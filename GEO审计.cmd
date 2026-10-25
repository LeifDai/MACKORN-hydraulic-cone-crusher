@echo off
chcp 65001 >nul
setlocal

set "ROOT=D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"

if not exist "%ROOT%\tools\geo_audit.mjs" (
  echo.
  echo   [错误] 找不到项目目录：
  echo   %ROOT%
  echo.
  echo   请确认项目是否还在这个路径。如果换了位置，
  echo   用记事本打开本文件（GEO审计.cmd），改第二行的 ROOT 路径。
  echo.
  pause
  exit /b 1
)

cd /d "%ROOT%"

echo.
echo   ══════════════════════════════════════════════════════
echo    MACKORN GEO 审计
echo    （GEO = 生成式引擎优化：让 AI 生成回答时引用我们）
echo   ══════════════════════════════════════════════════════
echo.

node tools\geo_audit.mjs --all

echo.
echo   ══════════════════════════════════════════════════════
echo    报告已写入：
echo    %ROOT%\distribution\03_验证与基准\geo-audit.json
echo   ══════════════════════════════════════════════════════
echo.

pause
