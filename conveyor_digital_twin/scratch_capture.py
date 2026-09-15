import subprocess
import time
import json
import urllib.request
import websocket
import base64
import os

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
port = 9222
proc = subprocess.Popen([chrome_path, "--headless=new", f"--remote-debugging-port={port}", "--remote-allow-origins=*", "--disable-gpu", "--window-size=1440,900"])
time.sleep(2)

try:
    req = urllib.request.Request(f"http://localhost:{port}/json/new?http://localhost:8080/", method="PUT")
    new_tab = json.loads(urllib.request.urlopen(req).read())
    ws_url = new_tab["webSocketDebuggerUrl"]
    ws = websocket.create_connection(ws_url)
    ws.send(json.dumps({"id": 1, "method": "Page.enable"}))
    time.sleep(3.5) # Wait for STL meshes and scene to render
    
    # Capture full screenshot
    ws.send(json.dumps({"id": 2, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
    while True:
        raw = ws.recv()
        msg = json.loads(raw)
        if msg.get("id") == 2:
            img_data = base64.b64decode(msg["result"]["data"])
            out_path = r"C:\Users\jaswa\.gemini\antigravity-ide\brain\b6b326af-aad3-497d-84cd-85398fecc34a\.tempmediaStorage\resized_crew_view.png"
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(img_data)
            print("SCREENSHOT SAVED TO:", out_path)
            break
finally:
    proc.terminate()
