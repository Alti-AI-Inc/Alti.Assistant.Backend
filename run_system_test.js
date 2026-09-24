import http from 'http';

const checkStatus = async (path, method = 'GET', data = null) => {
  return new Promise((resolve, reject) => {
    const options = { hostname: 'localhost', port: 8000, path, method, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
};

async function runTests() {
  const hotkeyRes = await checkStatus('/api/v1/desktop/omni_hotkey', 'POST', { text: 'test' });
  console.log('Omni-Hotkey:', hotkeyRes.status, hotkeyRes.body);

  const chatRes = await checkStatus('/api/v1/chat/completions', 'POST', { messages: [{role: 'user', content: 'test'}] });
  console.log('Chat:', chatRes.status, chatRes.body);
}
runTests();
