/**
 * Regression tests for config/env validation bugs.
 */
import { describe, it, expect } from 'vitest';

describe('validateEnvironment required fields', () => {
  it('SESSION_SECRET is in required vars (BUG-R2: was a hardcoded fallback, now required)', () => {
    // Read the source to verify SESSION_SECRET is in the required array
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/config.ts'),
      'utf8',
    );
    // The required array must list SESSION_SECRET
    expect(src).toMatch(/['"]SESSION_SECRET['"]/);
    // The hardcoded fallback must be gone
    expect(src).not.toMatch(/readsync-secret-change-in-production/);
  });

  it('SESSION_SECRET export defaults to empty string (not a hardcoded secret)', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/config.ts'),
      'utf8',
    );
    // The SESSION_SECRET export must use empty string as fallback
    expect(src).toMatch(/SESSION_SECRET\s*=\s*process\.env\.SESSION_SECRET\s*\?\?\s*''/);
  });
});
