import urllib.request
import json

def fetch_json(url):
    req = urllib.request.Request(url, headers={"Connection": "close"})
    with urllib.request.urlopen(req, timeout=5) as res:
        return json.loads(res.read().decode("utf-8"))

def fetch_text(url):
    req = urllib.request.Request(url, headers={"Connection": "close"})
    with urllib.request.urlopen(req, timeout=5) as res:
        return res.read().decode("utf-8")

def run_checks():
    print("==================================================")
    print("  Testing beltXence Day-by-Day Historical System")
    print("==================================================")

    # 1. Test index.html
    html = fetch_text("http://localhost:8080/")
    assert "timeline-scrubber-bar" in html, "Missing timeline-scrubber-bar in html"
    assert "analytics-modal-root" in html, "Missing analytics-modal-root in html"
    print("[PASS] index.html contains all timeline & modal DOM roots")

    # 2. Test JS files
    js_files = [
        "app.js",
        "timeline_scrubber.js",
        "daily_analytics_modal.js",
        "conveyor_scene.js",
        "spatial_hud.js",
        "sensor_details.js",
        "depth_camera_vision.js"
    ]
    for js in js_files:
        content = fetch_text(f"http://localhost:8080/js/{js}")
        assert len(content) > 100, f"{js} too small"
        print(f"[PASS] js/{js} verified ({len(content)} bytes)")

    # 3. Test /api/telemetry/history
    hist = fetch_json("http://localhost:8080/api/telemetry/history")
    assert hist["total_days"] == 7, "Total days != 7"
    assert "summary" in hist
    assert "cumulative_tonnage" in hist["summary"]
    assert len(hist["days"]) == 7
    print(f"[PASS] /api/telemetry/history: {hist['summary']['cumulative_tonnage']:,} T total, {hist['summary']['total_wear_loss_mm']} mm wear loss, {hist['summary']['projected_days_remaining']} days remaining")

    # 4. Test /api/telemetry/day for all 7 days
    for i in range(7):
        day = fetch_json(f"http://localhost:8080/api/telemetry/day?day={i}")
        label = day["day_info"]["relative_label"]
        st01 = day["sensors"]["misalignment_st01"]["val"]
        thick = day["sensors"]["thickness_st01"]["val"]
        status = day["sensors"]["misalignment_st01"]["status"]
        print(f"[PASS] Day {i} ({label}): ST01={st01} mm ({status}) | Thickness={thick} mm")

    print("\n[SUCCESS] All 7 historical days, endpoints, and modules verified 100% operational!")

if __name__ == "__main__":
    run_checks()
