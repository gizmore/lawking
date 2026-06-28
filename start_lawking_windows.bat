@echo off
setlocal
REM lawking offline starter for Windows

set "APP_DIR=%~dp0"
set "PORT=8765"
set "HOST=127.0.0.1"
set "URL=http://%HOST%:%PORT%/browser.html"
set "LOG=%APP_DIR%lawking-httpd.log"

cd /d "%APP_DIR%"

where py >nul 2>nul
if %errorlevel%==0 (
  set "PY_EXE=py"
  set "PY_ARGS=-3"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set "PY_EXE=python"
    set "PY_ARGS="
  ) else (
    echo Python wurde nicht gefunden. Bitte Python 3 installieren.
    pause
    exit /b 1
  )
)

REM Server zuerst starten, aber keinen zweiten Server auf demselben Port erzwingen.
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>nul
if %errorlevel%==0 (
  echo Port %PORT% ist bereits belegt. Oeffne vorhandene Instanz: %URL%
) else (
  start "lawking-httpd" /min cmd /c ""%PY_EXE%" %PY_ARGS% -m http.server %PORT% --bind %HOST% ^> "%LOG%" 2^>^&1"
)

REM Warten, bis browser.html erreichbar ist.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$url='%URL%'; for($i=0; $i -lt 80; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; if($r.StatusCode -ge 200){ exit 0 } } catch {}; Start-Sleep -Milliseconds 100 }; exit 1"

if errorlevel 1 (
  echo Warnung: Server antwortet noch nicht. Versuche trotzdem zu oeffnen.
)

start "" "%URL%"
echo lawking offline laeuft: %URL%
echo Log: %LOG%
echo Dieses Fenster kann geschlossen werden. Der Server laeuft in einem zweiten Fenster.
pause
