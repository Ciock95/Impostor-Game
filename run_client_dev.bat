@echo off
set "PATH=%PATH%;C:\Program Files\nodejs"
cd client
echo Installing socket.io-client...
call npm install socket.io-client
echo Starting Client...
call npm run dev
