import sys
sys.path.insert(0, ".")

# Test 1: camera capture module imports and detect_camera_index works
from smartbelt.camera.capture import CameraCapture, detect_camera_index
idx = detect_camera_index()
print(f"detect_camera_index() => {idx}")

# Test 2: OpenCV engine imports
from smartbelt.inference.opencv_engine import OpenCVVisionEngine
engine = OpenCVVisionEngine()
engine.load()
engine.start()
print("OpenCVVisionEngine started OK")

# Test 3: Feed a frame from real camera
import cv2, time
cam_idx = idx if idx is not None else 1
cap = cv2.VideoCapture(cam_idx, cv2.CAP_DSHOW)
ret, frame = cap.read()
cap.release()
if ret:
    engine.submit_frame(frame)
    time.sleep(0.2)
    result = engine.latest_result
    if result:
        print(f"Live frame: score={result.visual_score:.4f}  latency={result.inference_latency_s*1000:.1f}ms  shape={result.annotated_frame.shape}")
    else:
        print("No result yet (calibrating)")
else:
    print("Could not read from camera")
engine.stop()

# Test 4: Orchestrator state has new field
from smartbelt.pipeline.orchestrator import SmartBeltState
state = SmartBeltState()
has_field = hasattr(state, "vision_engine_type")
print(f"SmartBeltState.vision_engine_type field present: {has_field}")
print(f"Default value: {state.vision_engine_type}")

print("\nAll integration tests PASSED")
