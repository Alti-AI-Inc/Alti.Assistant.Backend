import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 8080;

// Enable CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Serve static files (the HTML demo)
app.use(express.static(__dirname));

// Serve the demo frontend at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'demo_frontend.html'));
});

// Simple API status endpoint for testing
app.get('/status', (req, res) => {
    res.json({
        status: 'running',
        message: 'Demo frontend server is running',
        timestamp: new Date().toISOString()
    });
});

app.listen(port, () => {
    console.log('🚀 Demo Frontend Server Started!');
    console.log('================================');
    console.log(`📱 Frontend URL: http://localhost:${port}`);
    console.log(`🔗 Backend API: http://localhost:3000/api/composio-v2`);
    console.log('');
    console.log('🎯 Test Examples:');
    console.log('1. "Send me a daily GitHub issues summary every morning at 9 AM"');
    console.log('2. "Email me weekly reports every Friday at 5 PM"');
    console.log('3. "Remind me about the meeting tomorrow at 2 PM"');
    console.log('4. "Get my GitHub issues right now"');
    console.log('');
    console.log('💡 Make sure your backend server is running on port 3000!');
    console.log('🎨 Open your browser and navigate to the frontend URL above');
});

export default app;
