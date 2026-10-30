@echo off
setlocal
cd /d "%~dp0"
title TClean - lancement local

echo ==========================================
echo          TCLEAN - LANCEMENT LOCAL
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERREUR : Node.js n'est pas installe.
  echo Installez la version LTS depuis https://nodejs.org/
  echo Puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERREUR : npm est introuvable. Reinstallez Node.js LTS.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=.v" %%V in ('node -p "process.versions.node"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 20 (
  echo ERREUR : votre version de Node.js est trop ancienne.
  echo Installez Node.js LTS recent depuis https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Premiere utilisation : installation des dependances...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo ERREUR pendant l'installation des dependances.
    echo Verifiez votre connexion Internet puis relancez ce fichier.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Le serveur local va demarrer.
echo Ouvrez l'adresse affichee dans cette fenetre, souvent http://localhost:5173
 echo Pour arreter le site, appuyez sur Ctrl+C.
echo.
call npm run dev -- --host 127.0.0.1
pause
