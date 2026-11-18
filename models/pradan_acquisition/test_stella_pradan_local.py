# LOCAL MECHANICS TEST ONLY: a fake HTTP server on 127.0.0.1 serving dummy bytes. NOT PRADAN, NOT real data.
import http.server, threading, json, os, shutil, sys, re, zipfile, io
import stella_pradan as sp
def fits_bytes(n_blocks=2): return (b"SIMPLE  =                    T".ljust(2880,b" ")) + b"\0"*2880*(n_blocks-1)
FILES={"a_20250101.fits":fits_bytes(3),"a_20250102.fits":fits_bytes(5),"readme.txt":b"x","cat.csv":b"start,peak,end,class\n"}
STATE={"trunc_once":set(),"cookie":"sess1","expire_next":False,"hits":[],"auth":None}
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def _authed(self):
        if STATE["auth"]=="bearer": return self.headers.get("Authorization")=="Bearer tok123"
        if STATE["auth"]=="form":
            ok = STATE["cookie"] in (self.headers.get("Cookie") or "")
            if ok and STATE["expire_next"]: STATE["expire_next"]=False; STATE["cookie"]="sess2"; return False
            return ok
        return True
    def do_POST(self):
        n=int(self.headers.get("Content-Length",0)); body=self.rfile.read(n).decode()
        if "u=me" in body and "p=pw" in body:
            self.send_response(200); self.send_header("Set-Cookie",f"S={STATE['cookie']}; Path=/"); self.end_headers(); self.wfile.write(b"welcome")
        else: self.send_response(200); self.end_headers(); self.wfile.write(b"Invalid credentials")
    def do_GET(self):
        STATE["hits"].append(self.path)
        if self.path=="/index/": 
            if not self._authed(): self.send_response(401); self.end_headers(); return
            self.send_response(200); self.end_headers(); self.wfile.write("".join(f'<a href="/files/{k}">{k}</a>' for k in FILES).encode()); return
        m=re.match(r"/files/(.+)",self.path)
        if not m or m.group(1) not in FILES: self.send_response(404); self.end_headers(); return
        if not self._authed(): self.send_response(401); self.end_headers(); return
        data=FILES[m.group(1)]; start=0
        rg=self.headers.get("Range")
        if rg: start=int(re.match(r"bytes=(\d+)-",rg).group(1))
        body=data[start:]
        self.send_response(206 if rg else 200)
        if rg: self.send_header("Content-Range",f"bytes {start}-{len(data)-1}/{len(data)}")
        self.send_header("Content-Length",str(len(body))); self.end_headers()
        if m.group(1) in STATE["trunc_once"]:
            STATE["trunc_once"].discard(m.group(1)); self.wfile.write(body[:len(body)//2]); self.wfile.flush(); self.close_connection=True; return
        self.wfile.write(body)
srv=http.server.ThreadingHTTPServer(("127.0.0.1",0),H); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
base=f"http://127.0.0.1:{port}"
def cfg(auth,dd):
    return {"data_dir":dd,"base_url":base,"inbox_dir":None,"auth":auth,
     "http":{"timeout_s":5,"retries":3,"backoff_s":0.05,"chunk_bytes":4096,"verify_tls":True},
     "datasets":[{"name":"x","kind":"sxr","subdir":"x","listing":{"mode":"html_index","url":"/index/"},"include_regex":r"\.fits$","exclude_regex":None}]}
class A: force=False; dry_run=False
res={}
def check(name,cond): res[name]=bool(cond); print(("PASS " if cond else "FAIL ")+name)
shutil.rmtree("/tmp/t/dd",ignore_errors=True)
# 1 no-auth sync, truncated stream -> resume
STATE["auth"]=None; STATE["trunc_once"]={"a_20250102.fits"}
rc=sp.cmd_sync(cfg({"mode":"none"},"/tmp/t/dd"),A); 
check("sync downloads 2 fits (+resume after truncated stream)", rc==0 and sorted(os.listdir("/tmp/t/dd/x"))==["a_20250101.fits","a_20250102.fits"])
check("downloaded bytes identical", open("/tmp/t/dd/x/a_20250102.fits","rb").read()==FILES["a_20250102.fits"])
# 2 incremental: second run downloads nothing; new file appears -> only it is fetched
STATE["hits"].clear(); FILES["a_20250103.fits"]=fits_bytes(2)
rc=sp.cmd_sync(cfg({"mode":"none"},"/tmp/t/dd"),A)
fetched=[h for h in STATE["hits"] if h.startswith("/files/")]
check("incremental: only new file downloaded", fetched==["/files/a_20250103.fits"])
# 3 corrupt/incomplete partial: server sends wrong-size full file -> verify rejects
FILES["bad.fits"]=b"SIMPLE"+b"\0"*100
rc=sp.cmd_sync(cfg({"mode":"none"},"/tmp/t/dd"),A)
check("invalid FITS rejected, not left in data dir, exit code 1", rc==1 and not os.path.exists("/tmp/t/dd/x/bad.fits"))
del FILES["bad.fits"]
# 4 bearer auth
os.environ["PRADAN_TOKEN"]="tok123"; STATE["auth"]="bearer"; shutil.rmtree("/tmp/t/dd2",ignore_errors=True)
rc=sp.cmd_sync(cfg({"mode":"bearer","token_env":"PRADAN_TOKEN"},"/tmp/t/dd2"),A)
check("bearer auth works", rc==0 and len(os.listdir("/tmp/t/dd2/x"))==3)
os.environ["PRADAN_TOKEN"]="wrong"
try: sp.cmd_sync(cfg({"mode":"bearer","token_env":"PRADAN_TOKEN"},"/tmp/t/dd3"),A); check("bad token raises AuthError",False)
except sp.AuthError: check("bad token raises AuthError",True)
del os.environ["PRADAN_TOKEN"]
try: sp.PradanSession(cfg({"mode":"bearer","token_env":"PRADAN_TOKEN"},"/tmp/t/dd3")); check("missing env var raises AuthError",False)
except sp.AuthError: check("missing env var raises AuthError",True)
# 5 form login, session expiry mid-run -> relogin
STATE["auth"]="form"; STATE["cookie"]="sess1"; os.environ["U"]="me"; os.environ["P"]="pw"
fa={"mode":"form_login","login_url":base+"/login","form_fields":{"u":"env:U","p":"env:P"},"failure_text":"Invalid credentials"}
shutil.rmtree("/tmp/t/dd4",ignore_errors=True); STATE["expire_next"]=False
s=sp.PradanSession(cfg(fa,"/tmp/t/dd4")); items=s.list_files(cfg(fa,"/tmp/t/dd4")["datasets"][0])
STATE["expire_next"]=True
s.download(items[0][0],"/tmp/t/dd4/x/"+items[0][1])
check("form login + automatic re-login after session expiry", os.path.exists("/tmp/t/dd4/x/"+items[0][1]))
os.environ["P"]="nope"
try: sp.PradanSession(cfg(fa,"/tmp/t/dd5")); check("wrong password -> AuthError",False)
except sp.AuthError: check("wrong password -> AuthError",True)
# 6 unavailable dataset (404) and network error
s=sp.PradanSession(cfg({"mode":"none"},"/tmp/t/dd6"))
try: s.download(base+"/files/nope.fits","/tmp/t/dd6/nope.fits"); check("404 -> DatasetUnavailable",False)
except sp.DatasetUnavailable: check("404 -> DatasetUnavailable",True)
try: s.request("GET","http://127.0.0.1:1/x"); check("connection refused -> NetworkError",False)
except sp.NetworkError: check("connection refused -> NetworkError",True)
# 7 ingest of browser-style ZIP + truncated zip
os.makedirs("/tmp/t/inbox",exist_ok=True)
with zipfile.ZipFile("/tmp/t/inbox/bulk.zip","w") as z: z.writestr("b_1.fits",fits_bytes(2)); z.writestr("other.txt","x")
open("/tmp/t/inbox/broken.zip","wb").write(open("/tmp/t/inbox/bulk.zip","rb").read()[:50])
p=cfg({"mode":"none"},"/tmp/t/dd7"); p["inbox_dir"]="/tmp/t/inbox"
rc=sp.cmd_ingest(p,A)
check("ingest extracts zip member, flags broken zip", os.path.exists("/tmp/t/dd7/x/b_1.fits") and rc==1)
check("verify passes on manifest", sp.cmd_verify(p,A)==0)
print(json.dumps(res)); sys.exit(0 if all(res.values()) else 1)
