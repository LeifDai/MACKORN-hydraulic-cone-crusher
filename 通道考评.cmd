@echo off
chcp 65001 >nul
setlocal

set "ROOT=D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"

if not exist "%ROOT%\tools\channel_eval.mjs" (
  echo   [错误] 找不到项目目录：%ROOT%
  pause
  exit /b 1
)

cd /d "%ROOT%"
title MACKORN 通道考评

:menu
cls
echo.
echo   ══════════════════════════════════════════════════════
echo     MACKORN 通道考评 · 谁能做得更好
echo     口径：质量 60%% + 效率 40%%
echo   ══════════════════════════════════════════════════════
echo.
echo     [1] 看所有通道状态（key 有没有配）
echo     [2] Kimi 三版本对比（免费/收费/网页版）
echo     [3] 探活 + 排名（真发请求，慢，约 1-2 分钟）
echo     [4] 只看 Kimi 官方 API 免费政策
echo     [5] 退出
echo.
set /p choice="   请选择 [1-5]: "

if "%choice%"=="1" goto status
if "%choice%"=="2" goto kimi
if "%choice%"=="3" goto probe
if "%choice%"=="4" goto kimipolicy
if "%choice%"=="5" exit /b 0
goto menu

:status
echo.
node tools\channel_eval.mjs --status
echo.
pause
goto menu

:kimi
echo.
node tools\channel_eval.mjs --kimi
echo.
pause
goto menu

:probe
echo.
echo   正在探活（每个通道最多等 45 秒）...
node tools\channel_eval.mjs --probe --score
echo.
pause
goto menu

:kimipolicy
echo.
echo   ══════════════════════════════════════════════════════
echo     Kimi 免费政策（2026-10-26 实测）
echo   ══════════════════════════════════════════════════════
echo.
echo     1. Kimi K2.6（NVIDIA NIM）  --  免费
echo        路径：https://integrate.api.nvidia.com/v1
echo        模型：moonshotai/kimi-k2.6
echo        条件：只需免费注册 NVIDIA，拿 NVIDIA_API_KEY
echo        ★ 这就是你要的 Kimi 免费版
echo.
echo     2. Kimi 官方 API（月之暗面）  --  收费
echo        路径：https://api.moonshot.cn/v1
echo        政策：新用户 15 元试用额度，之后按 token 收费
echo        注意：没有永久免费模型
echo.
echo     3. Kimi 网页版  --  免费但不能程序调用
echo        路径：https://kimi.moonshot.cn
echo        限制：只能人手动问，无 API
echo.
echo   ══════════════════════════════════════════════════════
echo     当前状态：NVIDIA_API_KEY 未配置，所以 Kimi 免费版用不了
echo     配 key 只需 3 步（见下方指南）
echo   ══════════════════════════════════════════════════════
echo.
pause
goto menu
