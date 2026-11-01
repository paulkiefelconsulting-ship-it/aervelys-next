@echo off
setlocal EnableExtensions
title AERVELYS NEXT - Flight Bridge Setup
cd /d "%~dp0"

if not exist "AERVELYS.SimConnectBridge.exe" (
 echo FEHLER: AERVELYS.SimConnectBridge.exe fehlt im gleichen Ordner.
 pause
 exit /b 1
)

if exist "Microsoft.FlightSimulator.SimConnect.dll" if exist "SimConnect.dll" goto launch

set "SDK_ROOT=%MSFS2024_SDK%"
if defined SDK_ROOT if exist "%SDK_ROOT%\SimConnect SDK\lib\SimConnect.dll" goto install
set "SDK_ROOT=%MSFS_SDK%"
if defined SDK_ROOT if exist "%SDK_ROOT%\SimConnect SDK\lib\SimConnect.dll" goto install
set "SDK_ROOT=C:\MSFS 2024 SDK"
if exist "%SDK_ROOT%\SimConnect SDK\lib\SimConnect.dll" goto install
set "SDK_ROOT=C:\MSFS SDK"
if exist "%SDK_ROOT%\SimConnect SDK\lib\SimConnect.dll" goto install

echo.
echo Keine komplette SDK-Installation automatisch gefunden.
echo Die Bridge startet trotzdem. Im Bridge-Fenster kannst du
echo "MSFS-SDK auswählen ..." anklicken und den installierten SDK-Ordner waehlen.
echo Die MSFS-2024-SDK-DLLs werden nur auf diesem PC verwendet.
echo.
goto launch

:install
set "MANAGED=%SDK_ROOT%\SimConnect SDK\lib\managed\Microsoft.FlightSimulator.SimConnect.dll"
set "NATIVE=%SDK_ROOT%\SimConnect SDK\lib\SimConnect.dll"
if not exist "%MANAGED%" (
 echo Die Managed-DLL fehlt im SDK. Bitte im Bridge-Fenster SDK auswaehlen.
 goto launch
)
echo SimConnect SDK gefunden: "%SDK_ROOT%"
copy /Y "%MANAGED%" "%~dp0Microsoft.FlightSimulator.SimConnect.dll" >nul
if errorlevel 1 (
 echo Managed-DLL konnte nicht kopiert werden. Bitte Programmordner pruefen.
 goto launch
)
copy /Y "%NATIVE%" "%~dp0SimConnect.dll" >nul
if errorlevel 1 (
 echo Native SimConnect.dll konnte nicht kopiert werden. Bitte Programmordner pruefen.
 goto launch
)
echo Beide Microsoft-DLLs nur lokal aus deinem SDK bereitgestellt.

:launch
echo Starte AERVELYS Flight Bridge...
start "" "%~dp0AERVELYS.SimConnectBridge.exe"
exit /b 0
