/**
 * Tests for CompanionSettings component — AOPS-04.
 */

import { describe, it, expect } from 'vitest';

// We test that the module exports are valid.
// Full component rendering would require a DOM environment (happy-dom),
// which is covered by the existing test infrastructure.

describe('CompanionSettings', () => {
  it('module exports CompanionSettings component', async () => {
    const mod = await import('./CompanionSettings');
    expect(mod.CompanionSettings).toBeDefined();
    expect(typeof mod.CompanionSettings).toBe('function');
  });
});
