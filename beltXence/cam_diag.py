import cv2
print("OpenCV version:", cv2.__version__)

found = []
for idx in range(5):
    cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
    if cap.isOpened():
        ret, frame = cap.read()
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        print(f"  Camera [{idx}] DSHOW : {w}x{h} @ {fps:.0f}fps  read_ok={ret}")
        found.append(idx)
    else:
        print(f"  Camera [{idx}] DSHOW : NOT available")
    cap.release()

print("--- default backend ---")
for idx in range(3):
    cap = cv2.VideoCapture(idx)
    status = "FOUND" if cap.isOpened() else "not available"
    print(f"  Camera [{idx}] default: {status}")
    cap.release()

if not found:
    print("\nNO cameras detected. Will use video file fallback.")
else:
    print(f"\nCameras detected at indices: {found}")
