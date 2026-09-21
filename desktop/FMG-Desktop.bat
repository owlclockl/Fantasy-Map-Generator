@echo off
rem ==========================================================================
rem  Fantasy Map Generator - Автосборщик десктопной версии для Windows
rem  Меню: установка зависимостей, сборка, создание EXE-установщика, запуск.
rem ==========================================================================
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Fantasy Map Generator - Автосборщик

cd /d "%~dp0.."
set "ROOT=%CD%"

:menu
cls
echo ============================================================
echo   Fantasy Map Generator - Автосборщик десктопной версии
echo ============================================================
echo   Папка проекта: %ROOT%
echo ------------------------------------------------------------
echo   1 - Полный цикл: зависимости + сборка + EXE + запуск
echo   2 - Быстрый запуск для разработки (dev, hot reload)
echo   3 - Только собрать и запустить (без установщика)
echo   4 - Только создать EXE-установщик
echo   5 - Запустить уже собранную программу
echo   6 - Проверка окружения (диагностика)
echo   7 - Очистка артефактов сборки
echo   0 - Выход
echo ------------------------------------------------------------
set "CHOICE="
set /p CHOICE="Выберите пункт (0-7): "
if "%CHOICE%"=="1" goto :full_cycle
if "%CHOICE%"=="2" goto :dev_mode
if "%CHOICE%"=="3" goto :build_and_run
if "%CHOICE%"=="4" goto :installer_only
if "%CHOICE%"=="5" goto :run_only
if "%CHOICE%"=="6" goto :diagnose
if "%CHOICE%"=="7" goto :clean
if "%CHOICE%"=="0" exit /b 0
echo Неверный ввод, попробуйте снова.
timeout /t 2 >nul
goto :menu

rem --------------------------------------------------------------------------
:full_cycle
cls
echo === Полный цикл: зависимости + сборка + EXE + запуск ===
call :check_node
if "%NODE_OK%"=="0" goto :pause_return
call :install_deps
if errorlevel 1 goto :pause_return
call :make_installer
if errorlevel 1 goto :pause_return
call :run_installer
goto :pause_return

rem --------------------------------------------------------------------------
:dev_mode
cls
echo === Режим разработки (hot reload, окно закроется - вернетесь в меню) ===
call :check_node
if "%NODE_OK%"=="0" goto :pause_return
call :install_deps
if errorlevel 1 goto :pause_return
echo.
echo Запускаю dev-режим...
call npm run electron
goto :pause_return

rem --------------------------------------------------------------------------
:build_and_run
cls
echo === Сборка программы без установщика + запуск ===
call :check_node
if "%NODE_OK%"=="0" goto :pause_return
call :install_deps
if errorlevel 1 goto :pause_return
echo.
echo --- Сборка portable-версии (без установщика) ---
call node scripts/electron.mjs dist --win --x64 --dir --publish never
if errorlevel 1 (
  echo [ОШИБКА] Сборка не удалась. Смотрите ошибки выше.
  goto :pause_return
)
echo [OK] Сборка завершена.
call :run_portable
goto :pause_return

rem --------------------------------------------------------------------------
:installer_only
cls
echo === Создание EXE-установщика ===
call :check_node
if "%NODE_OK%"=="0" goto :pause_return
call :install_deps
if errorlevel 1 goto :pause_return
call :make_installer
if errorlevel 1 goto :pause_return
call :find_installer
if not "!INSTALLER!"=="" (
  echo.
  echo Установщик готов: %ROOT%\!INSTALLER!
)
goto :pause_return

rem --------------------------------------------------------------------------
:run_only
cls
echo === Запуск собранной программы ===
call :run_portable
goto :pause_return

