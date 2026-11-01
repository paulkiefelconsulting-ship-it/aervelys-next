"""Offline tests for scoped HTTPS transport. Run via unittest discovery."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib import error

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from bridge_client import BridgeClient,BridgeRejected


class Response:
    def __enter__(self):
        return self
    def __exit__(self,*args):
        return False
    def read(self,max_bytes):
        return b'{"accepted":true,"simulation_only":true,"telemetry_trusted_for_ops":false,"real_flight_changes":0,"financial_postings":0}'


class BridgeClientTests(unittest.TestCase):
    def setUp(self):
        self.secret="f"*96
        self.url="https://demo123.supabase.co"
        self.client=BridgeClient(self.url,"public-anon-key",self.secret)

    def test_scoped_https_only(self):
        for url in ("http://demo123.supabase.co",
                    "https://demo123.supabase.co.attackers.example",
                    "https://demo123.supabase.co.evil.com",
                    "https://localhost",
                    "https://demo123.supabase.co/other"):
            with self.assertRaises(ValueError):
                BridgeClient(url,"public-anon-key",self.secret)
        with self.assertRaises(ValueError):
            BridgeClient(self.url,"public-anon-key","short")

    def test_secret_sent_only_in_body_with_monotonic_sequence(self):
        sample={"on_ground":True,"groundspeed_kt":15,"agl_ft":0,"vertical_speed_fpm":0,"indicated_airspeed_kt":10}
        with patch("bridge_client.request.urlopen",return_value=Response()) as opened:
            self.client.send(sample)
            request1=opened.call_args.args[0]
            self.assertEqual(request1.full_url,self.url+"/rest/v1/rpc/aervelys_sim_bridge_ingest")
            self.assertEqual(json.loads(request1.data)["p_seq"],1)
            self.assertEqual(json.loads(request1.data)["p_token"],self.secret)
            self.assertNotIn(self.secret,str(request1.headers))
            self.client.send(sample,"taxi_out")
            self.assertEqual(json.loads(opened.call_args.args[0].data)["p_seq"],2)

    def test_rejects_unsafe_server_response(self):
        class BadReply(Response):
            def read(self,max_bytes):
                return b'{"accepted":true,"simulation_only":true,"telemetry_trusted_for_ops":true,"real_flight_changes":0,"financial_postings":0}'
        with patch("bridge_client.request.urlopen",return_value=BadReply()):
            with self.assertRaises(BridgeRejected):
                self.client.send({},None)

    def test_http_error_never_exposes_secret_and_fails_closed(self):
        err=error.HTTPError(self.url,403,"Forbidden",{},None)
        with patch("bridge_client.request.urlopen",side_effect=err):
            with self.assertRaises(BridgeRejected) as context:
                self.client.send({},None)
        self.assertNotIn(self.secret,str(context.exception))
        self.assertEqual(self.client._sequence,0)

    def test_unsupported_phases_and_payloads_rejected_locally(self):
        with self.assertRaises(ValueError):
            self.client.send({},"debrief")
        with self.assertRaises(ValueError):
            self.client.send({"overlong":"x"*2000},None)
        self.assertEqual(self.client._sequence,0)


if __name__=="__main__":
    unittest.main()
