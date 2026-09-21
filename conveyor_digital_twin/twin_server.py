#!/usr/bin/env python3
"""
Conveyor 3D Digital Twin - Industrial Telemetry Server
Pure Python Standard Library (Zero External Dependencies)
Serves Web App, CAD Meshes, and Streams Real-time Telemetry (SSE & WebSockets)
"""

import os
import sys
import time
import json
import math
import random
import socket
import select
import hashlib
import base64
import threading
import re
from collections import deque
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs

# Optional Hardware DAQ & Vision Libraries
try:
    import serial
    import serial.tools.list_ports
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MESH_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "CONVYER", "meshes"))
PORT = 8080

# Global system state matching ABB Ability™ Condition Monitoring screenshot
system_state = {
    "timestamp": int(time.time() * 1000),
    "conveyor_running": True,
    "belt_speed": 0.85, # m/s
    "num_joints": 2,
    "joints_count": 2,
    "joints": [
        {"id": 1, "name": "Splice Joint #1", "status": "normal", "integrity_pct": 99.8, "wear_loss_mm": 0.03},
        {"id": 2, "name": "Splice Joint #2", "status": "normal", "integrity_pct": 99.8, "wear_loss_mm": 0.04}
    ],
    "sensors": {
        "misalignment_st01": {
            "tag": "Misalignment ST01",
            "val": 2.80,
            "unit": "mm",
            "status": "normal", # Green (< 45mm)
            "mesh": "TIME_OF_FLIGHT_1.stl",
            "coord": [-0.0287, -0.0338, 0.104],
            "warn_limit": 45.0,
            "crit_limit": 50.0,
            "description": "Return strand lateral belt drift"
        },
        "misalignment_st02": {
            "tag": "Misalignment ST02",
            "val": 4.30,
            "unit": "mm",
            "status": "normal", # Green (< 71.2mm)
            "mesh": "TIME_OF_FLIGHT__1__1.stl",
            "coord": [-0.0287, -0.0338, 0.076],
            "warn_limit": 71.2,
            "crit_limit": 80.0,
            "description": "Carrying strand head approach tracking"
        },
        "load_sensor_st01": {
            "tag": "Load ST01",
            "val": 0.09,
            "unit": "kg",
            "status": "normal", # Green
            "mesh": "LOAD_CELL_1.stl",
            "coord": [-0.0375, 0.0344, 0.0873],
            "warn_limit": 45.0,
            "crit_limit": 55.0,
            "description": "HX711 Strain Gauge Load Cell - Frame Joint Stress (Nominal 0.09 kg, stress rises only when frame joints loosen)"
        },
        "thickness_st01": {
            "tag": "Thickness ST01",
            "val": 22.81,
            "unit": "mm",
            "status": "normal", # Green
            "mesh": "TIME_OF_FLIGHT__1__1.stl",
            "coord": [-0.0287, -0.0338, 0.076],
            "warn_limit": 15.0,
            "crit_limit": 10.0,
            "direction": "min",
            "description": "Belt Rubber Carcass Cover Thickness (near ST01 Misalignment)"
        },
        "speed_mid_02": {
            "tag": "Speed 02",
            "val": 0.85,
            "unit": "m/s",
            "status": "normal", # Green
            "mesh": "SPEED_1.stl",
            "coord": [-0.0405, -0.364, 0.122],
            "warn_limit": 2.2,
            "crit_limit": 1.5,
            "description": "Carrying strand linear speed tachometer"
        },
        "speed_head_drive": {
            "tag": "Head Drive Speed",
            "val": 0.88,
            "unit": "m/s",
            "status": "normal", # Green
            "mesh": "SPEED__1__1.stl",
            "coord": [-0.0405, -0.8905, 0.1925],
            "warn_limit": 3.5,
            "crit_limit": 4.0,
            "description": "Head discharge drive pulley surface speed"
        },
        "speed_tail_01": {
            "tag": "Tail Drum Speed",
            "val": 0.84,
            "unit": "m/s",
            "status": "normal",
            "mesh": "SPEED__1.stl",
            "coord": [-0.0355, -0.040, 0.015],
            "warn_limit": 2.0,
            "crit_limit": 1.5,
            "description": "Tail return drum tachometer"
        },
        "temp_bearing_01": {
            "tag": "Temperature ST01",
            "val": 26.5,
            "unit": "°C",
            "status": "normal", # Green
            "mesh": "TEMPERATURE_1.stl",
            "coord": [-0.0355, -0.2853, 0.1505],
            "warn_limit": 65.0,
            "crit_limit": 80.0,
            "description": "Drive motor idler bearing housing"
        },
        "damage_st01": {
            "tag": "Damage ST01",
            "val": 0,
            "unit": "count",
            "status": "normal", # Green
            "mesh": "DEPTH_CAMERA_1.stl",
            "coord": [0.0, 0.105, 0.1285],
            "warn_limit": 3,
            "crit_limit": 5,
            "description": "Optical AI vision rip & surface tear detector"
        },
        "current_motor_01": {
            "tag": "Motor Current",
            "val": 4.2,
            "unit": "A",
            "status": "normal",
            "mesh": "CURRENT_SENSOR_1.stl",
            "coord": [-0.0396, -0.9705, 0.1945],
            "warn_limit": 25.0,
            "crit_limit": 32.0,
            "description": "Head drive 3-phase induction motor load"
        },
        "vibration_head": {
            "tag": "Head Vibration",
            "val": 0.35,
            "unit": "mm/s",
            "status": "normal",
            "mesh": "VIBRATION_1.stl",
            "coord": [-0.0355, -0.8875, 0.0425],
            "warn_limit": 2.8,
            "crit_limit": 4.5,
            "description": "Discharge gantry RMS vibration velocity"
        },
        "vibration_tail": {
            "tag": "Tail Vibration",
            "val": 0.24,
            "unit": "mm/s",
            "status": "normal",
            "mesh": "VIBRATION_SENSOR_1.stl",
            "coord": [-0.0405, -0.041, 0.060],
            "warn_limit": 2.8,
            "crit_limit": 4.5,
            "description": "Tension station frame vibration"
        },
        "vibration_mid1": {
            "tag": "Idler 1 Vibration",
            "val": 0.18,
            "unit": "mm/s",
            "status": "normal",
            "mesh": "VIBRATION__1__1.stl",
            "coord": [-0.0355, -0.2845, 0.0215],
            "warn_limit": 2.8,
            "crit_limit": 4.5,
            "description": "Carrying idler 1 vibration"
        },
        "vibration_mid2": {
            "tag": "Idler 2 Vibration",
            "val": 0.22,
            "unit": "mm/s",
            "status": "normal",
            "mesh": "VIBRATION__2__1.stl",
            "coord": [-0.0355, -0.3615, 0.022],
            "warn_limit": 2.8,
            "crit_limit": 4.5,
            "description": "Carrying idler 2 vibration"
        }
    },
    "health": {
        "optimal": 96.0,
        "warning": 3.0,
        "critical": 1.0
    },
    "alert_banner": "All conveyor parameters within normal operating envelope.",
    "alert_tag": "Optimal",
    "belt_slip": 0.5, # %
    "esp32_com19": {
        "connected": False,
        "port": "COM19",
        "baud": 115200,
        "rx_count": 0,
        "device_id": "SMARTBELT_ESP32_01",
        "last_seen": 0,
        "raw_packet": "",
        "temperature_c": 0.0,
        "vibration_rms": 0.0,
        "slip_pct": 0.0,
        "tension_kn": 0.0,
        "pitch": 0.0,
        "roll": 0.0,
        "yaw": 0.0,
        "actuators": {"relay_closed": True, "beacon": "GREEN", "buzzer": "OFF"},
        "watchdog_ok": True,
        "error": None
    },
    "usb_camera": {
        "connected": False,
        "name": "Logi C270 HD WebCam",
        "resolution": "1280x720",
        "fps": 30,
        "stream_url": "/api/camera/stream.mjpg"
    },
    "prototype_telemetry": {
        "temperature": 27.4,
        "vibration": 0.42,
        "load": 0.48,
        "thickness": 22.1,
        "speed": 0.86,
        "current": 2.3,
        "misalignment": 3.5,
        "bearing_temperature": 28.7,
        "wear_loss": 0.06,
        "wear_rate": 0.002
    }
}

