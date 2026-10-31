"""Local, read-only flight phase classifier for AERVELYS NEXT.

Input: numeric snapshots from a Windows SimConnect reader.
Output: phase transitions for *local* JSONL logs. No network, no flight release.
Not certified for dispatch, nor a replacement for a flight recorder.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Optional

PHASES = (
    "boarding", "taxi_out", "takeoff", "climb", "cruise",
    "descent", "approach", "landing", "taxi_in", "arrived",
)
STABLE_SECONDS = {
    "taxi_out": 6.0,
    "takeoff": 2.0,
    "climb": 4.0,
    "cruise": 35.0,
    "descent": 8.0,
    "approach": 8.0,
    "landing": 2.0,
    "taxi_in": 5.0,
    "arrived": 20.0,
}
MAX_SAMPLE_GAP_SECONDS = 20.0


@dataclass(frozen=True)
class Telemetry:
    timestamp_s: float
    on_ground: bool
    groundspeed_kt: float
    agl_ft: float
    vertical_speed_fpm: float
    indicated_airspeed_kt: float
    engine_running: Optional[bool] = None

    def validate(self) -> None:
        vals = (
            self.timestamp_s, self.groundspeed_kt, self.agl_ft,
            self.vertical_speed_fpm, self.indicated_airspeed_kt,
        )
        if not all(isfinite(v) for v in vals):
            raise ValueError("Invalid non-finite SimConnect sample.")
        if self.timestamp_s < 0 or self.groundspeed_kt < 0 or self.agl_ft < -100:
            raise ValueError("Invalid negative time, groundspeed or AGL.")
        if self.groundspeed_kt > 900 or self.agl_ft > 120000:
            raise ValueError("Unreasonable SimConnect sample; ignored.")


class PhaseDetector:
    """Debounced progression; never advances phase without plausible telemetry.

    Start state deliberately assumes boarding is selected by the pilot.
    Airborne startup needs manual phase alignment, not speculative detection.
    """

    def __init__(self, initial_phase: str = "boarding"):
        if initial_phase not in PHASES:
            raise ValueError("Unknown initial phase.")
        self.phase = initial_phase
        self._candidate: Optional[str] = None
        self._candidate_at: Optional[float] = None
        self._last_at: Optional[float] = None

    def next_candidate(self, s: Telemetry) -> Optional[str]:
        if self.phase == "boarding":
            if s.on_ground and s.groundspeed_kt >= 7:
                return "taxi_out"
        elif self.phase == "taxi_out":
            if not s.on_ground and s.agl_ft >= 35 and s.indicated_airspeed_kt >= 60:
                return "takeoff"
        elif self.phase == "takeoff":
            if not s.on_ground and s.agl_ft >= 300 and s.vertical_speed_fpm >= 200:
                return "climb"
        elif self.phase == "climb":
            if not s.on_ground and s.agl_ft >= 4000 and abs(s.vertical_speed_fpm) <= 350:
                return "cruise"
        elif self.phase == "cruise":
            if not s.on_ground and s.agl_ft >= 2000 and s.vertical_speed_fpm <= -400:
                return "descent"
        elif self.phase == "descent":
            if not s.on_ground and s.agl_ft <= 3200 and s.vertical_speed_fpm <= -150:
                return "approach"
        elif self.phase == "approach":
            if not s.on_ground and s.agl_ft >= 400 and s.vertical_speed_fpm >= 500:
                return "climb"  # Go-around; not a false landing.
            if s.on_ground and s.groundspeed_kt >= 25:
                return "landing"
        elif self.phase == "landing":
            if s.on_ground and s.groundspeed_kt <= 25:
                return "taxi_in"
        elif self.phase == "taxi_in":
            if s.on_ground and s.groundspeed_kt <= 3 and s.engine_running is False:
                return "arrived"
        return None

    def update(self, sample: Telemetry) -> Optional[str]:
        """Return new phase only on a stabilized transition, otherwise None."""
        sample.validate()
        now = sample.timestamp_s
        if self._last_at is not None:
            if now <= self._last_at:
                return None  # Drop duplicate or out-of-order samples.
            if now - self._last_at > MAX_SAMPLE_GAP_SECONDS:
                self._candidate = None
                self._candidate_at = None  # Re-establish stable telemetry.
        self._last_at = now
        if self.phase == "arrived":
            return None

        candidate = self.next_candidate(sample)
        if candidate is None:
            self._candidate = None
            self._candidate_at = None
            return None

        if candidate != self._candidate:
            self._candidate = candidate
            self._candidate_at = now
            return None

        if self._candidate_at is None:
            self._candidate_at = now
            return None

        if now - self._candidate_at < STABLE_SECONDS[candidate]:
            return None

        self.phase = candidate
        self._candidate = None
        self._candidate_at = None
        return candidate