rem --------------------------------------------------------------------------
:diagnose
cls
echo === Диагностика окружения ===
call :check_node
echo.
echo --- npm ---
call npm -v
echo.
echo --- Папки проекта ---
if exist "node_modules" (echo [OK] node_modules) else (echo [--] node_modules отсутствует)
if exist "dist-electron" (echo [OK] dist-electron) else (echo [--] dist-electron отсутствует)
if exist "release" (echo [OK] release) else (echo [--] release отсутствует)
echo.
echo --- Установщики в release ---
if exist "release\*.exe" (dir /b "release\*.exe") else (echo Установщиков нет)
echo.
echo --- Собранная программа ---
if exist "release\win-unpacked\Fantasy Map Generator.exe" (
  echo [OK] portable-сборка готова
) else (
  echo [--] portable-сборка отсутствует
)
echo.
echo --- Electron ---
call npx --no-install electron --version
goto :pause_return

rem --------------------------------------------------------------------------
:clean
cls
echo === Очистка артефактов сборки ===
echo Будут удалены папки: dist-electron, release, dist
set "DELNM="
set /p DELNM="Удалить также node_modules (полная переустановка)? (y/N): "
rmdir /s /q dist-electron 2>nul
rmdir /s /q release 2>nul
rmdir /s /q dist 2>nul
if /i "!DELNM!"=="y" rmdir /s /q node_modules 2>nul
if /i "!DELNM!"=="д" rmdir /s /q node_modules 2>nul
echo [OK] Очистка завершена.
goto :pause_return

rem --------------------------------------------------------------------------
:pause_return
echo.
pause
goto :menu

rem ==========================================================================
rem  Подпрограммы
rem ==========================================================================

:check_node
set "NODE_OK=0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ОШИБКА] Node.js не найден.
  echo Скачайте LTS-версию с https://nodejs.org, установите и запустите снова.
  exit /b 1
)
for /f "delims=" %%V in ('node -v') do set "NODE_VER=%%V"
echo [OK] Node.js !NODE_VER! найден.
for /f "tokens=1 delims=." %%M in ("!NODE_VER:v=!") do set "NODE_MAJOR=%%M"
if !NODE_MAJOR! LSS 24 (
  echo [ОШИБКА] Требуется Node.js 24+. У вас: !NODE_VER!.
  echo Скачайте LTS-версию с https://nodejs.org, установите и запустите снова.
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ОШИБКА] npm не найден. Переустановите Node.js.
  exit /b 1
)
set "NODE_OK=1"
exit /b 0

:install_deps
echo.
echo --- Установка зависимостей (может занять несколько минут) ---
if not exist "node_modules" echo Папка node_modules отсутствует, выполняю установку...
call npm ci --no-audit --no-fund
if errorlevel 1 (
  echo npm ci не удался, пробую npm install...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ОШИБКА] Не удалось установить зависимости.
    exit /b 1
  )
)
echo [OK] Зависимости готовы.
exit /b 0

:make_installer
echo.
echo --- Сборка программы и EXE-установщика ---
call node scripts/electron.mjs dist --win --x64 --publish never
if errorlevel 1 (
  echo [ОШИБКА] Сборка не удалась. Смотрите ошибки выше.
  exit /b 1
)
echo [OK] Сборка завершена.
exit /b 0

:find_installer
set "INSTALLER="
if not exist "release" exit /b 1
for /f "delims=" %%F in ('dir /b /o:-d "release\*.exe" 2^>nul') do (
  set "INSTALLER=release\%%F"
  exit /b 0
)
exit /b 1

:run_installer
call :find_installer
if "%INSTALLER%"=="" (
  echo [ОШИБКА] Установщик не найден в папке release.
  exit /b 1
)
echo.
echo Найден установщик: %INSTALLER%
echo Запускаю установщик...
start "" "%ROOT%\%INSTALLER%"
echo [OK] Установщик запущен. Следуйте его шагам.
exit /b 0

:run_portable
set "PORTABLE=release\win-unpacked\Fantasy Map Generator.exe"
if not exist "%PORTABLE%" (
  echo [ОШИБКА] Собранная программа не найдена.
  echo Ожидался файл: %PORTABLE%
  echo Сначала выполните сборку (пункт 1 или 3).
  exit /b 1
)
echo Запускаю программу...
start "" "%ROOT%\%PORTABLE%"
echo [OK] Программа запущена.
exit /b 0
