const express = require('express');
const mongoSanitize = require('express-mongo-sanitize');
const bodyParser = require('body-parser');

const app = express();
app.use(express.json());
app.use(mongoSanitize());

app.post('/test', (req, res) => {
  console.log('RAW req.body:', JSON.stringify(req.body));
  console.log('password value:', req.body.password);
  console.log('password length:', req.body.password ? req.body.password.length : 'N/A');
  console.log('password chars:', req.body.password ? [...req.body.password].map(c => c + '(' + c.charCodeAt(0) + ')').join(' ') : 'N/A');
  res.json({ received: req.body });
});

app.listen(9999, () => {
  console.log('Test server on 9999');
  
  // Send a test request
  const http = require('http');
  const data = JSON.stringify({ email: 'meram.michael@gmail.com', password: 'Victory$23' });
  
  const options = {
    hostname: '127.0.0.1',
    port: 9999,
    path: '/test',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('\nResponse:', body);
      process.exit(0);
    });
  });
  req.write(data);
  req.end();
});