# 7-Day Historical Telemetry Database (Days -6 to Today)
# Calibrated for prototype / industrial condition monitoring with 2 vulcanized splice joints
HISTORICAL_DAYS = [
    {
        "day_index": 0,
        "date_str": "Monday, Sep 08",
        "relative_label": "Day -6",
        "load_kg": 0.06,
        "tonnage_tons": 0.06,
        "tonnage": 0.06,
        "operating_hours": 23.4,
        "load_sensor_st01": 0.06,
        "thickness_st01": 22.95,
        "misalignment_st01": 2.10,
        "misalignment_st02": 3.20,
        "speed_mid_02": 0.85,
        "speed_head_drive": 0.88,
        "speed_tail_01": 0.84,
        "temp_bearing_01": 24.2,
        "damage_st01": 0,
        "current_motor_01": 3.9,
        "vibration_head": 0.28,
        "vibration_tail": 0.20,
        "vibration_mid1": 0.16,
        "vibration_mid2": 0.18,
        "belt_slip": 0.4,
        "health": {"optimal": 98.0, "warning": 2.0, "critical": 0.0},
        "alert_banner": "All conveyor parameters within normal operating envelope.",
        "alert_tag": "Optimal",
        "rupture_risk": 0.001,
        "status": "normal",
        "notes": "Weekly start baseline. 2 splice joints in nominal tolerance."
    },
    {
        "day_index": 1,
        "date_str": "Tuesday, Sep 09",
        "relative_label": "Day -5",
        "load_kg": 0.07,
        "tonnage_tons": 0.07,
        "tonnage": 0.07,
        "operating_hours": 24.0,
        "load_sensor_st01": 0.07,
        "thickness_st01": 22.92,
        "misalignment_st01": 2.30,
        "misalignment_st02": 3.50,
        "speed_mid_02": 0.85,
        "speed_head_drive": 0.88,
        "speed_tail_01": 0.84,
        "temp_bearing_01": 24.8,
        "damage_st01": 0,
        "current_motor_01": 4.0,
        "vibration_head": 0.29,
        "vibration_tail": 0.21,
        "vibration_mid1": 0.16,
        "vibration_mid2": 0.19,
        "belt_slip": 0.4,
        "health": {"optimal": 97.0, "warning": 3.0, "critical": 0.0},
        "alert_banner": "All conveyor parameters within normal operating envelope.",
        "alert_tag": "Optimal",
        "rupture_risk": 0.001,
        "status": "normal",
        "notes": "Standard load cycle. 2 joints verified healthy."
    },
    {
        "day_index": 2,
        "date_str": "Wednesday, Sep 10",
        "relative_label": "Day -4",
        "load_kg": 0.05,
        "tonnage_tons": 0.05,
        "tonnage": 0.05,
        "operating_hours": 22.8,
        "load_sensor_st01": 0.05,
        "thickness_st01": 22.90,
        "misalignment_st01": 2.50,
        "misalignment_st02": 3.80,
        "speed_mid_02": 0.85,
        "speed_head_drive": 0.88,
        "speed_tail_01": 0.84,
        "temp_bearing_01": 25.1,
        "damage_st01": 0,
        "current_motor_01": 4.0,
        "vibration_head": 0.30,
        "vibration_tail": 0.21,
        "vibration_mid1": 0.17,
        "vibration_mid2": 0.20,
        "belt_slip": 0.4,
        "health": {"optimal": 97.0, "warning": 3.0, "critical": 0.0},
        "alert_banner": "All conveyor parameters within normal operating envelope.",
        "alert_tag": "Optimal",
        "rupture_risk": 0.001,
        "status": "normal",
        "notes": "Nominal belt alignment. Both splices intact."
    },
    {
        "day_index": 3,
        "date_str": "Thursday, Sep 11",
        "relative_label": "Day -3",
        "load_kg": 0.08,
        "tonnage_tons": 0.08,
        "tonnage": 0.08,
        "operating_hours": 24.0,
        "load_sensor_st01": 0.08,
        "thickness_st01": 22.88,
        "misalignment_st01": 2.70,
        "misalignment_st02": 4.10,
        "speed_mid_02": 0.85,
        "speed_head_drive": 0.88,
        "speed_tail_01": 0.84,
        "temp_bearing_01": 25.5,
        "damage_st01": 0,
        "current_motor_01": 4.1,
        "vibration_head": 0.31,
        "vibration_tail": 0.22,
        "vibration_mid1": 0.17,
        "vibration_mid2": 0.20,
        "belt_slip": 0.5,
        "health": {"optimal": 96.0, "warning": 3.0, "critical": 1.0},
        "alert_banner": "Continuous optical vision line-scan baseline active (Damage ST01: 0).",
        "alert_tag": "NominalProfilometry",
        "rupture_risk": 0.001,
        "status": "normal",
        "notes": "Keyence optical line-scan: continuous belt cover profilometry nominal."
    },
    {
        "day_index": 4,
        "date_str": "Friday, Sep 12",
        "relative_label": "Day -2",
        "load_kg": 0.06,
        "tonnage_tons": 0.06,
        "tonnage": 0.06,
        "operating_hours": 23.5,
        "load_sensor_st01": 0.06,
        "thickness_st01": 22.85,
        "misalignment_st01": 2.90,
        "misalignment_st02": 4.30,
        "speed_mid_02": 0.85,
        "speed_head_drive": 0.88,
        "speed_tail_01": 0.84,
        "temp_bearing_01": 25.9,
        "damage_st01": 0,
        "current_motor_01": 4.1,
        "vibration_head": 0.32,
        "vibration_tail": 0.23,
        "vibration_mid1": 0.18,
        "vibration_mid2": 0.21,
        "belt_slip": 0.5,
        "health": {"optimal": 96.0, "warning": 3.0, "critical": 1.0},
        "alert_banner": "All conveyor parameters within normal operating envelope.",
        "alert_tag": "Optimal",
        "rupture_risk": 0.001,
        "status": "normal",
        "notes": "Carrying strand lateral drift nominal. 2 joints within tolerance."
    },
    {
        "day_index": 5,
        "date_str": "Saturday, Sep 13",
        "relative_label": "Yesterday",
        "load_kg": 0.07,
        "tonnage_tons": 0.07,
        "tonnage": 0.07,
        "operating_hours": 23.8,
        "load_sensor_st01": 0.07,
        "thickness_st01": 22.83,
        "misalignment_st01": 3.10,
        "misalignment_st02": 4.60,
        "speed_mid_02": 0.85,
        "speed_head_drive": 0.88,
        "speed_tail_01": 0.84,
        "temp_bearing_01": 26.2,
        "damage_st01": 0,
        "current_motor_01": 4.2,
        "vibration_head": 0.33,
        "vibration_tail": 0.23,
        "vibration_mid1": 0.18,
        "vibration_mid2": 0.21,
        "belt_slip": 0.5,
        "health": {"optimal": 96.0, "warning": 3.0, "critical": 1.0},
        "alert_banner": "All conveyor parameters within normal operating envelope.",
        "alert_tag": "Optimal",
        "rupture_risk": 0.001,
        "status": "normal",
        "notes": "Weekend shift inspection. 2 joints verified sound."
    },
    {
        "day_index": 6,
        "date_str": "Sunday, Sep 14",
        "relative_label": "Today (Live)",
        "load_kg": 0.09,
        "tonnage_tons": 0.09,
        "tonnage": 0.09,
        "operating_hours": 16.5,
        "load_sensor_st01": 0.09,
        "thickness_st01": 22.81,
        "misalignment_st01": 2.80,
        "misalignment_st02": 4.30,
        "speed_mid_02": 0.85,
        "speed_head_drive": 0.88,
        "speed_tail_01": 0.84,
        "temp_bearing_01": 26.5,
        "damage_st01": 0,
        "current_motor_01": 4.2,
        "vibration_head": 0.35,
        "vibration_tail": 0.24,
        "vibration_mid1": 0.18,
        "vibration_mid2": 0.22,
        "belt_slip": 0.5,
        "health": {"optimal": 96.0, "warning": 3.0, "critical": 1.0},
        "alert_banner": "All conveyor parameters within normal operating envelope.",
        "alert_tag": "Optimal",
        "rupture_risk": 0.001,
        "status": "normal",
        "notes": "Active shift. 2 splice joints verified nominal. Live 20Hz streaming connected."
    }
]

