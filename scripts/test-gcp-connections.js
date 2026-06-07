import net from 'net';
import { createClient } from 'redis';
import config from '../config/index.js';
import { logger } from '../src/shared/logger.js';

/**
 * Healthcheck verification utility for GCP Native resources
 */
async function testGcpResources() {
  console.log('\n================================================');
  console.log('       GCP Managed Services Healthcheck');
  console.log('================================================\n');

  let alloyDbPassed = false;
  let redisPassed = false;

  // 1. Test AlloyDB / pgvector Connection via TCP Handshake
  console.log(`[AlloyDB] Testing TCP connection to ${config.alloydb.host}:${config.alloydb.port}...`);
  try {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection(config.alloydb.port, config.alloydb.host);
      socket.setTimeout(5000); // 5s timeout

      socket.on('connect', () => {
        console.log('🟢 [AlloyDB] TCP Connection Succeeded! Port is open.');
        alloyDbPassed = true;
        socket.end();
        resolve();
      });

      socket.on('error', (err) => {
        console.error(`🔴 [AlloyDB] TCP Connection Failed: ${err.message}`);
        reject(err);
      });

      socket.on('timeout', () => {
        console.error('🔴 [AlloyDB] TCP Connection Timed Out (5s).');
        socket.destroy();
        reject(new Error('Timeout'));
      });
    });
  } catch (err) {
    // Already logged error details
  }

  // 2. Test Memorystore / Redis Connection via Redis Ping
  const redisUrl = config.redis.url || 'redis://localhost:6379';
  console.log(`\n[Memorystore] Testing connection to Redis at: ${redisUrl}...`);
  let redisClient;
  try {
    redisClient = createClient({ url: redisUrl });
    redisClient.on('error', (err) => {
      console.error(`🔴 [Memorystore] Redis Client Error: ${err.message}`);
    });

    await redisClient.connect();
    const pingResult = await redisClient.ping();
    if (pingResult === 'PONG') {
      console.log('🟢 [Memorystore] Redis Connection Succeeded! Received PONG.');
      redisPassed = true;
    } else {
      console.warn(`🟡 [Memorystore] Redis connected but ping returned: ${pingResult}`);
    }
  } catch (err) {
    console.error(`🔴 [Memorystore] Redis Connection Failed: ${err.message}`);
  } finally {
    if (redisClient && redisClient.isOpen) {
      await redisClient.disconnect();
    }
  }

  // Final Summary
  console.log('\n================================================');
  console.log('               Verification Summary');
  console.log('================================================');
  console.log(`AlloyDB Connection:    ${alloyDbPassed ? 'PASS' : 'FAIL'}`);
  console.log(`Memorystore Connection: ${redisPassed ? 'PASS' : 'FAIL'}`);
  console.log('================================================\n');

  if (alloyDbPassed && redisPassed) {
    console.log('🎉 All GCP resource verifications completed successfully!');
    process.exit(0);
  } else {
    console.warn('⚠️ Some GCP native verifications did not pass. Check configs/networks.');
    process.exit(1);
  }
}

testGcpResources().catch((err) => {
  console.error('Fatal healthcheck failure:', err);
  process.exit(1);
});
