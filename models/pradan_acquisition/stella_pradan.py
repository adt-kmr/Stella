"""STELLA <-> PRADAN data acquisition layer.

IMPORTANT - what has and has not been verified (see PRADAN_VERIFICATION_REPORT.md):
PRADAN (https://pradan.issdc.gov.in/al1/) is a registration + login web portal. Its public pages
document browser-based "Browse and Download", ZIP download and "Bulk Download". No public REST API,
API token scheme, dataset-identifier scheme or file-URL pattern is documented, so NONE is hard-coded
here. Everything that identifies PRADAN (URLs, login form fields, listing method, file name patterns)
comes from the "pradan" section of your JSON config and must be filled in by you from what you observe
after logging in. Credentials are read ONLY from environment variables (or a local .env file).

Commands
  sync     download files found via a configured listing (incremental; resumable; verified)
  ingest   register files you downloaded with the PRADAN web UI (ZIP / Bulk Download) into the data dir
  verify   re-check every file in the manifest (size + sha256)
  status   summarise the manifest
  inspect  print HDU/column names of a FITS (or CSV) file to help fill column mappings
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from urllib.parse import unquote, urljoin, urlparse

import requests

FITS_BLOCK = 2880


class PradanError(Exception):
    pass


class AuthError(PradanError):
    pass


class DatasetUnavailable(PradanError):
    pass


class NetworkError(PradanError):
    pass


class IncompleteDownload(PradanError):
    pass


# ----------------------------------------------------------------------------- config / env
def load_env_file(path):
    """Minimal .env reader (KEY=VALUE). Does not override variables already set."""
    if not path or not os.path.exists(path):
        return
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _required_paths(obj, path=""):
    out = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            out += _required_paths(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out += _required_paths(v, f"{path}[{i}]")
    elif isinstance(obj, str) and obj.startswith("REQUIRED"):
        out.append(f"{path}: {obj}")
    return out


def load_pradan_config(path, only_dataset=None):
    with open(path) as fh:
        full = json.load(fh)
    p = full.get("pradan")
    if not p:
        raise SystemExit("config has no 'pradan' section")
    p.setdefault("http", {})
    for k, v in {"timeout_s": 60, "retries": 4, "backoff_s": 2.0, "chunk_bytes": 1 << 20, "verify_tls": True}.items():
        p["http"].setdefault(k, v)
    p.setdefault("inbox_dir", None)
    if only_dataset:
        p["datasets"] = [d for d in p["datasets"] if d["name"] == only_dataset]
        if not p["datasets"]:
            raise SystemExit(f"no dataset named '{only_dataset}' in config")
    missing = _required_paths(p)
    if missing:
        raise SystemExit("pradan config has unfilled REQUIRED fields (see PRADAN_VERIFICATION_REPORT.md):\n  "
                         + "\n  ".join(missing))
    return p


def _env(name):
    v = os.environ.get(name)
    if not v:
        raise AuthError(f"environment variable {name} is not set (see .env.example)")
    return v


# ----------------------------------------------------------------------------- session
class PradanSession:
    def __init__(self, pcfg):
        self.cfg = pcfg
        self.h = pcfg["http"]
        self.auth = pcfg["auth"]
        self.s = requests.Session()
        self.s.verify = bool(self.h["verify_tls"])
        self.s.headers["User-Agent"] = "stella-pradan/1.0"
        self._logged_in = False
        self._setup_auth()

    def _setup_auth(self):
        mode = self.auth["mode"]
        if mode == "none":
            return
        if mode == "bearer":
            self.s.headers["Authorization"] = f"Bearer {_env(self.auth['token_env'])}"
        elif mode == "basic":
            self.s.auth = (_env(self.auth["username_env"]), _env(self.auth["password_env"]))
        elif mode == "form_login":
            self.login()
        else:
            raise PradanError(f"unknown auth.mode '{mode}' (use none | bearer | basic | form_login)")

    def login(self):
        a = self.auth
        fields = {}
        for name, val in a["form_fields"].items():
            fields[name] = _env(val[4:]) if isinstance(val, str) and val.startswith("env:") else val
        try:
            if a.get("get_login_page_first"):
                self.s.get(a["login_url"], timeout=self.h["timeout_s"])
            r = self.s.post(a["login_url"], data=fields, timeout=self.h["timeout_s"])
        except requests.RequestException as e:
            raise NetworkError(f"login request failed: {e}") from e
        if r.status_code in (401, 403) or r.status_code >= 400:
            raise AuthError(f"login rejected (HTTP {r.status_code})")
        if a.get("failure_text") and a["failure_text"] in r.text:
            raise AuthError("login failed: failure_text found in response (check credentials)")
        if a.get("success_url_contains") and a["success_url_contains"] not in r.url:
            raise AuthError(f"login did not reach expected page (ended at {r.url})")
        self._logged_in = True

    def _expired(self, r):
        marker = self.auth.get("session_expired_marker")
        return r.status_code in (401, 403) or bool(marker and marker in r.url)

    def request(self, method, url, **kw):
        retries, backoff = int(self.h["retries"]), float(self.h["backoff_s"])
        relogged = False
        last = None
        for attempt in range(retries + 1):
            try:
                r = self.s.request(method, url, timeout=self.h["timeout_s"], **kw)
            except requests.RequestException as e:
                last = e
                time.sleep(backoff * (2 ** attempt))
                continue
            if self._expired(r):
                r.close()
                if self.auth["mode"] == "form_login" and not relogged:
                    relogged = True
                    self.login()  # PRADAN documents a 30-minute inactivity timeout
                    continue
                raise AuthError(f"authentication failed or session expired for {url} (HTTP {r.status_code})")
            if r.status_code == 404:
                r.close()
                raise DatasetUnavailable(f"not found: {url}")
            if r.status_code in (429, 500, 502, 503, 504):
                last = PradanError(f"HTTP {r.status_code}")
                r.close()
                time.sleep(backoff * (2 ** attempt))
                continue
            if r.status_code >= 400 and r.status_code != 416:
                r.close()
                raise PradanError(f"HTTP {r.status_code} for {url}")
            return r
        raise NetworkError(f"giving up on {url} after {retries + 1} attempts: {last}")

    # ------------------------------------------------------------------ listing
    def list_files(self, ds):
        lst = ds["listing"]
        base = self.cfg.get("base_url") or ""
        mode = lst["mode"]
        if mode == "url_list_file":
            if not os.path.exists(lst["file"]):
                raise DatasetUnavailable(f"url list file not found: {lst['file']}")
            urls = [l.strip() for l in open(lst["file"]) if l.strip() and not l.startswith("#")]
        elif mode == "html_index":
            r = self.request("GET", urljoin(base, lst["url"]))
            rx = re.compile(lst.get("link_regex", r'href="([^"]+)"'))
            urls = rx.findall(r.text)
            if not urls:
                raise DatasetUnavailable(f"no links matched link_regex on {lst['url']} (is the page a dynamic UI?)")
        else:
            raise PradanError(f"unknown listing.mode '{mode}' (use url_list_file | html_index)")
        inc = re.compile(ds["include_regex"]) if ds.get("include_regex") else None
        exc = re.compile(ds["exclude_regex"]) if ds.get("exclude_regex") else None
        out, seen = [], {}
        for u in urls:
            full = urljoin(base, u)
            name = unquote(os.path.basename(urlparse(full).path))
            if not name or (inc and not inc.search(name)) or (exc and exc.search(name)):
                continue
            if name in seen and seen[name] != full:
                raise PradanError(f"two different URLs map to file name '{name}'")
            seen[name] = full
            out.append((full, name))
        return out

    # ------------------------------------------------------------------ download
    def download(self, url, dest):
        part = dest + ".part"
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        retries, backoff = int(self.h["retries"]), float(self.h["backoff_s"])
        err = None
        for attempt in range(retries + 1):
            pos = os.path.getsize(part) if os.path.exists(part) else 0
            r = self.request("GET", url, stream=True, headers={"Range": f"bytes={pos}-"} if pos else {})
            try:
                if r.status_code == 416:  # stale/over-long partial file: start over
                    os.remove(part)
                    continue
                if pos and r.status_code == 206:
                    m = re.match(r"bytes (\d+)-", r.headers.get("Content-Range", ""))
                    if not m or int(m.group(1)) != pos:
                        os.remove(part)
                        continue
                    mode = "ab"
                else:
                    pos, mode = 0, "wb"  # full response (server ignored Range or fresh start)
                clen = r.headers.get("Content-Length")
                expected = pos + int(clen) if clen is not None and not r.headers.get("Content-Encoding") else None
                with open(part, mode) as fh:
                    for chunk in r.iter_content(int(self.h["chunk_bytes"])):
                        fh.write(chunk)
            except (requests.RequestException, OSError) as e:
                err = e
                time.sleep(backoff * (2 ** attempt))
                continue
            finally:
                r.close()
            size = os.path.getsize(part)
            if expected is not None and size != expected:
                err = IncompleteDownload(f"{url}: got {size} of {expected} bytes")
                time.sleep(backoff * (2 ** attempt))
                continue  # next loop resumes from the .part file
            try:
                verify_file(part, display=dest)
            except IncompleteDownload:
                os.remove(part)  # never resume from a file that failed verification
                raise
            os.replace(part, dest)
            return
        raise IncompleteDownload(f"could not complete download of {url}: {err}")


# ----------------------------------------------------------------------------- integrity
def verify_file(path, display=None):
    """Structural integrity check. Raises IncompleteDownload on failure (callers discard the file)."""
    name = (display or path).lower()
    try:
        size = os.path.getsize(path)
        if size == 0:
            raise IncompleteDownload("empty file")
        if name.endswith(".zip"):
            with zipfile.ZipFile(path) as z:
                bad = z.testzip()
                if bad:
                    raise IncompleteDownload(f"corrupt member in zip: {bad}")
        elif name.endswith(".gz"):
            with gzip.open(path, "rb") as g:
                while g.read(1 << 20):
                    pass
        elif name.endswith((".fits", ".fit", ".fts")):
            with open(path, "rb") as f:
                head = f.read(6)
            if head != b"SIMPLE" or size % FITS_BLOCK != 0:
                raise IncompleteDownload("not a complete FITS file (bad header or size not a multiple of 2880)")
    except (zipfile.BadZipFile, EOFError, OSError, gzip.BadGzipFile) as e:
        raise IncompleteDownload(f"{display or path}: {e}") from e
    except IncompleteDownload as e:
        raise IncompleteDownload(f"{display or path}: {e}") from e


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


# ----------------------------------------------------------------------------- manifest
class Manifest:
    def __init__(self, data_dir):
        self.path = os.path.join(data_dir, "pradan_manifest.json")
        self.data = {"files": {}}
        if os.path.exists(self.path):
            with open(self.path) as fh:
                self.data = json.load(fh)

    def save(self):
        tmp = self.path + ".tmp"
        with open(tmp, "w") as fh:
            json.dump(self.data, fh, indent=1, sort_keys=True)
        os.replace(tmp, self.path)

    def have(self, key, abspath):
        e = self.data["files"].get(key)
        return bool(e) and os.path.exists(abspath) and os.path.getsize(abspath) == e["size"]

    def add(self, key, abspath, url, source):
        self.data["files"][key] = {"size": os.path.getsize(abspath), "sha256": sha256_of(abspath), "url": url,
                                   "source": source, "fetched_utc": datetime.now(timezone.utc).isoformat()}


def _dest(pcfg, ds, name):
    return os.path.join(pcfg["data_dir"], ds["subdir"], name)


# ----------------------------------------------------------------------------- commands
def cmd_sync(pcfg, args):
    os.makedirs(pcfg["data_dir"], exist_ok=True)
    sess = PradanSession(pcfg)
    man = Manifest(pcfg["data_dir"])
    n_new = n_skip = 0
    failures = []
    for ds in pcfg["datasets"]:
        try:
            items = sess.list_files(ds)
        except AuthError:
            raise
        except PradanError as e:
            failures.append((ds["name"], str(e)))
            print(f"[{ds['name']}] listing failed: {e}")
            continue
        print(f"[{ds['name']}] {len(items)} candidate files")
        for url, name in items:
            key = f"{ds['name']}/{name}"
            dest = _dest(pcfg, ds, name)
            if not args.force and man.have(key, dest):
                n_skip += 1
                continue
            if args.dry_run:
                print(f"  would download {name}")
                continue
            try:
                sess.download(url, dest)
                man.add(key, dest, url, "sync")
                man.save()
                n_new += 1
                print(f"  downloaded {name}")
            except AuthError:
                raise
            except PradanError as e:
                failures.append((key, str(e)))
                print(f"  FAILED {name}: {e}")
    print(f"[sync] new={n_new} already_present={n_skip} failed={len(failures)}")
    return 1 if failures else 0


def cmd_ingest(pcfg, args):
    inbox = pcfg.get("inbox_dir")
    if not inbox or not os.path.isdir(inbox):
        raise SystemExit("pradan.inbox_dir must be an existing directory (where the web-UI downloads were saved)")
    os.makedirs(pcfg["data_dir"], exist_ok=True)
    man = Manifest(pcfg["data_dir"])
    matchers = [(ds, re.compile(ds["include_regex"]) if ds.get("include_regex") else None,
                 re.compile(ds["exclude_regex"]) if ds.get("exclude_regex") else None) for ds in pcfg["datasets"]]
    n_new = n_skip = n_unmatched = 0
    failures = []
    tmpdirs = []

    def candidates():
        for root, _, files in os.walk(inbox):
            for f in sorted(files):
                p = os.path.join(root, f)
                if f.lower().endswith(".zip"):
                    td = tempfile.mkdtemp(prefix="stella_zip_")
                    tmpdirs.append(td)
                    try:
                        verify_file(p)
                        with zipfile.ZipFile(p) as z:
                            z.extractall(td)
                    except (IncompleteDownload, zipfile.BadZipFile) as e:
                        failures.append((p, f"zip unusable: {e}"))
                        continue
                    for r2, _, f2 in os.walk(td):
                        for g in sorted(f2):
                            yield os.path.join(r2, g), g
                elif not f.endswith(".part"):
                    yield p, f

    for path, name in candidates():
        hits = [ds for ds, inc, exc in matchers
                if (inc is None or inc.search(name)) and not (exc and exc.search(name))]
        if len(hits) != 1:
            n_unmatched += 1
            if len(hits) > 1:
                failures.append((name, f"matches several datasets: {[d['name'] for d in hits]}"))
            continue
        ds = hits[0]
        key, dest = f"{ds['name']}/{name}", _dest(pcfg, ds, name)
        if man.have(key, dest) and not args.force:
            n_skip += 1
            continue
        try:
            verify_file(path, display=name)
        except IncompleteDownload as e:
            failures.append((name, f"incomplete/corrupt download: {e}"))
            continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(path, dest)
        man.add(key, dest, "inbox:" + path, "ingest")
        n_new += 1
    man.save()
    for td in tmpdirs:
        shutil.rmtree(td, ignore_errors=True)
    for k, why in failures:
        print(f"  PROBLEM {k}: {why}")
    print(f"[ingest] new={n_new} already_present={n_skip} unmatched={n_unmatched} problems={len(failures)}")
    return 1 if failures else 0


def cmd_verify(pcfg, args):
    man = Manifest(pcfg["data_dir"])
    bad = 0
    for key, e in sorted(man.data["files"].items()):
        ds_name, name = key.split("/", 1)
        ds = next((d for d in pcfg["datasets"] if d["name"] == ds_name), None)
        p = _dest(pcfg, ds, name) if ds else None
        if not p or not os.path.exists(p):
            print(f"MISSING {key}")
            bad += 1
        elif os.path.getsize(p) != e["size"] or sha256_of(p) != e["sha256"]:
            print(f"MISMATCH {key}")
            bad += 1
    print(f"[verify] {len(man.data['files'])} files, {bad} problems")
    return 1 if bad else 0


def cmd_status(pcfg, args):
    man = Manifest(pcfg["data_dir"])
    by = {}
    for k, e in man.data["files"].items():
        n, s = by.get(k.split("/")[0], (0, 0))
        by[k.split("/")[0]] = (n + 1, s + e["size"])
    for k, (n, s) in sorted(by.items()):
        print(f"{k}: {n} files, {s / 1e6:.1f} MB")
    if not by:
        print("manifest is empty")
    return 0


def cmd_inspect(path):
    if path.lower().endswith((".csv", ".tsv")):
        print(open(path).readline().strip())
        return 0
    from astropy.io import fits
    with fits.open(path, memmap=False) as hd:
        for i, h in enumerate(hd):
            cols = list(h.columns.names) if getattr(h, "columns", None) is not None else None
            print(f"HDU {i} name={h.name!r} type={type(h).__name__} columns={cols}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["sync", "ingest", "verify", "status", "inspect"])
    ap.add_argument("file", nargs="?", help="file for 'inspect'")
    ap.add_argument("--config", default="stella_config.json")
    ap.add_argument("--env-file", default=".env")
    ap.add_argument("--dataset", help="limit to one dataset name")
    ap.add_argument("--force", action="store_true", help="re-download / re-ingest even if already in the manifest")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--watch", type=float, metavar="SECONDS", help="sync: repeat every SECONDS to pick up new files")
    a = ap.parse_args(argv)
    if a.command == "inspect":
        if not a.file:
            raise SystemExit("inspect needs a file path")
        return cmd_inspect(a.file)
    load_env_file(a.env_file)
    pcfg = load_pradan_config(a.config, a.dataset)
    try:
        if a.command == "sync":
            while True:
                rc = cmd_sync(pcfg, a)
                if not a.watch:
                    return rc
                time.sleep(a.watch)
        return {"ingest": cmd_ingest, "verify": cmd_verify, "status": cmd_status}[a.command](pcfg, a)
    except AuthError as e:
        print(f"AUTHENTICATION ERROR: {e}", file=sys.stderr)
        return 2
    except NetworkError as e:
        print(f"NETWORK ERROR: {e}", file=sys.stderr)
        return 3
    except PradanError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 4


if __name__ == "__main__":
    sys.exit(main())
