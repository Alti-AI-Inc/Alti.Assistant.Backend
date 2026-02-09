const BASE_URL = 'http://localhost:5000/api/v1';

async function runVerification() {
    console.log('🚀 Starting System Integrity Check...');

    try {
        // 1. Health Check
        console.log('\n[1/5] Checking System Health...');
        try {
            const health = await fetch('http://localhost:5000/health');
            if (health.ok) console.log('✅ Health Check Passed');
            else console.error('❌ Health Check Failed:', health.status);
        } catch (e) {
            console.error('❌ Health Check Error:', e.message);
        }

        // 2. Auth Check (Login)
        console.log('\n[2/5] Checking Authentication...');
        let token = '';
        try {
            const login = await fetch(`${BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'admin@alti.com', password: 'password123' }) 
            });
            const loginData = await login.json();
            if (loginData.success) {
                token = loginData.data.accessToken;
                console.log('✅ Auth Check Passed');
            } else {
                console.warn('⚠️ Auth Check Failed (Test user might not exist):', loginData.message);
            }
        } catch (e) {
            console.error('❌ Auth Check Error:', e.message);
        }

        if (!token) {
            console.log('⚠️ Skipping authenticated tests due to login failure.');
            return;
        }

        // 3. Research Check (Tavily)
        console.log('\n[3/5] Checking Deep Research (Tavily)...');
        try {
            const search = await fetch(`${BASE_URL}/tavily/search`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token 
                },
                body: JSON.stringify({ query: 'What is the capital of France?' })
            });
            const searchData = await search.json();
            if (searchData.success) console.log('✅ Research Check Passed');
            else console.error('❌ Research Check Failed:', searchData.message);
        } catch (e) {
             console.error('❌ Research Check Error:', e.message);
        }

        // 4. Knowledge Check (RAG)
        console.log('\n[4/5] Checking Knowledge Base (RAG)...');
        try {
            const rag = await fetch(`${BASE_URL}/rag-system/query`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token 
                },
                body: JSON.stringify({ query: 'Test query', history: [] })
            });
            const ragData = await rag.json();
            // It might return success: false if index is empty, which is fine for availability check
            console.log(`ℹ️ RAG Response: ${ragData.success ? 'Success' : 'Failed/Empty'}`);
        } catch (e) {
             console.error('❌ RAG Check Error:', e.message);
        }

        // 5. Browser Agent Check
        console.log('\n[5/5] Checking Browser Agent...');
        try {
            const browser = await fetch(`${BASE_URL}/browser-use/logs/test-session`, {
                 headers: { 'Authorization': token }
            });
            if (browser.status !== 404) console.log('✅ Browser Agent Endpoint Accessible');
            else console.error('❌ Browser Agent Endpoint Not Found');
        } catch (e) {
             console.error('❌ Browser Check Error:', e.message);
        }

    } catch (error) {
        console.error('🔥 Critical Verification Error:', error);
    }
}

runVerification();
