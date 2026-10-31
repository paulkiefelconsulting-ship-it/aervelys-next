using System;
using System.Runtime.InteropServices;

namespace Aervelys.SimConnectBridge
{
    public enum FlightPhase
    {
        Unknown, Parked, TaxiOut, TakeoffRoll, Climb, Cruise, Descent,
        Approach, Landing, TaxiIn
    }

    // Order and scalar units match AddToDataDefinition calls in BridgeForm.
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct SimSnapshot
    {
        public double Latitude;
        public double Longitude;
        public double AltitudeFt;
        public double AboveGroundFt;
        public double VerticalSpeedFpm;
        public double GroundSpeedKnots;
        public double IndicatedSpeedKnots;
        public double OnGround;
        public double ParkingBrake;
        public double Engine1Running;
        public double Engine2Running;
    }

    public sealed class FlightPhaseDetector
    {
        public FlightPhase Current { get; private set; } = FlightPhase.Unknown;
        private FlightPhase _candidate = FlightPhase.Unknown;
        private DateTime _candidateSince = DateTime.MinValue;
        private DateTime _lastSeen = DateTime.MinValue;
        private bool _airborne;
        private bool _wasEverAirborne;
        private bool _landed;
        private double _previousAltitudeFt;
        private int _stableAirborne;
        private int _stableGrounded;

        public FlightPhase Update(SimSnapshot data, DateTime utcNow)
        {
            if (double.IsNaN(data.GroundSpeedKnots) || double.IsNaN(data.AltitudeFt) ||
                double.IsNaN(data.AboveGroundFt) || double.IsNaN(data.VerticalSpeedFpm) ||
                double.IsInfinity(data.GroundSpeedKnots) || double.IsInfinity(data.AltitudeFt))
                return Current;

            // A large telemetry gap means no reliable continuous phase history.
            if (_lastSeen != DateTime.MinValue && (utcNow - _lastSeen).TotalSeconds > 25)
                Reset();
            if (_lastSeen != DateTime.MinValue && utcNow < _lastSeen) return Current;
            _lastSeen = utcNow;

            bool rawGround = data.OnGround > .5;
            if (rawGround) { _stableGrounded++; _stableAirborne = 0; }
            else { _stableAirborne++; _stableGrounded = 0; }
            if (_stableAirborne >= 3) { _airborne = true; _wasEverAirborne = true; }
            if (_stableGrounded >= 3) _airborne = false;

            // Brief wheel contact or radio-altimeter spikes must not jump phases.
            var speed = Math.Max(0, data.GroundSpeedKnots);
            var agl = Math.Max(0, data.AboveGroundFt);
            var vs = data.VerticalSpeedFpm;
            var parking = data.ParkingBrake > .5;
            var engines = data.Engine1Running > .5 || data.Engine2Running > .5;

            FlightPhase desired;
            if (!_airborne)
            {
                if (_wasEverAirborne && _stableGrounded >= 3 && !_landed)
                {
                    desired = FlightPhase.Landing;
                    _landed = true;
                }
                else if (_wasEverAirborne)
                {
                    desired = speed > 4 ? FlightPhase.TaxiIn : parking || !engines ?
                        FlightPhase.Parked : FlightPhase.TaxiIn;
                }
                else if (parking && speed < 3 || !engines && speed < 3)
                    desired = FlightPhase.Parked;
                else if (speed >= 55 && engines)
                    desired = FlightPhase.TakeoffRoll;
                else
                    desired = FlightPhase.TaxiOut;
            }
            else
            {
                if (agl < 2300 && vs < -220 && _wasEverAirborne &&
                    Current != FlightPhase.TakeoffRoll && Current != FlightPhase.TaxiOut)
                    desired = FlightPhase.Approach;
                else if (vs > 270 || Current == FlightPhase.TakeoffRoll ||
                         (Current == FlightPhase.Climb && vs > -140 && agl < 3500))
                    desired = FlightPhase.Climb;
                else if (vs < -300)
                    desired = agl < 3000 ? FlightPhase.Approach : FlightPhase.Descent;
                else
                    desired = agl >= 2300 ? FlightPhase.Cruise : FlightPhase.Climb;
            }

            // Landing stays visible long enough, then changes to taxi-in.
            if (Current == FlightPhase.Landing && (utcNow - _candidateSince).TotalSeconds < 8
                && !_airborne) return Current;

            if (Current == FlightPhase.TaxiIn && desired == FlightPhase.Parked &&
                speed < 2 && parking) desired = FlightPhase.Parked;

            if (desired != _candidate)
            {
                _candidate = desired;
                _candidateSince = utcNow;
            }
            // Initial estimate is immediately useful, regular changes are debounced.
            var stabilitySeconds = desired == FlightPhase.TakeoffRoll ? 2 :
                                   desired == FlightPhase.Landing ? 0 :
                                   desired == FlightPhase.Parked ? 8 :
                                   desired == FlightPhase.Cruise ? 15 : 5;
            if (Current == FlightPhase.Unknown ||
                (desired != Current && (utcNow - _candidateSince).TotalSeconds >= stabilitySeconds))
                Current = desired;
            _previousAltitudeFt = data.AltitudeFt;
            return Current;
        }

        public void Reset()
        {
            Current = FlightPhase.Unknown;
            _candidate = FlightPhase.Unknown;
            _candidateSince = DateTime.MinValue;
            _lastSeen = DateTime.MinValue;
            _stableAirborne = 0;
            _stableGrounded = 0;
            _airborne = false;
            _wasEverAirborne = false;
            _landed = false;
            _previousAltitudeFt = 0;
        }
    }
}
