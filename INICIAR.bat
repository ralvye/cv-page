@echo off
title ralvye.com - Landing Page
cd /d "%~dp0"

echo.
echo  ==========================================
echo   ralvye.com  ^|  Iniciando servidor...
echo  ==========================================
echo.
echo  Se abrira tu navegador en http://localhost:8080/
echo  Cierra esta ventana para detener el servidor.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"

echo.
echo  Servidor detenido.
pause
