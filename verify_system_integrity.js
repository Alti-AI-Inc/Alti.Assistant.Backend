
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000/api/v1';

async function verifySystem() {
    console.log('Starting System Integrity Verification...');

    try {
        // 1. Health Check
        console.log('1. Checking Health Endpoint...');
        const healthRes = await fetch('http://localhost:5000/health');
        if (healthRes.ok) {
            console.log('   [PASS] Health Check OK');
        } else {
            console.error('   [FAIL] Health Check Failed:', healthRes.statusText);
        }

        // 2. Search (Tavily)
        console.log('2. Verifying Search (Tavily)...');
        // Mocking an anonymous search or authenticated if token available
        // For now, assuming public or skipped if auth required without token
        console.log('   [SKIP] Auth required for Search');

    } catch (error) {
        console.error('System Verification Failed:', error);
    }
}

verifySystem();
