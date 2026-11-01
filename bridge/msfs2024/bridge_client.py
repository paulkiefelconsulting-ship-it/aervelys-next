"""Safe mission-scoped AERVELYS NEXT Supabase REST client.

Only SIM telemetry RPC; never service-role credentials.
No persistent secrets, no retry of ambiguous writes and no real flight permissions.
"""
from __future__ import annotations
import json
import re
from urllib import error, parse, request


class BridgeRejected(RuntimeError):
    pass


class BridgeClient:
    def __init__(self, project_url: str, anon_key: str, pairing_token: str, timeout: float = 8.0):
        url = parse.urlparse(project_url)
        if (url.scheme != "https" or
                not re.fullmatch(r"[a-z0-9-]+\.supabase\.co", url.hostname or "") or
                url.path not in ("", "/") or url.port is not None):
            raise ValueError("Expected HTTPS *.supabase.co project URL")
        if not anon_key or "\n" in anon_key or "\r" in anon_key:
            raise ValueError("Public Supabase anon key required")
        if not re.fullmatch(r"[a-f0-9]{96}", pairing_token):
            raise ValueError("Invalid one-time pairing code")
        if not 2 <= timeout <= 30:
            raise ValueError("Timeout must be 2..30 seconds")
        self.endpoint = project_url.rstrip("/") + "/rest/v1/rpc/aervelys_sim_bridge_ingest"
        self._public_key = anon_key
        self._token = pairing_token
        self._timeout = timeout
        self._sequence = 0

    def send(self, sample: dict, phase: str | None = None) -> dict:
        """Never blindly retry a timed-out sequence; re-pair on ambiguous delivery."""
        if not isinstance(sample, dict) or len(json.dumps(sample)) > 1500:
            raise ValueError("Invalid sample payload")
        if phase is not None and phase not in (
            "taxi_out","takeoff","climb","cruise","descent","approach",
            "landing","taxi_in","arrived"):
            raise ValueError("Invalid flight phase")
        seq = self._sequence + 1
        data = json.dumps({
            "p_token":self._token,"p_seq":seq,
            "p_phase":phase,"p_sample":sample,
        },separators=(",",":")).encode("utf-8")
        req = request.Request(
            self.endpoint,data=data,method="POST",
            headers={
                "apikey":self._public_key,
                "Authorization":"Bearer "+self._public_key,
                "Content-Type":"application/json",
                "Accept":"application/json",
            },
        )
        try:
            with request.urlopen(req,timeout=self._timeout) as response:
                out=json.loads(response.read(4096))
        except error.HTTPError as exc:
            # Do not print the request body or the secret on errors.
            raise BridgeRejected(f"Supabase refused telemetry (HTTP {exc.code}); re-pair if needed") from None
        except (error.URLError,TimeoutError,ValueError) as exc:
            raise BridgeRejected("Telemetry delivery uncertain: stop and re-pair; no automatic retry") from exc
        if not isinstance(out,dict) or out.get("accepted") is not True or (
            out.get("simulation_only") is not True or
            out.get("telemetry_trusted_for_ops") is not False or
            out.get("real_flight_changes") != 0 or
            out.get("financial_postings") != 0
        ):
            raise BridgeRejected("Telemetry response did not meet SIM-only safety contract")
        self._sequence = seq
        return out
