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
if not defined SDK_ROOT set "SDK_ROOT=%MSFS_SDK%"
if not defined SDK_ROOT set "SDK_ROOT=C:\MSFS 2024 SDK"

set "MANAGED=%SDK_ROOT%\SimConnect SDK\lib\managed\Microsoft.FlightSimulator.SimConnect.dll"
set "NATIVE=%SDK_ROOT%\SimConnect SDK\lib\SimConnect.dll"
if not exist "%MANAGED%" goto missing
if not exist "%NATIVE%" goto missing

echo Kopiere die beiden SimConnect-Dateien aus deinem lokal installierten MSFS 2024 SDK.
copy /Y "%MANAGED%" "%~dp0Microsoft.FlightSimulator.SimConnect.dll" >nul || goto error
copy /Y "%NATIVE%" "%~dp0SimConnect.dll" >nul || goto error
echo Erfolgreich. Die SDK-Binaerdateien bleiben nur auf deinem PC.

:launch
echo Starte AERVELYS Flight Bridge...
start "" "%~dp0AERVELYS.SimConnectBridge.exe"
exit /b 0

:missing
echo.
echo FEHLER: MSFS 2024 SDK Dateien wurden nicht gefunden.
echo Installiere zuerst den offiziellen MSFS-2024-SDK und starte diese Datei erneut.
echo Erwarteter SDK-Pfad: "%SDK_ROOT%"
echo.
echo Du kannst alternativ MSFS2024_SDK als Umgebungsvariable setzen.
echo Es werden keine SDK-Dateien heruntergeladen oder ins Internet uebertragen.
pause
exit /b 2

:error
echo FEHLER: SDK-Dateien konnten nicht kopiert werden.
pause
exit /b 3
