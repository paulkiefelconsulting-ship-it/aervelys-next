using System;
namespace Aervelys.SimBridge
{
    // Only a heuristic simulator label, NEVER a real-world airworthiness or dispatch approval.
    internal sealed class PhaseClassifier
    {
        private bool? _ground;
        private bool? _candidate;
        private int _consecutive;
        private bool _everAirborne;
        private DateTime _landingSince = DateTime.MinValue;
        private DateTime _takeoffSince = DateTime.MinValue;
        public string Update(bool onGround, double groundSpeed, double verticalSpeed, double agl)
        {
            if (!_candidate.HasValue || _candidate.Value != onGround)
            { _candidate = onGround; _consecutive = 1; }
            else _consecutive++;
            if (_consecutive >= 2 && (!_ground.HasValue || _ground.Value != onGround))
            {
                if (_ground.HasValue && _ground.Value && !onGround)
                { _everAirborne = true; _takeoffSince = DateTime.UtcNow; }
                if (_ground.HasValue && !_ground.Value && onGround)
                { _landingSince = DateTime.UtcNow; }
                _ground = onGround;
            }
            if (!_ground.HasValue) return "UNKNOWN";
            if (_ground.Value)
            {
                if (_everAirborne)
                {
                    if ((DateTime.UtcNow - _landingSince).TotalSeconds < 12) return "LANDING";
                    return groundSpeed > 3 ? "TAXI_IN" : "PARKED";
                }
                return groundSpeed > 3 ? "TAXI_OUT" : "PARKED";
            }
            if ((DateTime.UtcNow - _takeoffSince).TotalSeconds < 12) return "TAKEOFF";
            if (agl < 3500 && verticalSpeed < -300) return "APPROACH";
            if (verticalSpeed > 300) return "CLIMB";
            if (verticalSpeed < -300) return "DESCENT";
            return "CRUISE";
        }
    }
}
