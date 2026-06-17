
const sanitize = require('express-mongo-sanitize');
const payload = { password: 'Victory' };
sanitize.sanitize(payload);
console.log('Sanitized payload:', payload);

