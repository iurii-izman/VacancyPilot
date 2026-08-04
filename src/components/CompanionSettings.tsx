/**
 * CompanionSettings — AOPS-04.
 *
 * A minimal section in the Settings/Options page for the Ops Companion.
 * Displays companion status and provides pair/connect/disconnect controls.
 *
 * Visible states: unavailable, unpaired, pairing, connected, incompatible API, error.
 */

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import {
  detectCompanionStatus,
  startPairing,
  confirmPairing,
  disconnectCompanion,
  setOpsModeEnabled,
  requestLocalhostPermission,
  hasLocalhostPermission,
  initCompanionClient,
} from '@/services/companion-service';
import { loadSettings } from '@/db/settings-bridge';
import type { CompanionStatus, CompanionVersionInfo } from '@/adapters/companion/types';
import { EXPECTED_API_VERSION } from '@/adapters/companion/types';
import { LoadingState } from './LoadingState';
import { colors } from '@/styles/tokens';

// ── Shared styles ──────────────────────────────────────────────────────────

const toggleBase: React.CSSProperties = {
  width: 40,
  height: 22,
  borderRadius: 11,
  position: 'relative',
  cursor: 'pointer',
  border: 'none',
  padding: 0,
  transition: 'background 0.2s',
};

function knobLeft(on: boolean): number {
  return on ? 20 : 2;
}

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  margin: '0 0 4px',
  color: '#1a3a5c',
};

const sectionDesc: React.CSSProperties = {
  fontSize: 12,
  color: '#999',
  margin: '0 0 16px',
};

// ── Status coloring ────────────────────────────────────────────────────────

function statusColor(status: CompanionStatus): string {
  switch (status) {
    case 'connected':
      return colors.green;
    case 'pairing':
      return colors.amber;
    case 'unpaired':
      return colors.blue;
    case 'incompatible-api':
    case 'error':
      return colors.red;
    case 'unavailable':
    default:
      return colors.textPlaceholder;
  }
}

function statusLabel(status: CompanionStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'pairing':
      return 'Pairing…';
    case 'unpaired':
      return 'Not paired';
    case 'incompatible-api':
      return 'Incompatible API';
    case 'error':
      return 'Error';
    case 'unavailable':
    default:
      return 'Unavailable';
  }
}

