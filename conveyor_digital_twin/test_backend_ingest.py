#!/usr/bin/env python3
"""
Test Telemetry Ingestion Script
Sends custom simulated or live sensor data to the Conveyor Digital Twin Backend
Usage: python test_backend_ingest.py
"""

import time
import json
import urllib.request

SERVER_URL = "http://localhost:8080/api/telemetry/ingest"

def send_sensor_update(payload):
    req = urllib.request.Request(
        SERVER_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode("utf-8"))
        print(f"[*] Ingestion Response: {res}")

if __name__ == "__main__":
    print("[*] Testing live telemetry ingestion to backend...")

    # Test 1: Normal operating conditions
    print("\n1. Injecting Normal Sensor Packet...")
    send_sensor_update({
        "belt_speed": 3.12,
        "misalignment_st01": 32.4, # Normal (<45 mm)
        "misalignment_st02": 58.1, # Normal (<71.2 mm)
        "thickness_st01": 22.8,
        "temp_bearing_01": 42.1,
        "vibration_head": 1.15
    })

    time.sleep(2)

    # Test 2: Critical Misalignment Scenario
    print("\n2. Injecting Critical Misalignment ST01 Alert (>50 mm)...")
    send_sensor_update({
        "misalignment_st01": 56.8, # Trip critical (Red)
        "misalignment_st02": 73.4  # Trip warning (Yellow)
    })

    print("\n[OK] Backend ingestion test complete! Check your dashboard at http://localhost:8080")
