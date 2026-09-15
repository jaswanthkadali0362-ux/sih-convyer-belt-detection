"""
SmartBelt v2 — Streamlit Dashboard UI
Provides visual layout components:
  - Per-node individual COM port connection (Node 1 ESP32, Node 2 Arduino, Node 3 ESP32)
  - Webcam live view with offline placeholder & camera status
  - Hardware diagnostics table
  - Risk fusion gauges and telemetry charts
"""

from typing import Any, Dict, List, Optional
import cv2
import numpy as np
import pandas as pd
import streamlit as st

from smartbelt.dashboard.charts import create_risk_gauge_figure, create_telemetry_history_figure
from smartbelt.fusion.risk_fusion import FusionState
from smartbelt.pipeline.orchestrator import SmartBeltOrchestrator, SmartBeltState

# ── Webcam offline placeholder (drawn with numpy) ─────────────────────────────
def _make_offline_placeholder(width: int = 640, height: int = 360) -> np.ndarray:
    """Create a dark placeholder image shown when webcam is offline."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = (18, 20, 30)  # dark navy background

    # Draw camera icon outline
    cx, cy = width // 2, height // 2
    cv2.rectangle(img, (cx - 80, cy - 50), (cx + 80, cy + 50), (50, 60, 80), 2)
    cv2.circle(img, (cx, cy), 28, (50, 60, 80), 2)
    cv2.circle(img, (cx, cy), 12, (50, 60, 80), -1)
    cv2.rectangle(img, (cx + 60, cy - 60), (cx + 90, cy - 40), (50, 60, 80), 2)

    # Text lines
    font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(img, "WEBCAM OFFLINE", (cx - 110, cy + 90), font, 0.65, (60, 80, 120), 1, cv2.LINE_AA)
    cv2.putText(img, "Click  'Connect Camera'  in sidebar", (cx - 145, cy + 115), font, 0.42, (45, 55, 80), 1, cv2.LINE_AA)
    return img


# ── render_header ─────────────────────────────────────────────────────────────
def render_header(state: SmartBeltState) -> None:
    """Render top title banner and hardware connectivity badges."""
    st.markdown(
        """
        <div style="display:flex; justify-content:space-between; align-items:center;
                    padding:8px 16px; background-color:#1a1c24; border-radius:8px; margin-bottom:12px;">
            <div>
                <h2 style="margin:0; color:#ffffff; font-family:sans-serif;">SmartBelt v2 — Hardware Inspection</h2>
                <span style="color:#8c9ba5; font-size:13px;">Tri-Node IoT + Vision PatchCore + Real-Time Fusion</span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    c1, c2, c3, c4 = st.columns(4)

    with c1:
        if state.camera_fps > 0:
            cam_badge = "🟢 LIVE"
            cam_delta = f"{state.camera_fps:.1f} FPS"
        else:
            cam_badge = "🔴 OFFLINE"
            cam_delta = "Not connected"
        st.metric("📷 Webcam", cam_badge, cam_delta)

    with c2:
        node_ports = st.session_state.get("node_port_status", {})
        connected = [k for k, v in node_ports.items() if v.get("connected")]
        if connected:
            badge = f"🟢 {len(connected)}/3 Nodes"
            delta = " | ".join(connected)
        else:
            badge = "🔴 No Nodes"
            delta = "None connected"
        st.metric("🔌 IoT Nodes", badge, delta)

    with c3:
        if state.vision_engine_type == "patchcore":
            inf_label = "🧠 PatchCore AI"
            inf_status = "🟢 READY" if state.inference_fps > 0 else "🟡 IDLE"
        elif state.vision_engine_type == "opencv_cv":
            inf_label = "👁 OpenCV Vision"
            inf_status = "🟢 ACTIVE" if state.inference_fps > 0 else "🟡 STARTING"
        else:
            inf_label = "🧠 Vision Engine"
            inf_status = "🔴 OFFLINE"
        st.metric(inf_label, inf_status, f"{state.inference_latency_s:.2f}s")

    with c4:
        calib_status = "🟢 CALIBRATED" if state.calibrated else "🟠 NEED CAL"
        st.metric("📊 Baseline", calib_status)


