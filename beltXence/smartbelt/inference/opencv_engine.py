"""
SmartBelt v2 — OpenCV Fallback Vision Engine
=============================================
A drop-in replacement for PatchCoreEngine that uses pure OpenCV computer vision
when the PatchCore .ckpt model file is unavailable.

Implements the same interface as PatchCoreEngine:
    engine.start()
    engine.submit_frame(bgr_frame)
    engine.latest_result        -> InferenceResult
    engine.stop()

Detection pipeline (same as camera_vision_detector.py):
  1. ROI strip      — central belt region extraction
  2. Edge density   — Canny edge map (tears, cracks)
  3. Texture score  — local std-dev filter (worn / shiny zones)
  4. Color anomaly  — HSV z-score vs. calibrated baseline (stains)
  5. EMA fusion     — weighted combination + exponential smoothing
"""

import logging
import threading
import time
from typing import List, Optional, Tuple

import cv2
import numpy as np

from smartbelt.inference.patchcore_engine import InferenceResult, THRESHOLD_1, THRESHOLD_2

logger = logging.getLogger(__name__)

# ── Vision parameters ─────────────────────────────────────────────────────────
_BLUR_K      = 5
_CANNY_LO    = 40
_CANNY_HI    = 120
_TEX_K       = 11
_EDGE_W      = 0.45
_TEX_W       = 0.30
_COLOR_W     = 0.25
_EMA_ALPHA   = 0.30
_CAL_FRAMES  = 50      # frames collected before colour baseline is ready
_ROI_FRAC    = 0.55    # fraction of frame height used as belt ROI


