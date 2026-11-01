"""Run on Windows with MSFS 2024 active: local SimConnect -> AERVELYS SIM only.

Never carries service role credentials; secret is entered through getpass.
Autonomous phase changes have no operational/legal dispatch authority.
"""
from __future__ import annotations
import argparse
import getpass
import json
import logging
import os
import sys
import time

from bridge_client import BridgeClient,BridgeRejected
from phase_detector import PhaseDetector
from run_local import read_sample

LOG=logging.getLogger("aervelys.msfs2024.paired")


def sample_payload(s):
    data={
        "on_ground":s.on_ground,
        "groundspeed_kt":round(s.groundspeed_kt,2),
        "agl_ft":round(s.agl_ft,2),
        "vertical_speed_fpm":round(s.vertical_speed_fpm,2),
        "indicated_airspeed_kt":round(s.indicated_airspeed_kt,2),
    }
    if s.engine_running is not None:
        data["engine_running"]=bool(s.engine_running)
    return data


def main() -> int:
    parser=argparse.ArgumentParser(description="Local read-only MSFS 2024 -> AERVELYS SIM mission")
    parser.add_argument("--initial-phase",choices=[
        "boarding","taxi_out","takeoff","climb","cruise",
        "descent","approach","landing","taxi_in"],default="boarding",
        help="Must match the active AERVELYS SIM phase")
    parser.add_argument("--interval",type=float,default=2)
    args=parser.parse_args()
    if args.interval<1 or args.interval>10:
        parser.error("--interval must be 1..10 seconds")
    logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(message)s")
    url=os.environ.get("AERVELYS_SUPABASE_URL","")
    anon=os.environ.get("AERVELYS_SUPABASE_ANON_KEY","")
    try:
        token=getpass.getpass("AERVELYS SIM pairing code (hidden): ")
        bridge=BridgeClient(url,anon,token)
        detector=PhaseDetector(initial_phase=args.initial_phase)
        del token
    except (ValueError,EOFError) as exc:
        LOG.error("Pairing setup invalid: %s",str(exc).replace("token","code"))
        return 2

    LOG.info("Paired with SIM-only server endpoint; no real flight or crew changes")
    LOG.info("Re-pair the mission after restarting. Never log the secret.")
    sm=None
    try:
        from SimConnect import SimConnect,AircraftRequests
        sm=SimConnect()
        aq=AircraftRequests(sm,_time=max(500,int(args.interval*500)))
        last_sent=time.monotonic()-10
        while True:
            sample=read_sample(aq)
            if sample is None:
                LOG.warning("SimConnect variables missing: no heartbeat or phase update")
                time.sleep(args.interval)
                continue
            try:
                phase=detector.update(sample)
            except ValueError:
                LOG.warning("Invalid aircraft data ignored")
                time.sleep(args.interval)
                continue
            if phase or time.monotonic()-last_sent>=8:
                reply=bridge.send(sample_payload(sample),phase)
                last_sent=time.monotonic()
                if phase:
                    # Only print verified server-accepted event; never print secrets.
                    print(json.dumps({
                        "phase":phase,
                        "source":"local_simconnect_unverified",
                        "server_accepted":reply.get("accepted"),
                        "simulation_only":True,
                    }),flush=True)
            time.sleep(args.interval)
    except KeyboardInterrupt:
        LOG.info("Stopped by pilot; time-limited token expires automatically")
        return 0
    except BridgeRejected as exc:
        LOG.error("%s",exc)
        LOG.error("Bridge stopped to avoid divergent phases. Re-pair from CEO mission cockpit.")
        return 1
    except ImportError:
        LOG.error("Python-SimConnect is not installed; see bridge/msfs2024/README.md")
        return 2
    except Exception:
        LOG.exception("Windows SimConnect could not be read")
        return 1
    finally:
        if sm is not None:
            try:
                sm.exit()
            except Exception:
                pass


if __name__=="__main__":
    sys.exit(main())
