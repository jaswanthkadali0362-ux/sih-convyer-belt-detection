"""
SmartBelt v2 — Live Operations Dashboard
Fixes:
  1. Webcam shown with a placeholder when offline, explicit Connect button
  2. Auto-refresh driven by streamlit-autorefresh (controlled refresh, no page rerun spam)
  3. Per-node individual COM port selection: Node 1 ESP32 / Node 2 Arduino / Node 3 ESP32
"""

import sys
import time
from pathlib import Path
import streamlit as st

# Allow running directly with: python app.py
if __name__ == "__main__" and hasattr(st, "runtime") and not st.runtime.exists():
    from streamlit.web import cli as stcli
    sys.argv = ["streamlit", "run", str(Path(__file__).resolve())]
    sys.exit(stcli.main())

try:
    from streamlit_autorefresh import st_autorefresh
    HAS_AUTOREFRESH = True
except ImportError:
    HAS_AUTOREFRESH = False

# Anchor project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from smartbelt.dashboard.ui import (
    render_alert_banner,
    render_hardware_diagnostics,
    render_header,
    render_live_view,
    render_sidebar_calibration,
    render_sidebar_node_ports,
    render_telemetry_history,
)
from smartbelt.pipeline.orchestrator import OrchestratorConfig, SmartBeltOrchestrator

st.set_page_config(
    page_title="SmartBelt v2 — Hardware Inspection System",
    page_icon="🏭",
    layout="wide",
    initial_sidebar_state="expanded",
)


@st.cache_resource
def get_orchestrator() -> SmartBeltOrchestrator:
    """Initialize and start background acquisition and neural inference threads."""
    config = OrchestratorConfig()
    orch = SmartBeltOrchestrator(config)
    orch.start()
    return orch


# ── Session State Defaults ────────────────────────────────────────────────────
if "history" not in st.session_state:
    st.session_state["history"] = []
if "live_refresh" not in st.session_state:
    st.session_state["live_refresh"] = True
if "refresh_interval_ms" not in st.session_state:
    st.session_state["refresh_interval_ms"] = 1000

orchestrator = get_orchestrator()

# ── Controlled Auto-Refresh (NOT a st.rerun loop) ────────────────────────────
if st.session_state["live_refresh"] and HAS_AUTOREFRESH:
    st_autorefresh(
        interval=st.session_state["refresh_interval_ms"],
        limit=None,
        key="smartbelt_autorefresh",
    )
elif st.session_state["live_refresh"] and not HAS_AUTOREFRESH:
    # Fallback: only rerun once, let Streamlit's native refresh handle it
    pass

# ── Sidebar ───────────────────────────────────────────────────────────────────
render_sidebar_calibration(orchestrator)

st.sidebar.markdown("---")
st.sidebar.subheader("🎥 Camera / Vision Source")

# Auto-detect available live camera indices
_cam_labels_order = []
_cam_options: dict = {}
try:
    from smartbelt.camera.capture import detect_camera_index
    import cv2 as _cv2
    for _idx in [2, 1, 3, 0, 4, 5]:
        _cap = _cv2.VideoCapture(_idx, _cv2.CAP_DSHOW)
        if _cap.isOpened():
            _ret, _ = _cap.read()
            _w = int(_cap.get(_cv2.CAP_PROP_FRAME_WIDTH) or 0)
            _cap.release()
            if _ret:
                if _idx == 2 or _w >= 1280:
                    _lbl = f"📷 ⭐ Logi C270 HD WebCam (index {_idx})"
                    _cam_labels_order.insert(0, _lbl)
                else:
                    _lbl = f"📷 Live Camera (index {_idx})"
                    _cam_labels_order.append(_lbl)
                _cam_options[_lbl] = _idx
        else:
            _cap.release()
except Exception:
    pass

if not _cam_labels_order:
    _cam_labels_order.append("📷 Live Camera (index 0)")
    _cam_options["📷 Live Camera (index 0)"] = 0

_cam_labels_order += [
    "Test Video: Normal Belt",
    "Test Video: Joint Damage",
]
_cam_options["Test Video: Normal Belt"]  = str(PROJECT_ROOT / "videos" / "conveyorbelt.mp4")
_cam_options["Test Video: Joint Damage"] = str(PROJECT_ROOT / "videos" / "conveyor_with_real_damage.mp4")

video_options  = _cam_options
chosen_label   = st.sidebar.selectbox("Vision Source", _cam_labels_order, index=0)
chosen_source  = video_options[chosen_label]

# Camera connect/disconnect
cam_col1, cam_col2 = st.sidebar.columns(2)
with cam_col1:
    if st.button("📷 Connect Camera", key="cam_connect", use_container_width=True):
        success = orchestrator.set_camera_source(chosen_source)
        if success:
            st.sidebar.success("Camera connected!")
        else:
            st.sidebar.error("Camera failed. Check USB connection.")
        st.rerun()

with cam_col2:
    if st.button("⏹ Disconnect", key="cam_disconnect", use_container_width=True):
        orchestrator.camera.stop()
        st.sidebar.info("Camera disconnected.")
        st.rerun()

# Auto-connect camera when source changes
if "current_source" not in st.session_state or st.session_state["current_source"] != chosen_source:
    orchestrator.set_camera_source(chosen_source)
    st.session_state["current_source"] = chosen_source

# ── Per-Node COM Port Controls ────────────────────────────────────────────────
render_sidebar_node_ports(orchestrator)

# ── Live Refresh Controls ─────────────────────────────────────────────────────
st.sidebar.markdown("---")
st.sidebar.subheader("⏱ Live Refresh")

refresh_col1, refresh_col2 = st.sidebar.columns(2)
with refresh_col1:
    if st.button(
        "⏸ Pause" if st.session_state["live_refresh"] else "▶ Resume",
        use_container_width=True,
        key="refresh_toggle",
    ):
        st.session_state["live_refresh"] = not st.session_state["live_refresh"]
        st.rerun()

with refresh_col2:
    refresh_ms = st.selectbox(
        "Interval",
        [500, 1000, 2000, 3000],
        index=1,
        format_func=lambda x: f"{x}ms",
        label_visibility="collapsed",
    )
    st.session_state["refresh_interval_ms"] = refresh_ms

live_label = "🟢 LIVE" if st.session_state["live_refresh"] else "⏸ PAUSED"
st.sidebar.caption(f"Status: {live_label}")

# ── Main Page ─────────────────────────────────────────────────────────────────
state = orchestrator.get_state()

# Update history buffer
if state.sensor_packet and not state.sensor_packet.parse_error:
    st.session_state["history"].append({
        "temp_c": state.sensor_packet.temp_c,
        "vib_rms": state.sensor_packet.vib_rms,
        "load_kg": state.sensor_packet.load_kg,
        "speed_mps": state.sensor_packet.belt_speed_mps,
        "risk_score": state.fusion.fused_score,
    })
    if len(st.session_state["history"]) > 60:
        st.session_state["history"].pop(0)

render_header(state)
render_alert_banner(state)
render_live_view(state)
render_hardware_diagnostics(state)
render_telemetry_history(st.session_state["history"])
