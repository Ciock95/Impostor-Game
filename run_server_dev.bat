@echo off
set "PATH=%PATH%;C:\Program Files\nodejs"
cd server
echo Starting Server (ignoring PowerShell restrictions)...
node index.js
pause
