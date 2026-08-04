/**
 * Tests for companion TypeScript contracts — AOPS-04.
 */

import { describe, it, expect } from 'vitest';
import {
  isCompatibleApiVersion,
  EXPECTED_API_VERSION,
} from './types';

describe('isCompatibleApiVersion', () => {
  it('returns true for identical versions', () => {
    expect(isCompatibleApiVersion(EXPECTED_API_VERSION)).toBe(true);
  });

  it('accepts the canonical integer API generation', () => {
    expect(EXPECTED_API_VERSION).toBe('1');
    expect(isCompatibleApiVersion('1')).toBe(true);
  });

  it('accepts a future dotted version in the same generation', () => {
    expect(isCompatibleApiVersion('1.1.0')).toBe(true);
  });

  it('returns false for a different API generation', () => {
    expect(isCompatibleApiVersion('2')).toBe(false);
    expect(isCompatibleApiVersion('0.1.0')).toBe(false);
  });

  it('returns false for invalid or empty values', () => {
    expect(isCompatibleApiVersion('abc')).toBe(false);
    expect(isCompatibleApiVersion('')).toBe(false);
    expect(isCompatibleApiVersion('0')).toBe(false);
  });
});