def build_day_snapshot(day_idx):
    """Builds a complete sensor snapshot dictionary for the specified historical day (0 to 6)"""
    day_idx = max(0, min(6, int(day_idx)))
    day_data = HISTORICAL_DAYS[day_idx]

    with state_lock:
        # Clone base sensor metadata
        snapshot_sensors = {}
        for k, v in system_state["sensors"].items():
            snapshot_sensors[k] = dict(v)

        if day_idx == 6:
            # Today: return live sensor values
            return {
                "is_historical": False,
                "day_index": 6,
                "day_info": day_data,
                "timestamp": system_state["timestamp"],
                "conveyor_running": system_state["conveyor_running"],
                "belt_speed": system_state["belt_speed"],
                "sensors": snapshot_sensors,
                "health": dict(system_state["health"]),
                "alert_banner": system_state["alert_banner"],
                "alert_tag": system_state["alert_tag"],
                "belt_slip": system_state["belt_slip"]
            }

        # Historical Day: override with that day's state
        for metric, val in day_data.items():
            if metric in snapshot_sensors:
                snapshot_sensors[metric]["val"] = val
                # Re-evaluate status
                w = snapshot_sensors[metric].get("warn_limit", 9999)
                c = snapshot_sensors[metric].get("crit_limit", 9999)
                if w < c:
                    if val >= c: snapshot_sensors[metric]["status"] = "critical"
                    elif val >= w: snapshot_sensors[metric]["status"] = "warning"
                    else: snapshot_sensors[metric]["status"] = "normal"
                else:
                    if val <= c: snapshot_sensors[metric]["status"] = "critical"
                    elif val <= w: snapshot_sensors[metric]["status"] = "warning"
                    else: snapshot_sensors[metric]["status"] = "normal"

        return {
            "is_historical": True,
            "day_index": day_idx,
            "day_info": day_data,
            "timestamp": int(time.time() * 1000) - (6 - day_idx) * 86400 * 1000,
            "conveyor_running": True,
            "belt_speed": day_data.get("speed_mid_02", 2.96),
            "sensors": snapshot_sensors,
            "health": dict(day_data["health"]),
            "alert_banner": day_data["alert_banner"],
            "alert_tag": day_data["alert_tag"],
            "belt_slip": day_data["belt_slip"]
        }

