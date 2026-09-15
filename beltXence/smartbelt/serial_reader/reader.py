"""
SmartBelt v2 — ESP32 Serial Reader Thread
Auto-detects the ESP32 COM port, reads JSON packets at 5 Hz,
and exposes the latest parsed SensorPacket via a thread-safe property.

Supports:
- Dynamic COM port listing and scanning
- Runtime port and baud rate reconfiguration
- High-fidelity synthetic simulation mode when physical hardware is not connected
- Diagnostic tracking (VID/PID, baud rate, raw line, error reporting)
"""

import json
import logging
import random
import threading
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import serial
import serial.tools.list_ports

logger = logging.getLogger(__name__)

# USB-Serial chip descriptions and vendor IDs found on ESP32 / Arduino development boards
_ESP32_USB_DESCRIPTORS = [
    "CH340",
    "CH341",
    "CP2102",
    "CP210X",
    "CP2104",
    "FT232",
    "FTDI",
    "USB-SERIAL",
    "SILICON LABS",
    "WCH.CN",
    "USB SERIAL",
    "ESP32",
    "ESPRESSIF",
]

_KNOWN_VID_PID = [
    (0x10C4, 0xEA60),  # Silicon Labs CP210x
    (0x1A86, 0x7523),  # QinHeng CH340
    (0x1A86, 0x55D4),  # QinHeng CH9102
    (0x0403, 0x6001),  # FTDI FT232R
    (0x303A, 0x1001),  # Espressif USB JTAG/serial debug
    (0x303A, 0x0002),  # ESP32-S2/S3 native CDC
    (0x2341, 0x0043),  # Arduino Uno R3
    (0x2341, 0x0001),  # Arduino Uno
]


@dataclass
class SensorPacket:
    """Parsed sensor reading from the ESP32 JSON packet."""
    timestamp_ms: int = 0          # ESP32 millis()
    received_at: float = 0.0      # time.monotonic() on host machine
    temp_c: float = 0.0           # MLX90614 object temperature (°C)
    vib_x: float = 0.0            # MPU-6050 accel X (g)
    vib_y: float = 0.0            # MPU-6050 accel Y (g)
    vib_z: float = 0.0            # MPU-6050 accel Z (g, gravity subtracted)
    vib_rms: float = 0.0          # combined vibration RMS (g)
    load_kg: float = 0.0          # HX711 load cell reading (kg)
    ir_state: int = 1             # E18-D80NK: 0=object, 1=clear
    belt_speed_mps: float = 0.0   # derived from IR pulse count (m/s)
    parse_error: bool = False     # True if this packet had a JSON decode error


