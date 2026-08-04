/**
 * Tests for OpsClient adapter — AOPS-04.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpsClient, CompanionError } from './ops-client';
import type {
  HealthResponse,
  PairStartResponse,
  PairConfirmResponse,
  PairRevokeResponse,
} from './types';

// ── Helpers ────────────────────────────────────────────────────────────────

function mockNetworkError() {
  return Promise.reject(new TypeError('Failed to fetch'));
}

function mockAbortError() {
  // happy-dom does not have DOMException. Use Error with name AbortError.
  const err = new Error('The operation was aborted.') as Error & { name: string };
  err.name = 'AbortError';
  return Promise.reject(err);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('OpsClient', () => {
  let client: OpsClient;

  beforeEach(() => {
    client = new OpsClient();
  });

  describe('constructor', () => {
    it('uses default base URL', () => {
      expect(client.baseUrl).toBe('http://127.0.0.1:8765/api/v1');
    });

    it('accepts the fixed base URL with a trailing slash', () => {
      const c = new OpsClient('http://127.0.0.1:8765/api/v1/');
      expect(c.baseUrl).toBe('http://127.0.0.1:8765/api/v1');
    });

    it('starts with no client token', () => {
      expect(client.hasToken).toBe(false);
    });
  });

  describe('token management', () => {
    it('setClientToken / hasToken', () => {
      client.setClientToken('test-token-123');
      expect(client.hasToken).toBe(true);
    });

    it('clearClientToken removes token', () => {
      client.setClientToken('test-token-123');
      client.clearClientToken();
      expect(client.hasToken).toBe(false);
    });
  });

  describe('request ID generation', () => {
    it('includes X-VacancyPilot-Request-ID in every request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { status: 'ok', service_version: '0.1.0', api_version: '1', db: 'ok' },
            meta: { request_id: 'server-id' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await client.health();

      const [url, init] = fetchSpy.mock.calls[0];
      void url; // read but unused in assertion
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['X-VacancyPilot-Request-ID']).toBeTruthy();
      expect(headers['X-VacancyPilot-Request-ID']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      fetchSpy.mockRestore();
    });
  });

  describe('client token header', () => {
    it('does NOT include X-VacancyPilot-Client when no token is set', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { status: 'ok', service_version: '0.1.0', api_version: '0.1.0', db: 'ok' },
            meta: { request_id: 'x' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await client.health();

      const [, init] = fetchSpy.mock.calls[0];
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['X-VacancyPilot-Client']).toBeUndefined();

      fetchSpy.mockRestore();
    });

    it('does not expose the token on public health requests', async () => {
      client.setClientToken('my-secret-token');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { status: 'ok', service_version: '0.1.0', api_version: '0.1.0', db: 'ok' },
            meta: { request_id: 'x' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await client.health();

      const [, init] = fetchSpy.mock.calls[0];
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['X-VacancyPilot-Client']).toBeUndefined();

      fetchSpy.mockRestore();
    });
  });

  describe('health', () => {
    it('returns typed health response on success', async () => {
      const healthBody: HealthResponse = {
        data: { status: 'ok', service_version: '0.1.0', api_version: '0.1.0', db: 'ok' },
        meta: { request_id: 'req-1' },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(healthBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await client.health();
      expect(result.data.status).toBe('ok');
      expect(result.data.api_version).toBe('0.1.0');
    });

    it('throws CompanionError on HTTP error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Database not reachable',
              request_id: 'err-1',
            },
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const error = await client.health().then(
        () => { throw new Error('Expected rejection'); },
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(CompanionError);
      expect((error as CompanionError).code).toBe('SERVICE_UNAVAILABLE');
      expect((error as CompanionError).httpStatus).toBe(503);
    });

    it('throws CompanionError on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(mockNetworkError);

      const error = await client.health().then(
        () => { throw new Error('Expected rejection'); },
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(CompanionError);
      expect((error as CompanionError).code).toBe('NETWORK_ERROR');
    });

    it('throws CompanionError on abort/timeout', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(mockAbortError);

      const error = await client.health().then(
        () => { throw new Error('Expected rejection'); },
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(CompanionError);
      expect((error as CompanionError).code).toBe('ABORTED');
    });
  });

  describe('handshake', () => {
    it('returns compatible: true for matching API version', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { status: 'ok', service_version: '0.1.0', api_version: '1', db: 'ok' },
            meta: { request_id: 'x' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const info = await client.handshake();
      expect(info.compatible).toBe(true);
      expect(info.api_version).toBe('1');
    });

    it('returns compatible: false for mismatched API version', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { status: 'ok', service_version: '1.0.0', api_version: '2', db: 'ok' },
            meta: { request_id: 'x' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const info = await client.handshake();
      expect(info.compatible).toBe(false);
    });
  });

  describe('pairing', () => {
    it('pairStart returns challenge ID', async () => {
      const body: PairStartResponse = {
        data: { challenge_id: 'abc123', expires_in_seconds: 300 },
        meta: {},
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await client.pairStart();
      expect(result.data.challenge_id).toBe('abc123');
      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(init?.body).toBe('{}');
    });

    it('pairConfirm returns client token', async () => {
      const body: PairConfirmResponse = {
        data: { client_token: 'secret-token', message: 'ok' },
        meta: {},
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await client.pairConfirm('ch-1', '123456');
      expect(result.data.client_token).toBe('secret-token');
    });

    it('pairConfirm throws CompanionError on invalid code', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'INVALID_CHALLENGE',
              message: 'Invalid challenge or code',
              request_id: 'e1',
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await expect(client.pairConfirm('bad', '000000')).rejects.toThrow(CompanionError);
    });

    it('pairRevoke succeeds', async () => {
      client.setClientToken('my-secret-token');
      const body: PairRevokeResponse = {
        data: { message: 'Revoked' },
        meta: {},
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await client.pairRevoke();
      expect(result.data.message).toBe('Revoked');
      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-VacancyPilot-Client']).toBe('my-secret-token');
      expect(init?.body).toBe('{}');
    });
  });

  it('rejects a non-loopback companion base URL', () => {
    expect(() => new OpsClient('https://attacker.example/api/v1')).toThrow(
      'fixed loopback endpoint',
    );
  });
});

describe('CompanionError', () => {
  it('stores all fields and extends Error', () => {
    const err = new CompanionError(
      'TEST_CODE',
      'Test message',
      'req-123',
      418,
      { field: 'xyz' },
    );

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CompanionError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('Test message');
    expect(err.requestId).toBe('req-123');
    expect(err.httpStatus).toBe(418);
    expect(err.details).toEqual({ field: 'xyz' });
  });
});
