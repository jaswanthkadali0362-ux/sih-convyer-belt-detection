import subprocess
import time
import json
import urllib.request
import websocket

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
port = 9222
proc = subprocess.Popen([chrome_path, "--headless=new", f"--remote-debugging-port={port}", "--remote-allow-origins=*", "--disable-gpu"])
time.sleep(2)

try:
    req = urllib.request.Request(f"http://localhost:{port}/json/new?http://localhost:8080/", method="PUT")
    new_tab = json.loads(urllib.request.urlopen(req).read())
    ws_url = new_tab["webSocketDebuggerUrl"]
    ws = websocket.create_connection(ws_url)
    ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
    time.sleep(2.5)
    
    # Check loading overlay display
    ws.send(json.dumps({
        "id": 2,
        "method": "Runtime.evaluate",
        "params": {"expression": "document.getElementById('loading-overlay').style.display"}
    }))
    
    # Check 3D scene & workers
    ws.send(json.dumps({
        "id": 3,
        "method": "Runtime.evaluate",
        "params": {"expression": "Boolean(window.app && window.app.scene && window.app.scene.industrialCrew && window.app.scene.industrialCrew.workers.length === 2)"}
    }))
    
    results = {}
    start = time.time()
    while time.time() - start < 4 and len(results) < 2:
        try:
            ws.settimeout(1.0)
            msg = json.loads(ws.recv())
            if msg.get("id") in (2, 3):
                results[msg["id"]] = msg.get("result", {}).get("result", {}).get("value")
        except Exception:
            pass

    print("RESULT - Loading overlay display:", results.get(2))
    print("RESULT - Scene & Industrial Crew loaded:", results.get(3))
finally:
    proc.terminate()
