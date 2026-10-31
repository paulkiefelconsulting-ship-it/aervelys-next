"""AERVELYS NEXT local MSFS 2024 SimConnect read-only prototype (Windows).

This process ONLY writes a local JSONL file.
It never contacts Supabase/Vercel, never updates a virtual charter mission,
never changes the simulator, and never releases flights.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from phase_detector import PhaseDetector, Telemetry

LOG = logging.getLogger("aervelys.msfs2024")


def finite_numeric(aq, key: str):
    try:
        result = aq.get(key)
        return None if result is None else float(result)
    except Exception as exc:
        LOG.debug("SimVar %s unavailable: %s", key, exc)
        return None


def read_sample(aq) -> Telemetry | None:
    on_ground = finite_numeric(aq, "SIM_ON_GROUND")
    ground_velocity = finite_numeric(aq, "GROUND_VELOCITY")
    altitude_agl = finite_numeric(aq, "PLANE_ALT_ABOVE_GROUND")
    vertical_speed = finite_numeric(aq, "VERTICAL_SPEED")
    indicated_air_speed = finite_numeric(aq, "AIRSPEED_INDICATED")
    if None in (on_ground, ground_velocity, altitude_agl, vertical_speed, indicated_air_speed):
        return None
    engine = finite_numeric(aq, "GENERAL_ENG_COMBUSTION:1")
    return Telemetry(
        timestamp_s=time.monotonic(),
        on_ground=on_ground >= 0.5,
        groundspeed_kt=ground_velocity,
        agl_ft=altitude_agl,
        vertical_speed_fpm=vertical_speed,
        indicated_airspeed_kt=indicated_air_speed,
        engine_running=None if engine is None else engine >= 0.5,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="AERVELYS NEXT local SimConnect phase detector")
    parser.add_argument("--output",default="msfs_phase_events.jsonl",
        help="Local JSONL event log, not uploaded")
    parser.add_argument("--interval",type=float,default=2.0,
        help="SimVar polling interval in seconds (>=1)")
    parser.add_argument("--initial-phase",choices=[
        "boarding","taxi_out","takeoff","climb","cruise",
        "descent","approach","landing","taxi_in"],default="boarding",
        help="Must match your manually selected phase when connecting mid-flight")
    args=parser.parse_args()
    if args.interval<1 or args.interval>10:
        parser.error("--interval must be between 1 and 10 seconds")
    logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(message)s")
    try:
        from SimConnect import SimConnect,AircraftRequests
    except ImportError:
        LOG.error("Python-SimConnect not installed; see bridge/msfs2024/README.md")
        return 2
    detector=PhaseDetector(args.initial_phase)
    out=Path(args.output).resolve()
    out.parent.mkdir(parents=True,exist_ok=True)
    LOG.info("LOCAL-ONLY SimConnect reader, no AERVELYS web connection")
    LOG.info("Phases are heuristic, NOT verified as flight recorder evidence")
    LOG.info("Logging to %s",out)
    sm=None
    try:
        sm=SimConnect()
        aq=AircraftRequests(sm,_time=max(500,int(args.interval*500)))
        with out.open("a",encoding="utf-8") as log:
            while True:
                sample=read_sample(aq)
                if sample is None:
                    LOG.warning("Core SimVars unavailable; waiting without phase change")
                    time.sleep(args.interval)
                    continue
                try:
                    new_phase=detector.update(sample)
                except ValueError as e:
                    LOG.warning("Rejected telemetry: %s",e)
                    time.sleep(args.interval)
                    continue
                if new_phase:
                    payload={
                       "source":"local_simconnect_unverified",
                       "phase":new_phase,
                       "at_utc":datetime.now(timezone.utc).isoformat(),
                       "groundspeed_kt":round(sample.groundspeed_kt,1),
                       "agl_ft":round(sample.agl_ft,1),
                       "vertical_speed_fpm":round(sample.vertical_speed_fpm,1),
                       "on_ground":sample.on_ground,
                       "uploaded":False,
                       "operational_approval":False
                    }
                    encoded=json.dumps(payload,ensure_ascii=False)
                    log.write(encoded+"\n")
                    log.flush()
                    print(encoded,flush=True)
                time.sleep(args.interval)
    except KeyboardInterrupt:
        LOG.info("Stopped by pilot")
        return 0
    except Exception:
        LOG.exception("SimConnect connection or polling failed")
        return 1
    finally:
        if sm is not None:
            try:
                sm.exit()
            except Exception:
                pass


if __name__=="__main__":
    sys.exit(main())
