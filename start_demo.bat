@echo off
echo.
echo =====================================
echo  Composio v2 Demo Frontend Launcher
echo =====================================
echo.

echo 🚀 Starting demo frontend server...
echo.

echo 📋 Instructions:
echo 1. Make sure your main backend is running on port 3000
echo 2. Open http://localhost:8080 in your browser
echo 3. Try the example workflows in the interface
echo.

echo 🎯 Example workflows to test:
echo - "Send me a daily GitHub issues summary every morning at 9 AM"
echo - "Email me weekly reports every Friday at 5 PM"  
echo - "Remind me about the meeting tomorrow at 2 PM"
echo - "Get my GitHub issues right now"
echo.

node demo_server.js

pause
