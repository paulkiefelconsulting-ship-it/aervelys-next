"""Run: python -m unittest discover bridge/msfs2024/tests -v"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from phase_detector import PhaseDetector,Telemetry


def sample(sec,on_ground=True,gs=0,agl=0,vs=0,ias=0,engine=True):
    return Telemetry(float(sec),on_ground,float(gs),float(agl),float(vs),float(ias),engine)


def hold(detector, t, seconds, **kwargs):
    events=[]
    for i in range(seconds+2):
        changed=detector.update(sample(t+i,**kwargs))
        if changed:
            events.append(changed)
    return t+seconds+2,events


class DetectorTests(unittest.TestCase):
    def test_full_flight_lifecycle(self):
        d=PhaseDetector()
        t=1
        for expected,duration,readings in (
            ("taxi_out",8,dict(on_ground=True,gs=12)),
            ("takeoff",4,dict(on_ground=False,gs=135,agl=60,vs=950,ias=133)),
            ("climb",6,dict(on_ground=False,gs=180,agl=900,vs=1100,ias=170)),
            ("cruise",38,dict(on_ground=False,gs=310,agl=25000,vs=80,ias=265)),
            ("descent",12,dict(on_ground=False,gs=295,agl=18000,vs=-950,ias=240)),
            ("approach",12,dict(on_ground=False,gs=230,agl=2400,vs=-610,ias=176)),
            ("landing",4,dict(on_ground=True,gs=88,agl=0,vs=0,ias=74)),
            ("taxi_in",7,dict(on_ground=True,gs=16,agl=0,vs=0,ias=6)),
            ("arrived",23,dict(on_ground=True,gs=0,agl=0,vs=0,ias=0,engine=False))
        ):
            t,events=hold(d,t,duration,**readings)
            self.assertEqual(events,[expected],(expected,events,d.phase))
        self.assertEqual(d.phase,"arrived")

    def test_noise_is_debounced(self):
        d=PhaseDetector()
        d.update(sample(1,gs=0))
        d.update(sample(2,gs=9))
        d.update(sample(3,gs=0))
        d.update(sample(4,gs=11))
        self.assertEqual(d.phase,"boarding")
        self.assertIsNone(d.update(sample(50,gs=12))) # Long gap resets evidence
        self.assertEqual(d.phase,"boarding")

    def test_go_around_not_reported_as_landing(self):
        d=PhaseDetector(initial_phase="approach")
        t,events=hold(d,1,8,on_ground=False,gs=130,agl=900,vs=850,ias=140)
        self.assertEqual(events,["climb"])
        self.assertEqual(d.phase,"climb")

    def test_missing_engine_cannot_auto_arrive(self):
        d=PhaseDetector(initial_phase="taxi_in")
        _,events=hold(d,1,35,on_ground=True,gs=0,agl=0,vs=0,ias=0,engine=None)
        self.assertEqual(events,[])
        self.assertEqual(d.phase,"taxi_in")

    def test_invalid_and_out_of_order_samples(self):
        d=PhaseDetector()
        with self.assertRaises(ValueError):
            d.update(sample(1,gs=float("nan")))
        self.assertIsNone(d.update(sample(10,gs=10)))
        self.assertIsNone(d.update(sample(10,gs=10)))
        self.assertEqual(d.phase,"boarding")


if __name__=="__main__":
    unittest.main()
