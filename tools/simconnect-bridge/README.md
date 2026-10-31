# AERVELYS NEXT — MSFS 2024 Bridge (Windows MVP)

This is the first read-only desktop SimConnect bridge, not the finished networked integration with AERVELYS NEXT. It observes the user aircraft only and writes an atomic local JSON snapshot once per second. It never sends data to Vercel, Supabase, or a public endpoint.

## Requirements
- Windows 10/11 with Microsoft Flight Simulator 2024 running
- MSFS 2024 SDK with managed Microsoft.FlightSimulator.SimConnect wrapper installed
- Visual Studio 2022 (Desktop development with .NET), targeting pack for .NET Framework 4.8, x64 build
- Configure MSFS_SDK to the root of your installed MSFS SDK. In the .csproj, verify the reference HintPath; the filename/location can differ by SDK install. Never commit the SDK binary into the repo.

## Build
Open AERVELYS.SimConnectBridge.csproj in Visual Studio, select Release | x64, then Build. Alternatively, from a Visual Studio Developer Command Prompt:

    msbuild AERVELYS.SimConnectBridge.csproj /p:Configuration=Release /p:Platform=x64

Run the built executable first with:

    AERVELYS.SimConnectBridge.exe --self-test

This exercises parked → taxi-out → takeoff roll → climb → cruise → descent → approach → landing → taxi-in → parked with controlled telemetry.

With MSFS running, start the executable without arguments. It reconnects if the simulator is not yet available.

## Flight-phase detection
Inputs requested via the official managed SimConnect API:
- SIM ON GROUND
- GROUND VELOCITY
- PLANE ALT ABOVE GROUND
- VERTICAL SPEED
- PLANE ALTITUDE
- BRAKE PARKING POSITION
- GENERAL ENG COMBUSTION:1, :2
- Latitude, longitude, indicated airspeed

The detector uses stable-ground/airborne samples, candidate time windows and phase history rather than single speed thresholds. The transitions are best-effort heuristics, not guaranteed to be perfect for every jet, helicopter, aircraft add-on or go-around. Validating aircraft types in MSFS 2024 and tuning thresholds is required before production. A proper crew/flight pairing and manual override should be added before operational use.

## Local output
Path: %LOCALAPPDATA%\AERVELYS\bridge\telemetry.json

Example snapshot (illustrative values, not a recorded flight):

    {
      "schemaVersion": 1,
      "source": "msfs2024-simconnect-local",
      "timestampUtc": "2026-10-31T18:20:00.0000000Z",
      "phase": "Cruise",
      "telemetry": {
        "latitude": 52.0,
        "longitude": 13.0,
        "altitudeFt": 36000,
        "aglFt": 35500,
        "verticalSpeedFpm": 50,
        "groundSpeedKt": 430,
        "indicatedSpeedKt": 270,
        "onGround": false,
        "parkingBrake": false
      }
    }

Never treat an old file as proof of a current connection: any consumer MUST check timestampUtc, reject stale snapshots (>10 seconds), reject unexpected schema versions and revalidate phase.

## Security and limitations
- The bridge does not expose an HTTP port, unauthenticated WebSocket, secret, or public data endpoint.
- The file is local to the simulator PC and may contain location and flight information. Do not upload it publicly.
- The NEXT public passenger demo cannot automatically read this file, and browser localStorage SimBrief imports remain device-local. This is intentional until authenticated device pairing and per-flight authorization are implemented.
- Windows/SimConnect compilation and flight testing require a Windows computer with the MSFS SDK and running simulator. Vercel web builds cannot validate the native bridge.

Next phases: signed device-pairing flow → explicit active-OPS-flight binding → authenticated ingest with short-lived credentials and replay protection → per-flight guest-view token → stale-data protection and permission-based release. Do not forward arbitrary unauthenticated telemetry directly to Supabase or expose the device over the public internet.