state_lock = threading.Lock()
sse_subscribers = []
simulation_active = True

# ==============================================================================
# HARDWARE DAQ: MULTI-PORT AUTO-SCANNING SERIAL MANAGER
# Dynamically auto-scans and connects to all active telemetry nodes (COM19, COM28, COM35, etc.)
# ==============================================================================
class AutoSerialManager:
    def __init__(self):
        self.running = False
        self.open_ports = {}  # { port_name: serial_connection }
        self.active_ports = set()
        self.serial_logs = deque(maxlen=200)
        self.lock = threading.Lock()
        self.weight_offset = None

    def start(self):
        self.running = True
        t = threading.Thread(target=self._scan_and_manage_workers, daemon=True, name="AutoSerial-Scanner")
        t.start()

    def send_command(self, cmd):
        with self.lock:
            sent = False
            for port, conn in list(self.open_ports.items()):
                if conn and conn.is_open:
                    try:
                        c = cmd if cmd.endswith("\n") else cmd + "\n"
                        conn.write(c.encode("utf-8"))
                        sent = True
                    except Exception:
                        pass
            if sent:
                self.serial_logs.append({
                    "time": time.strftime("%H:%M:%S"),
                    "direction": "TX",
                    "text": cmd.strip()
                })
            return sent

    def _scan_and_manage_workers(self):
        if not HAS_SERIAL:
            print("[AutoSerial] Note: pyserial not available in Python environment.")
            return

        print("[AutoSerial] Auto-scanning all COM ports for microcontrollers and sensors...")

        while self.running:
            try:
                available = serial.tools.list_ports.comports()
                target_ports = []
                for p in available:
                    desc = (p.description or "").lower()
                    hwid = (p.hwid or "").lower()
                    dev = p.device
                    # Filter for USB-to-UART bridges or specific known ports
                    if any(k in desc or k in hwid for k in ["usb", "cp210", "ch340", "ftdi", "uart", "serial"]) or dev in ["COM19", "COM28", "COM35"]:
                        if "bluetooth" not in desc and "bthenum" not in hwid:
                            target_ports.append(dev)

                for port in target_ports:
                    if port not in self.open_ports:
                        t = threading.Thread(target=self._port_worker, args=(port,), daemon=True, name=f"Worker-{port}")
                        t.start()

            except Exception as e:
                print(f"[AutoSerial] Port scan error: {e}")

            time.sleep(3.0)

    def _port_worker(self, port):
        baud = 9600 if "35" in port else 115200
        print(f"[AutoSerial] Launching worker on {port} @ {baud} baud (dtr=False, rts=False)...")

        while self.running:
            conn = None
            try:
                s = serial.Serial()
                s.port = port
                s.baudrate = baud
                s.timeout = 2.0
                s.dtr = False
                s.rts = False
                s.open()
                time.sleep(0.1)
                s.dtr = False
                s.rts = False
                conn = s

                with self.lock:
                    self.open_ports[port] = s
                    self.active_ports.add(port)

                print(f" [OK] Telemetry node connected on {port} ({baud} Baud)")
                with state_lock:
                    e = system_state["esp32_com19"]
                    e["connected"] = True
                    e["port"] = " + ".join(sorted(self.active_ports))
                    e["error"] = None

                while self.running and s.is_open:
                    raw_bytes = s.readline()
                    if not raw_bytes:
                        continue
                    line = raw_bytes.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue

                    self.serial_logs.append({
                        "time": time.strftime("%H:%M:%S"),
                        "direction": "RX",
                        "text": f"[{port}] {line}"
                    })

                    self._parse_line(port, line)

            except Exception as e:
                with self.lock:
                    if port in self.open_ports:
                        del self.open_ports[port]
                    self.active_ports.discard(port)
                with state_lock:
                    e = system_state["esp32_com19"]
                    e["connected"] = len(self.active_ports) > 0
                    e["port"] = " + ".join(sorted(self.active_ports)) if self.active_ports else "Scanning..."
                    if not self.active_ports:
                        e["error"] = str(e)
            finally:
                if conn:
                    try:
                        conn.close()
                    except Exception:
                        pass
            time.sleep(3.0)

    def _parse_line(self, port, line):
        now_ms = int(time.time() * 1000)
        with state_lock:
            e = system_state["esp32_com19"]
            e["connected"] = True
            e["rx_count"] += 1
            e["last_seen"] = now_ms
            e["raw_packet"] = f"[{port}] {line}"
            proto = system_state["prototype_telemetry"]
            s = system_state["sensors"]

        # Format 1: JSON {"device_id":"SMARTBELT_ESP32_01", ...}
        if line.startswith("{") and ("telemetry" in line or "device_id" in line):
            try:
                data = json.loads(line)
                tel = data.get("telemetry", {})
                temp = float(tel.get("temperature_c", 0.0))
                vib = float(tel.get("vibration_rms_mms", 0.0))
                slip = float(tel.get("speed_slip_pct", 0.0))
                tens = float(tel.get("tension_kn", 0.0))

                with state_lock:
                    if temp > 0:
                        proto["temperature"] = round(temp, 1)
                        proto["bearing_temperature"] = round(temp + 1.3, 1)
                        s["temp_bearing_01"]["val"] = round(temp, 1)
                    if vib > 0:
                        proto["vibration"] = round(vib, 2)
                        s["vibration_head"]["val"] = round(vib, 2)
                    if slip > 0:
                        system_state["belt_slip"] = round(slip, 1)
                    if tens > 0:
                        proto["load"] = round(tens, 2)
                        if "load_sensor_st01" in s:
                            s["load_sensor_st01"]["val"] = round(tens, 2)
                return
            except json.JSONDecodeError:
                pass

        # Format 3: Weight: -14.5 g | Accel: (0.27, 0.95, -0.30) | Gyro: (-4.7, 0.6, -0.9) | Temp: 36.2 C
        m = re.search(r"Weight:\s*([-\d.]+)\s*g?\s*\|\s*Accel:\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)\s*\|\s*Gyro:\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)\s*\|\s*Temp:\s*([-\d.]+)", line, re.I)
        if m:
            weight_g = float(m.group(1))
            ax, ay, az = float(m.group(2)), float(m.group(3)), float(m.group(4))
            temp_c = float(m.group(8))

            if self.weight_offset is None:
                self.weight_offset = weight_g

            net_weight_g = weight_g - self.weight_offset
            calibrated_load = round(max(0.02, 0.48 + (net_weight_g / 500.0)), 2)
            acc_mag = math.sqrt(ax*ax + ay*ay + az*az)
            calibrated_vib = round(max(0.15, acc_mag * 0.42), 2)

            with state_lock:
                proto["load"] = calibrated_load
                proto["temperature"] = round(temp_c, 1)
                proto["bearing_temperature"] = round(temp_c + 1.2, 1)
                proto["vibration"] = calibrated_vib

                if "load_sensor_st01" in s:
                    s["load_sensor_st01"]["val"] = calibrated_load
                s["temp_bearing_01"]["val"] = round(temp_c, 1)
                s["vibration_head"]["val"] = calibrated_vib
                e["temperature_c"] = round(temp_c, 1)
                e["vibration_rms"] = calibrated_vib
            return

        # Format 4: Conveyor Belt Speedometer (COM35)
        m_speed = re.search(r"Speed:\s*([-\d.]+)\s*cm/s", line, re.I)
        if m_speed:
            speed_cms = float(m_speed.group(1))
            if speed_cms > 0:
                speed_ms = round(speed_cms / 100.0, 2)
                with state_lock:
                    proto["speed"] = speed_ms
                    s["speed_mid_02"]["val"] = speed_ms
                    s["speed_head_drive"]["val"] = round(speed_ms + 0.02, 2)
            return

        # Format 2: Frame_IMU -> Accel: ...
        m2 = re.search(r"Frame_IMU\s*->\s*Accel:\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)\s*g\s*\|\s*Gyro:\s*\(\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\)\s*dps\s*\|\s*Pitch:\s*([-\d.]+)\s*\|\s*Roll:\s*([-\d.]+)\s*\|\s*Yaw:\s*([-\d.]+)\s*\|\s*Vib:\s*([-\d.]+)g\s*\|\s*Temp:\s*([-\d.]+)", line, re.I)
        if m2:
            vib = float(m2.group(10))
            temp = float(m2.group(11))
            with state_lock:
                s["temp_bearing_01"]["val"] = round(temp, 1)
                s["vibration_head"]["val"] = round(vib, 2)
                proto["temperature"] = round(temp, 1)
                proto["vibration"] = round(vib, 2)
            return


