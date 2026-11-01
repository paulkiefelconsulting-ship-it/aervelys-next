using System;
using System.IO;
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

    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Console.Title = "AERVELYS SIM BRIDGE | MSFS 2024";
            Console.WriteLine("AERVELYS NEXT // SIM BRIDGE v0.1 (Read-only)");
            Console.WriteLine("Dies ist Simulator-Telemetrie, keine Flugfreigabe.\n");
            var settings = BridgeSettings.Load();
            if (settings == null)
            {
                Console.Write("NEXT-Webadresse (https://...): ");
                var url = Console.ReadLine();
                Console.Write("Einmaliger Kopplungscode aus NEXT: ");
                var code = Console.ReadLine();
                try
                {
                    var uri = new Uri((url ?? "").Trim(), UriKind.Absolute);
                    if (uri.Scheme != Uri.UriSchemeHttps || !string.IsNullOrEmpty(uri.UserInfo))
                        throw new InvalidOperationException("Ungültige HTTPS-Adresse");
                    var origin = uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
                    var token = BridgeApi.Claim(origin, code ?? "").GetAwaiter().GetResult();
                    settings = BridgeSettings.Create(origin, token);
                    Console.WriteLine("PC gekoppelt. Geräteschlüssel unter Windows-Benutzer verschlüsselt gespeichert.");
                }
                catch (Exception e) { Console.WriteLine("Kopplung fehlgeschlagen: " + e.Message); return; }
            }
            Console.WriteLine("MSFS starten, automatische Verbindung läuft. Mit STRG+C beenden.");
            Application.EnableVisualStyles();
            Application.Run(new SimBridgeWindow(settings));
        }
    }
}
