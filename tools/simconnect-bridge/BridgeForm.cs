using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Aervelys.SimConnectBridge
{
    /// <summary>
    /// SDK-free compilation: at runtime load the two *user-installed* Microsoft
    /// SimConnect SDK DLLs next to the EXE. Never redistribute Microsoft binaries.
    /// All SimConnect interaction remains on the Windows UI thread.
    /// </summary>
    public sealed class BridgeForm : Form
    {
        private const int SimMessage = 0x0402;
        private const string ManagedName = "Microsoft.FlightSimulator.SimConnect.dll";
        private const string NativeName = "SimConnect.dll";
        private enum Definitions { Snapshot = 1 }
        private enum Requests { Snapshot = 1 }
        private readonly Timer _watchdog = new Timer { Interval = 3000 };
        private readonly FlightPhaseDetector _detector = new FlightPhaseDetector();
        private readonly JavaScriptSerializer _json = new JavaScriptSerializer();
        private readonly string _outputFolder;
        private readonly string _outputFile;
        private readonly Label _status = MakeLabel(14, FontStyle.Bold, Color.White);
        private readonly Label _flight = MakeLabel(25, FontStyle.Bold, Color.FromArgb(158, 232, 223));
        private readonly Label _info = MakeLabel(11, FontStyle.Regular, Color.FromArgb(177, 200, 211));
        private object _client;
        private Type _clientType;
        private MethodInfo _receive;
        private DateTime _lastDataUtc = DateTime.MinValue;

        private static Label MakeLabel(int points, FontStyle style, Color color)
        {
            return new Label {
                AutoSize = false, Dock = DockStyle.Top, Height = points > 20 ? 60 : 43,
                Font = new Font("Segoe UI", points, style), ForeColor = color
            };
        }

        public BridgeForm()
        {
            Text = "AERVELYS · MSFS 2024 Flight Bridge";
            Width = 640; Height = 385; MinimumSize = new Size(520, 330);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(11, 24, 37); ForeColor = Color.White;
            // Chrome/Edge prevent File System Access from reading protected
            // AppData directories. Use a dedicated, non-system folder in
            // the user's local profile (not Documents/OneDrive by default).
            _outputFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "AERVELYS", "FlightBridge");
            Directory.CreateDirectory(_outputFolder);
            _outputFile = Path.Combine(_outputFolder, "telemetry.json");

            var layout = new Panel { Dock = DockStyle.Fill, Padding = new Padding(24) };
            Controls.Add(layout);
            var header = MakeLabel(10, FontStyle.Bold, Color.FromArgb(123, 211, 214));
            header.Text = "AERVELYS NEXT   /   FLIGHT TELEMETRY BRIDGE";
            _info.Height = 90;
            _info.Text = "Keine Verbindung. Starte MSFS 2024 und die Bridge verbindet sich automatisch.";
            layout.Controls.Add(_info);
            _flight.Text = "—  /  —";
            layout.Controls.Add(_flight);
            _status.Text = "SimConnect wird gesucht …";
            layout.Controls.Add(_status);
            layout.Controls.Add(header);

            var buttons = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 94, FlowDirection = FlowDirection.LeftToRight, AutoScroll = true };
            layout.Controls.Add(buttons);
            var open = new Button { Text = "Live-Datenordner öffnen", Width = 230, Height = 38 };
            open.Click += (s, e) => Process.Start("explorer.exe", _outputFolder);
            buttons.Controls.Add(open);
            var retry = new Button { Text = "Erneut verbinden", Width = 155, Height = 38 };
            retry.Click += (s, e) => { Disconnect(); Connect(); };
            buttons.Controls.Add(retry);
            var repair = new Button { Text = "MSFS-SDK auswählen …", Width = 195, Height = 38 };
            repair.Click += (sender, args) => {
                using (var dialog = new FolderBrowserDialog {
                    Description = "Bitte den MSFS 2024 SDK-Hauptordner auswählen (z. B. C:\\MSFS 2024 SDK).",
                    ShowNewFolderButton = false
                }) {
                    if (dialog.ShowDialog(this) != DialogResult.OK) return;
                    try {
                        CopyLocalSdkLibraries(dialog.SelectedPath);
                        _status.Text = "SDK-Dateien erfolgreich eingerichtet";
                        _info.Text = "Beide Microsoft-SimConnect-DLLs wurden nur lokal in den Bridge-Ordner kopiert. Verbinde jetzt mit dem Simulator.";
                        Disconnect();
                        Connect();
                    } catch (Exception ex) {
                        _status.Text = "SDK-Ordner nicht vollständig";
                        _info.Text = ex.GetBaseException().Message;
                    }
                }
            };
            buttons.Controls.Add(repair);

            _watchdog.Tick += (s, e) => {
                if (_client == null) Connect();
                else if (_lastDataUtc != DateTime.MinValue &&
                        (DateTime.UtcNow - _lastDataUtc).TotalSeconds > 12)
                {
                    _status.Text = "Verbindung unterbrochen · neuer Versuch";
                    Disconnect();
                }
            };
            Shown += (s, e) => { _watchdog.Start(); Connect(); };
            FormClosed += (s, e) => { _watchdog.Stop(); Disconnect(); };
        }

        private static string BridgeFolder => AppDomain.CurrentDomain.BaseDirectory;

        private static string[] CandidateSdkRoots()
        {
            return new[] {
                Environment.GetEnvironmentVariable("MSFS2024_SDK"),
                Environment.GetEnvironmentVariable("MSFS_SDK"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System).Substring(0, 3), "MSFS 2024 SDK"),
                @"C:\MSFS 2024 SDK",
                @"C:\MSFS SDK"
            }.Where(r => !String.IsNullOrWhiteSpace(r)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        }

        private static void CopyLocalSdkLibraries(string sdkRoot)
        {
            // Accept SDK root or any of its SimConnect SDK/lib/managed parent directories.
            var root = sdkRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            var guesses = new[] {
                Path.Combine(root, "SimConnect SDK", "lib"),
                Path.Combine(root, "lib"),
                root,
                Directory.GetParent(root)?.FullName ?? root
            }.Distinct(StringComparer.OrdinalIgnoreCase);
            string lib = guesses.FirstOrDefault(p =>
                File.Exists(Path.Combine(p, NativeName)) &&
                File.Exists(Path.Combine(p, "managed", ManagedName)));
            if (lib == null)
                throw new FileNotFoundException(
                    "Im ausgewählten SDK-Ordner fehlen SimConnect SDK\\lib\\SimConnect.dll "
                    + "oder SimConnect SDK\\lib\\managed\\" + ManagedName
                    + ". Installiere den vollständigen offiziellen MSFS 2024 SDK und wähle dessen Hauptordner.");

            string managed = Path.Combine(lib, "managed", ManagedName);
            string native = Path.Combine(lib, NativeName);
            string destManaged = Path.Combine(BridgeFolder, ManagedName);
            string destNative = Path.Combine(BridgeFolder, NativeName);
            if (!String.Equals(Path.GetFullPath(managed), Path.GetFullPath(destManaged), StringComparison.OrdinalIgnoreCase))
                File.Copy(managed, destManaged, true);
            if (!String.Equals(Path.GetFullPath(native), Path.GetFullPath(destNative), StringComparison.OrdinalIgnoreCase))
                File.Copy(native, destNative, true);
        }

        private string FindManagedDll()
        {
            string managed = Path.Combine(BridgeFolder, ManagedName);
            string native = Path.Combine(BridgeFolder, NativeName);
            if (File.Exists(managed) && File.Exists(native)) return managed;
            foreach (var root in CandidateSdkRoots())
            {
                try {
                    if (!Directory.Exists(root)) continue;
                    CopyLocalSdkLibraries(root);
                    return managed;
                } catch (FileNotFoundException) { /* Try another SDK root. */ }
            }
            string missing = !File.Exists(managed) && !File.Exists(native)
                ? "Beide SimConnect-DLLs fehlen"
                : !File.Exists(managed) ? "Microsoft.FlightSimulator.SimConnect.dll fehlt"
                : "Die native SimConnect.dll fehlt";
            throw new FileNotFoundException(
                missing + " im Bridge-Programmordner. "
                + "Klicke auf 'MSFS-SDK auswählen ...' und wähle den installierten MSFS-2024-SDK-Hauptordner. "
                + "Es werden keine Dateien aus dem Internet geladen.");
        }

        private static object EnumValue(Assembly assembly, string name, string value)
        {
            var t = assembly.GetType("Microsoft.FlightSimulator.SimConnect." + name, true);
            return Enum.Parse(t, value);
        }

        private static object Field(object obj, string name)
        {
            return obj.GetType().GetField(name).GetValue(obj);
        }

        private object Invoke(string name, params object[] args)
        {
            var methods = _clientType.GetMethods().Where(m => m.Name == name && m.GetParameters().Length == args.Length);
            foreach (var method in methods)
            {
                try
                {
                    var pars = method.GetParameters();
                    var actual = new object[args.Length];
                    for (int i = 0; i < args.Length; i++)
                    {
                        Type expected = pars[i].ParameterType;
                        if (args[i] == null) actual[i] = null;
                        else if (expected.IsInstanceOfType(args[i])) actual[i] = args[i];
                        else if (expected.IsEnum) actual[i] = Enum.ToObject(expected, Convert.ToInt64(args[i]));
                        else actual[i] = Convert.ChangeType(args[i], expected);
                    }
                    return method.Invoke(_client, actual);
                }
                catch (ArgumentException) { /* Try matching overload */ }
                catch (InvalidCastException) { /* Try matching overload */ }
            }
            throw new MissingMethodException(name + ": keine passende SDK-Methode");
        }

        private void AttachEvent(string name, string methodName)
        {
            var evt = _clientType.GetEvent(name);
            if (evt == null) throw new MissingMemberException("SimConnect event missing: " + name);
            var delegateType = evt.EventHandlerType;
            var invoke = delegateType.GetMethod("Invoke");
            var parameters = invoke.GetParameters().Select(p => Expression.Parameter(p.ParameterType, p.Name)).ToArray();
            var callback = GetType().GetMethod(methodName, BindingFlags.Instance | BindingFlags.NonPublic);
            var body = Expression.Call(Expression.Constant(this), callback,
                Expression.Convert(parameters[parameters.Length - 1], typeof(object)));
            var handler = Expression.Lambda(delegateType, body, parameters).Compile();
            evt.AddEventHandler(_client, handler);
        }

        private void Connect()
        {
            if (_client != null) return;
            try
            {
                var managed = FindManagedDll();
                // Both DLLs are now guaranteed to be next to the running EXE,
                // which is also the Windows native-DLL search directory.
                var assembly = Assembly.LoadFrom(managed);
                _clientType = assembly.GetType("Microsoft.FlightSimulator.SimConnect.SimConnect", true);
                var constructor = _clientType.GetConstructors().First(c => c.GetParameters().Length == 5);
                var args = new object[] { "AERVELYS NEXT Flight Bridge", Handle, (uint)SimMessage, null, (uint)0 };
                var parameters = constructor.GetParameters();
                for (int i = 0; i < args.Length; i++)
                    if (args[i] != null && !parameters[i].ParameterType.IsInstanceOfType(args[i]))
                        args[i] = Convert.ChangeType(args[i], parameters[i].ParameterType);
                _client = constructor.Invoke(args);
                _receive = _clientType.GetMethod("ReceiveMessage", Type.EmptyTypes);
                AttachEvent("OnRecvSimobjectData", nameof(ReceiveData));
                AttachEvent("OnRecvQuit", nameof(ReceiveQuit));
                var def = EnumValue(assembly, "SIMCONNECT_DATATYPE", "FLOAT64");
                var definition = Definitions.Snapshot;
                string[] vars = {
                    "PLANE LATITUDE", "PLANE LONGITUDE", "PLANE ALTITUDE",
                    "PLANE ALT ABOVE GROUND", "VERTICAL SPEED", "GROUND VELOCITY",
                    "AIRSPEED INDICATED", "SIM ON GROUND", "BRAKE PARKING POSITION",
                    "GENERAL ENG COMBUSTION:1", "GENERAL ENG COMBUSTION:2"
                };
                string[] units = { "degrees", "degrees", "feet", "feet",
                    "feet per minute", "knots", "knots", "Bool", "Bool", "Bool", "Bool" };
                for (int i = 0; i < vars.Length; i++)
                    Invoke("AddToDataDefinition", definition, vars[i], units[i], def, 0f, UInt32.MaxValue);
                var register = _clientType.GetMethods().First(m => m.Name == "RegisterDataDefineStruct" && m.IsGenericMethodDefinition);
                register.MakeGenericMethod(typeof(SimSnapshot)).Invoke(_client, new object[] { definition });
                var request = Requests.Snapshot;
                var everySecond = EnumValue(assembly, "SIMCONNECT_PERIOD", "SECOND");
                var flags = EnumValue(assembly, "SIMCONNECT_DATA_REQUEST_FLAG", "DEFAULT");
                Invoke("RequestDataOnSimObject", request, definition, (uint)0, everySecond, flags,
                    (uint)0, (uint)0, (uint)0);
                _lastDataUtc = DateTime.UtcNow;
                _status.Text = "Verbunden · warte auf Flugzeugdaten";
                _info.Text = "MSFS verbunden. Im Browser den Ordner AERVELYS\\FlightBridge unter deinem Benutzerprofil freigeben (nicht AppData).";
            }
            catch (Exception ex)
            {
                var baseError = ex.GetBaseException();
                string message = baseError.Message;
                if (baseError is BadImageFormatException)
                    message = "32-/64-Bit-Konflikt: Bitte die x64-SimConnect.dll aus dem aktuellen MSFS-2024-SDK verwenden.";
                else if (baseError is FileNotFoundException &&
                         File.Exists(Path.Combine(BridgeFolder, ManagedName)) &&
                         File.Exists(Path.Combine(BridgeFolder, NativeName)))
                    message = "Die SimConnect-Dateien sind vorhanden, aber eine Laufzeit-Abhängigkeit konnte nicht geladen werden. "
                        + "Prüfe, ob beide DLLs aus demselben MSFS-2024-SDK und in x64 vorliegen. Details: " + message;
                _status.Text = "SimConnect-Verbindung nicht verfügbar";
                _info.Text = message + "\r\nSDK auswählen oder nach der Korrektur erneut verbinden.";
                Disconnect();
            }
        }

        private void ReceiveQuit(object data) { Disconnect(); }

        private void ReceiveData(object data)
        {
            if (Convert.ToUInt32(Field(data, "dwRequestID")) != 1u) return;
            var values = Field(data, "dwData") as Array;
            if (values == null || values.Length < 1 || !(values.GetValue(0) is SimSnapshot)) return;
            var snapshot = (SimSnapshot)values.GetValue(0);
            var now = DateTime.UtcNow;
            _lastDataUtc = now;
            var phase = _detector.Update(snapshot, now);
            var state = new {
                schemaVersion = 1,
                source = "msfs2024-simconnect-local",
                timestampUtc = now.ToString("o"),
                phase = phase.ToString(),
                telemetry = new {
                    latitude = snapshot.Latitude, longitude = snapshot.Longitude,
                    altitudeFt = snapshot.AltitudeFt, aglFt = snapshot.AboveGroundFt,
                    verticalSpeedFpm = snapshot.VerticalSpeedFpm,
                    groundSpeedKt = snapshot.GroundSpeedKnots,
                    indicatedSpeedKt = snapshot.IndicatedSpeedKnots,
                    onGround = snapshot.OnGround > .5,
                    parkingBrake = snapshot.ParkingBrake > .5
                }
            };
            try
            {
                var temp = _outputFile + ".tmp";
                File.WriteAllText(temp, _json.Serialize(state));
                if (File.Exists(_outputFile)) File.Replace(temp, _outputFile, null);
                else File.Move(temp, _outputFile);
            }
            catch (Exception e) { _info.Text = "Dateifehler: " + e.Message; }
            _status.Text = "MSFS verbunden · LIVE-DATEN LOKAL";
            _flight.Text = phase + "  ·  " + Math.Round(snapshot.AltitudeFt) + " ft";
            _info.Text = "Groundspeed: " + Math.Round(snapshot.GroundSpeedKnots) +
                         " kt   |   Vertical speed: " + Math.Round(snapshot.VerticalSpeedFpm) +
                         " ft/min\r\nSnapshot: " + _outputFile;
        }

        private void Disconnect()
        {
            try { (_client as IDisposable)?.Dispose(); } catch { /* simulator may be gone */ }
            _client = null; _clientType = null; _receive = null;
            _lastDataUtc = DateTime.MinValue; _detector.Reset();
        }

        protected override void WndProc(ref Message message)
        {
            if (message.Msg == SimMessage)
            {
                try { if (_client != null) _receive.Invoke(_client, null); }
                catch (Exception ex)
                {
                    _status.Text = "SimConnect-Übertragung unterbrochen";
                    _info.Text = ex.GetBaseException().Message;
                    Disconnect();
                }
                return;
            }
            base.WndProc(ref message);
        }
    }
}