# ── render_alert_banner ───────────────────────────────────────────────────────
def render_alert_banner(state: SmartBeltState) -> None:
    """Displays color-coded operational risk banner."""
    f = state.fusion
    state_enum = f.state

    if state_enum == FusionState.MULTIMODAL_EMERGENCY:
        bg, border, txt = "#721c24", "#f5c6cb", "#f8d7da"
        title = "🚨 CRITICAL: MULTIMODAL EMERGENCY"
        desc = "Simultaneous visual surface damage and severe mechanical distress!"
    elif state_enum == FusionState.VISION_DOMINANT:
        bg, border, txt = "#856404", "#ffeeba", "#fff3cd"
        title = "⚠️ HIGH ALERT: VISUAL BELT DAMAGE"
        desc = f"PatchCore anomaly score: {f.visual_score:.4f}"
    elif state_enum == FusionState.SENSOR_DOMINANT:
        bg, border, txt = "#856404", "#ffeeba", "#fff3cd"
        title = "⚠️ HIGH ALERT: MECHANICAL DISTRESS"
        desc = f"Sensor score: {f.sensor_score:.4f} — vibration/thermal/load anomaly."
    elif state_enum == FusionState.ELEVATED:
        bg, border, txt = "#533f03", "#ffe8a1", "#fff3cd"
        title = "⚡ WARNING: ELEVATED ZONE"
        desc = "Readings trending above nominal. Maintain observation."
    else:
        bg, border, txt = "#155724", "#c3e6cb", "#d4edda"
        title = "✅ NOMINAL OPERATION"
        desc = "Belt integrity and IoT telemetry within healthy parameters."

    st.markdown(
        f"""<div style="background:{bg}; border:1px solid {border}; color:{txt};
                       padding:10px 16px; border-radius:6px; margin-bottom:12px;">
              <strong style="font-size:15px;">{title}</strong>
              <div style="font-size:13px; margin-top:3px;">{desc}</div>
           </div>""",
        unsafe_allow_html=True,
    )


# ── render_live_view ──────────────────────────────────────────────────────────
def render_live_view(state: SmartBeltState) -> None:
    """Renders webcam feed (or offline placeholder) and sensor gauges."""
    col_left, col_right = st.columns([3, 2])

    with col_left:
        st.subheader("📷 Live Inspection Stream")
        if state.annotated_frame is not None:
            # Camera is working — show live feed
            rgb = cv2.cvtColor(state.annotated_frame, cv2.COLOR_BGR2RGB)
            st.image(rgb, channels="RGB", use_container_width=True)
            st.caption(f"Frame #{state.frame_id}  •  {state.camera_fps:.1f} FPS")
        else:
            # Camera offline — show placeholder
            placeholder = _make_offline_placeholder()
            st.image(placeholder, channels="BGR", use_container_width=True)
            st.caption("⚠️ Camera offline — use **Connect Camera** in the sidebar to start stream.")

    with col_right:
        st.subheader("📊 Risk & Sensor Metrics")
        st.plotly_chart(create_risk_gauge_figure(state.fusion.fused_score), use_container_width=True)

        pkt = state.sensor_packet

        # ── Sensor source status badge ──────────────────────────────────────
        if state.serial_is_simulation:
            src_html = (
                '<span style="background:#1e3a5f;color:#7ec8e3;padding:2px 8px;'
                'border-radius:4px;font-size:11px;font-weight:600;border:1px solid #2563eb;">'
                "🧪 SIMULATION MODE</span>"
            )
        elif state.sensor_healthy:
            src_html = (
                '<span style="background:#14532d;color:#86efac;padding:2px 8px;'
                'border-radius:4px;font-size:11px;font-weight:600;border:1px solid #16a34a;">'
                f"🟢 LIVE — {state.serial_port_active or state.serial_status}</span>"
            )
        else:
            src_html = (
                '<span style="background:#3b1515;color:#fca5a5;padding:2px 8px;'
                'border-radius:4px;font-size:11px;font-weight:600;border:1px solid #dc2626;">'
                "🔴 NO SIGNAL — Connect a node or enable Simulation</span>"
            )
        st.markdown(src_html, unsafe_allow_html=True)
        st.markdown("")

        # ── Sensor readings ─────────────────────────────────────────────────
        m1, m2 = st.columns(2)
        with m1:
            st.metric("🌡 Temperature", f"{pkt.temp_c:.1f} °C" if pkt else "—")
            st.metric("⚖ Belt Load", f"{pkt.load_kg:.2f} kg" if pkt else "—")
        with m2:
            st.metric("📳 Vibration RMS", f"{pkt.vib_rms:.3f} g" if pkt else "—")
            st.metric("💨 Belt Speed", f"{pkt.belt_speed_mps:.2f} m/s" if pkt else "—")

        if not pkt:
            st.caption(
                "⏳ Waiting for sensor data… Enable **Simulation** in the Node Serial Connections "
                "panel (sidebar) or connect a physical ESP32/Arduino node."
            )



# ── render_telemetry_history ──────────────────────────────────────────────────
def render_telemetry_history(history: List[Dict[str, Any]]) -> None:
    """Render rolling historical sensor plots."""
    st.subheader("📈 Telemetry Trends (Last 60 Samples)")
    st.plotly_chart(create_telemetry_history_figure(history), use_container_width=True)