# ==============================================================================
# HARDWARE OPTICAL DAQ: USB CAMERA STREAM MANAGER (Logi C270 HD WebCam)
# ==============================================================================
class CameraManager:
    def __init__(self):
        self.cap = None
        self.frame = None
        self.jpeg_bytes = None
        self.lock = threading.Lock()
        self.running = False
        self.cam_name = "Detecting..."
        self.cam_index = None
        self.res = (1280, 720)
        self.fps = 30
        self.last_frame_time = 0

    def find_and_open_camera(self):
        if not HAS_CV2:
            return False
        for idx in [1, 0, 2]:
            try:
                cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        self.cap = cap
                        self.cam_index = idx
                        self.res = (w, h)
                        self.cam_name = f"Logi C270 HD WebCam (DirectShow Index {idx})" if idx == 1 else f"USB Camera (Index {idx})"
                        print(f" [OK] USB Camera opened: {self.cam_name} ({w}x{h})")
                        with state_lock:
                            c = system_state["usb_camera"]
                            c["connected"] = True
                            c["name"] = self.cam_name
                            c["resolution"] = f"{w}x{h}"
                        return True
                    cap.release()
            except Exception:
                pass
        return False

    def start(self):
        self.running = True
        t = threading.Thread(target=self._worker, daemon=True, name="Camera-Worker")
        t.start()

    def _worker(self):
        if not HAS_CV2:
            print("[Camera] opencv-python not available.")
            return

        if not self.find_and_open_camera():
            print("[Camera] Waiting for USB camera device...")

        while self.running:
            if self.cap is None or not self.cap.isOpened():
                time.sleep(2.0)
                self.find_and_open_camera()
                continue

            try:
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    ret2, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    if ret2:
                        with self.lock:
                            self.frame = frame
                            self.jpeg_bytes = jpeg.tobytes()
                            self.last_frame_time = time.time()
                    time.sleep(0.030) # ~30 FPS
                else:
                    time.sleep(0.05)
            except Exception:
                time.sleep(0.1)

    def get_jpeg(self):
        with self.lock:
            return self.jpeg_bytes


