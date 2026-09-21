@echo off
rem ==========================================================================
rem  Fantasy Map Generator - Сборка и установка в ОДИН КЛИК.
rem  Делает все сам: зависимости -^> сборка -^> EXE-установщик -^> запуск.
rem  Для ручного управления используйте FMG-Desktop.bat (меню).
rem ==========================================================================
chcp 65001 >nul
setlocal EnableDelayedExpansion
title FMG - Сборка и установка в один клик

cd /d "%~dp0.."
set "ROOT=%CD%"

echo ============================================================
echo   Fantasy Map Generator - сборка и установка в один клик
echo ============================================================
echo   Папка проекта: %ROOT%
echo.

rem --- Шаг 1: Node.js ---
echo [Шаг 1/4] Проверка Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo [ОШИБКА] Node.js не найден.
  echo Скачайте LTS-версию с https://nodejs.org, установите и запустите снова.
  goto :fail
)
for /f "delims=" %%V in ('node -v') do set "NODE_VER=%%V"
echo [OK] Node.js !NODE_VER!
echo.

rem --- Шаг 2: зависимости ---
echo [Шаг 2/4] Установка зависимостей (может занять несколько минут)...
call npm ci --no-audit --no-fund
if errorlevel 1 (
  echo npm ci не удался, пробую npm install...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ОШИБКА] Не удалось установить зависимости.
    goto :fail
  )
)
echo [OK] Зависимости готовы.
echo.

rem --- Шаг 3: сборка + установщик ---
echo [Шаг 3/4] Сборка программы и EXE-установщика...
call node scripts/electron.mjs dist --win --x64 --publish never
if errorlevel 1 (
  echo [ОШИБКА] Сборка не удалась. Смотрите ошибки выше.
  goto :fail
)
echo [OK] Сборка завершена.
echo.

rem --- Шаг 4: поиск и запуск установщика ---
echo [Шаг 4/4] Поиск установщика...
set "INSTALLER="
for /f "delims=" %%F in ('dir /b /o:-d "release\*.exe" 2^>nul') do (
  set "INSTALLER=release\%%F"
  goto :launch
)
echo [ОШИБКА] Установщик не найден в папке release.
goto :fail

:launch
echo [OK] Найден: !INSTALLER!
echo Запускаю установщик...
start "" "%ROOT%\!INSTALLER!"
echo.
echo ============================================================
echo   ГОТОВО. Установщик запущен - следуйте его шагам.
echo   Файл установщика: %ROOT%\!INSTALLER!
echo   Portable-версия:  %ROOT%\release\win-unpacked\Fantasy Map Generator.exe
echo ============================================================
pause
exit /b 0

:fail
echo.
echo Сборка прервана. Исправьте ошибку выше и запустите снова.
pause
exit /b 1
