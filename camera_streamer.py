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
            html = f"""
            <html><body style="background:#0a0e1a;color:#fff;font-family:sans-serif;text-align:center;padding:20px;">
            <h2>Logi C270 HD WebCam Stream Server</h2>
            <p>Active Camera: <strong>{cam_mgr.cam_name}</strong></p>
            <p><a style="color:#00f0ff;" href="/stream.mjpg">Open MJPEG Stream</a> | <a style="color:#00f0ff;" href="/snapshot.jpg">Snapshot</a></p>
            <img src="/stream.mjpg" style="max-width:800px;border-radius:8px;border:1px solid #334155;"/>
            </body></html>
            """
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
