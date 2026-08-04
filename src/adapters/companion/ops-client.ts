/**
 * OpsClient — typed HTTP adapter for the VacancyPilot loopback companion.
 *
 * Features:
 * - Fixed loopback base URL (``http://127.0.0.1:8765/api/v1``).
 * - Timeout and AbortController-based abort handling.
 * - JSON request/response with error-envelope parsing.
 * - Per-request ``X-VacancyPilot-Request-ID`` generation.
 * - ``X-VacancyPilot-Client`` only on authenticated endpoints.
 * - No automatic retry for non-idempotent calls (POST/PATCH/DELETE).
 * - Typed health and pairing methods.
 *
 * The client token is managed externally through the CompanionSettings bridge
 * and injected via ``setClientToken()`` / ``clearClientToken()``.
 */

import type {
  HealthResponse,
  PairStartResponse,
  PairConfirmRequest,
  PairConfirmResponse,
  PairRevokeResponse,
  CompanionErrorResponse,
  CompanionVersionInfo,
} from './types';
import { isCompatibleApiVersion } from './types';

// ── Constants ──────────────────────────────────────────────────────────────

export const COMPANION_BASE_URL = 'http://127.0.0.1:8765/api/v1';
const DEFAULT_TIMEOUT_MS = 10_000;

// ── Helpers ────────────────────────────────────────────────────────────────

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments where crypto.randomUUID is unavailable.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── OpsClient ──────────────────────────────────────────────────────────────

export class OpsClient {
  private _baseUrl: string;
  private _timeoutMs: number;
  private _clientToken: string | null;

  constructor(baseUrl: string = COMPANION_BASE_URL, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    if (normalizedBaseUrl !== COMPANION_BASE_URL) {
      throw new Error('Companion base URL must use the fixed loopback endpoint');
    }
    this._baseUrl = normalizedBaseUrl;
    this._timeoutMs = timeoutMs;
    this._clientToken = null;
  }

  // ── Token management ─────────────────────────────────────────────────

  /** Inject the client token for authenticated requests. */
  setClientToken(token: string): void {
    this._clientToken = token;
  }

  /** Remove the client token (disconnect). */
  clearClientToken(): void {
    this._clientToken = null;
  }

  /** Returns true when a client token is set. */
  get hasToken(): boolean {
    return this._clientToken !== null;
  }

  // ── Base URL ─────────────────────────────────────────────────────────

  get baseUrl(): string {
    return this._baseUrl;
  }

  // ── Generic request ──────────────────────────────────────────────────

