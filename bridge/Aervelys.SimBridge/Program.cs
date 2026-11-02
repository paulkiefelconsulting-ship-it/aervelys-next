using System;
using System.IO;
using System.Reflection;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Aervelys.SimBridge
{
    internal sealed class BridgeSettings
    {
        public string NextUrl { get; private set; }
        public string DeviceToken { get; private set; }
        private static string Folder { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AERVELYS", "SimBridge"); } }
        private static string FileName { get { return Path.Combine(Folder, "bridge.txt"); } }
        private BridgeSettings(string url, string token) { NextUrl = url; DeviceToken = token; }
        public static BridgeSettings Load()
        {
            if (!File.Exists(FileName)) return null;
            try
            {
                var lines = File.ReadAllLines(FileName);
                if (lines.Length != 2) return null;
                var raw = ProtectedData.Unprotect(Convert.FromBase64String(lines[1]), null, DataProtectionScope.CurrentUser);
                var settings = new BridgeSettings(lines[0], Encoding.UTF8.GetString(raw));
                Array.Clear(raw, 0, raw.Length);
                return settings;
            }
            catch (Exception e) { Console.WriteLine("Gespeicherte Kopplung nicht verfügbar: " + e.Message); return null; }
        }
        public static BridgeSettings Create(string url, string token)
        {
            var uri = new Uri(url.Trim().TrimEnd('/') + "/", UriKind.Absolute);
            if (uri.Scheme != Uri.UriSchemeHttps || !string.IsNullOrEmpty(uri.UserInfo))
                throw new InvalidOperationException("Für NEXT wird HTTPS benötigt.");
            if (!System.Text.RegularExpressions.Regex.IsMatch(token, "^[a-f0-9]{64}$"))
                throw new InvalidOperationException("Ungültiger Geräteschlüssel.");
            Directory.CreateDirectory(Folder);
            var raw = Encoding.UTF8.GetBytes(token);
            var protectedBytes = ProtectedData.Protect(raw, null, DataProtectionScope.CurrentUser);
            Array.Clear(raw, 0, raw.Length);
            var origin = uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
            File.WriteAllLines(FileName, new[] { origin, Convert.ToBase64String(protectedBytes) });
            return new BridgeSettings(origin, token);
        }
    }

    internal static class BridgeApi
    {
        private static readonly HttpClient Client = new HttpClient { Timeout = TimeSpan.FromSeconds(12) };
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        public static async Task<string> Claim(string url, string code)
        {
            var data = Json.Serialize(new { code = code.Trim().ToLowerInvariant(), device_name = Environment.MachineName });
            using (var request = new HttpRequestMessage(HttpMethod.Post, url.TrimEnd('/') + "/api/msfs/bridge/claim"))
            {
                request.Content = new StringContent(data, Encoding.UTF8, "application/json");
                using (var result = await Client.SendAsync(request).ConfigureAwait(false))
                {
                    if (!result.IsSuccessStatusCode)
                        throw new InvalidOperationException("Kopplung abgelehnt (HTTP " + (int)result.StatusCode + ").");
                    var payload = Json.Deserialize<System.Collections.Generic.Dictionary<string, object>>(
                        await result.Content.ReadAsStringAsync().ConfigureAwait(false));
                    return (string)payload["device_token"];
                }
            }
        }
        public static async Task Send(BridgeSettings settings, object sample)
        {
            using (var request = new HttpRequestMessage(HttpMethod.Post, settings.NextUrl + "/api/msfs/bridge/ingest"))
            {
                request.Headers.TryAddWithoutValidation("Authorization", "Bearer " + settings.DeviceToken);
                request.Content = new StringContent(Json.Serialize(sample), Encoding.UTF8, "application/json");
                using (var result = await Client.SendAsync(request).ConfigureAwait(false))
                {
                    if (result.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                        throw new UnauthorizedAccessException("Gerät wurde entkoppelt. Neue Kopplung erforderlich.");
                    if (!result.IsSuccessStatusCode)
                        throw new InvalidOperationException("NEXT Telemetrie HTTP " + (int)result.StatusCode);
                }
            }
        }
    }


    internal sealed class BridgePairingDialog : Form
    {
        public string NextUrl { get { return _url.Text.Trim(); } }
        public string PairCode { get { return _code.Text.Trim(); } }
        private readonly TextBox _url = new TextBox();
        private readonly TextBox _code = new TextBox();

        public BridgePairingDialog()
        {
            Text = "AERVELYS NEXT | MSFS 2024 koppeln";
            Width = 540; Height = 280;
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false; MinimizeBox = false;
            BackColor = System.Drawing.Color.FromArgb(13, 35, 60);
            ForeColor = System.Drawing.Color.White;
            Font = new System.Drawing.Font("Segoe UI", 10f);
            var title = new Label { Text = "AERVELYS SIM BRIDGE", Left = 20, Top = 16,
                Width = 490, Height = 30, Font = new System.Drawing.Font("Segoe UI", 14f,
                System.Drawing.FontStyle.Bold) };
            var sub = new Label { Text = "Einmalcode unter NEXT > MSFS-Integration erzeugen.",
                Left = 20, Top = 51, Width = 480, Height = 28 };
            var urlLabel = new Label { Text = "AERVELYS NEXT Adresse", Left = 20,
                Top = 85, Width = 470, Height = 22 };
            _url.Left = 20; _url.Top = 109; _url.Width = 480;
            _url.Text = "https://aervelys-next-paulkiefelconsulting-9108.vercel.app";
            var codeLabel = new Label { Text = "Kopplungscode (32 Zeichen)", Left = 20,
                Top = 145, Width = 470, Height = 22 };
            _code.Left = 20; _code.Top = 169; _code.Width = 480;
            _code.MaxLength = 32; _code.UseSystemPasswordChar = true;
            var ok = new Button { Text = "Sicher koppeln", Left = 360, Top = 203,
                Width = 140, Height = 30, DialogResult = DialogResult.OK };
            var cancel = new Button { Text = "Abbrechen", Left = 245, Top = 203,
                Width = 108, Height = 30, DialogResult = DialogResult.Cancel };
            Controls.AddRange(new Control[] { title, sub, urlLabel, _url,
                codeLabel, _code, ok, cancel });
            AcceptButton = ok; CancelButton = cancel;
        }
    }

    internal static class Program
    {
        [STAThread]
        private static Assembly ResolveLocalSimConnect(object sender, ResolveEventArgs e)
        {
            var name = new AssemblyName(e.Name);
            if (!String.Equals(name.Name, "Microsoft.FlightSimulator.SimConnect",
                               StringComparison.OrdinalIgnoreCase))
                return null;
            var installedDll = Environment.GetEnvironmentVariable("AERVELYS_SIMCONNECT_MANAGED");
            if (String.IsNullOrWhiteSpace(installedDll) ||
                !Path.IsPathRooted(installedDll) ||
                !String.Equals(Path.GetFileName(installedDll),
                   "Microsoft.FlightSimulator.SimConnect.dll",
                   StringComparison.OrdinalIgnoreCase) ||
                !File.Exists(installedDll))
                return null;
            return Assembly.LoadFrom(installedDll);
        }

        [System.Runtime.CompilerServices.MethodImpl(
          System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
        private static void RunNativeBridge(BridgeSettings settings)
        {
            Application.Run(new SimBridgeWindow(settings));
        }

        private static void Main(string[] args)
        {
            // Only the user-installed official Microsoft SDK assembly is resolved.
            // It is never copied or redistributed with AERVELYS NEXT.
            AppDomain.CurrentDomain.AssemblyResolve += ResolveLocalSimConnect;
            Application.EnableVisualStyles();
            // Offline-first mode has no account, no internet and no pairing code.
            if (args != null && args.Length == 1 && args[0] == "--offline")
            {
                RunNativeBridge(null);
                return;
            }
            var settings = BridgeSettings.Load();
            if (settings == null)
            {
                using (var prompt = new BridgePairingDialog())
                {
                    if (prompt.ShowDialog() != DialogResult.OK) return;
                    try
                    {
                        var uri = new Uri(prompt.NextUrl, UriKind.Absolute);
                        if (uri.Scheme != Uri.UriSchemeHttps ||
                            !String.Equals(uri.Host,
                                "aervelys-next-paulkiefelconsulting-9108.vercel.app",
                                StringComparison.OrdinalIgnoreCase) ||
                            !uri.IsDefaultPort || !String.IsNullOrEmpty(uri.UserInfo))
                            throw new InvalidOperationException("Nur die eigene AERVELYS NEXT HTTPS-Adresse ist zugelassen.");
                        var origin = uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
                        var token = BridgeApi.Claim(origin, prompt.PairCode).GetAwaiter().GetResult();
                        settings = BridgeSettings.Create(origin, token);
                    }
                    catch (Exception e)
                    {
                        MessageBox.Show("Kopplung fehlgeschlagen: " + e.Message,
                            "AERVELYS SIM BRIDGE", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return;
                    }
                }
            }
            // The bridge is a local companion controlled from NEXT Desktop.
            // Connection and telemetry states are reported in NEXT -> MSFS-Integration.
            RunNativeBridge(settings);
        }
    }
}
