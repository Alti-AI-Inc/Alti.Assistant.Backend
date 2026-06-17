// Test login against PRODUCTION backend
const https = require('https');

const data = JSON.stringify({
  email: 'meram.michael@gmail.com',
  password: 'Victory$23'
});

const options = {
  hostname: 'altihq.com',
  port: 443,
  path: '/api/v1/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

console.log('Sending request to PRODUCTION:', `https://${options.hostname}${options.path}`);
console.log('Body:', data);
console.log('');

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('');
    try {
      const parsed = JSON.parse(body);
      console.log('Response:', JSON.stringify(parsed, null, 2));
    } catch {
      console.log('Raw Response:', body.substring(0, 500));
    }
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('Request Error:', e.message);
  process.exit(1);
});

req.write(data);
req.end();