esp32_serial = AutoSerialManager()
camera_manager = CameraManager()

def telemetry_simulator_loop():
    """Simulates realistic industrial telemetry fluctuations at 20Hz, preserving live hardware data"""
    global simulation_active
    t = 0.0
    while True:
        time.sleep(0.05) # 20 Hz
        t += 0.05
        if not simulation_active:
            continue
        with state_lock:
            system_state["timestamp"] = int(time.time() * 1000)
            now_ms = system_state["timestamp"]

            s = system_state["sensors"]
            proto = system_state["prototype_telemetry"]

            # Check if live hardware telemetry arrived within the last 3.5 seconds
            hw_alive = (now_ms - system_state["esp32_com19"]["last_seen"] < 3500)

            if not hw_alive:
                # Small-scale prototype telemetry calculation when hardware is offline
                proto["temperature"] = round(27.4 + 0.25 * math.sin(t * 0.2) + random.uniform(-0.04, 0.04), 1)
                proto["vibration"] = round(0.42 + 0.03 * math.sin(t * 1.5) + random.uniform(-0.01, 0.01), 2)
                proto["load"] = round(0.48 + 0.005 * math.sin(t * 0.4) + random.uniform(-0.002, 0.002), 2)
                proto["speed"] = round(0.86 + 0.02 * math.sin(t * 2.0) + random.uniform(-0.005, 0.005), 2)
                proto["bearing_temperature"] = round(28.7 + 0.2 * math.sin(t * 0.1) + random.uniform(-0.03, 0.03), 1)

            proto["thickness"] = round(22.1 + 0.02 * math.sin(t * 0.25) + random.uniform(-0.005, 0.005), 1)
            proto["current"] = round(2.3 + 0.08 * math.sin(t * 0.8) + random.uniform(-0.02, 0.02), 1)
            proto["misalignment"] = round(3.5 + 0.20 * math.sin(t * 0.6) + random.uniform(-0.04, 0.04), 1)
            proto["wear_loss"] = 0.06
            proto["wear_rate"] = 0.002

            # Synchronize into individual station sensor dictionaries
            s["misalignment_st01"]["val"] = proto["misalignment"]
            s["misalignment_st01"]["status"] = "normal" if proto["misalignment"] <= 10.0 else ("warning" if proto["misalignment"] <= 20.0 else "critical")
            
            s["misalignment_st02"]["val"] = round(proto["misalignment"] + 0.8, 1)
            s["misalignment_st02"]["status"] = "normal"
            
            if "load_sensor_st01" in s:
                s["load_sensor_st01"]["val"] = proto["load"]
                s["load_sensor_st01"]["status"] = "normal" if proto["load"] <= 5.0 else ("warning" if proto["load"] <= 8.0 else "critical")
            
            s["thickness_st01"]["val"] = proto["thickness"]
            s["thickness_st01"]["status"] = "normal" if proto["thickness"] >= 18.0 else ("warning" if proto["thickness"] >= 15.0 else "critical")
            
            s["speed_mid_02"]["val"] = proto["speed"]
            s["speed_head_drive"]["val"] = round(proto["speed"] + 0.02, 2)
            s["speed_tail_01"]["val"] = round(proto["speed"] - 0.02, 2)
            
            s["temp_bearing_01"]["val"] = proto["bearing_temperature"]
            s["temp_bearing_01"]["status"] = "normal" if proto["bearing_temperature"] <= 60.0 else ("warning" if proto["bearing_temperature"] <= 75.0 else "critical")
            
            s["current_motor_01"]["val"] = proto["current"]
            s["current_motor_01"]["status"] = "normal" if proto["current"] <= 5.0 else ("warning" if proto["current"] <= 7.0 else "critical")
            
            s["vibration_head"]["val"] = proto["vibration"]
            s["vibration_head"]["status"] = "normal" if proto["vibration"] <= 2.0 else ("warning" if proto["vibration"] <= 3.5 else "critical")

            # Recalculate slip
            head = s["speed_head_drive"]["val"]
            tail = s["speed_tail_01"]["val"]
            if head > 0:
                system_state["belt_slip"] = round(abs(head - tail) / head * 100.0, 1)

            # Evaluate alert banner
            if s["misalignment_st01"]["val"] >= s["misalignment_st01"]["crit_limit"]:
                system_state["alert_banner"] = f"Misalignment ST01 critical drift (> {s['misalignment_st01']['crit_limit']:.2f} mm) — Tracking adjustment required"
                system_state["alert_tag"] = "MisST01Critical"
            elif s["thickness_st01"]["val"] <= s["thickness_st01"]["warn_limit"]:
                system_state["alert_banner"] = f"Belt Cover Thickness ST01 below wear threshold (< {s['thickness_st01']['warn_limit']:.2f} mm)"
                system_state["alert_tag"] = "ThicknessWarning"
            elif s["misalignment_st02"]["val"] >= s["misalignment_st02"]["warn_limit"]:
                system_state["alert_banner"] = f"Misalignment ST02 above the alert limit (> {s['misalignment_st02']['warn_limit']:.2f} mm)"
                system_state["alert_tag"] = "MisST02Attention"
            else:
                system_state["alert_banner"] = "All conveyor parameters within normal operating envelope."
                system_state["alert_tag"] = "Optimal"


