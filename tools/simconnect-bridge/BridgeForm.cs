using System;
using System.IO;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.FlightSimulator.SimConnect;

namespace Aervelys.SimConnectBridge
{
    public sealed class BridgeForm : Form
    {
        private const int SimMessage = 0x0402;
        private enum Definitions { Snapshot = 1 }
        private enum Requests { Snapshot = 1 }
        private SimConnect _client;
        private readonly Timer _reconnect = new Timer { Interval = 3500 };
        private readonly FlightPhaseDetector _detector = new FlightPhaseDetector();
        private readonly string _outputPath;
        private readonly JavaScriptSerializer _json = new JavaScriptSerializer();
        private DateTime _lastDataUtc = DateTime.MinValue;

        public BridgeForm()
        {
            Text = "AERVELYS Flight Bridge";
            ShowInTaskbar = false;
            WindowState = FormWindowState.Minimized;
            _outputPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "AERVELYS", "bridge", "telemetry.json");
            Directory.CreateDirectory(Path.GetDirectoryName(_outputPath));
            _reconnect.Tick += (sender, args) => {
                if (_client == null) Connect();
                else if (_lastDataUtc != DateTime.MinValue &&
                         (DateTime.UtcNow - _lastDataUtc).TotalSeconds > 15)
                {
                    Console.WriteLine("SimConnect telemetry stale: reconnecting.");
                    Disconnect();
                }
            };
            Shown += (sender, args) => {
                Hide();
                Console.WriteLine("AERVELYS MSFS Bridge - local read-only adapter.");
                Console.WriteLine("Telemetry file: " + _outputPath);
                _reconnect.Start();
                Connect();
            };
            FormClosed += (sender, args) => { _reconnect.Stop(); Disconnect(); };
        }

        private void Define(string variable, string unit)
        {
            _client.AddToDataDefinition(Definitions.Snapshot, variable, unit,
                SIMCONNECT_DATATYPE.FLOAT64, 0, SimConnect.SIMCONNECT_UNUSED);
        }

        private void Connect()
        {
            try
            {
                // API calls and ReceiveMessage occur on the single WinForms UI thread.
                _client = new SimConnect("AERVELYS NEXT Flight Bridge",
                    Handle, SimMessage, null, 0);
                _client.OnRecvOpen += (sender, message) => Console.WriteLine("Connected to MSFS.");
                _client.OnRecvQuit += (sender, message) => Disconnect();
                _client.OnRecvSimobjectData += ReceiveData;
                Define("PLANE LATITUDE", "degrees");
                Define("PLANE LONGITUDE", "degrees");
                Define("PLANE ALTITUDE", "feet");
                Define("PLANE ALT ABOVE GROUND", "feet");
                Define("VERTICAL SPEED", "feet per minute");
                Define("GROUND VELOCITY", "knots");
                Define("AIRSPEED INDICATED", "knots");
                Define("SIM ON GROUND", "Bool");
                Define("BRAKE PARKING POSITION", "Bool");
                Define("GENERAL ENG COMBUSTION:1", "Bool");
                Define("GENERAL ENG COMBUSTION:2", "Bool");
                _client.RegisterDataDefineStruct<SimSnapshot>(Definitions.Snapshot);
                _client.RequestDataOnSimObject(Requests.Snapshot, Definitions.Snapshot,
                    SimConnect.SIMCONNECT_OBJECT_ID_USER, SIMCONNECT_PERIOD.SECOND,
                    SIMCONNECT_DATA_REQUEST_FLAG.DEFAULT, 0, 0, 0);
                _lastDataUtc = DateTime.UtcNow;
            }
            catch (Exception e)
            {
                Console.WriteLine("MSFS connection not available: " + e.Message);
                Disconnect();
            }
        }

        private void ReceiveData(SimConnect sender, SIMCONNECT_RECV_SIMOBJECT_DATA data)
        {
            if (data.dwRequestID != (uint)Requests.Snapshot || data.dwData == null ||
                data.dwData.Length < 1 || !(data.dwData[0] is SimSnapshot))
                return;
            var snapshot = (SimSnapshot)data.dwData[0];
            var utc = DateTime.UtcNow;
            _lastDataUtc = utc;
            var phase = _detector.Update(snapshot, utc);
            var state = new
            {
                schemaVersion = 1,
                source = "msfs2024-simconnect-local",
                timestampUtc = utc.ToString("o"),
                phase = phase.ToString(),
                telemetry = new {
                    latitude = snapshot.Latitude,
                    longitude = snapshot.Longitude,
                    altitudeFt = snapshot.AltitudeFt,
                    aglFt = snapshot.AboveGroundFt,
                    verticalSpeedFpm = snapshot.VerticalSpeedFpm,
                    groundSpeedKt = snapshot.GroundSpeedKnots,
                    indicatedSpeedKt = snapshot.IndicatedSpeedKnots,
                    onGround = snapshot.OnGround > .5,
                    parkingBrake = snapshot.ParkingBrake > .5
                }
            };
            // File remains LOCAL. No network endpoint, user data, or credentials.
            var tmp = _outputPath + ".tmp";
            try
            {
                File.WriteAllText(tmp, _json.Serialize(state));
                if (File.Exists(_outputPath))
                {
                    File.Replace(tmp, _outputPath, null);
                }
                else File.Move(tmp, _outputPath);
            }
            catch (Exception e) { Console.WriteLine("Local snapshot write error: " + e.Message); }
            Console.Title = "AERVELYS | " + phase + " | " +
                Math.Round(snapshot.GroundSpeedKnots) + " kt | " +
                Math.Round(snapshot.AltitudeFt) + " ft";
        }

        private void Disconnect()
        {
            try { _client?.Dispose(); } catch { /* Simulator may have closed. */ }
            _client = null;
            _lastDataUtc = DateTime.MinValue;
            _detector.Reset();
            Console.WriteLine("Disconnected. Reconnecting only to local MSFS...");
        }

        protected override void WndProc(ref Message message)
        {
            if (message.Msg == SimMessage)
            {
                try { _client?.ReceiveMessage(); }
                catch (Exception e)
                {
                    Console.WriteLine("Receive failure: " + e.Message);
                    Disconnect();
                }
                return;
            }
            base.WndProc(ref message);
        }
    }
}