# ── render_sidebar_node_ports ─────────────────────────────────────────────────
def render_sidebar_node_ports(orchestrator: SmartBeltOrchestrator) -> None:
    """
    Individual per-node COM port selector and connect/disconnect controls.
    Node 1 = ESP32 Frame IMU (COM19, 115200 baud)
    Node 2 = Arduino Conveyor Tracker (COM26/COM23, 9600 baud)
    Node 3 = ESP32 Weigh Station (COM21/COM27, 115200 baud)
    """
    st.sidebar.markdown("---")
    st.sidebar.subheader("🔌 Node Serial Connections")

    # Initialise per-node state store
    if "node_port_status" not in st.session_state:
        st.session_state["node_port_status"] = {
            "Node 1": {"port": None, "baud": 115200, "connected": False, "sim": False},
            "Node 2": {"port": None, "baud": 9600,   "connected": False, "sim": False},
            "Node 3": {"port": None, "baud": 115200, "connected": False, "sim": False},
        }

    # Scan COM ports once
    detected = orchestrator.get_available_com_ports()
    rescan_col, count_col = st.sidebar.columns([3, 2])
    with rescan_col:
        if st.button("🔄 Rescan All Ports", key="rescan_all", use_container_width=True):
            st.rerun()
    with count_col:
        n = len(detected)
        st.caption(f"{n} port{'s' if n != 1 else ''} found")

    if not detected:
        st.sidebar.warning(
            "⚠️ No COM ports detected.\n\nPlug in your ESP32 / Arduino via USB, "
            "or choose **Simulation** below to test without hardware."
        )

    # Build display options list
    port_labels: List[str] = ["— None —"]
    port_map: Dict[str, Optional[str]] = {"— None —": None}
    for p in detected:
        tag = " [ESP32]" if p.get("is_esp32") else (" [Arduino]" if p.get("is_arduino") else "")
        label = f"{p['port']} — {p['description']}{tag}"
        port_labels.append(label)
        port_map[label] = p["port"]
    port_labels.append("🧪 Simulation (no hardware)")
    port_map["🧪 Simulation (no hardware)"] = "SIMULATION"
    port_labels.append("✏️ Custom / manual...")
    port_map["✏️ Custom / manual..."] = "CUSTOM"

    nodes = [
        {
            "key":         "Node 1",
            "label":       "Node 1 — ESP32 Frame IMU",
            "emoji":       "🔵",
            "default_baud": 115200,
            "hint":        "COM19 • 115200 baud (MPU-6050 Vibration + Attitude)",
        },
        {
            "key":         "Node 2",
            "label":       "Node 2 — Arduino Belt Tracker",
            "emoji":       "🟣",
            "default_baud": 9600,
            "hint":        "COM26 • 9600 baud (IR Speed + Station Tracking)",
        },
        {
            "key":         "Node 3",
            "label":       "Node 3 — ESP32 Weigh Station",
            "emoji":       "🟡",
            "default_baud": 115200,
            "hint":        "COM27 • 115200 baud (HX711 Load Cell + IMU Tilt)",
        },
    ]

    for node in nodes:
        nk = node["key"]
        ns = st.session_state["node_port_status"][nk]

        connected_icon = "🟢" if ns["connected"] else "🔴"
        with st.sidebar.expander(f"{connected_icon} {node['emoji']} {node['label']}", expanded=not ns["connected"]):
            st.caption(node["hint"])

            # Port selector
            # Try to find the index of any previously selected label
            prev_port = ns.get("port")
            current_label = "— None —"
            if prev_port == "SIMULATION":
                current_label = "🧪 Simulation (no hardware)"
            elif prev_port == "CUSTOM":
                current_label = "✏️ Custom / manual..."
            elif prev_port:
                for lbl, val in port_map.items():
                    if val == prev_port:
                        current_label = lbl
                        break

            try:
                sel_idx = port_labels.index(current_label)
            except ValueError:
                sel_idx = 0

            sel_label = st.selectbox(
                "COM Port",
                port_labels,
                index=sel_idx,
                key=f"port_sel_{nk}",
            )
            sel_port = port_map.get(sel_label)

            # Custom text input
            if sel_port == "CUSTOM":
                sel_port = st.text_input(
                    "Enter port name",
                    value=ns.get("port", "COM19") or "COM19",
                    key=f"custom_port_{nk}",
                    placeholder="e.g. COM19, COM21, /dev/ttyUSB0",
                ).strip()

            # Baud rate
            baud_options = [115200, 9600, 57600, 38400, 19200, 230400]
            baud_default_idx = baud_options.index(node["default_baud"]) if node["default_baud"] in baud_options else 0
            sel_baud = st.selectbox(
                "Baud Rate",
                baud_options,
                index=baud_default_idx,
                key=f"baud_{nk}",
            )

            # Connect / Disconnect
            btn_a, btn_b = st.columns(2)
            with btn_a:
                if st.button("⚡ Connect", key=f"connect_{nk}", use_container_width=True, type="primary"):
                    is_sim = (sel_port == "SIMULATION")
                    if sel_port and sel_port != "— None —":
                        orchestrator.set_serial_config(
                            port=sel_port if not is_sim else "SIMULATION",
                            baud=sel_baud,
                            simulation=is_sim,
                        )
                        st.session_state["node_port_status"][nk] = {
                            "port": sel_port,
                            "baud": sel_baud,
                            "connected": True,
                            "sim": is_sim,
                        }
                        st.toast(f"{'Simulation' if is_sim else sel_port} connected for {nk}!")
                        st.rerun()
                    else:
                        st.warning("Select a port first.")

            with btn_b:
                if st.button("⏹ Disc.", key=f"disc_{nk}", use_container_width=True):
                    orchestrator.set_serial_config(port=None, baud=sel_baud, simulation=False)
                    st.session_state["node_port_status"][nk]["connected"] = False
                    st.session_state["node_port_status"][nk]["port"] = None
                    st.toast(f"{nk} disconnected.")
                    st.rerun()

            # Show live status
            if ns["connected"]:
                port_disp = "Simulation" if ns["sim"] else ns["port"]
                st.success(f"✅ Active: `{port_disp}` @ {ns['baud']} baud")
            else:
                st.info("Not connected — select a port and click ⚡ Connect")


