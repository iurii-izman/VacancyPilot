/**
 * Tests for CompanionSettings component — AOPS-04.
 */

import { describe, it, expect } from 'vitest';
import { describeSyncErrors } from './HHIntegrationSection';

// We test that the module exports are valid.
// Full component rendering would require a DOM environment (happy-dom),
// which is covered by the existing test infrastructure.

describe('CompanionSettings', () => {
  it('module exports CompanionSettings component', async () => {
    const mod = await import('./CompanionSettings');
    expect(mod.CompanionSettings).toBeDefined();
    expect(typeof mod.CompanionSettings).toBe('function');
  });

  it('formats sanitized HH sync errors with profile names', () => {
    expect(describeSyncErrors(
      [{ profile_id: 'profile-1', code: 'HH_BAD_REQUEST' }],
      [{ id: 'profile-1', name: 'System Analyst' }],
    )).toEqual(['System Analyst: HH_BAD_REQUEST']);
  });
});
