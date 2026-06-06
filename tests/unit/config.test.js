import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Read the config source to verify defaults — avoids ESM module caching issues

describe('Config Module', () => {
  const configPath = path.resolve(process.cwd(), 'config', 'index.js');
  const configSource = fs.readFileSync(configPath, 'utf-8');

  it('should have safe JWT access token expiry default (1h, not 3650d)', () => {
    // Verify the old dangerous defaults are gone
    expect(configSource).not.toContain("|| '3650d'");
    expect(configSource).not.toContain("|| '36500d'");

    // Verify the new safe defaults are present
    expect(configSource).toContain("|| '1h'");
    expect(configSource).toContain("|| '7d'");
  });

  it('should export superAdminEmail from env var', () => {
    expect(configSource).toContain('superAdminEmail');
    expect(configSource).toContain('SUPER_ADMIN_EMAIL');
  });

  it('should use env var for super admin email with fallback default', () => {
    // The super admin email should be configurable via SUPER_ADMIN_EMAIL env var
    expect(configSource).toContain('process.env.SUPER_ADMIN_EMAIL');
    // It should have a fallback default (not undefined)
    expect(configSource).toMatch(/superAdminEmail:\s*process\.env\.SUPER_ADMIN_EMAIL\s*\|\|/);
  });
});