# ── render_hardware_diagnostics ───────────────────────────────────────────────
def render_hardware_diagnostics(state: SmartBeltState) -> None:
    """Expandable hardware bus and COM port diagnostics table."""
    with st.expander("🔍 Hardware Bus Diagnostics", expanded=False):
        d1, d2, d3, d4 = st.columns(4)
        with d1:
            st.markdown(f"**Serial Status:** `{state.serial_status}`")
            st.markdown(f"**Active Port:** `{state.serial_port_active or 'None'}`")
        with d2:
            st.markdown(f"**Baud Rate:** `{state.serial_baud} bps`")
            st.markdown(f"**Packets Rx:** `{state.serial_packets_total}`")
        with d3:
            st.markdown(f"**Parse Errors:** `{state.serial_parse_errors}`")
            st.markdown(f"**Simulation:** `{'YES' if state.serial_is_simulation else 'NO'}`")
        with d4:
            st.markdown(f"**Watchdog:** `{'🟢 HEALTHY' if state.sensor_healthy else '🔴 TIMEOUT'}`")

        if state.serial_error:
            st.error(f"**Serial Error:** {state.serial_error}")

        st.markdown("##### Detected Host COM Ports")
        if state.available_com_ports:
            rows = []
            for p in state.available_com_ports:
                dev_type = "ESP32" if p.get("is_esp32") else ("Arduino" if p.get("is_arduino") else "USB Serial")
                rows.append({
                    "Port": p.get("port"),
                    "Description": p.get("description"),
                    "Manufacturer": p.get("manufacturer") or "—",
                    "Type": dev_type,
                    "VID:PID": f"{p.get('vid')}:{p.get('pid')}",
                })
            st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
        else:
            st.info("No physical COM ports enumerated by OS.")

        if state.serial_last_raw_line:
            st.markdown("##### Live Raw Serial Packet")
            st.code(state.serial_last_raw_line, language="json")


# ── render_sidebar_calibration ────────────────────────────────────────────────
def render_sidebar_calibration(orchestrator: SmartBeltOrchestrator) -> None:
    """Sidebar controls for live sensor baseline calibration."""
    st.sidebar.title("⚙️ SmartBelt Controls")
    st.sidebar.markdown("---")
    st.sidebar.subheader("🔧 Sensor Calibration")
    st.sidebar.caption(
        "Run 30-60s baseline collection during nominal operation to compute machine-specific "
        "mean and std dev profiles."
    )
    duration = st.sidebar.slider("Duration (seconds)", min_value=15, max_value=120, value=30, step=5)

    if st.sidebar.button("▶ Run Baseline Calibration", type="primary", use_container_width=True):
        progress_bar = st.sidebar.progress(0, text="Calibrating sensors...")

        def on_prog(elapsed: float, total: float):
            pct = min(1.0, elapsed / total)
            progress_bar.progress(pct, text=f"Collecting ({int(elapsed)}s / {int(total)}s)...")

        success = orchestrator.run_calibration(duration_s=float(duration), on_progress=on_prog)
        if success:
            progress_bar.progress(1.0, text="Calibration Complete!")
            st.sidebar.success("Sensor baseline saved successfully.")
        else:
            st.sidebar.error("Calibration failed: insufficient packets received.")
