@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
where py >nul 2>nul
if errorlevel 1 (
  echo Python 3.12 64-bit와 Python Launcher가 필요합니다. https://www.python.org/downloads/windows/
  echo Python 설치 후 이 파일을 다시 실행하세요.
  pause
  exit /b 1
)
py -3 -c "import sys; sys.exit(0 if (3,11) <= sys.version_info[:2] <= (3,13) else 1)"
if errorlevel 1 (
  echo Python 3.11~3.13을 지원합니다. Python 3.12 64-bit 설치를 권장합니다.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
  if errorlevel 1 goto fail
)
if not exist ".venv\capture-ready" (
  .venv\Scripts\python.exe -m pip install -r requirements.txt
  if errorlevel 1 goto fail
  echo ready> .venv\capture-ready
)
.venv\Scripts\python.exe app.py
if errorlevel 1 goto fail
exit /b 0
:fail
echo 실행하지 못했습니다. 위 오류 내용을 확인하세요.
pause
exit /b 1
