import subprocess
import time
import json
import urllib.request
import websocket
import base64
import os

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
port = 9222
output_dir = r"C:\Users\jaswa\.gemini\antigravity-ide\brain\b6b326af-aad3-497d-84cd-85398fecc34a\.tempmediaStorage"
os.makedirs(output_dir, exist_ok=True)

# Stop any existing chrome
subprocess.run(["powershell", "-Command", "Stop-Process -Name chrome -ErrorAction SilentlyContinue"])
time.sleep(1)

proc = subprocess.Popen([
    chrome_path,
    "--headless=new",
    f"--remote-debugging-port={port}",
    "--remote-allow-origins=*",
    "--disable-gpu",
    "--window-size=1440,900"
])
time.sleep(2)

try:
    req = urllib.request.Request(f"http://localhost:{port}/json/new?http://localhost:8080/", method="PUT")
    new_tab = json.loads(urllib.request.urlopen(req).read())
    ws_url = new_tab["webSocketDebuggerUrl"]
    ws = websocket.create_connection(ws_url)
    ws.send(json.dumps({"id": 1, "method": "Page.enable"}))
    ws.send(json.dumps({"id": 2, "method": "Runtime.enable"}))
    time.sleep(4.0)

    # 1. Focus on Elena Rostova (Mid-Incline Optical Scan Specialist)
    ws.send(json.dumps({
        "id": 101,
        "method": "Runtime.evaluate",
        "params": {
            "expression": "if (window.app?.scene) { window.app.scene.focusOnWorker('worker_elena'); }"
        }
    }))
    time.sleep(2.0)

    # Capture 1: Elena Rostova Closeup in 3D
    ws.send(json.dumps({"id": 10, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
    while True:
        raw = ws.recv()
        msg = json.loads(raw)
        if msg.get("id") == 10:
            img_data = base64.b64decode(msg["result"]["data"])
            out_path = os.path.join(output_dir, "elena_closeup_3d.png")
            with open(out_path, "wb") as f:
                f.write(img_data)
            print("SAVED:", out_path)
            break

    # 2. Trigger Active Diagnostic Scan on Elena
    ws.send(json.dumps({
        "id": 102,
        "method": "Runtime.evaluate",
        "params": {
            "expression": "if (window.app?.scene?.industrialCrew) { window.app.scene.industrialCrew.triggerDiagnosticScan('worker_elena'); }"
        }
    }))
    time.sleep(1.0)

    # Capture 2: Elena Diagnostic Scan
    ws.send(json.dumps({"id": 11, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
    while True:
        raw = ws.recv()
        msg = json.loads(raw)
        if msg.get("id") == 11:
            img_data = base64.b64decode(msg["result"]["data"])
            out_path = os.path.join(output_dir, "elena_diagnostic_scan.png")
            with open(out_path, "wb") as f:
                f.write(img_data)
            print("SAVED:", out_path)
            break

    # 3. Open Operator Dossier Modal for Elena
    ws.send(json.dumps({
        "id": 103,
        "method": "Runtime.evaluate",
        "params": {
            "expression": "if (window.app?.crewModal) { window.app.crewModal.open('worker_elena'); }"
        }
    }))
    time.sleep(1.2)

    # Capture 3: Operator Dossier Modal for Elena
    ws.send(json.dumps({"id": 12, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
    while True:
        raw = ws.recv()
        msg = json.loads(raw)
        if msg.get("id") == 12:
            img_data = base64.b64decode(msg["result"]["data"])
            out_path = os.path.join(output_dir, "operator_dossier_modal.png")
            with open(out_path, "wb") as f:
                f.write(img_data)
            print("SAVED:", out_path)
            break

    # 4. Start Follow-Cam on Elena
    ws.send(json.dumps({
        "id": 104,
        "method": "Runtime.evaluate",
        "params": {
            "expression": "if (window.app?.crewModal) { window.app.crewModal.close(); } if (window.app?.scene) { window.app.scene.startFollowCam('worker_elena'); }"
        }
    }))
    time.sleep(2.0)

    # Capture 4: Operator Follow-Cam Catwalk Perspective
    ws.send(json.dumps({"id": 13, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
    while True:
        raw = ws.recv()
        msg = json.loads(raw)
        if msg.get("id") == 13:
            img_data = base64.b64decode(msg["result"]["data"])
            out_path = os.path.join(output_dir, "operator_follow_cam.png")
            with open(out_path, "wb") as f:
                f.write(img_data)
            print("SAVED:", out_path)
            break

    # 5. Stop Follow-Cam and Switch to Light Mode
    ws.send(json.dumps({
        "id": 105,
        "method": "Runtime.evaluate",
        "params": {
            "expression": "if (window.app?.scene) { window.app.scene.stopFollowCam(); window.app.scene.setCameraPreset('iso'); } document.documentElement.setAttribute('data-theme', 'light'); if (window.app?.scene?.setTheme) { window.app.scene.setTheme('light'); }"
        }
    }))
    time.sleep(2.0)

    # Capture 5: Light Mode Showroom with Workers
    ws.send(json.dumps({"id": 14, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
    while True:
        raw = ws.recv()
        msg = json.loads(raw)
        if msg.get("id") == 14:
            img_data = base64.b64decode(msg["result"]["data"])
            out_path = os.path.join(output_dir, "crew_light_mode.png")
            with open(out_path, "wb") as f:
                f.write(img_data)
            print("SAVED:", out_path)
            break

finally:
    proc.kill()