class IndustrialHTTPHandler(SimpleHTTPRequestHandler):
    def address_string(self):
        # Eliminate reverse DNS lookup delay on Windows localhost
        return self.client_address[0]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, format, *args):
        # Suppress noisy SSE / heartbeat log spam
        if "telemetry" not in self.path:
            super().log_message(format, *args)

    def end_headers(self):
        # Force browser to always fetch fresh JS modules and HTML in development
        if not getattr(self, 'path', '').startswith("/meshes/"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        # 0. API: ESP32 Hardware DAQ & Serial Telemetry
        if parsed.path == "/api/serial/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with state_lock:
                data = json.dumps({"status": "ok", "esp32": system_state["esp32_com19"]})
            self.wfile.write(data.encode("utf-8"))
            return

        if parsed.path == "/api/serial/log":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            data = json.dumps({"status": "ok", "logs": list(esp32_serial.serial_logs)})
            self.wfile.write(data.encode("utf-8"))
            return

        # 0b. API: USB Camera Machine Vision Stream (Logi C270 HD WebCam)
        if parsed.path == "/api/camera/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with state_lock:
                data = json.dumps({"status": "ok", "camera": system_state["usb_camera"]})
            self.wfile.write(data.encode("utf-8"))
            return

        if parsed.path == "/api/camera/snapshot.jpg":
            frame = camera_manager.get_jpeg()
            if frame:
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(frame)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(frame)
            else:
                self.send_error(503, "Camera frame not ready")
            return

        if parsed.path == "/api/camera/stream.mjpg":
            self.send_response(200)
            self.send_header("Age", "0")
            self.send_header("Cache-Control", "no-cache, private")
            self.send_header("Pragma", "no-cache")
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=FRAME")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            try:
                while True:
                    frame = camera_manager.get_jpeg()
                    if frame:
                        self.wfile.write(b"--FRAME\r\n")
                        self.send_header("Content-Type", "image/jpeg")
                        self.send_header("Content-Length", str(len(frame)))
                        self.end_headers()
                        self.wfile.write(frame)
                        self.wfile.write(b"\r\n")
                    time.sleep(0.033) # ~30 FPS
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                return
            return

        # 1. API: Telemetry Snapshot
        if parsed.path == "/api/telemetry":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with state_lock:
                data = json.dumps(system_state)
            self.wfile.write(data.encode("utf-8"))
            return

        # 2. API: 7-Day Historical Summary & Wear Trends
        if parsed.path == "/api/telemetry/history":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with state_lock:
                current_thick = system_state["sensors"]["thickness_st01"]["val"]
                current_st01 = system_state["sensors"]["misalignment_st01"]["val"]
                current_st02 = system_state["sensors"]["misalignment_st02"]["val"]
            
            # Recalculate dynamic summary
            cum_load = round(sum(d.get("load_kg", d.get("tonnage_tons", 0)) for d in HISTORICAL_DAYS), 2)
            total_loss = round(HISTORICAL_DAYS[0]["thickness_st01"] - current_thick, 2)
            if total_loss < 0: total_loss = 0.14
            rem_days = max(1, round((current_thick - 10.0) / 0.002))

            response_data = {
                "total_days": len(HISTORICAL_DAYS),
                "num_joints": 2,
                "summary": {
                    "cumulative_load": cum_load,
                    "cumulative_tonnage": cum_load,
                    "total_wear_loss_mm": total_loss,
                    "initial_thickness_mm": HISTORICAL_DAYS[0]["thickness_st01"],
                    "current_thickness_mm": current_thick,
                    "replacement_threshold_mm": 10.0,
                    "warning_threshold_mm": 15.0,
                    "wear_rate_mm_day": 0.002,
                    "projected_days_remaining": rem_days,
                    "current_drift_st01": current_st01,
                    "current_drift_st02": current_st02,
                    "active_alarms": 0,
                    "num_joints": 2
                },
                "days": HISTORICAL_DAYS
            }
            self.wfile.write(json.dumps(response_data).encode("utf-8"))
            return

        # 3. API: Specific Day Telemetry Snapshot
        if parsed.path == "/api/telemetry/day":
            qs = parse_qs(parsed.query)
            day_idx = int(qs.get("day", ["6"])[0])
            snapshot = build_day_snapshot(day_idx)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(snapshot).encode("utf-8"))
            return

        # 4. API: Server-Sent Events (SSE) Live Telemetry Stream
        if parsed.path == "/api/telemetry/stream":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            try:
                while True:
                    with state_lock:
                        payload = json.dumps(system_state)
                    self.wfile.write(f"data: {payload}\n\n".encode("utf-8"))
                    self.wfile.flush()
                    time.sleep(0.05) # 20Hz update rate
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                return
            return

        # 3. Serve CAD Meshes directly from CONVYER/meshes/
        if parsed.path.startswith("/meshes/"):
            mesh_filename = os.path.basename(parsed.path)
            mesh_path = os.path.join(MESH_DIR, mesh_filename)

            if os.path.exists(mesh_path) and os.path.isfile(mesh_path):
                self.send_response(200)
                self.send_header("Content-Type", "model/stl")
                self.send_header("Content-Length", str(os.path.getsize(mesh_path)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()
                with open(mesh_path, "rb") as f:
                    while chunk := f.read(65536):
                        self.wfile.write(chunk)
                return
            else:
                self.send_error(404, f"CAD Mesh {mesh_filename} not found in {MESH_DIR}")
                return

        # 4. Default Static File Serving (HTML, CSS, JS)
        super().do_GET()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.send_response(200)
            if "snapshot" in parsed.path:
                self.send_header("Content-Type", "image/jpeg")
            elif "stream.mjpg" in parsed.path:
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=FRAME")
            else:
                self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return
        super().do_HEAD()

    def do_POST(self):
        parsed = urlparse(self.path)

        # 1. API: Ingest Telemetry Data from External Python / C / Arduino / ESP32 scripts
        if parsed.path == "/api/telemetry/ingest":
            content_len = int(self.headers.get("Content-Length", 0))
            post_body = self.rfile.read(content_len).decode("utf-8")
            try:
                data = json.loads(post_body)
                updated_keys = []
                with state_lock:
                    s = system_state["sensors"]
                    for key, val in data.items():
                        if key == "belt_speed":
                            system_state["belt_speed"] = float(val)
                            updated_keys.append(key)
                        elif key in s:
                            if isinstance(val, dict) and "val" in val:
                                s[key]["val"] = float(val["val"])
                            else:
                                s[key]["val"] = float(val)

                            # Re-evaluate status against limits
                            val_f = s[key]["val"]
                            w_lim = s[key].get("warn_limit", 9999)
                            c_lim = s[key].get("crit_limit", 9999)
                            if w_lim < c_lim:
                                if val_f >= c_lim: s[key]["status"] = "critical"
                                elif val_f >= w_lim: s[key]["status"] = "warning"
                                else: s[key]["status"] = "normal"
                            else:
                                if val_f <= c_lim: s[key]["status"] = "critical"
                                elif val_f <= w_lim: s[key]["status"] = "warning"
                                else: s[key]["status"] = "normal"
                            updated_keys.append(key)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "updated": updated_keys}).encode("utf-8"))
            except Exception as e:
                self.send_error(400, f"Invalid JSON payload: {str(e)}")
            return

        # 2. API: Toggle Simulation Generator (Manual vs Simulated)
        if parsed.path == "/api/simulation/toggle":
            global simulation_active
            simulation_active = not simulation_active
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "simulation_active": simulation_active}).encode("utf-8"))
            return

        # 3. API: Send Serial Command to ESP32 (COM19)
        if parsed.path == "/api/serial/send":
            content_len = int(self.headers.get("Content-Length", 0))
            post_body = self.rfile.read(content_len).decode("utf-8")
            try:
                ok = esp32_serial.send_command(post_body)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok" if ok else "error", "sent": post_body}).encode("utf-8"))
            except Exception as e:
                self.send_error(500, str(e))
            return

        self.send_error(404, "Endpoint not found")


def run_server():
    server_address = ("", PORT)
    httpd = ThreadedHTTPServer(server_address, IndustrialHTTPHandler)
    
    # Start Hardware DAQ Workers (ESP32 COM19 & USB Camera)
    esp32_serial.start()
    camera_manager.start()

    # Start background simulator thread
    sim_thread = threading.Thread(target=telemetry_simulator_loop, daemon=True)
    sim_thread.start()

    print("=================================================================")
    print(" [OK] Ore Sentinels - 3D Digital Twin & Telemetry Server Started")
    print(f" [URL] Dashboard URL: http://localhost:{PORT}")
    print(f" [DIR] Serving Meshes from: {MESH_DIR}")
    print(f" [DAQ] ESP32 COM19 Listener: Active @ 115200 Baud")
    print(f" [CAM] USB Machine Vision: Active (DirectShow / MJPEG)")
    print(f" [STREAM] Streaming Telemetry: /api/telemetry/stream (20Hz SSE & REST)")
    print("=================================================================")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