function statusDescription(status: CompanionStatus): string {
  switch (status) {
    case 'connected':
      return 'The extension is connected to the local companion.';
    case 'pairing':
      return 'Pairing in progress — enter the code displayed in the companion terminal.';
    case 'unpaired':
      return 'Companion is reachable but not paired. Click "Pair" to connect.';
    case 'incompatible-api':
      return 'The companion API version is incompatible with this extension. Please update both.';
    case 'error':
      return 'The companion returned an unexpected error. Check the companion logs.';
    case 'unavailable':
    default:
      return 'The companion is not running or Ops Mode is disabled. Start the companion and enable Ops Mode.';
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function CompanionSettings(): ReactNode {
  const [opsModeEnabled, setOpsModeEnabledLocal] = useState(false);
  const [status, setStatus] = useState<CompanionStatus>('unavailable');
  const [versionInfo, setVersionInfo] = useState<CompanionVersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Pairing form state
  const [pairingForm, setPairingForm] = useState<{
    challengeId: string;
    expiresAt: number;
  } | null>(null);
  const [pairingCode, setPairingCode] = useState('');

  // Permission state
  const [localhostPermitted, setLocalhostPermitted] = useState(false);

  // ── Refresh status ──

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setActionError(null);

    try {
      const result = await detectCompanionStatus();
      setStatus(result.status);
      if (result.versionInfo) setVersionInfo(result.versionInfo);
      if (result.error && result.status === 'error') {
        setActionError(result.error);
      }
    } catch {
      setStatus('unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load initial state ──

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const settings = await loadSettings();
      if (cancelled) return;
      setOpsModeEnabledLocal(settings.companion.opsModeEnabled);

      const permitted = await hasLocalhostPermission();
      if (cancelled) return;
      setLocalhostPermitted(permitted);

      await initCompanionClient();
      if (cancelled) return;
      await refreshStatus();
    }

    void init();
    return () => { cancelled = true; };
  }, [refreshStatus]);

  // ── Ops Mode toggle ──

  const handleOpsModeToggle = useCallback(async () => {
    setActionBusy(true);
    setActionError(null);

    const next = !opsModeEnabled;

    try {
      if (next) {
        // Request localhost permission when enabling Ops Mode
        const permitted = await requestLocalhostPermission();
        setLocalhostPermitted(permitted);
        if (!permitted) {
          setActionError(
            'Localhost permission is required for Ops Mode. You can grant it in the Permissions section.',
          );
          return;
        }
      }

      await setOpsModeEnabled(next);
      setOpsModeEnabledLocal(next);

      if (next) {
        await initCompanionClient();
        await refreshStatus();
      } else {
        setStatus('unavailable');
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to update Ops Mode');
    } finally {
      setActionBusy(false);
    }
  }, [opsModeEnabled, refreshStatus]);

  // ── Pair ──

  const handlePair = useCallback(async () => {
    setActionBusy(true);
    setActionError(null);

    const result = await startPairing();
    if (result.success && result.challengeId) {
      setPairingForm({
        challengeId: result.challengeId,
        expiresAt: Date.now() + (result.expiresInSeconds ?? 300) * 1000,
      });
      setPairingCode('');
      setStatus('pairing');
    } else {
      setActionError(result.error ?? 'Failed to start pairing');
    }

    setActionBusy(false);
  }, []);

  // ── Confirm pairing ──

  const handleConfirmPairing = useCallback(async () => {
    if (!pairingForm || pairingCode.length !== 6) return;

    setActionBusy(true);
    setActionError(null);

    const result = await confirmPairing(pairingForm.challengeId, pairingCode);
    if (result.success) {
      setPairingForm(null);
      setPairingCode('');
      await refreshStatus();
    } else {
      setActionError(result.error ?? 'Pairing failed');
    }

    setActionBusy(false);
  }, [pairingForm, pairingCode, refreshStatus]);

  // ── Cancel pairing ──

  const handleCancelPairing = useCallback(() => {
    setPairingForm(null);
    setPairingCode('');
    setActionError(null);
    void refreshStatus();
  }, [refreshStatus]);

  // ── Disconnect ──

  const handleDisconnect = useCallback(async () => {
    setActionBusy(true);
    setActionError(null);

    const result = await disconnectCompanion();
    if (result.success) {
      await refreshStatus();
    } else {
      setActionError(result.error ?? 'Disconnect failed');
    }

    setActionBusy(false);
  }, [refreshStatus]);

  // ── Render ──

  if (loading) {
    return (
      <div>
        <h2 style={sectionTitle}>Companion</h2>
        <LoadingState message="Checking companion status…" />
      </div>
    );
  }

  return (
    <div>
      <h2 style={sectionTitle}>Companion</h2>
      <p style={sectionDesc}>
        Connect to the local Ops Companion for advanced features. When disconnected,
        all existing features continue to work offline.
      </p>

      {/* Ops Mode master toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 0',
          borderBottom: '1px solid #eee',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
            Ops Mode
          </div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
            Enable connection to the local companion app
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleOpsModeToggle()}
          disabled={actionBusy}
          style={{
            ...toggleBase,
            background: opsModeEnabled ? colors.blue : '#ccc',
            opacity: actionBusy ? 0.6 : 1,
            cursor: actionBusy ? 'not-allowed' : 'pointer',
          }}
          aria-label={opsModeEnabled ? 'Disable Ops Mode' : 'Enable Ops Mode'}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 2,
              left: knobLeft(opsModeEnabled),
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: '8px 12px',
            background: colors.errorBg,
            border: '1px solid #fcc',
            borderRadius: 6,
            fontSize: 12,
            color: colors.red,
          }}
        >
          {actionError}
        </div>
      )}

      {/* Status and controls (only when Ops Mode is enabled) */}
      {opsModeEnabled && (
        <div style={{ marginTop: 12 }}>
          {/* Status indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: '#fafafa',
              border: '1px solid #e0e0e0',
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: statusColor(status),
                display: 'inline-block',
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                {statusLabel(status)}
              </div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                {statusDescription(status)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refreshStatus()}
              disabled={actionBusy}
              style={{
                padding: '2px 8px',
                fontSize: 11,
                cursor: actionBusy ? 'not-allowed' : 'pointer',
                border: '1px solid #ccc',
                borderRadius: 4,
                background: '#fff',
                color: '#555',
              }}
              aria-label="Refresh companion status"
            >
              Refresh
            </button>
          </div>

          {/* Version info */}
          {versionInfo && (
            <div
              style={{
                fontSize: 11,
                color: '#999',
                marginBottom: 12,
                padding: '6px 10px',
                background: '#f5f5f5',
                borderRadius: 4,
              }}
            >
              Companion: v{versionInfo.service_version} · API: v{versionInfo.api_version}{' '}
              · Expected API: v{EXPECTED_API_VERSION}
              {!versionInfo.compatible && (
                <span style={{ color: colors.red, fontWeight: 600 }}>
                  {' '}— Incompatible
                </span>
              )}
            </div>
          )}

          {/* Localhost permission warning */}
          {!localhostPermitted && (
            <div
              style={{
                padding: '8px 12px',
                background: colors.warningBg,
                border: '1px solid #e6a817',
                borderRadius: 6,
                marginBottom: 12,
                fontSize: 12,
                color: '#8a6d14',
              }}
              role="alert"
            >
              ⚠️ Localhost permission is required for the companion connection.{' '}
              <button
                type="button"
                onClick={() => void requestLocalhostPermission().then((ok) => setLocalhostPermitted(ok))}
                style={{
                  border: 'none',
                  background: 'none',
                  color: colors.blue,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                  fontSize: 12,
                }}
              >
                Grant permission
              </button>
            </div>
          )}

          {/* Action buttons */}
          {status === 'connected' && (
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={actionBusy}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                cursor: actionBusy ? 'not-allowed' : 'pointer',
                border: '1px solid #c44',
                borderRadius: 4,
                background: '#fff',
                color: '#c44',
                fontWeight: 600,
                opacity: actionBusy ? 0.6 : 1,
              }}
            >
              {actionBusy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          )}

          {(status === 'unpaired' || status === 'error') && (
            <button
              type="button"
              onClick={() => void handlePair()}
              disabled={actionBusy}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                cursor: actionBusy ? 'not-allowed' : 'pointer',
                border: '1px solid #4a90d9',
                borderRadius: 4,
                background: '#4a90d9',
                color: '#fff',
                fontWeight: 600,
                opacity: actionBusy ? 0.6 : 1,
              }}
            >
              {actionBusy ? 'Starting…' : 'Pair'}
            </button>
          )}

          {/* Pairing code entry form */}
          {status === 'pairing' && pairingForm && (
            <div
              style={{
                padding: 14,
                border: '1px solid #4a90d9',
                borderRadius: 8,
                background: '#f0f6ff',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#333' }}>
                Enter Pairing Code
              </div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>
                Check the companion terminal for the six-digit code.
                Expires in {Math.max(0, Math.ceil((pairingForm.expiresAt - Date.now()) / 1000))}s.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pairingCode}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setPairingCode(digits);
                  }}
                  placeholder="000000"
                  disabled={actionBusy}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    fontSize: 14,
                    fontFamily: 'monospace',
                    letterSpacing: 4,
                    textAlign: 'center',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                  }}
                  aria-label="Six-digit pairing code"
                />
                <button
                  type="button"
                  onClick={() => void handleConfirmPairing()}
                  disabled={actionBusy || pairingCode.length !== 6}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    cursor: actionBusy || pairingCode.length !== 6 ? 'not-allowed' : 'pointer',
                    border: '1px solid #4a90d9',
                    borderRadius: 4,
                    background: '#4a90d9',
                    color: '#fff',
                    fontWeight: 600,
                    opacity: actionBusy || pairingCode.length !== 6 ? 0.6 : 1,
                  }}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={handleCancelPairing}
                  disabled={actionBusy}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    cursor: actionBusy ? 'not-allowed' : 'pointer',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    background: '#fff',
                    color: '#555',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
