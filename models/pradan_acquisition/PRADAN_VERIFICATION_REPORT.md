# PRADAN integration: verification report

Date of work: 2026-11-17

## 1. Bottom line

**Real PRADAN data was NOT fetched.** I had no PRADAN credentials, my sandbox has no outbound network for code execution, and PRADAN's public documentation does not describe a scriptable access method. I therefore did not (and could not honestly) write a PRADAN-specific endpoint client. What I built is a configuration-driven downloader whose PRADAN-specific parts you must fill in from what you see after logging in. Its mechanics were tested only against a local fake server.

## 2. What PRADAN's official pages say (checked 2026-11-17)

Fetched: `https://pradan.issdc.gov.in/al1` and its FAQ page `https://pradan.issdc.gov.in/al1/faq.xhtml`.

- Access is through a **web portal that requires registration and login** (Login/Signup link goes to `.../al1/protected/payload.xhtml`). Protected pages seen in the menu: Browse and Download, History, Statistics, Other Downloads (`.../protected/*.xhtml`).
- The FAQ documents **browser-based** download only: click-to-download, ZIP download (with a per-ZIP size limit and a "Jump-to-File" control to continue), and a **"Download in Bulk"** button that streams files individually.
- The FAQ states the **session times out after 30 minutes of inactivity**.
- Third-party instrument papers and news items agree: registration required; SoLEXS data from July 2024 onward is public via the portal; HEL1OS level-1 bundles are listed per observation on a PRADAN page.
- **Not found in any documentation I could reach:** a REST API, API token or key scheme, dataset identifier scheme, file-URL pattern, or any statement permitting automated/scripted access. Hostnames also vary across sources (`pradan`, `pradan1`), so I did not pick one.
- **Flare catalog:** PRADAN documentation lists instrument data, user manuals, utilities and SPICE kernels. I found no flare catalog on PRADAN. You need to supply a catalog from another source (it must have onset, peak, end and class).
- **File schemas** (HDU names, column names, bands, live-time columns) are in the instrument user manuals behind the login. I could not read them. Use `python stella_pradan.py inspect <file>` on a downloaded file to see the real columns.

## 3. What I implemented

- `stella_pradan.py`: environment-variable credentials (and optional local `.env`), `sync` (incremental, resumable, verified), `ingest` (for ZIP / Bulk Download files saved with the web UI), `verify`, `status`, `inspect`. Auth modes: `none`, `bearer`, `basic`, `form_login`. All URLs, field names and regexes come from the `pradan` config section.
- Error handling: `AuthError` (bad/missing credentials, expired session after one automatic re-login), `DatasetUnavailable` (404, no links matched), `NetworkError` (retries with backoff), `IncompleteDownload` (size mismatch, bad FITS/ZIP/GZ structure; partial files are discarded or resumed).
- Incremental updates: `pradan_manifest.json` in the data dir records size and sha256 per file; re-running `sync` only fetches files not yet present. `--watch SECONDS` repeats this to pick up new observations.
- Pipeline compatibility: downloads land in `<data_dir>/<subdir>/`; `data.sxr.files` / `data.hxr.files` globs in the existing config point there. The loader's cache key includes file size and mtime, so new files invalidate the cache automatically. Only change to existing code: `stella_data.load_config` no longer requires the optional `pradan` section to be filled (one line).

## 4. Known limits (unverified against PRADAN)

- The portal's pages are server-rendered `.xhtml` forms. `form_login` supports plain form fields only; it cannot handle hidden per-request tokens (for example JSF view-state) that such pages may require. If login needs them, use `ingest` with the browser's Bulk Download instead.
- `html_index` listing only works if a page you can GET contains plain links to files. A dynamic table with click-to-download rows will not work. `url_list_file` works if you can obtain direct file URLs yourself.
- I did not confirm that PRADAN permits scripted downloads. Check ISSDC's terms and the Disclaimer page before automating.

## 5. What was actually tested

`test_stella_pradan_local.py` runs against a fake HTTP server on 127.0.0.1 serving dummy bytes (**not PRADAN, not real data**). 13 checks passed:
resumed download after a truncated stream, byte-identical result, incremental skip (only a newly added file downloaded), invalid FITS rejected with no leftover file, bearer auth, wrong bearer token, missing env var, form login with automatic re-login after simulated session expiry, wrong password, 404 handling, connection-refused handling, ingest of a ZIP with a corrupt ZIP flagged, manifest verify.

Earlier, in the previous step, the feature/label/window code was smoke-tested on random synthetic numbers with torch stubbed. No test touched real PRADAN data or the PyTorch parts.

## 6. What I need from you to make a real PRADAN fetch work

1. Confirmation you have a registered PRADAN account (username and password go in `.env`, never in the config).
2. After logging in, in your browser's developer tools (Network tab), the exact: login request URL and form field names, and the URL pattern of a file download from Browse and Download or Bulk Download. Or a text file of direct file URLs you export.
3. The file-name patterns of the SoLEXS and HEL1OS products you want (for `include_regex`), and the flare catalog source.
4. One downloaded SoLEXS and one HEL1OS file, inspected with `stella_pradan.py inspect`, to fill the column mappings in `data.sxr` and `data.hxr`.
