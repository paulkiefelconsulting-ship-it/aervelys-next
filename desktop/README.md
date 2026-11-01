# AERVELYS NEXT Desktop 0.2 — integrated local SIM Bridge launcher (Windows alpha)

AERVELYS NEXT is our own virtual business-aviation application. SkyBridge was a functional reference only; no SkyBridge source, binaries or assets are used.

## What the Windows installer now contains

- Real Windows x64 Electron installer, Start Menu/Desktop links and persistent NEXT CEO login
- Secure dedicated desktop window displaying existing NEXT cloud modules
- **Simulator > MSFS 2024 Bridge starten / einrichten** to launch the native AERVELYS C# companion
- Pairing dialog in Windows for NEXT HTTPS URL and single-use code (no terminal needed)
- Windows-only build of our own companion source from Microsoft SimConnect assemblies already installed on your own computer
- Native **Bridge beenden** option; the companion is also stopped when Desktop exits
- Existing MSFS Integration panel for device status, ACARS and checkride evidence

**This is not an offline SkyBridge replacement yet.** AERVELYS NEXT's business logic still runs via Vercel/Supabase and requires internet. Our bridge's true connection to a live MSFS 2024 aircraft has not been verified on your PC. Neither type ratings nor real flight logbook entries are automatically issued yet.

## Install, set up & pair

1. Download and unzip a Windows setup artifact from **GitHub > Actions > AERVELYS NEXT Windows Desktop**.
2. Run AERVELYS-NEXT-Setup-0.2.0-x64.exe (unsigned alpha, check GitHub build SHA-256).
3. Install the **official Microsoft Flight Simulator 2024 SDK** (including SimConnect managed library/runtime) and ensure Windows has the .NET Framework 4.8 C# compiler / Developer Pack. This SDK is a Microsoft prerequisite, not a part of the AERVELYS installer.
4. Start AERVELYS NEXT Desktop and sign in with the existing NEXT CEO account.
5. Go to **MSFS-Integration** in the left navigation; click **Kopplungscode erzeugen** in the device panel.
6. Click **Simulator > MSFS 2024 Bridge starten / einrichten** in the native application menu.
7. If the SDK is not automatically detected, select the SDK root folder (usually C:\MSFS 2024 SDK). It must contain SimConnect SDK\lib\managed\Microsoft.FlightSimulator.SimConnect.dll.
8. On first use, enter the code in the native pairing dialog and click **Sicher koppeln**. No password or service-role key is requested.
9. Start MSFS 2024 and load an aircraft. In NEXT/MSFS-Integration the status must transition from offline to online after actual telemetry is accepted. The bridge automatically reconnects locally when MSFS starts.
10. Stop through **Simulator > Bridge beenden**, or close AERVELYS NEXT Desktop.

Token storage is protected with **Windows DPAPI** in %APPDATA%\AERVELYS\SimBridge\bridge.txt. The paired device can be revoked from NEXT. To pair again, remove only this local file, then generate a fresh one-use code.

## Native builder implementation

The Electron app bundles the three AERVELYS-owned C# source files, not a compiled Microsoft SDK or modified third-party binary. At first launch the app locates the installed Microsoft SimConnect managed reference DLL and the system csc.exe compiler. It builds the AERVELYS companion into the user's local Desktop app data directory (AERVELYS NEXT/Bridge) and caches a source/SDK fingerprint to avoid unnecessary rebuilds. No unrestricted desktop IPC, Node.js, filesystem or shell access is exposed to the remote NEXT web content; launching requires a direct click in the native app menu.

The published Windows installer **does not redistribute** SimConnect.dll, Microsoft.FlightSimulator.SimConnect.dll, SDK MSI installers, or any third-party Python-SimConnect package. Use the official SDK on your own development/testing PC. Microsoft redistribution rights for SDK runtime DLLs are not presumed.

## Known gaps / test checklist

- [ ] Install alpha on the intended Windows PC and verify that the local SDK is found
- [ ] Compile companion using the real installed SDK and .NET Framework compiler
- [ ] Complete first-run device pairing and verify the NEXT device comes online
- [ ] Test cold start at EDAZ, takeoff, approach, landing, shutdown, and device reconnect
- [ ] Test flight type detection and engine SimVars on an actual Phenom add-on
- [ ] Improve noise, pause/slew, crash/teleport detection and training integrity
- [ ] Link ACARS evidence to an explicit flight/checkride before allowing simulated certificate or financial posting
- [ ] Resolve Microsoft redistributable-license requirements before creating a standalone SDK-free installer
- [ ] Sign the Windows application for normal end-user distribution

A deployed NEXT page is not proof of a simulator connection, nor does simulator evidence constitute an aviation certification or flight release.

## Developer build

Windows 10/11; Node.js 22, Python 3.12.

    cd desktop
    python scripts/make-icon.py
    npm install --no-audit --no-fund
    npm test
    npm run build:win

The unsigned NSIS installer appears in desktop/dist. GitHub Actions runs the same build automatically for changes to the desktop app; tests also assert that official Microsoft SDK DLLs have **not** been bundled.

Official managed API documentation:
https://docs.flightsimulator.com/msfs2024/flighting/programming-apis/simconnect/programming-simconnect-clients-using-managed-code/