class OpenCVVisionEngine:
    """
    OpenCV-based belt anomaly engine.
    Runs inference in a daemon thread and exposes the same API as PatchCoreEngine.
    """

    def __init__(self) -> None:
        self._running  = False
        self._thread: Optional[threading.Thread] = None
        self._frame_lock = threading.Lock()
        self._result_lock = threading.Lock()
        self._pending_frame: Optional[np.ndarray] = None
        self._latest_result: Optional[InferenceResult] = None
        self._frame_id = 0

        # Colour baseline calibration state
        self._cal_accum: List[np.ndarray] = []
        self._cal_frames = 0
        self._calibrated = False
        self._baseline_mean: Optional[np.ndarray] = None
        self._baseline_std: Optional[np.ndarray] = None
        self._ema_score = 0.0

    # ── Public API (matches PatchCoreEngine) ──────────────────────────────────
    def load(self) -> None:
        """No-op for compatibility with PatchCoreEngine.load()."""
        logger.info("OpenCVVisionEngine: no model file needed — using pure-CV pipeline.")

    def start(self) -> None:
        """Start the background inference thread."""
        self._running = True
        self._thread = threading.Thread(
            target=self._inference_loop, name="OpenCVVisionEngine", daemon=True
        )
        self._thread.start()
        logger.info("OpenCVVisionEngine inference thread started.")

    def stop(self) -> None:
        """Stop the inference thread."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=3.0)
        logger.info("OpenCVVisionEngine stopped.")

    def submit_frame(self, bgr_frame: np.ndarray) -> None:
        """Submit a new frame (non-blocking, newest-wins)."""
        with self._frame_lock:
            self._pending_frame = bgr_frame.copy()

    @property
    def latest_result(self) -> Optional[InferenceResult]:
        """Thread-safe access to the most recent inference result."""
        with self._result_lock:
            return self._latest_result

    # ── Background thread ─────────────────────────────────────────────────────
    def _inference_loop(self) -> None:
        while self._running:
            frame = None
            with self._frame_lock:
                if self._pending_frame is not None:
                    frame = self._pending_frame
                    self._pending_frame = None

            if frame is None:
                time.sleep(0.033)
                continue

            self._frame_id += 1
            t0 = time.monotonic()
            score, amap, annotated = self._analyse(frame)
            latency = time.monotonic() - t0

            result = InferenceResult(
                visual_score=score,
                anomaly_map=amap,
                raw_frame=frame,
                annotated_frame=annotated,
                inference_latency_s=latency,
                frame_id=self._frame_id,
            )
            with self._result_lock:
                self._latest_result = result

    # ── Computer-Vision pipeline ──────────────────────────────────────────────
    def _analyse(self, bgr: np.ndarray) -> Tuple[float, Optional[np.ndarray], np.ndarray]:
        h, w = bgr.shape[:2]

        # 1. ROI strip
        roi_top    = int(h * (1 - _ROI_FRAC) / 2)
        roi_bottom = h - roi_top
        roi        = bgr[roi_top:roi_bottom, :]

        blurred = cv2.GaussianBlur(roi, (_BLUR_K, _BLUR_K), 0)
        gray    = cv2.cvtColor(blurred, cv2.COLOR_BGR2GRAY)

        # 2. Edge density (Canny)
        edges      = cv2.Canny(gray, _CANNY_LO, _CANNY_HI)
        edge_map   = cv2.GaussianBlur(edges.astype(np.float32) / 255.0, (21, 21), 8)
        edge_score = float(np.mean(edge_map))

        # 3. Texture variance (local std-dev)
        gray_f  = gray.astype(np.float32)
        mean_f  = cv2.blur(gray_f, (_TEX_K, _TEX_K))
        mean_sq = cv2.blur(gray_f ** 2, (_TEX_K, _TEX_K))
        tex_map  = np.sqrt(np.maximum(mean_sq - mean_f ** 2, 0.0))
        tex_norm = np.clip(tex_map / (tex_map.max() + 1e-6), 0.0, 1.0)
        tex_score = float(np.mean(tex_norm))

        # 4. Colour anomaly (HSV z-score vs baseline)
        hsv_roi = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV).astype(np.float32)
        if not self._calibrated:
            self._cal_accum.append(hsv_roi)
            self._cal_frames += 1
            if self._cal_frames >= _CAL_FRAMES:
                stacked = np.stack(self._cal_accum, axis=0)
                self._baseline_mean = stacked.mean(axis=0).astype(np.float32)
                self._baseline_std  = stacked.std(axis=0).astype(np.float32)
                self._cal_accum.clear()
                self._calibrated = True
                logger.info("OpenCVVisionEngine: colour baseline calibrated.")
            color_map   = np.zeros(gray.shape, dtype=np.float32)
            color_score = 0.0
        else:
            diff         = np.abs(hsv_roi - self._baseline_mean)
            diff[..., 0] = np.minimum(diff[..., 0], 180.0 - diff[..., 0])
            std_safe     = np.maximum(self._baseline_std, 1.0)
            z            = diff / std_safe
            color_map    = np.clip(
                (z[..., 0] * 0.45 + z[..., 1] * 0.35 + z[..., 2] * 0.20) / 6.0,
                0.0, 1.0
            ).astype(np.float32)
            color_score  = float(np.mean(color_map))

        # 5. Fused raw score
        raw = (
            _EDGE_W  * np.clip(edge_score * 12.0, 0.0, 1.0) +
            _TEX_W   * np.clip(tex_score  * 4.0,  0.0, 1.0) +
            _COLOR_W * np.clip(color_score * 3.0,  0.0, 1.0)
        )
        raw = float(np.clip(raw, 0.0, 1.0))
        self._ema_score = _EMA_ALPHA * raw + (1.0 - _EMA_ALPHA) * self._ema_score
        score = float(self._ema_score)

        # 6. Anomaly map (full frame)
        roi_h     = edge_map.shape[0]
        fused_roi = np.clip(_EDGE_W * edge_map + _TEX_W * tex_norm + _COLOR_W * color_map, 0.0, 1.0)
        full_amap = np.zeros((h, w), dtype=np.float32)
        full_amap[roi_top:roi_top + roi_h, :] = cv2.resize(
            fused_roi, (w, roi_h), interpolation=cv2.INTER_LINEAR
        )

        # 7. Annotated frame (heatmap overlay + HUD text)
        annotated = self._render(bgr, full_amap, score, roi_top, roi_bottom)

        return score, full_amap, annotated

    def _render(
        self,
        bgr: np.ndarray,
        amap: np.ndarray,
        score: float,
        roi_top: int,
        roi_bottom: int,
    ) -> np.ndarray:
        out  = bgr.copy()
        h, w = out.shape[:2]

        # Heatmap overlay (only after calibration)
        if self._calibrated:
            uint8      = (amap * 255).clip(0, 255).astype(np.uint8)
            heatmap    = cv2.applyColorMap(uint8, cv2.COLORMAP_JET)
            out        = cv2.addWeighted(out, 0.62, heatmap, 0.38, 0)

        # ROI border
        if score >= THRESHOLD_2:
            border_color = (0, 40, 220)    # red
        elif score >= THRESHOLD_1:
            border_color = (0, 145, 255)   # orange
        else:
            border_color = (0, 210, 60)    # green
        cv2.rectangle(out, (0, roi_top), (w - 1, roi_bottom), border_color, 2)

        # Status label (with calibration progress)
        if not self._calibrated:
            pct   = int(self._cal_frames / _CAL_FRAMES * 100)
            label = f"[CV] CALIBRATING {pct}%"
            color = (200, 220, 60)
        elif score >= THRESHOLD_2:
            label = f"[CV] CRITICAL DAMAGE  {score:.4f}"
            color = (0, 40, 220)
        elif score >= THRESHOLD_1:
            label = f"[CV] ELEVATED RISK    {score:.4f}"
            color = (0, 145, 255)
        else:
            label = f"[CV] NOMINAL BELT     {score:.4f}"
            color = (0, 210, 60)

        # HUD bar
        overlay = out.copy()
        cv2.rectangle(overlay, (0, 0), (w, 50), (12, 14, 22), -1)
        out = cv2.addWeighted(overlay, 0.75, out, 0.25, 0)

        cv2.putText(out, label, (14, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(out, label, (14, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.85, color, 2, cv2.LINE_AA)

        # Score bar (bottom)
        bar_w = int(w * min(score, 1.0))
        cv2.rectangle(out, (0, h - 5), (w, h), (30, 30, 30), -1)
        cv2.rectangle(out, (0, h - 5), (bar_w, h), border_color, -1)

        return out
