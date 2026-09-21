"""
SmartBelt — Dedicated High-Performance MJPEG Camera Streaming Bridge
Streams Logi C270 HD WebCam video feed directly to HTTP for web UI consumption.
URL: http://localhost:8088/stream.mjpg
"""

import sys
import time
import threading
import http.server
import socketserver
import cv2

PORT = 8088

class CameraManager:
    def __init__(self):
        self.cap = None
        self.frame = None
        self.lock = threading.Lock()
        self.running = False
        self.cam_name = "Detecting..."
        self.cam_index = None
        self.res = (1280, 720)

    def find_and_open_camera(self):
        print("Scanning video devices for Logi C270 HD WebCam...")
        # Probing order: 0, 1, 2
        for idx in [0, 1, 2]:
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                ret, frame = cap.read()
                if ret and frame is not None:
                    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    print(f"  Camera [{idx}] opened: {w}x{h}, mean brightness: {frame.mean():.1f}")
                    self.cap = cap
                    self.cam_index = idx
                    self.res = (w, h)
                    self.cam_name = f"Logi C270 HD WebCam (Index {idx}, {w}x{h})"
                    return True
                cap.release()
        return False

    def start(self):
        if not self.find_and_open_camera():
            print("ERROR: No camera could be opened. Retrying in background...")
        self.running = True
        t = threading.Thread(target=self._worker, daemon=True)
        t.start()

    def _worker(self):
        while self.running:
            if self.cap is None or not self.cap.isOpened():
                time.sleep(1.0)
                self.find_and_open_camera()
                continue
            ret, frame = self.cap.read()
            if ret and frame is not None:
                with self.lock:
                    self.frame = frame
            else:
                time.sleep(0.02)

    def set_frame_bytes(self, jpeg_bytes):
        with self.lock:
            self.jpeg_bytes = jpeg_bytes
            self.cam_name = "Xiaomi Mi 11X (Live Phone Camera)"
            self.last_update = time.time()

    def get_jpeg(self):
        with self.lock:
            # If recent phone frame received from Mi 11X (within last 3.0s), prioritize it
            if hasattr(self, 'jpeg_bytes') and self.jpeg_bytes and (time.time() - getattr(self, 'last_update', 0) < 3.0):
                return self.jpeg_bytes
            if self.frame is None:
                return None
            ret, jpeg = cv2.imencode('.jpg', self.frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            return jpeg.tobytes() if ret else None

    def stop(self):
        self.running = False
        if self.cap:
            self.cap.release()

cam_mgr = CameraManager()

class StreamHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass # Suppress spammy HTTP logs

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Content-Length')
        self.end_headers()

    def do_POST(self):
        if self.path == '/upload_frame':
            length = int(self.headers.get('Content-Length', 0))
            if length > 0:
                data = self.rfile.read(length)
                cam_mgr.set_frame_bytes(data)
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'OK')
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path == '/stream.mjpg':
            self.send_response(200)
            self.send_header('Age', '0')
            self.send_header('Cache-Control', 'no-cache, private')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=FRAME')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                while True:
                    frame = cam_mgr.get_jpeg()
                    if frame:
                        self.wfile.write(b'--FRAME\r\n')
                        self.send_header('Content-Type', 'image/jpeg')
                        self.send_header('Content-Length', str(len(frame)))
                        self.end_headers()
                        self.wfile.write(frame)
                        self.wfile.write(b'\r\n')
                    time.sleep(0.033) # ~30 FPS
            except Exception:
                pass
        elif self.path == '/snapshot.jpg':
            frame = cam_mgr.get_jpeg()
            if frame:
                self.send_response(200)
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(frame)
            else:
                self.send_error(503, "Camera frame not ready")
        elif self.path == '/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(f'{{"status":"ok","camera":"{cam_mgr.cam_name}","resolution":"{cam_mgr.res[0]}x{cam_mgr.res[1]}"}}'.encode())
        else:
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            html = f"""<!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Logi C270 Camera Streamer</title>
              <style>
                body {{
                  background: #060913;
                  color: #e2e8f0;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  margin: 0;
                  padding: 20px;
                  box-sizing: border-box;
                }}
                .card {{
                  background: rgba(15, 23, 42, 0.9);
                  border: 1px solid rgba(0, 240, 255, 0.25);
                  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 240, 255, 0.15);
                  border-radius: 12px;
                  padding: 20px 24px;
                  max-width: 900px;
                  width: 100%;
                  text-align: center;
                }}
                h2 {{ margin-top: 0; color: #00f0ff; letter-spacing: 0.05em; font-size: 1.4rem; }}
                .stream-container {{
                  position: relative;
                  margin: 16px 0;
                  border-radius: 8px;
                  overflow: hidden;
                  border: 1px solid #334155;
                  background: #000;
                  cursor: pointer;
                }}
                .stream-img {{
                  width: 100%;
                  max-height: 70vh;
                  object-fit: contain;
                  display: block;
                }}
                .btn-group {{ display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 14px; }}
                .btn {{
                  background: rgba(0, 240, 255, 0.15);
                  border: 1px solid rgba(0, 240, 255, 0.4);
                  color: #00f0ff;
                  padding: 8px 18px;
                  border-radius: 6px;
                  font-weight: 700;
                  cursor: pointer;
                  text-decoration: none;
                  font-size: 0.85rem;
                  transition: all 0.2s ease;
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                }}
                .btn:hover {{
                  background: #00f0ff;
                  color: #040810;
                  box-shadow: 0 0 15px rgba(0, 240, 255, 0.5);
                }}
                .btn-primary {{
                  background: #0284c7;
                  border-color: #38bdf8;
                  color: #fff;
                }}
                .btn-primary:hover {{
                  background: #38bdf8;
                  color: #040810;
                }}
                :fullscreen .stream-img, :-webkit-full-screen .stream-img {{
                  max-height: 100vh;
                  height: 100vh;
                  width: 100vw;
                  object-fit: contain;
                }}
                :fullscreen, :-webkit-full-screen {{
                  background: #000 !important;
                }}
              </style>
            </head>
            <body>
              <div class="card">
                <h2>LOGI C270 HD WEBCAM // LIVE STREAM</h2>
                <p style="color: #94a3b8; font-size: 0.9rem; margin: 4px 0 12px;">Active Device: <strong style="color: #10b981;">{cam_mgr.cam_name}</strong> &bull; Resolution: <strong>{cam_mgr.res[0]}x{cam_mgr.res[1]}</strong></p>
                
                <div class="stream-container" id="stream-box" title="Click or Press F for Fullscreen">
                  <img src="/stream.mjpg" class="stream-img" id="stream-feed" alt="Camera Stream" />
                </div>

                <div class="btn-group">
                  <button class="btn btn-primary" id="btn-fullscreen" onclick="toggleFullscreen()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                    <span>Fullscreen Mode (F)</span>
                  </button>
                  <a class="btn" href="/snapshot.jpg" target="_blank">View Snapshot</a>
                  <a class="btn" href="/stream.mjpg" target="_blank">Direct MJPEG Stream</a>
                  <a class="btn" href="http://localhost:8080/dom.html" style="border-color:#10b981; color:#34d399;">Launch Digital Twin UI</a>
                </div>
              </div>

              <script>
                function toggleFullscreen() {{
                  const box = document.getElementById('stream-box');
                  if (!document.fullscreenElement) {{
                    if (box.requestFullscreen) box.requestFullscreen();
                    else if (box.webkitRequestFullscreen) box.webkitRequestFullscreen();
                  }} else {{
                    if (document.exitFullscreen) document.exitFullscreen();
                  }}
                }}
                document.getElementById('stream-box').addEventListener('dblclick', toggleFullscreen);
                window.addEventListener('keydown', (e) => {{
                  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
                }});
              </script>
            </body>
            </html>"""
            self.wfile.write(html.encode())

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

def run_server():
    cam_mgr.start()
    server = ThreadedHTTPServer(('0.0.0.0', PORT), StreamHandler)
    print("\n=======================================================")
    print(f" Camera Streaming Bridge Running on port {PORT}!")
    print(f" MJPEG Stream: http://localhost:{PORT}/stream.mjpg")
    print(f" Snapshot:     http://localhost:{PORT}/snapshot.jpg")
    print("=======================================================\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        cam_mgr.stop()

if __name__ == '__main__':
    run_server()
