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
    ws.send(json.dumps({"id": 2, "method": "Runtime.enable"}))
    time.sleep(4.0)

    # 1. Capture Dark Mode Cinematic RTX 4050 View
    ws.send(json.dumps({"id": 10, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
    while True:
        raw = ws.recv()
        msg = json.loads(raw)
        if msg.get("id") == 10:
            img_data = base64.b64decode(msg["result"]["data"])
            out_path = r"C:\Users\jaswa\.gemini\antigravity-ide\brain\b6b326af-aad3-497d-84cd-85398fecc34a\.tempmediaStorage\cinematic_dark_rtx.png"
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(img_data)
            print("CINEMATIC DARK RTX SAVED:", out_path)
            break
            
    # 2. Open Settings modal to RTX Graphics tab
    ws.send(json.dumps({
        "id": 11,
        "method": "Runtime.evaluate",
        "params": {
            "expression": "if (window.app && window.app.settingsModal) { window.app.settingsModal.open('rtx_graphics'); }"
        }
    }))
    time.sleep(1)
    
    ws.send(json.dumps({"id": 12, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
    while True:
        raw = ws.recv()
        msg = json.loads(raw)
        if msg.get("id") == 12:
            img_data = base64.b64decode(msg["result"]["data"])
            out_path = r"C:\Users\jaswa\.gemini\antigravity-ide\brain\b6b326af-aad3-497d-84cd-85398fecc34a\.tempmediaStorage\cinematic_rtx_settings.png"
            with open(out_path, "wb") as f:
                f.write(img_data)
            print("CINEMATIC RTX SETTINGS SAVED:", out_path)
            break

    # 3. Close settings and switch to Light Showroom Mode
    ws.send(json.dumps({
        "id": 13,
        "method": "Runtime.evaluate",
        "params": {
            "expression": "if (window.app) { if (window.app.settingsModal) window.app.settingsModal.close(); window.app.applyTheme('light'); }"
        }
    }))
    time.sleep(1.5)
    
    ws.send(json.dumps({"id": 14, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
    while True:
        raw = ws.recv()
        msg = json.loads(raw)
        if msg.get("id") == 14:
            img_data = base64.b64decode(msg["result"]["data"])
            out_path = r"C:\Users\jaswa\.gemini\antigravity-ide\brain\b6b326af-aad3-497d-84cd-85398fecc34a\.tempmediaStorage\cinematic_light_rtx.png"
            with open(out_path, "wb") as f:
                f.write(img_data)
            print("CINEMATIC LIGHT RTX SAVED:", out_path)
            break
finally:
    proc.terminate()

