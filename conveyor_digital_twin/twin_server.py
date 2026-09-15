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
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs

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
    "belt_speed": 2.96, # m/s
    "sensors": {
        "misalignment_st01": {
            "tag": "Misalignment ST01",
            "val": 32.40,
            "unit": "mm",
            "status": "normal", # Green (< 50mm)
            "mesh": "TIME_OF_FLIGHT_1.stl",
            "coord": [-0.0287, -0.0338, 0.104],
            "warn_limit": 45.0,
            "crit_limit": 50.0,
            "description": "Return strand lateral belt drift"
        },
        "misalignment_st02": {
            "tag": "Misalignment ST02",
            "val": 72.33,
            "unit": "mm",
            "status": "warning", # Yellow
            "mesh": "TIME_OF_FLIGHT__1__1.stl",
            "coord": [-0.0287, -0.0338, 0.076],
            "warn_limit": 71.2,
            "crit_limit": 80.0,
            "description": "Carrying strand head approach tracking"
        },
        "load_sensor_st01": {
            "tag": "Load Sensor ST01",
            "val": 0.0,
            "unit": "kg",
            "status": "normal", # Green
            "mesh": "LOAD_CELL_1.stl",
            "coord": [-0.0375, 0.0344, 0.0873],
            "warn_limit": 45.0,
            "crit_limit": 55.0,
            "description": "HX711 Strain Gauge Load Cell - Frame Joint Stress (Nominal 0.0 kg, stress rises only when frame joints loosen)"
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
            "description": "Belt Rubber Carcass Cover Thickness Sensor (near ST01 Misalignment)"
        },
        "speed_mid_02": {
            "tag": "Speed Sensor 02",
            "val": 2.96,
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
            "val": 3.08,
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
            "val": 2.94,
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
            "val": 45.5,
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
            "val": 18.4,
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
            "val": 1.45,
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
            "val": 1.12,
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
            "val": 0.95,
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
            "val": 1.05,
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
        "optimal": 70.0,
        "warning": 10.0,
        "critical": 20.0
    },
    "alert_banner": "Misalignment ST02 above the alert limit (> 71.199997 mm)",
    "alert_tag": "MisST02Attention",
    "belt_slip": 3.9 # %
}