class SerialReader:
    """
    Reads JSON packets from the ESP32 over USB serial in a daemon thread.
    The latest successfully parsed packet is always available via `latest_packet`.
    Supports dynamic port reconfiguration and virtual simulation mode.
    """

    WATCHDOG_TIMEOUT_S = 5.0   # Warn if no packet received for this long
    RECONNECT_DELAY_S  = 2.0   # Wait between reconnect attempts

    def __init__(self, port: Optional[str] = None, baud: int = 115200, simulation: bool = False) -> None:
        self._port = port       # None = auto-detect, "SIMULATION" = synthetic
        self._baud = baud
        self._simulation = simulation or (port == "SIMULATION")
        self._serial: Optional[serial.Serial] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._config_lock = threading.Lock()
        self._latest: Optional[SensorPacket] = None

        # Diagnostics & Runtime Status
        self.active_port_name: Optional[str] = "Simulation" if self._simulation else None
        self.last_error: Optional[str] = None
        self.last_raw_line: str = ""
        self.packets_received: int = 0
        self.parse_errors: int = 0
        self.last_packet_ts: float = 0.0
        self._sim_tick: int = 0

    def start(self) -> None:
        """Start the serial reader background thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._read_loop, name="SerialReader", daemon=True)
        self._thread.start()
        logger.info("SerialReader thread started.")

    def stop(self) -> None:
        """Stop the background thread and close the serial port."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=3.0)
        self._close_serial()
        logger.info("SerialReader stopped.")

    def configure(self, port: Optional[str] = None, baud: int = 115200, simulation: bool = False) -> None:
        """
        Dynamically reconfigure port, baud rate, or simulation mode without
        restarting background threads.
        """
        with self._config_lock:
            sim_requested = simulation or (port == "SIMULATION")
            changed = (self._port != port) or (self._baud != baud) or (self._simulation != sim_requested)
            if not changed:
                return

            logger.info(f"Reconfiguring SerialReader: port={port}, baud={baud}, simulation={sim_requested}")
            self._close_serial()
            self._port = None if port in (None, "", "AUTO", "Auto-Detect") else port
            self._baud = baud
            self._simulation = sim_requested
            self.last_error = None
            if self._simulation:
                self.active_port_name = "Simulation"
            else:
                self.active_port_name = None

    @property
    def latest_packet(self) -> Optional[SensorPacket]:
        """Thread-safe access to the most recently parsed sensor packet."""
        with self._lock:
            return self._latest

    @property
    def is_healthy(self) -> bool:
        """True if a packet was received within the watchdog window."""
        if self._latest is None:
            return False
        return (time.monotonic() - self.last_packet_ts) < self.WATCHDOG_TIMEOUT_S

    @property
    def is_connected(self) -> bool:
        """True if physical serial port is currently open or simulation is running."""
        if self._simulation:
            return True
        return self._serial is not None and self._serial.is_open

    @property
    def is_simulation(self) -> bool:
        return self._simulation

    @property
    def baud_rate(self) -> int:
        return self._baud

    @property
    def configured_port(self) -> Optional[str]:
        return self._port

    @staticmethod
    def list_com_ports() -> List[Dict[str, Any]]:
        """Scan and list all COM ports detected on host with hardware metadata."""
        ports = []
        try:
            for p in serial.tools.list_ports.comports():
                desc = p.description or ""
                mfg = p.manufacturer or ""
                hwid = p.hwid or ""
                combined = f"{desc} {mfg} {hwid}".upper()

                # Check if matches known ESP32 or Arduino VID/PID or keywords
                is_esp32 = any(k in combined for k in _ESP32_USB_DESCRIPTORS)
                if not is_esp32 and p.vid:
                    for v, _ in _KNOWN_VID_PID:
                        if p.vid == v:
                            is_esp32 = True
                            break

                is_arduino = "ARDUINO" in combined or (p.vid == 0x2341)

                ports.append({
                    "port": p.device,
                    "description": desc,
                    "manufacturer": mfg,
                    "hwid": hwid,
                    "vid": hex(p.vid) if p.vid else "",
                    "pid": hex(p.pid) if p.pid else "",
                    "is_esp32": is_esp32,
                    "is_arduino": is_arduino,
                })
        except Exception as e:
            logger.error(f"Failed to scan COM ports: {e}")
        return ports

    @classmethod
    def auto_detect_port(cls) -> Optional[str]:
        """Scan COM ports and return the first one matching an ESP32 or Arduino descriptor."""
        ports = cls.list_com_ports()
        for p in ports:
            if p["is_esp32"] or p["is_arduino"]:
                logger.info(f"Auto-detected microcontroller on {p['port']} ({p['description']})")
                return p["port"]
        # Fallback to first port if available
        if ports:
            logger.info(f"No explicit ESP32 match found; using first available port: {ports[0]['port']}")
            return ports[0]["port"]
        return None

    def _open_serial(self) -> bool:
        """Attempt to open the serial port. Returns True on success."""
        port = self._port or self.auto_detect_port()
        if port is None:
            self.active_port_name = None
            self.last_error = "No COM ports detected on host system. Check USB cable or switch to Simulation mode."
            return False

        try:
            self._serial = serial.Serial(port, self._baud, timeout=2.0)
            self.active_port_name = port
            self.last_error = None
            logger.info(f"Serial port opened: {port} @ {self._baud} baud")
            return True
        except (serial.SerialException, OSError) as e:
            self.last_error = f"Error opening {port}: {e}"
            self.active_port_name = None
            logger.debug(f"Failed to open serial port {port}: {e}")
            return False

    def _close_serial(self) -> None:
        if self._serial and self._serial.is_open:
            try:
                self._serial.close()
            except Exception:
                pass
        self._serial = None

    def _generate_simulated_packet(self) -> SensorPacket:
        """Generate realistic physics-modeled telemetry packet for simulation mode."""
        self._sim_tick += 1
        now = time.monotonic()

        # Slight sinusoidal drift + small gaussian noise around nominal conveyor values
        t = self._sim_tick * 0.2
        temp_c = 36.5 + 0.6 * (t % 10.0 / 10.0) + random.uniform(-0.15, 0.15)
        vib_rms = 1.42 + 0.08 * (t % 6.0 / 6.0) + random.uniform(-0.04, 0.04)
        load_kg = 22.4 + random.uniform(-0.15, 0.15)
        belt_speed = 1.80 + random.uniform(-0.02, 0.02)
        ir_state = 0 if (self._sim_tick % 25 == 0) else 1  # periodic marker pulse

        pkt = SensorPacket(
            timestamp_ms=int(time.time() * 1000) % 10000000,
            received_at=now,
            temp_c=round(temp_c, 2),
            vib_x=round(random.uniform(-0.04, 0.04), 3),
            vib_y=round(random.uniform(-0.04, 0.04), 3),
            vib_z=round(random.uniform(-0.02, 0.02), 3),
            vib_rms=round(vib_rms, 3),
            load_kg=round(load_kg, 2),
            ir_state=ir_state,
            belt_speed_mps=round(belt_speed, 2),
            parse_error=False,
        )
        self.last_raw_line = (
            f'{{"ts":{pkt.timestamp_ms},"temp_c":{pkt.temp_c},'
            f'"vib_rms":{pkt.vib_rms},"load_kg":{pkt.load_kg},"belt_speed_mps":{pkt.belt_speed_mps}}}'
        )
        return pkt

    def _read_loop(self) -> None:
        """Main acquisition loop: supports physical serial link or synthetic simulation."""
        while self._running:
            # 1. Simulation Mode
            if self._simulation:
                time.sleep(0.2)  # 5 Hz stream rate
                pkt = self._generate_simulated_packet()
                with self._lock:
                    self._latest = pkt
                self.last_packet_ts = time.monotonic()
                self.packets_received += 1
                self.active_port_name = "Simulation"
                self.last_error = None
                continue

            # 2. Physical Serial Mode
            if self._serial is None or not self._serial.is_open:
                if not self._open_serial():
                    time.sleep(self.RECONNECT_DELAY_S)
                    continue

            try:
                raw = self._serial.readline()
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="replace").strip()
                if not line:
                    continue

                self.last_raw_line = line
                pkt = self._parse_line(line)
                with self._lock:
                    self._latest = pkt
                self.last_packet_ts = time.monotonic()
                if not pkt.parse_error:
                    self.packets_received += 1
                else:
                    self.parse_errors += 1

            except (serial.SerialException, OSError) as e:
                self.last_error = f"Serial read error: {e}"
                logger.error(f"Serial read error: {e}. Attempting reconnect...")
                self._close_serial()
                self.active_port_name = None
                time.sleep(self.RECONNECT_DELAY_S)

    @staticmethod
    def _parse_line(line: str) -> SensorPacket:
        """Parse a single JSON line into a SensorPacket."""
        pkt = SensorPacket(received_at=time.monotonic())
        try:
            data = json.loads(line)
            pkt.timestamp_ms    = int(data.get("ts", 0))
            pkt.temp_c          = float(data.get("temp_c", 0.0))
            pkt.vib_x           = float(data.get("vib_x", 0.0))
            pkt.vib_y           = float(data.get("vib_y", 0.0))
            pkt.vib_z           = float(data.get("vib_z", 0.0))
            pkt.vib_rms         = float(data.get("vib_rms", 0.0))
            pkt.load_kg         = float(data.get("load_kg", 0.0))
            pkt.ir_state        = int(data.get("ir_state", 1))
            pkt.belt_speed_mps  = float(data.get("belt_speed_mps", 0.0))
        except (json.JSONDecodeError, ValueError, KeyError):
            pkt.parse_error = True
        return pkt
