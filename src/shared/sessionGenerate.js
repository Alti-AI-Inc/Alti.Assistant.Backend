// const crypto = require('crypto');
import crypto from 'crypto';

const generateSessionId = () => {
  return crypto.randomBytes(24).toString('hex');
};


export default generateSessionId;