  /**
   * Perform a typed GET request.
   *
   * Returns the parsed success body or throws a ``CompanionError`` on failure.
   */
  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this._request<T>('GET', path, undefined, signal, false);
  }

  /**
   * Perform a typed POST request.
   *
   * Returns the parsed success body or throws a ``CompanionError`` on failure.
   */
  async post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this._request<T>('POST', path, body, signal, false);
  }

  /** Perform an authenticated GET request. */
  async authenticatedGet<T>(path: string, signal?: AbortSignal): Promise<T> {
    this._requireClientToken();
    return this._request<T>('GET', path, undefined, signal, true);
  }

  /** Perform an authenticated JSON POST request. */
  async authenticatedPost<T>(
    path: string,
    body: unknown,
    signal?: AbortSignal,
    options?: { idempotencyKey?: string },
  ): Promise<T> {
    this._requireClientToken();
    return this._request<T>('POST', path, body, signal, true, options);
  }

  private _requireClientToken(): void {
    if (!this._clientToken) {
      throw new CompanionError(
        'NOT_PAIRED',
        'Companion authentication requires a paired client token',
        generateRequestId(),
      );
    }
  }

  /**
   * Internal fetch wrapper with timeout, error parsing, and headers.
   */
  private async _request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    authenticated = false,
    options?: { idempotencyKey?: string },
  ): Promise<T> {
    const requestId = generateRequestId();
    const url = `${this._baseUrl}${path}`;

    // Build headers
    const headers: Record<string, string> = {
      'X-VacancyPilot-Request-ID': requestId,
      Accept: 'application/json',
    };

    if (authenticated && this._clientToken) {
      headers['X-VacancyPilot-Client'] = this._clientToken;
    }

    if (options?.idempotencyKey) {
      headers['X-VacancyPilot-Idempotency-Key'] = options.idempotencyKey;
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    // Timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeoutMs);

    // Merge external signal
    const mergedSignal = signal
      ? combineAbortSignals(signal, controller.signal)
      : controller.signal;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: mergedSignal,
      });

      // Parse body as JSON
      let json: Record<string, unknown>;
      try {
        json = (await response.json()) as Record<string, unknown>;
      } catch {
        throw new CompanionError(
          'INVALID_JSON',
          'The companion response was not valid JSON',
          requestId,
          response.status,
        );
      }

      // Handle non-2xx as error envelope
      if (!response.ok) {
        const errorBody = json as unknown as CompanionErrorResponse;
        throw new CompanionError(
          errorBody.error?.code ?? 'UNKNOWN_ERROR',
          errorBody.error?.message ?? `HTTP ${response.status}`,
          errorBody.error?.request_id ?? requestId,
          response.status,
          errorBody.error?.details ?? undefined,
        );
      }

      // Return typed success
      return json as T;
    } catch (err) {
      if (err instanceof CompanionError) throw err;

      // The error might be a DOMException (AbortError) or a regular Error
      // (happy-dom does not implement DOMException, so we also check name).
      const isAbortError =
        (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');
      if (isAbortError) {        const isTimeout = controller.signal.aborted && !signal?.aborted;
        throw new CompanionError(
          isTimeout ? 'TIMEOUT' : 'ABORTED',
          isTimeout
            ? `Request timed out after ${this._timeoutMs}ms`
            : 'Request was aborted',
          requestId,
        );
      }

      // Network error (companion offline)
      throw new CompanionError(
        'NETWORK_ERROR',
        err instanceof Error ? err.message : 'Network error',
        requestId,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Health ───────────────────────────────────────────────────────────

  /** Call GET /health and return typed response. */
  async health(signal?: AbortSignal): Promise<HealthResponse> {
    return this.get<HealthResponse>('/health', signal);
  }

  /**
   * Perform a capability/version handshake: calls health and returns
   * parsed version info with a compatibility flag.
   */
  async handshake(signal?: AbortSignal): Promise<CompanionVersionInfo> {
    const h = await this.health(signal);
    return {
      service_version: h.data.service_version,
      api_version: h.data.api_version,
      compatible: isCompatibleApiVersion(h.data.api_version),
    };
  }

  // ── Pairing ──────────────────────────────────────────────────────────

  /** Start a pairing challenge. Returns the challenge ID. */
  async pairStart(signal?: AbortSignal): Promise<PairStartResponse> {
    return this.post<PairStartResponse>('/pair/start', {}, signal);
  }

  /** Confirm a pairing challenge with code. Returns client token. */
  async pairConfirm(
    challengeId: string,
    code: string,
    signal?: AbortSignal,
  ): Promise<PairConfirmResponse> {
    const body: PairConfirmRequest = { challenge_id: challengeId, code };
    return this.post<PairConfirmResponse>('/pair/confirm', body, signal);
  }

  /** Revoke the current client token. */
  async pairRevoke(signal?: AbortSignal): Promise<PairRevokeResponse> {
    return this._request<PairRevokeResponse>('POST', '/pair/revoke', {}, signal, true);
  }
}

// ── CompanionError ─────────────────────────────────────────────────────────

/** Structured error from the companion or network layer. */
export class CompanionError extends Error {
  code: string;
  requestId: string;
  httpStatus?: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    requestId: string,
    httpStatus?: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CompanionError';
    this.code = code;
    this.requestId = requestId;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// ── AbortSignal merging ────────────────────────────────────────────────────

/**
 * Combine two AbortSignals so the merged signal fires when either
 * source signal fires.
 */
function combineAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();

  const onAbort = () => controller.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });

  // If either is already aborted, abort immediately.
  if (a.aborted || b.aborted) {
    controller.abort();
  }

  return controller.signal;
}
