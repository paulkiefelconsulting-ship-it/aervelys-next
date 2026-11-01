using System;
using System.Drawing;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.FlightSimulator.SimConnect;

namespace Aervelys.SimBridge
{
    // Local SIM recorder: append-only JSONL in the current user's roaming AppData.
    // The desktop UI reads it on the same PC, no HTTP or account required.
    internal static class LocalTelemetryWriter
    {
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        private static string Folder
        {
            get
            {
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "AERVELYS NEXT", "Telemetry");
            }
        }
        public static void Write(object sample)
        {
            Directory.CreateDirectory(Folder);
            string filename = Path.Combine(Folder, DateTime.UtcNow.ToString("yyyy-MM-dd") + ".jsonl");
            string record = Json.Serialize(sample);
            if (record.Length > 4000)
                throw new InvalidOperationException("SIM-Datensatz ist zu groß.");
            // Appends only; never writes flight logs to cloud in --offline mode.
            using (var file = new StreamWriter(filename, true, Encoding.UTF8))
            {
                file.WriteLine(record);
            }
        }
    }

    // SimConnect must be accessed on one Windows message-pump thread.
    internal sealed class SimBridgeWindow : Form
    {
        private enum Definitions { Aircraft = 0 }
        private enum Requests { Aircraft = 0 }
        private const int WM_SIMCONNECT = 0x0402;
        private readonly BridgeSettings _settings;
        private readonly Timer _timer = new Timer();
        private readonly PhaseClassifier _phase = new PhaseClassifier();
        private readonly Guid _session = Guid.NewGuid();
        private SimConnect _sim;
        private AircraftData? _latest;
        private DateTime _lastAttempt = DateTime.MinValue, _lastTransmit = DateTime.MinValue;
        private bool _connected, _sending, _unauthorized;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
        private struct AircraftData
        {
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string Title;
            public double Latitude;
            public double Longitude;
            public double AltitudeFt;
            public double GroundspeedKt;
            public double OnGround;
            public double VerticalSpeedFpm;
            public double AltitudeAglFt;
            public double ParkingBrake;
            public double EngineCount;
            public double Engine1;
            public double Engine2;
            public double Engine3;
            public double Engine4;
        }
        public SimBridgeWindow(BridgeSettings settings)
        {
            _settings = settings;
            Text = "AERVELYS SIM BRIDGE";
            ShowInTaskbar = false;
            Opacity = 0;
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-30000, -30000);
            FormBorderStyle = FormBorderStyle.None;
            _timer.Interval = 1000;
            _timer.Tick += OnTick;
            _timer.Start();
        }
        protected override void DefWndProc(ref Message m)
        {
            if (m.Msg == WM_SIMCONNECT && _sim != null)
            {
                try { _sim.ReceiveMessage(); }
                catch (Exception ex) { Disconnect("SimConnect-Empfang: " + ex.Message); }
                return;
            }
            base.DefWndProc(ref m);
        }
        private void Connect()
        {
            try
            {
                var windowHandle = Handle;
                _sim = new SimConnect("AERVELYS NEXT SIM BRIDGE", windowHandle, WM_SIMCONNECT, null, 0);
                _sim.OnRecvOpen += (s, e) => { _connected = true; Console.WriteLine("MSFS 2024 / SimConnect verbunden"); };
                _sim.OnRecvQuit += (s, e) => Disconnect("MSFS wurde beendet.");
                _sim.OnRecvException += (s, e) => Console.WriteLine("SimConnect Fehler: " + e.dwException);
                _sim.OnRecvSimobjectData += (s, e) =>
                {
                    if (e.dwRequestID == (uint)Requests.Aircraft && e.dwData != null && e.dwData.Length > 0)
                        _latest = (AircraftData)e.dwData[0];
                };
                _sim.AddToDataDefinition(Definitions.Aircraft, "TITLE", null, SIMCONNECT_DATATYPE.STRING256, 0, 0);
                _sim.AddToDataDefinition(Definitions.Aircraft, "PLANE LATITUDE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0, 1);
                _sim.AddToDataDefinition(Definitions.Aircraft, "PLANE LONGITUDE", "degrees", SIMCONNECT_DATATYPE.FLOAT64, 0, 2);
                _sim.AddToDataDefinition(Definitions.Aircraft, "PLANE ALTITUDE", "feet", SIMCONNECT_DATATYPE.FLOAT64, 0, 3);
                _sim.AddToDataDefinition(Definitions.Aircraft, "GROUND VELOCITY", "knots", SIMCONNECT_DATATYPE.FLOAT64, 0, 4);
                _sim.AddToDataDefinition(Definitions.Aircraft, "SIM ON GROUND", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0, 5);
                _sim.AddToDataDefinition(Definitions.Aircraft, "VERTICAL SPEED", "feet per minute", SIMCONNECT_DATATYPE.FLOAT64, 0, 6);
                _sim.AddToDataDefinition(Definitions.Aircraft, "PLANE ALT ABOVE GROUND", "feet", SIMCONNECT_DATATYPE.FLOAT64, 0, 7);
                _sim.AddToDataDefinition(Definitions.Aircraft, "BRAKE PARKING POSITION", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0, 8);
                // Indexed MSFS engine combustion flags plus engine count. Missing/invalid
                // engine data must never be interpreted as a confirmed cold start.
                _sim.AddToDataDefinition(Definitions.Aircraft, "NUMBER OF ENGINES", "number", SIMCONNECT_DATATYPE.FLOAT64, 0, 9);
                _sim.AddToDataDefinition(Definitions.Aircraft, "GENERAL ENG COMBUSTION:1", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0, 10);
                _sim.AddToDataDefinition(Definitions.Aircraft, "GENERAL ENG COMBUSTION:2", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0, 11);
                _sim.AddToDataDefinition(Definitions.Aircraft, "GENERAL ENG COMBUSTION:3", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0, 12);
                _sim.AddToDataDefinition(Definitions.Aircraft, "GENERAL ENG COMBUSTION:4", "bool", SIMCONNECT_DATATYPE.FLOAT64, 0, 13);
                _sim.RegisterDataDefineStruct<AircraftData>(Definitions.Aircraft);
                _sim.RequestDataOnSimObject(Requests.Aircraft, Definitions.Aircraft,
                    SimConnect.SIMCONNECT_OBJECT_ID_USER, SIMCONNECT_PERIOD.SECOND,
                    SIMCONNECT_DATA_REQUEST_FLAG.DEFAULT, 0, 0, 0);
                Console.WriteLine("SimConnect Datenabfrage gestartet.");
            }
            catch (Exception ex) { Disconnect("SimConnect noch nicht verfügbar: " + ex.Message); }
        }
        private void Disconnect(string reason)
        {
            Console.WriteLine(reason);
            _connected = false;
            _latest = null;
            if (_sim != null) { try { _sim.Dispose(); } catch { } _sim = null; }
        }
        private async void OnTick(object sender, EventArgs e)
        {
            if (_sim == null && (DateTime.UtcNow - _lastAttempt).TotalSeconds >= 8)
            {
                _lastAttempt = DateTime.UtcNow;
                Connect();
            }
            if (!_connected || !_latest.HasValue || _sending || _unauthorized ||
                (DateTime.UtcNow - _lastTransmit).TotalSeconds < 5) return;
            var d = _latest.Value;
            if (double.IsNaN(d.Latitude) || double.IsNaN(d.Longitude) ||
                double.IsNaN(d.AltitudeFt) || double.IsNaN(d.GroundspeedKt) ||
                double.IsNaN(d.VerticalSpeedFpm) || double.IsNaN(d.AltitudeAglFt) ||
                double.IsInfinity(d.Latitude) || double.IsInfinity(d.Longitude) ||
                double.IsInfinity(d.AltitudeFt) || double.IsInfinity(d.GroundspeedKt)) return;
            _lastTransmit = DateTime.UtcNow;
            _sending = true;
            var phase = _phase.Update(d.OnGround > .5, d.GroundspeedKt, d.VerticalSpeedFpm, d.AltitudeAglFt);
            var title = (d.Title ?? "").Trim();
            if (title.Length > 120) title = title.Substring(0, 120);
            var count = (int)Math.Round(d.EngineCount);
            bool? engineRunning = null;
            if (count >= 1 && count <= 4 && d.Engine1 >= 0 && d.Engine2 >= 0 && d.Engine3 >= 0 && d.Engine4 >= 0)
            {
                engineRunning = d.Engine1 > .5 ||
                    (count >= 2 && d.Engine2 > .5) ||
                    (count >= 3 && d.Engine3 > .5) ||
                    (count >= 4 && d.Engine4 > .5);
            }
            var sample = new
            {
                observed_at = DateTime.UtcNow.ToString("o"),
                session_id = _session.ToString(),
                aircraft_title = title,
                latitude = d.Latitude,
                longitude = d.Longitude,
                altitude_ft = d.AltitudeFt,
                groundspeed_kt = d.GroundspeedKt,
                on_ground = d.OnGround > .5,
                vertical_speed_fpm = d.VerticalSpeedFpm,
                altitude_agl_ft = d.AltitudeAglFt,
                parking_brake = d.ParkingBrake > .5,
                engine_running = engineRunning,
                number_of_engines = count >= 1 && count <= 4 ? (int?)count : null,
                phase = phase
            };
            try
            {
                if (_settings == null)
                    LocalTelemetryWriter.Write(sample);
                else
                    await BridgeApi.Send(_settings, sample);
                Console.WriteLine("{0:HH:mm:ss}  {1,-11} {2,8:F0} ft {3,5:F0} kt  {4}",
                    DateTime.Now, phase, d.AltitudeFt, d.GroundspeedKt, title);
            }
            catch (UnauthorizedAccessException ex) { _unauthorized = true; Console.WriteLine(ex.Message); }
            catch (Exception ex) { Console.WriteLine("NEXT nicht erreichbar: " + ex.Message); }
            finally { _sending = false; }
        }
        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            _timer.Stop();
            Disconnect("Bridge beendet.");
            base.OnFormClosed(e);
        }
    }
}
