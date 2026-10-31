using System;

namespace Aervelys.SimConnectBridge
{
    internal static class FlightPhaseScenarios
    {
        private static DateTime _now = new DateTime(2026, 10, 31, 15, 0, 0, DateTimeKind.Utc);
        private static readonly FlightPhaseDetector Detector = new FlightPhaseDetector();
        private static FlightPhase Step(int seconds, bool onGround, double speed, double agl,
            double verticalSpeed, bool parking, bool running)
        {
            FlightPhase last = FlightPhase.Unknown;
            for (int i = 0; i < seconds; i++)
            {
                var sample = new SimSnapshot
                {
                    Latitude = 52.203, Longitude = 13.16,
                    AltitudeFt = 260 + agl, AboveGroundFt = agl,
                    VerticalSpeedFpm = verticalSpeed, GroundSpeedKnots = speed,
                    IndicatedSpeedKnots = speed, OnGround = onGround ? 1 : 0,
                    ParkingBrake = parking ? 1 : 0,
                    Engine1Running = running ? 1 : 0
                };
                last = Detector.Update(sample, _now);
                _now = _now.AddSeconds(1);
            }
            return last;
        }
        private static void Expect(string name, FlightPhase expected, FlightPhase actual)
        {
            if (actual != expected)
                throw new Exception(name + ": expected " + expected + " but got " + actual);
            Console.WriteLine("PASS " + name + " -> " + actual);
        }
        public static int Run()
        {
            try
            {
                Expect("parking", FlightPhase.Parked, Step(12, true, 0, 0, 0, true, false));
                Expect("taxi out", FlightPhase.TaxiOut, Step(12, true, 15, 0, 0, false, true));
                Expect("takeoff roll", FlightPhase.TakeoffRoll, Step(8, true, 95, 0, 0, false, true));
                Expect("climb", FlightPhase.Climb, Step(14, false, 235, 2900, 1600, false, true));
                Expect("cruise", FlightPhase.Cruise, Step(22, false, 415, 26000, 40, false, true));
                Expect("descent", FlightPhase.Descent, Step(13, false, 390, 15000, -1700, false, true));
                Expect("approach", FlightPhase.Approach, Step(13, false, 180, 1400, -650, false, true));
                Expect("landing", FlightPhase.Landing, Step(3, true, 95, 0, -80, false, true));
                Expect("taxi in", FlightPhase.TaxiIn, Step(16, true, 12, 0, 0, false, true));
                Expect("at stand", FlightPhase.Parked, Step(13, true, 0, 0, 0, true, false));
                Console.WriteLine("All AERVELYS phase scenarios passed.");
                return 0;
            }
            catch (Exception e) { Console.Error.WriteLine(e.Message); return 1; }
        }
    }
}
