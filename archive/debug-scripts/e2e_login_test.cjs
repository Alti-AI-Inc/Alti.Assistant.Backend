// End-to-end login test — mimics exactly what the frontend does
const http = require('http');

const data = JSON.stringify({
  email: 'meram.michael@gmail.com',
  password: 'Victory$23'
});

const options = {
  hostname: '127.0.0.1',
  port: 5100,
  path: '/api/v1/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

console.log('Sending request:', data);
console.log('To:', `http://${options.hostname}:${options.port}${options.path}`);
console.log('');

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers, null, 2));
    console.log('');
    try {
      const parsed = JSON.parse(body);
      console.log('Response:', JSON.stringify(parsed, null, 2));
    } catch {
      console.log('Raw Response:', body);
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
