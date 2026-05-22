import { RedisClient } from '../src/shared/redis.js';

console.log('RedisClient isEnabled:', RedisClient.isEnabled);

await RedisClient.set('test_key', 'hello_world', { EX: 10 });
const val = await RedisClient.get('test_key');
console.log('Retrieved key:', val);
