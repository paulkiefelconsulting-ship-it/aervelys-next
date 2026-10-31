using System;
using System.Windows.Forms;

namespace Aervelys.SimConnectBridge
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Length > 0 && args[0] == "--self-test")
                return FlightPhaseScenarios.Run();
            Console.WriteLine("AERVELYS MSFS 2024 Flight Bridge (read-only, localhost only).");
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new BridgeForm());
            return 0;
        }
    }
}
