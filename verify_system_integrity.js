
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8080/api/v1';

async function verifySystem() {
    console.log('Starting System Integrity Verification...');
    let userId = null;
    let token = null;

    try {
        // 1. Health Check
        console.log('1. Checking Health Endpoint...');
        const healthRes = await fetch('http://localhost:8080/health');
        if (healthRes.ok) {
            console.log('   [PASS] Health Check OK');
        } else {
            console.error('   [FAIL] Health Check Failed:', healthRes.statusText);
        }

        // 2. Auth (Get User for Tavily)
        console.log('2. Verifying Auth (Login/Register)...');
        const creds = { email: 'verify_test@example.com', password: 'password123' };

        // Try Login
        let authRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creds)
        });

        if (authRes.status === 404 || authRes.status === 401) {
            console.log('   [INFO] User not found, registering...');
            authRes = await fetch(`${BASE_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...creds, name: 'Verify Test' })
            });
        }

        const authData = await authRes.json();

        if (authData.success) {
            userId = authData.data.user?._id || authData.data?.user?.id || authData.data?._id; // Adjust based on consistency
            if (!userId && authData.data.accessToken) {
                // Decoding token is overkill, assume we have user object if success
                userId = authData.data.user?._id;
            }
            // Fallback if structure varies
            if (!userId && authData.data.id) userId = authData.data.id;

            console.log(`   [PASS] Auth Success. User ID: ${userId}`);
        } else {
            console.error('   [FAIL] Auth Failed:', authData.message);
        }

        // 3. Search (Tavily)
        console.log('3. Verifying Search (Tavily)...');
        if (userId) {
            const searchRes = await fetch(`${BASE_URL}/tavily/get-response-anonymously`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: 'OpenAI stock price', user: userId })
            });
            const searchData = await searchRes.json();
            if (searchData.success) {
                console.log('   [PASS] Tavily Search OK');
            } else {
                console.error('   [FAIL] Tavily Search Failed:', searchData.message);
            }
        } else {
            console.log('   [SKIP] Valid User ID required for Tavily');
        }

        // 4. RAG System
        console.log('4. Verifying RAG (LlamaIndex)...');
        const ragRes = await fetch(`${BASE_URL}/rag-system/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'Hello world' })
        });
        const ragData = await ragRes.json();
        if (ragRes.ok) {
            console.log('   [PASS] RAG Query Endpoint Accessible (Response:', ragData.answer ? 'Answered' : 'Empty', ')');
        } else {
            console.error('   [FAIL] RAG Query Failed:', ragData.error);
        }

    } catch (error) {
        console.error('System Verification Failed:', error);
    }
}

verifySystem();
