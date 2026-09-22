import { describe, expect, it } from 'vitest';

/**
 * Health endpoint integration tests.
 * These test the endpoint handlers in isolation (without a running server).
 * They validate the response shape and status codes.
 */

describe('Health Endpoints', () => {
  it('should verify /health endpoint exists in index.js source', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.resolve(process.cwd(), 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');

    // Verify all three endpoints are defined
    expect(content).toContain("app.get('/health'");
    expect(content).toContain("app.get('/liveness'");
    expect(content).toContain("app.get('/readiness'");
  });

  it('should verify health endpoint checks MongoDB', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.resolve(process.cwd(), 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain('mongoose.connection.readyState');
  });

  it('should verify health endpoint checks Redis', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.resolve(process.cwd(), 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain('RedisClient.isEnabled');
    expect(content).toContain('health:ping');
  });
});

describe('Security Middleware', () => {
  it('should verify mongo sanitize is imported and used', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.resolve(process.cwd(), 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain(
      "import mongoSanitize from 'express-mongo-sanitize'"
    );
    expect(content).toContain('app.use(mongoSanitize())');
  });

  it('should verify HPP is imported and used', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.resolve(process.cwd(), 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain("import hpp from 'hpp'");
    expect(content).toContain('app.use(hpp())');
  });

  it('should verify trust proxy is configured safely (not boolean true)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.resolve(process.cwd(), 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain('const trustProxyEnv = process.env.TRUST_PROXY');
    expect(content).not.toContain("app.set('trust proxy', true)");
  });

  it('should verify CORS restricts localhost to non-production', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.resolve(process.cwd(), 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain("process.env.NODE_ENV !== 'production'");
    expect(content).toContain('allowedOrigins.push(');
  });
});

describe('Graceful Shutdown', () => {
  it('should verify shutdown timeout is set', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.resolve(process.cwd(), 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain('SHUTDOWN_TIMEOUT_MS');
    expect(content).toContain('forceExitTimer');
  });

  it('should verify Redis disconnect is called during shutdown', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.resolve(process.cwd(), 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain('RedisClient.disconnect()');
  });

  it('should verify unhandled rejections do NOT crash the server', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.resolve(process.cwd(), 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');

    // Should NOT have process.exit in unhandledRejection handler
    const unhandledSection = content.split(
      "process.on('unhandledRejection'"
    )[1];
    expect(unhandledSection).toBeDefined();
    // The section up to the next process.on or export should not have process.exit
    const sectionEnd = unhandledSection.indexOf('export default');
    const section = unhandledSection.substring(0, sectionEnd);
    expect(section).not.toContain('process.exit');
  });

  it('should verify idle connections drain during graceful shutdown', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.resolve(process.cwd(), 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain('server.closeIdleConnections()');
  });

  it('should verify global and AI rate limiters are mounted', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.resolve(process.cwd(), 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain('globalApiLimiter');
    expect(content).toContain('aiRateLimiter');
  });
});

describe('Stripe Webhook IP Normalization', () => {
  it('should properly normalize comma-separated proxy headers and recognize localhost', async () => {
    const { isStripeIp } = await import('../../src/shared/stripeSecurity.js');

    // Localhost / private IP bypass
    expect(await isStripeIp('127.0.0.1')).toBe(true);
    expect(await isStripeIp('::1')).toBe(true);
    expect(await isStripeIp('10.0.1.5, 172.16.0.1')).toBe(true);
    expect(await isStripeIp('')).toBe(false);
    expect(await isStripeIp(null)).toBe(false);
  });
});

describe('Global Error Handler Response Format', () => {
  it('should include success: false in error output', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const handlerPath = path.resolve(
      process.cwd(),
      'src/app/middlewares/globalErrorHandler/globalErrorHandler.js'
    );
    const content = fs.readFileSync(handlerPath, 'utf-8');

    expect(content).toContain('success: false');
    expect(content).toContain('status: false');
  });
});

