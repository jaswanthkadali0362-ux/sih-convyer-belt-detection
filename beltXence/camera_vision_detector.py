"""
SmartBelt — Standalone OpenCV Camera Vision Belt Detector
==========================================================
Real-time conveyor belt inspection using pure computer vision.
No deep-learning model or checkpoint file required.

Detection pipeline (multi-stage):
  1. ROI tracking  — belt region auto-detected via central horizontal strip
  2. Edge density   — Canny gradient magnitude => surface tear / crack proxy
  3. Texture score  — local variance map (std-dev filter) => worn / shiny zones
  4. Color anomaly  — HSV deviation from baseline palette => stain / discoloration
  5. Structural gaps — morphological analysis => missing-chunk detection
  6. Fused score    — weighted combination of all channels, EMA-smoothed

Usage (standalone script):
    python camera_vision_detector.py                    # live webcam (index 0)
    python camera_vision_detector.py --source 1         # second USB camera
    python camera_vision_detector.py --source videos/conveyorbelt.mp4
    python camera_vision_detector.py --source videos/conveyor_with_real_damage.mp4

Controls in the OpenCV window:
    Q / ESC  — quit
    S        — save current annotated frame as PNG
    R        — reset baseline (re-calibrate color palette)
    P        — toggle pause / resume
    H        — toggle heatmap overlay on / off
    +/-      — increase / decrease sensitivity threshold
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import List, Optional, Tuple

import cv2
import numpy as np

# ── Tunable constants ─────────────────────────────────────────────────────────
WINDOW_TITLE = "SmartBelt — Camera Vision Belt Detector"

# Anomaly thresholds (0-1 scale)
THRESHOLD_ELEVATED = 0.40   # above -> ELEVATED RISK
THRESHOLD_CRITICAL = 0.65   # above -> CRITICAL DAMAGE

# EMA smoothing factor (higher = smoother but slower response)
EMA_ALPHA = 0.30

# Baseline colour calibration: collect N frames before scoring begins
BASELINE_FRAMES = 40

# Kernel sizes for vision stages
BLUR_KSIZE   = 5      # Gaussian pre-blur
CANNY_LOW    = 40
CANNY_HIGH   = 120
TEX_KSIZE    = 11     # Local std-dev window
TEX_WEIGHT   = 0.30
EDGE_WEIGHT  = 0.45
COLOR_WEIGHT = 0.25

# ── Colors (BGR) ──────────────────────────────────────────────────────────────
GREEN  = (0, 210, 60)
ORANGE = (0, 145, 255)
RED    = (0, 40, 220)
WHITE  = (245, 245, 245)
DARK   = (18, 20, 30)
TEAL   = (200, 220, 60)


# =============================================================================
class BeltVisionDetector:
    """
    Multi-stage OpenCV belt anomaly detector.
    Produces a fused anomaly score [0, 1] and a colour heatmap per frame.
    """

    def __init__(
        self,
        source: int | str = 0,
        width: int = 1280,
        height: int = 720,
        fps: int = 30,
        roi_frac: float = 0.55,
    ) -> None:
        self.source = source
        self.width = width
        self.height = height
        self.fps = fps
        self.roi_frac = roi_frac

        # Runtime state
        self._cap: Optional[cv2.VideoCapture] = None
        self._ema_score: float = 0.0
        self._calibrating: bool = True
        self._cal_frames: int = 0
        self._baseline_mean_hsv: Optional[np.ndarray] = None
        self._baseline_std_hsv: Optional[np.ndarray] = None
        self._cal_accum: List[np.ndarray] = []

        # Frame counters / stats
        self.frame_count: int = 0
        self.fps_measured: float = 0.0
        self._fps_t0: float = time.monotonic()
        self._fps_frames: int = 0

        # Runtime flags (toggled by keypresses)
        self.show_heatmap: bool = True
        self.paused: bool = False
        self.sensitivity: float = 1.0

        self.is_video_file = not str(source).lstrip("-").isdigit()

    # ── Public entry point ────────────────────────────────────────────────────
    def run(self) -> None:
        """Open camera and run the interactive detection loop."""
        self._open_source()
        cv2.namedWindow(WINDOW_TITLE, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(WINDOW_TITLE, 1280, 720)
        print(f"\n[BeltVision] Camera opened. Source: {self.source}")
        print("[BeltVision] Calibrating colour baseline — keep belt moving normally...")
        print("[BeltVision] Controls: Q=quit | S=save | R=reset | P=pause | H=heatmap | +/-=sensitivity\n")

        save_idx = 0
        last_annotated: Optional[np.ndarray] = None

        while True:
            if not self.paused:
                ret, frame = self._cap.read()
                if not ret:
                    if self.is_video_file:
                        self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        continue
                    print("[BeltVision] Camera disconnected.")
                    break

                self.frame_count += 1
                self._update_fps()
                score, heatmap, annotated = self.process_frame(frame)
                last_annotated = annotated
                cv2.imshow(WINDOW_TITLE, annotated)
            else:
                if last_annotated is not None:
                    cv2.imshow(WINDOW_TITLE, last_annotated)
                time.sleep(0.03)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            elif key == ord("s"):
                if last_annotated is not None:
                    fname = f"belt_detection_{save_idx:04d}.png"
                    cv2.imwrite(fname, last_annotated)
                    print(f"[BeltVision] Saved: {fname}")
                    save_idx += 1
            elif key == ord("r"):
                self._reset_baseline()
                print("[BeltVision] Baseline reset — recalibrating...")
            elif key == ord("p"):
                self.paused = not self.paused
                print("[BeltVision] " + ("PAUSED" if self.paused else "RESUMED"))
            elif key == ord("h"):
                self.show_heatmap = not self.show_heatmap
            elif key in (ord("+"), ord("=")):
                self.sensitivity = min(3.0, self.sensitivity + 0.1)
                print(f"[BeltVision] Sensitivity: {self.sensitivity:.1f}")
            elif key in (ord("-"), ord("_")):
                self.sensitivity = max(0.1, self.sensitivity - 0.1)
                print(f"[BeltVision] Sensitivity: {self.sensitivity:.1f}")

        self._cap.release()
        cv2.destroyAllWindows()
        print("[BeltVision] Stopped.")

    def process_frame(
        self, bgr_frame: np.ndarray
    ) -> Tuple[float, np.ndarray, np.ndarray]:
        """
        Run full detection pipeline on a single BGR frame.

        Returns:
            score       -- fused anomaly score in [0, 1]
            heatmap     -- uint8 BGR heatmap matching frame size
            annotated   -- frame with heatmap overlay + HUD text
        """
        h, w = bgr_frame.shape[:2]

        # 1. ROI extraction (central belt strip)
        roi_top    = int(h * (1 - self.roi_frac) / 2)
        roi_bottom = h - roi_top
        roi        = bgr_frame[roi_top:roi_bottom, :]

        # 2. Pre-blur
        blurred = cv2.GaussianBlur(roi, (BLUR_KSIZE, BLUR_KSIZE), 0)
        gray    = cv2.cvtColor(blurred, cv2.COLOR_BGR2GRAY)

        # 3. Edge density map (Canny)
        edges     = cv2.Canny(gray, CANNY_LOW, CANNY_HIGH)
        edge_map  = cv2.GaussianBlur(edges.astype(np.float32) / 255.0, (21, 21), 8)
        edge_score = float(np.mean(edge_map))

        # 4. Texture variance map
        tex_map  = self._local_std(gray, TEX_KSIZE)
        tex_norm = np.clip(tex_map / (tex_map.max() + 1e-6), 0.0, 1.0)
        tex_score = float(np.mean(tex_norm))

        # 5. Colour anomaly map
        hsv_roi = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV).astype(np.float32)

        if self._calibrating:
            self._cal_accum.append(hsv_roi)
            self._cal_frames += 1
            if self._cal_frames >= BASELINE_FRAMES:
                self._compute_baseline()
                self._calibrating = False
                print("[BeltVision] Baseline ready — detection active.")
            color_map   = np.zeros_like(gray, dtype=np.float32)
            color_score = 0.0
        else:
            color_map, color_score = self._colour_anomaly(hsv_roi)

        # 6. Structural gap map (morphological)
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        kernel    = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 3))
        closed    = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        gap_map   = cv2.bitwise_xor(closed, thresh).astype(np.float32) / 255.0

        # 7. Fused anomaly score
        raw_score = (
            EDGE_WEIGHT  * np.clip(edge_score * 12.0, 0.0, 1.0) +
            TEX_WEIGHT   * np.clip(tex_score  * 4.0,  0.0, 1.0) +
            COLOR_WEIGHT * np.clip(color_score * 3.0, 0.0, 1.0)
        )
        raw_score = float(np.clip(raw_score * self.sensitivity, 0.0, 1.0))

        # EMA smoothing
        self._ema_score = EMA_ALPHA * raw_score + (1 - EMA_ALPHA) * self._ema_score
        score = float(self._ema_score)

        # 8. Build heatmap
        heatmap_roi = self._build_heatmap(
            edge_map, tex_norm, color_map, gap_map, bgr_frame.shape[:2], roi_top
        )

        # 9. Annotate frame
        annotated = self._render_hud(bgr_frame.copy(), score, roi_top, roi_bottom, heatmap_roi)

        return score, heatmap_roi, annotated

    # ── Private helpers ───────────────────────────────────────────────────────
    @staticmethod
    def _local_std(gray: np.ndarray, ksize: int) -> np.ndarray:
        """Compute per-pixel local standard deviation within a sliding window."""
        gray_f  = gray.astype(np.float32)
        mean    = cv2.blur(gray_f, (ksize, ksize))
        mean_sq = cv2.blur(gray_f ** 2, (ksize, ksize))
        variance = np.maximum(mean_sq - mean ** 2, 0.0)
        return np.sqrt(variance)

    def _colour_anomaly(
        self, hsv: np.ndarray
    ) -> Tuple[np.ndarray, float]:
        """Measure per-pixel deviation from calibrated baseline HSV palette."""
        if self._baseline_mean_hsv is None:
            return np.zeros(hsv.shape[:2], dtype=np.float32), 0.0

        diff = np.abs(hsv - self._baseline_mean_hsv)
        # Hue is circular — clamp difference to [0, 90]
        diff[..., 0] = np.minimum(diff[..., 0], 180.0 - diff[..., 0])
        std_safe  = np.maximum(self._baseline_std_hsv, 1.0)
        z_score   = diff / std_safe
        amap      = (z_score[..., 0] * 0.45 + z_score[..., 1] * 0.35 + z_score[..., 2] * 0.20)
        amap_norm = np.clip(amap / 6.0, 0.0, 1.0)
        return amap_norm.astype(np.float32), float(np.mean(amap_norm))

    def _compute_baseline(self) -> None:
        stacked = np.stack(self._cal_accum, axis=0)
        self._baseline_mean_hsv = stacked.mean(axis=0).astype(np.float32)
        self._baseline_std_hsv  = stacked.std(axis=0).astype(np.float32)
        self._cal_accum.clear()

    def _reset_baseline(self) -> None:
        self._calibrating = True
        self._cal_frames  = 0
        self._cal_accum.clear()
        self._baseline_mean_hsv = None
        self._baseline_std_hsv  = None
        self._ema_score = 0.0

    def _build_heatmap(
        self,
        edge_map: np.ndarray,
        tex_map:  np.ndarray,
        color_map: np.ndarray,
        gap_map:  np.ndarray,
        frame_shape: Tuple[int, int],
        roi_top: int,
    ) -> np.ndarray:
        """Combine detection channels into a single JET heatmap (full frame size)."""
        h, w   = frame_shape
        roi_h  = edge_map.shape[0]

        fused_roi = (
            EDGE_WEIGHT  * edge_map  +
            TEX_WEIGHT   * tex_map   +
            COLOR_WEIGHT * color_map
        )
        fused_roi = np.clip(fused_roi, 0.0, 1.0)

        full_amap = np.zeros((h, w), dtype=np.float32)
        full_amap[roi_top:roi_top + roi_h, :] = cv2.resize(
            fused_roi, (w, roi_h), interpolation=cv2.INTER_LINEAR
        )

        uint8       = (full_amap * 255).clip(0, 255).astype(np.uint8)
        heatmap_bgr = cv2.applyColorMap(uint8, cv2.COLORMAP_JET)
        return heatmap_bgr

    def _render_hud(
        self,
        frame: np.ndarray,
        score: float,
        roi_top: int,
        roi_bottom: int,
        heatmap: np.ndarray,
    ) -> np.ndarray:
        """Overlay heatmap and HUD telemetry onto the frame."""
        h, w = frame.shape[:2]

        # Heatmap overlay
        if self.show_heatmap and not self._calibrating:
            alpha = 0.38
            frame = cv2.addWeighted(frame, 1.0 - alpha, heatmap, alpha, 0)

        # ROI border colour
        roi_color = (
            RED if score >= THRESHOLD_CRITICAL
            else ORANGE if score >= THRESHOLD_ELEVATED
            else GREEN
        )
        cv2.rectangle(frame, (0, roi_top), (w - 1, roi_bottom), roi_color, 2)

        # Status label
        if self._calibrating:
            pct         = int(self._cal_frames / BASELINE_FRAMES * 100)
            label       = f"CALIBRATING BASELINE  {pct}%"
            bar_color   = TEAL
            label_color = TEAL
        elif score >= THRESHOLD_CRITICAL:
            label       = f"CRITICAL DAMAGE  {score:.4f}"
            bar_color   = RED
            label_color = RED
        elif score >= THRESHOLD_ELEVATED:
            label       = f"ELEVATED RISK   {score:.4f}"
            bar_color   = ORANGE
            label_color = ORANGE
        else:
            label       = f"NOMINAL BELT    {score:.4f}"
            bar_color   = GREEN
            label_color = GREEN

        # Score bar (bottom strip)
        bar_h = 6
        bar_w = int(w * min(score, 1.0))
        cv2.rectangle(frame, (0, h - bar_h), (w, h), (30, 30, 30), -1)
        cv2.rectangle(frame, (0, h - bar_h), (bar_w, h), bar_color, -1)

        # Threshold reference markers
        for thresh, color in [(THRESHOLD_ELEVATED, ORANGE), (THRESHOLD_CRITICAL, RED)]:
            x_pos = int(thresh * w)
            cv2.line(frame, (x_pos, h - bar_h), (x_pos, h), color, 2)

        # Top HUD bar (semi-transparent)
        hud_h   = 54
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (w, hud_h), (12, 14, 22), -1)
        frame = cv2.addWeighted(overlay, 0.75, frame, 0.25, 0)

        # Status text (outline + fill)
        font  = cv2.FONT_HERSHEY_SIMPLEX
        scale = 0.85
        cv2.putText(frame, label, (14, 36), font, scale, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(frame, label, (14, 36), font, scale, label_color, 2, cv2.LINE_AA)

        # Right-side stats
        stats_x = w - 290
        for i, txt in enumerate([
            f"FPS:   {self.fps_measured:.1f}",
            f"Frame: {self.frame_count}",
            f"Sens:  {self.sensitivity:.1f}x",
        ]):
            cv2.putText(frame, txt, (stats_x, 20 + i * 16),
                        cv2.FONT_HERSHEY_PLAIN, 1.1, (160, 170, 180), 1, cv2.LINE_AA)

        # PAUSED badge
        if self.paused:
            cv2.putText(frame, "[ PAUSED ]", (w // 2 - 70, h // 2),
                        font, 1.2, WHITE, 3, cv2.LINE_AA)

        # Heatmap-off badge
        if not self.show_heatmap:
            cv2.putText(frame, "Heatmap: OFF", (14, h - 14),
                        cv2.FONT_HERSHEY_PLAIN, 1.0, (100, 100, 100), 1, cv2.LINE_AA)

        return frame

    def _update_fps(self) -> None:
        self._fps_frames += 1
        elapsed = time.monotonic() - self._fps_t0
        if elapsed >= 1.0:
            self.fps_measured = self._fps_frames / elapsed
            self._fps_frames  = 0
            self._fps_t0      = time.monotonic()

    def _open_source(self) -> None:
        source_str = str(self.source)
        if source_str.lstrip("-").isdigit():
            dev = int(source_str)
            self._cap = cv2.VideoCapture(dev, cv2.CAP_DSHOW)
            if not self._cap.isOpened():
                self._cap = cv2.VideoCapture(dev)
            if not self._cap.isOpened():
                raise RuntimeError(
                    f"Cannot open camera index {dev}. "
                    "Check USB connection or try --source 1."
                )
            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH,  self.width)
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self._cap.set(cv2.CAP_PROP_FPS,          self.fps)
            self._cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)
        else:
            path = Path(source_str)
            if not path.exists():
                raise FileNotFoundError(f"Video file not found: {path}")
            self._cap = cv2.VideoCapture(str(path))
            if not self._cap.isOpened():
                raise RuntimeError(f"Cannot open video file: {path}")
            native_fps = self._cap.get(cv2.CAP_PROP_FPS)
            if native_fps > 0:
                self.fps = int(native_fps)


# =============================================================================
def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="SmartBelt — OpenCV Camera Vision Belt Detector",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--source", "-s", default="0",
                   help="Camera index or video file path. Default: 0")
    p.add_argument("--width",  type=int, default=1280)
    p.add_argument("--height", type=int, default=720)
    p.add_argument("--sensitivity", "-S", type=float, default=1.0,
                   help="Score sensitivity multiplier (0.1-3.0). Default: 1.0")
    p.add_argument("--no-heatmap", action="store_true",
                   help="Disable heatmap overlay on startup.")
    p.add_argument("--calibration-frames", type=int, default=BASELINE_FRAMES,
                   help=f"Frames for colour baseline. Default: {BASELINE_FRAMES}")
    return p.parse_args()


# =============================================================================
if __name__ == "__main__":
    args = _parse_args()

    try:
        source: int | str = int(args.source)
        # Prioritize Logi C270 HD WebCam (index 2 / 1280x720) if default 0 passed
        if source == 0:
            import cv2 as _cv2
            for _probe in [2, 1, 3, 0]:
                _cap2 = _cv2.VideoCapture(_probe, _cv2.CAP_DSHOW)
                if _cap2.isOpened():
                    _ret, _ = _cap2.read()
                    _cap2.release()
                    if _ret:
                        _name = "Logi C270 HD WebCam" if _probe == 2 else f"Camera index {_probe}"
                        print(f"[BeltVision] Auto-selected {_name} (index {_probe})")
                        source = _probe
                        break
    except ValueError:
        source = args.source

    # Honour calibration-frames argument by patching the module constant
    import camera_vision_detector as _self
    _self.BASELINE_FRAMES = args.calibration_frames

    detector = BeltVisionDetector(
        source=source,
        width=args.width,
        height=args.height,
    )
    detector.sensitivity  = args.sensitivity
    detector.show_heatmap = not args.no_heatmap

    try:
        detector.run()
    except (RuntimeError, FileNotFoundError) as exc:
        print(f"\n[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n[BeltVision] Interrupted by user.")
        sys.exit(0)
