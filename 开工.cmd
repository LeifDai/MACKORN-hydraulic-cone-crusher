@echo off
chcp 65001 >nul
setlocal

set "ROOT=D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"

if not exist "%ROOT%\tools\resume.mjs" (
  echo   [错误] 找不到 %ROOT%
  pause
  exit /b 1
)

cd /d "%ROOT%"

echo.
echo   正在续接上次进度...
echo.

node tools\resume.mjs

echo.
echo   ══════════════════════════════════════════════════════
echo    接下来：
echo    [1] 先干上面的「今天第一件事」
echo    [2] 看焦点：node tools\daily_focus.mjs
echo    [3] 开始干活
echo   ══════════════════════════════════════════════════════
echo.

pause