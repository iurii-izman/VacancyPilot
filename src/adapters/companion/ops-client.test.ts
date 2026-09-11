/**
 * Tests for OpsClient adapter — AOPS-04.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FULL_V4_TIMEOUT_MS, OpsClient, CompanionError } from './ops-client';
import type {
  HealthResponse,
  PairStartResponse,
  PairConfirmResponse,
  PairStatusResponse,
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

    it('pairRecoveryStart uses the public recovery endpoint', async () => {
      const body: PairStartResponse = {
        data: { challenge_id: 'recovery-1', expires_in_seconds: 300 },
        meta: {},
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );

      const result = await client.pairRecoveryStart();
      expect(result.data.challenge_id).toBe('recovery-1');
      expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toContain('/pair/recover/start');
    });

    it('pairStatus validates the client token on a protected endpoint', async () => {
      client.setClientToken('paired-token');
      const body: PairStatusResponse = { data: { paired: true }, meta: {} };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );

      const result = await client.pairStatus();
      expect(result.data.paired).toBe(true);
      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect((init as RequestInit).headers).toMatchObject({ 'X-VacancyPilot-Client': 'paired-token' });
    });
  });

  it('rejects a non-loopback companion base URL', () => {
    expect(() => new OpsClient('https://attacker.example/api/v1')).toThrow(
      'fixed loopback endpoint',
    );
  });

  it('reads the bounded Ops projection with one authenticated request', async () => {
    client.setClientToken('projection-token');
    const body = {
      data: [],
      meta: {
        request_id: 'projection-request',
        total: 0,
        limit: 25,
        offset: 25,
        view: 'vacancies',
        summary: {
          vacancies_total: 0,
          vacancies_without_application: 0,
          applications_total: 0,
          analysis_not_analyzed: 0,
          analysis_running: 0,
          analysis_ready: 0,
          analysis_invalid: 0,
          analysis_failed: 0,
          ready_to_review: 0,
          followups_due: 0,
        },
      },
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await client.getOpsWorkItems({
      view: 'vacancies',
      limit: 25,
      offset: 25,
      application_status: 'none',
      analysis_state: 'not_analyzed',
      search_profile_id: 'profile-1',
      sort: 'score',
      direction: 'asc',
    });

    expect(result.meta.total).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/api/v1/ops/work-items');
    expect(parsed.searchParams.get('application_status')).toBe('none');
    expect(parsed.searchParams.get('analysis_state')).toBe('not_analyzed');
    expect(parsed.searchParams.get('search_profile_id')).toBe('profile-1');
    expect(parsed.searchParams.get('sort')).toBe('score');
    expect(parsed.searchParams.get('direction')).toBe('asc');
    expect((init as RequestInit).headers).toMatchObject({
      'X-VacancyPilot-Client': 'projection-token',
    });
  });

  it('rejects authenticated requests before pairing', async () => {
    await expect(client.authenticatedGet('/migration/status')).rejects.toMatchObject({
      code: 'NOT_PAIRED',
    });
  });

  it('attaches the client token only to authenticated requests', async () => {
    client.setClientToken('paired-token');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {}, meta: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await client.authenticatedPost('/migration/preview', {});
    const [, init] = fetchSpy.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-VacancyPilot-Client']).toBe('paired-token');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('adds the typed idempotency header without replacing auth metadata', async () => {
    client.setClientToken('paired-token');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {}, meta: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await client.authenticatedPost('/vacancies/intake', {}, undefined, {
      idempotencyKey: 'stable-key',
    });

    const [, init] = fetchSpy.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-VacancyPilot-Idempotency-Key']).toBe('stable-key');
    expect(headers['X-VacancyPilot-Client']).toBe('paired-token');
    expect(headers['X-VacancyPilot-Request-ID']).toBeTruthy();
  });

  it('gives Full V4 enough time for a provider response and repair', async () => {
    vi.useFakeTimers();
    client.setClientToken('test-token-123');
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted.') as Error & { name: string };
          error.name = 'AbortError';
          reject(error);
        });
      }),
    );

    const pending = client.analyzeFullV4('vacancy-id').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(FULL_V4_TIMEOUT_MS);
    const error = await pending;

    expect(error).toBeInstanceOf(CompanionError);
    expect((error as CompanionError).code).toBe('TIMEOUT');
    expect((error as CompanionError).message).toContain(String(FULL_V4_TIMEOUT_MS));
    vi.useRealTimers();
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
