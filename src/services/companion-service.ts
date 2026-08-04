/**
 * Companion connection service — AOPS-04.
 *
 * Manages the pairing/connect/disconnect lifecycle:
 * 1. Check companion availability via /health.
 * 2. If unpaired: POST /pair/start → user enters code → POST /pair/confirm.
 * 3. Store client token via companion-auth-bridge.
 * 4. On disconnect: POST /pair/revoke (best-effort) → delete local token.
 *
 * Standalone Mode: when the companion is unreachable or Ops Mode is disabled,
 * all existing features continue to work against local Dexie storage.
 */

import { OpsClient, CompanionError } from '@/adapters/companion/ops-client';
import type { CompanionStatus, CompanionVersionInfo } from '@/adapters/companion/types';
import {
  loadClientToken,
  saveClientToken,
  deleteClientToken,
} from '@/db/companion-auth-bridge';
import { loadSettings, saveSettings } from '@/db/settings-bridge';

// ── Singleton client ───────────────────────────────────────────────────────

let _opsClient: OpsClient | null = null;

/** Return the singleton OpsClient, creating it if necessary. */
export function getOpsClient(): OpsClient {
  if (!_opsClient) {
    _opsClient = new OpsClient();
  }
  return _opsClient;
}

/**
 * Initialize the client with the configured base URL and stored token.
 * Call this once at extension startup.
 */
export async function initCompanionClient(): Promise<void> {
  const settings = await loadSettings();

  // Create a new client with the configured URL
  _opsClient = new OpsClient(settings.companion.baseUrl);

  // Inject stored client token
  const token = await loadClientToken();
  if (token) {
    _opsClient.setClientToken(token);
  }
}

// ── Status detection ───────────────────────────────────────────────────────

/**
 * Detect the current companion status.
 *
 * Flow:
 * 1. If Ops Mode is disabled → ``unavailable`` (no attempt).
 * 2. Try GET /health:
 *    - Network error → ``unavailable``.
 *    - Incompatible API version → ``incompatible-api``.
 *    - Health OK, no stored token → ``unpaired``.
 *    - Health OK, stored token → ``connected`` (assumes token still valid).
 *    - Unexpected error → ``error``.
 */
export async function detectCompanionStatus(): Promise<{
  status: CompanionStatus;
  versionInfo?: CompanionVersionInfo;
  error?: string;
}> {
  const settings = await loadSettings();
  if (!settings.companion.opsModeEnabled) {
    return { status: 'unavailable' };
  }

  await initCompanionClient();
  const client = getOpsClient();
  const hasToken = client.hasToken;

  try {
    const versionInfo = await client.handshake();

    // Persist version info
    settings.companion.lastServiceVersion = versionInfo.service_version;
    settings.companion.lastApiVersion = versionInfo.api_version;
    settings.companion.lastApiCompatible = versionInfo.compatible;
    settings.companion.lastConnectedAt = new Date().toISOString();
    await saveSettings(settings);

    if (!versionInfo.compatible) {
      return { status: 'incompatible-api', versionInfo };
    }

    const status: CompanionStatus = hasToken ? 'connected' : 'unpaired';
    return { status, versionInfo };
  } catch (err) {
    if (err instanceof CompanionError) {
      if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
        return { status: 'unavailable', error: err.message };
      }
      return { status: 'error', error: err.message };
    }
    return {
      status: 'unavailable',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ── Pairing flow ───────────────────────────────────────────────────────────

/**
 * Start a pairing challenge.
 *
 * Returns the challenge ID so the UI can show the code entry field.
 * The six-digit code is displayed out-of-band by the companion (stdout).
 */
export async function startPairing(): Promise<{
  success: boolean;
  challengeId?: string;
  expiresInSeconds?: number;
  error?: string;
}> {
  try {
    const client = getOpsClient();
    const response = await client.pairStart();
    return {
      success: true,
      challengeId: response.data.challenge_id,
      expiresInSeconds: response.data.expires_in_seconds ?? 300,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof CompanionError ? err.message : 'Failed to start pairing',
    };
  }
}

/**
 * Confirm a pairing challenge with the six-digit code.
 *
 * On success: stores the client token and updates OpsClient.
 */
export async function confirmPairing(
  challengeId: string,
  code: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const client = getOpsClient();
    const response = await client.pairConfirm(challengeId, code);
    const token = response.data.client_token;

    // Persist token and inject into client
    await saveClientToken(token);
    client.setClientToken(token);

    // Update settings
    const settings = await loadSettings();
    settings.companion.lastConnectedAt = new Date().toISOString();
    await saveSettings(settings);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof CompanionError ? err.message : 'Pairing confirmation failed',
    };
  }
}

// ── Disconnect flow ────────────────────────────────────────────────────────

/**
 * Disconnect from the companion: revoke the token on the server (best-effort)
 * and delete local pairing material.
 */
export async function disconnectCompanion(): Promise<{
  success: boolean;
  revoked: boolean;
  error?: string;
}> {
  let revoked = false;

  try {
    await initCompanionClient();
    const client = getOpsClient();
    if (client.hasToken) {
      await client.pairRevoke();
      revoked = true;
    }
  } catch {
    // Revocation is best-effort — the server might already be gone.
    revoked = false;
  }

  try {
    await deleteClientToken();
    getOpsClient().clearClientToken();
    return { success: true, revoked };
  } catch (err) {
    return {
      success: false,
      revoked,
      error: err instanceof Error ? err.message : 'Failed to clear local token',
    };
  }
}

// ── Ops Mode toggle ────────────────────────────────────────────────────────

/**
 * Enable or disable Ops Mode.
 *
 * Disabling Ops Mode does NOT disconnect (the token is kept). The user can
 * re-enable Ops Mode later without re-pairing.
 */
export async function setOpsModeEnabled(enabled: boolean): Promise<void> {
  const settings = await loadSettings();
  settings.companion.opsModeEnabled = enabled;
  await saveSettings(settings);

  // Re-init client with (possibly) updated base URL
  await initCompanionClient();
}

/**
 * Request the optional localhost permission required for the loopback companion.
 * Returns true if permission was granted.
 */
export async function requestLocalhostPermission(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) {
    // Not in an extension context (test environment likely).
    return true;
  }

  try {
    const granted = await chrome.permissions.request({
      origins: ['http://127.0.0.1:8765/*'],
    });
    return granted;
  } catch {
    return false;
  }
}

/**
 * Check if the localhost permission is currently granted.
 */
export async function hasLocalhostPermission(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) {
    return true;
  }

  try {
    return await chrome.permissions.contains({
      origins: ['http://127.0.0.1:8765/*'],
    });
  } catch {
    return false;
  }
}
