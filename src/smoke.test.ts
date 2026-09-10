import { describe, it, expect } from 'vitest';
import { SCHEMA_V1, SCHEMA_VERSION } from '@/db/schema';

describe('foundation smoke', () => {
  it('exposes the current persisted schema foundation', () => {
    expect(SCHEMA_VERSION).toBe(7);
    expect(SCHEMA_V1).toHaveProperty('jobs');
    expect(SCHEMA_V1).toHaveProperty('meta');
  });
});