# 7-Day Historical Telemetry Database (Days -6 to Today)
# Models physical conveyor degradation, wear progression, tonnage correlation, and drift escalation
HISTORICAL_DAYS = [
    {
        "day_index": 0,
        "date_str": "Monday, Sep 08",
        "relative_label": "Day -6",
        "tonnage_tons": 48200,
        "operating_hours": 23.4,
        "load_sensor_st01": 0.0,
        "thickness_st01": 24.15,
        "misalignment_st01": 36.20,
        "misalignment_st02": 58.40,
        "speed_mid_02": 3.01,
        "speed_head_drive": 3.04,
        "speed_tail_01": 2.98,
        "temp_bearing_01": 41.2,
        "damage_st01": 0,
        "current_motor_01": 17.2,
        "vibration_head": 1.12,
        "vibration_tail": 1.02,
        "vibration_mid1": 0.88,
        "vibration_mid2": 0.94,
        "belt_slip": 2.0,
        "health": {"optimal": 92.0, "warning": 6.0, "critical": 2.0},
        "alert_banner": "All conveyor parameters within normal operating envelope.",
        "alert_tag": "Optimal",
        "rupture_risk": 0.010,
        "status": "normal",
        "notes": "Weekly start baseline. Splice joints in nominal tolerance."
    },
    {
        "day_index": 1,
        "date_str": "Tuesday, Sep 09",
        "relative_label": "Day -5",
        "tonnage_tons": 51400,
        "operating_hours": 24.0,
        "load_sensor_st01": 0.0,
        "thickness_st01": 23.92,
        "misalignment_st01": 38.60,
        "misalignment_st02": 61.10,
        "speed_mid_02": 2.99,
        "speed_head_drive": 3.03,
        "speed_tail_01": 2.96,
        "temp_bearing_01": 42.0,
        "damage_st01": 0,
        "current_motor_01": 17.5,
        "vibration_head": 1.18,
        "vibration_tail": 1.05,
        "vibration_mid1": 0.90,
        "vibration_mid2": 0.96,
        "belt_slip": 2.3,
        "health": {"optimal": 88.0, "warning": 9.0, "critical": 3.0},
        "alert_banner": "All conveyor parameters within normal operating envelope.",
        "alert_tag": "Optimal",
        "rupture_risk": 0.012,
        "status": "normal",
        "notes": "Standard load cycle. Idler alignment verified."
    },
    {
        "day_index": 2,
        "date_str": "Wednesday, Sep 10",
        "relative_label": "Day -4",
        "tonnage_tons": 49800,
        "operating_hours": 22.8,
        "load_sensor_st01": 0.0,
        "thickness_st01": 23.68,
        "misalignment_st01": 41.50,
        "misalignment_st02": 64.30,
        "speed_mid_02": 2.98,
        "speed_head_drive": 3.05,
        "speed_tail_01": 2.95,
        "temp_bearing_01": 42.8,
        "damage_st01": 0,
        "current_motor_01": 17.8,
        "vibration_head": 1.25,
        "vibration_tail": 1.08,
        "vibration_mid1": 0.92,
        "vibration_mid2": 0.98,
        "belt_slip": 2.8,
        "health": {"optimal": 85.0, "warning": 11.0, "critical": 4.0},
        "alert_banner": "Carrying strand tracking drift progressing toward warning band.",
        "alert_tag": "TrackingWatch",
        "rupture_risk": 0.015,
        "status": "normal",
        "notes": "Moderate chute skirt friction observed at loading point."
    },
    {
        "day_index": 3,
        "date_str": "Thursday, Sep 11",
        "relative_label": "Day -3",
        "tonnage_tons": 53200,
        "operating_hours": 24.0,
        "load_sensor_st01": 0.0,
        "thickness_st01": 23.45,
        "misalignment_st01": 44.80,
        "misalignment_st02": 67.90,
        "speed_mid_02": 2.97,
        "speed_head_drive": 3.06,
        "speed_tail_01": 2.95,
        "temp_bearing_01": 43.6,
        "damage_st01": 0,
        "current_motor_01": 18.0,
        "vibration_head": 1.31,
        "vibration_tail": 1.10,
        "vibration_mid1": 0.93,
        "vibration_mid2": 1.01,
        "belt_slip": 3.2,
        "health": {"optimal": 80.0, "warning": 15.0, "critical": 5.0},
        "alert_banner": "Continuous optical vision line-scan baseline active (Damage ST01: 0).",
        "alert_tag": "NominalProfilometry",
        "rupture_risk": 0.008,
        "status": "normal",
        "notes": "Keyence optical line-scan: continuous belt cover profilometry nominal."
    },
    {
        "day_index": 4,
        "date_str": "Friday, Sep 12",
        "relative_label": "Day -2",
        "tonnage_tons": 52100,
        "operating_hours": 23.5,
        "load_sensor_st01": 0.0,
        "thickness_st01": 23.22,
        "misalignment_st01": 47.30,
        "misalignment_st02": 69.80,
        "speed_mid_02": 2.96,
        "speed_head_drive": 3.07,
        "speed_tail_01": 2.94,
        "temp_bearing_01": 44.3,
        "damage_st01": 0,
        "current_motor_01": 18.1,
        "vibration_head": 1.38,
        "vibration_tail": 1.11,
        "vibration_mid1": 0.94,
        "vibration_mid2": 1.03,
        "belt_slip": 3.6,
        "health": {"optimal": 75.0, "warning": 18.0, "critical": 7.0},
        "alert_banner": "Misalignment ST01 lateral drift exceeds warning threshold (> 45.00 mm).",
        "alert_tag": "MisST01Warning",
        "rupture_risk": 0.012,
        "status": "warning",
        "notes": "Return strand lateral drift warning triggered. Tension realignment scheduled."
    },
    {
        "day_index": 5,
        "date_str": "Saturday, Sep 13",
        "relative_label": "Yesterday",
        "tonnage_tons": 47900,
        "operating_hours": 23.8,
        "load_sensor_st01": 0.0,
        "thickness_st01": 22.98,
        "misalignment_st01": 51.10,
        "misalignment_st02": 71.40,
        "speed_mid_02": 2.95,
        "speed_head_drive": 3.08,
        "speed_tail_01": 2.94,
        "temp_bearing_01": 45.1,
        "damage_st01": 0,
        "current_motor_01": 18.3,
        "vibration_head": 1.42,
        "vibration_tail": 1.12,
        "vibration_mid1": 0.95,
        "vibration_mid2": 1.04,
        "belt_slip": 3.8,
        "health": {"optimal": 72.0, "warning": 12.0, "critical": 16.0},
        "alert_banner": "Misalignment ST01 tripped critical alert limit (> 50.00 mm) & ST02 warning.",
        "alert_tag": "MisST01Critical",
        "rupture_risk": 0.018,
        "status": "critical",
        "notes": "Return strand edge contact alert. Operator acknowledged alert."
    },
    {
        "day_index": 6,
        "date_str": "Sunday, Sep 14",
        "relative_label": "Today (Live)",
        "tonnage_tons": 33900,
        "operating_hours": 16.5,
        "load_sensor_st01": 0.0,
        "thickness_st01": 22.81,
        "misalignment_st01": 32.40,
        "misalignment_st02": 72.33,
        "speed_mid_02": 2.96,
        "speed_head_drive": 3.08,
        "speed_tail_01": 2.94,
        "temp_bearing_01": 45.5,
        "damage_st01": 0,
        "current_motor_01": 18.4,
        "vibration_head": 1.45,
        "vibration_tail": 1.12,
        "vibration_mid1": 0.95,
        "vibration_mid2": 1.05,
        "belt_slip": 3.9,
        "health": {"optimal": 78.0, "warning": 14.0, "critical": 8.0},
        "alert_banner": "Misalignment ST02 above the alert limit (> 71.199997 mm)",
        "alert_tag": "MisST02Attention",
        "rupture_risk": 0.020,
        "status": "warning",
        "notes": "Active shift. Live 20Hz streaming connected."
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

def telemetry_simulator_loop():
    """Simulates realistic industrial telemetry fluctuations at 20Hz"""
    global simulation_active
    t = 0.0
    while True:
        time.sleep(0.05) # 20 Hz
        t += 0.05
        if not simulation_active:
            continue
        with state_lock:
            system_state["timestamp"] = int(time.time() * 1000)

            # Realistic noise & slight sinusoidal drift
            s = system_state["sensors"]
            
            # ST01 operates safely under 50 mm (Normal operating envelope, < 45.0 mm warn limit)
            s["misalignment_st01"]["val"] = round(32.40 + 0.35 * math.sin(t * 1.2) + random.uniform(-0.08, 0.08), 2)
            if s["misalignment_st01"]["val"] >= s["misalignment_st01"]["crit_limit"]:
                s["misalignment_st01"]["status"] = "critical"
            elif s["misalignment_st01"]["val"] >= s["misalignment_st01"]["warn_limit"]:
                s["misalignment_st01"]["status"] = "warning"
            else:
                s["misalignment_st01"]["status"] = "normal"
            
            # ST02 fluctuates around 72.33 mm (Warning limit 71.2 mm)
            s["misalignment_st02"]["val"] = round(72.33 + 0.45 * math.sin(t * 0.9) + random.uniform(-0.1, 0.1), 2)
            
            # Load Sensor ST01: Joint stress load cell. Initial nominal value is 0.0 kg (stress rises only when frame joints loosen)
            if "load_sensor_st01" in s:
                s["load_sensor_st01"]["val"] = 0.0
            
            # Thickness Sensor fluctuates around 22.81 mm
            s["thickness_st01"]["val"] = round(22.81 + 0.04 * math.sin(t * 0.25) + random.uniform(-0.01, 0.01), 2)
            
            # Speeds fluctuate slightly around 2.96 and 3.08 m/s
            s["speed_mid_02"]["val"] = round(2.96 + 0.02 * math.sin(t * 2.0) + random.uniform(-0.01, 0.01), 2)
            s["speed_head_drive"]["val"] = round(3.08 + 0.03 * math.sin(t * 2.1) + random.uniform(-0.01, 0.01), 2)
            s["speed_tail_01"]["val"] = round(2.94 + 0.02 * math.sin(t * 1.9) + random.uniform(-0.01, 0.01), 2)
            
            # Bearing temperature
            s["temp_bearing_01"]["val"] = round(45.5 + 0.2 * math.sin(t * 0.1) + random.uniform(-0.05, 0.05), 1)
            
            # Motor current
            s["current_motor_01"]["val"] = round(18.4 + 0.3 * math.sin(t * 1.5) + random.uniform(-0.1, 0.1), 1)
            
            # Vibration velocity RMS
            s["vibration_head"]["val"] = round(1.45 + 0.12 * math.sin(t * 3.5) + random.uniform(-0.04, 0.04), 2)

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
                system_state["alert_tag"] = "Normal"


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
            cum_tonnage = sum(d["tonnage_tons"] for d in HISTORICAL_DAYS)
            total_loss = round(HISTORICAL_DAYS[0]["thickness_st01"] - current_thick, 2)
            rem_days = max(1, round((current_thick - 10.0) / 0.024))

            response_data = {
                "total_days": len(HISTORICAL_DAYS),
                "summary": {
                    "cumulative_tonnage": cum_tonnage,
                    "total_wear_loss_mm": total_loss,
                    "initial_thickness_mm": HISTORICAL_DAYS[0]["thickness_st01"],
                    "current_thickness_mm": current_thick,
                    "replacement_threshold_mm": 10.0,
                    "warning_threshold_mm": 15.0,
                    "wear_rate_mm_day": 0.024,
                    "projected_days_remaining": rem_days,
                    "current_drift_st01": current_st01,
                    "current_drift_st02": current_st02,
                    "active_alarms": 2
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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

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

        self.send_error(404, "Endpoint not found")


def run_server():
    server_address = ("", PORT)
    httpd = ThreadedHTTPServer(server_address, IndustrialHTTPHandler)
    
    # Start background simulator thread
    sim_thread = threading.Thread(target=telemetry_simulator_loop, daemon=True)
    sim_thread.start()

    print("=================================================================")
    print(" [OK] ABB Ability(TM) Conveyor 3D Digital Twin Server Started")
    print(f" [URL] Dashboard URL: http://localhost:{PORT}")
    print(f" [DIR] Serving Meshes from: {MESH_DIR}")
    print(f" [STREAM] Streaming Telemetry: /api/telemetry/stream (20Hz SSE & REST)")
    print("=================================================================")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
