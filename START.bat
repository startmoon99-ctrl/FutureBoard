@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem 퓨쳐보드가 이미 실행 중이면 그 서버로 사이트만 열고 이 창은 바로 닫는다
curl --silent --fail --max-time 2 --output nul http://localhost:3000/api/config >nul 2>nul
if not errorlevel 1 (
  start "" "http://localhost:3000"
  exit /b 0
)

title 퓨쳐보드 서버

echo.
echo  ==========================================
echo    퓨쳐보드 로컬 프로토타입
echo  ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [오류] Node.js 가 설치되어 있지 않습니다.
  echo.
  echo   1. https://nodejs.org 에서 LTS 버전을 설치하세요.
  echo   2. 설치가 끝나면 이 창을 닫고 START.bat 을 다시 실행하세요.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node --version') do set NODE_VER=%%v
echo  · Node.js %NODE_VER% 확인
echo  · 외부 패키지 설치가 필요 없습니다
echo  · 서버를 시작하면 브라우저가 자동으로 열립니다
echo.

node server.js --open
set EXIT_CODE=%errorlevel%

if "%EXIT_CODE%"=="2" (
  echo.
  echo  [오류] 3000번 포트를 퓨쳐보드가 아닌 다른 프로그램이 사용 중입니다.
  echo  그 프로그램을 종료한 뒤 START.bat 을 다시 실행해 주세요.
  echo.
  pause
  exit /b 2
)

if not "%EXIT_CODE%"=="0" (
  echo.
  echo  [오류] 서버가 예기치 않게 종료되었습니다. 위의 메시지를 확인해 주세요.
  pause
)
