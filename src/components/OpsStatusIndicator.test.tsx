/**
 * Tests for OpsStatusIndicator — AOPS-04.
 */

import { describe, it, expect } from 'vitest';

describe('OpsStatusIndicator', () => {
  it('module exports OpsStatusDot function', async () => {
    const mod = await import('./OpsStatusIndicator');
    expect(mod.OpsStatusDot).toBeDefined();
    expect(typeof mod.OpsStatusDot).toBe('function');
  });

  it('detects real companion config changes', async () => {
    const { hasCompanionConfigChange } = await import('./OpsStatusIndicator');
    const base = { companion: { opsModeEnabled: true, baseUrl: 'http://127.0.0.1:8765/api/v1' } };

    expect(hasCompanionConfigChange({
      oldValue: base,
      newValue: { ...base, companion: { ...base.companion, opsModeEnabled: false } },
    })).toBe(true);
  });
});
