/**
 * OpsStatusIndicator — AOPS-04.
 *
 * A tiny non-intrusive indicator that shows the companion connection status
 * in existing shell surfaces (side panel, popup, dashboard).
 *
 * Does not create a new dashboard or route. Renders a small colored dot
 * with a tooltip describing the current status.
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { detectCompanionStatus } from '@/services/companion-service';
import type { CompanionStatus } from '@/adapters/companion/types';
// ── Status mapping ─────────────────────────────────────────────────────────

function dotColor(status: CompanionStatus): string {
  switch (status) {
    case 'connected':
      return '#2a8';
    case 'pairing':
      return '#e6a817';
    case 'unpaired':
      return '#4a90d9';
    case 'incompatible-api':
    case 'error':
      return '#c44';
    case 'unavailable':
    default:
      return '#ccc';
  }
}

function tooltipText(status: CompanionStatus): string {
  switch (status) {
    case 'connected':
      return 'Companion connected';
    case 'pairing':
      return 'Companion pairing…';
    case 'unpaired':
      return 'Companion reachable — not paired';
    case 'incompatible-api':
      return 'Companion API version mismatch';
    case 'error':
      return 'Companion error';
    case 'unavailable':
    default:
      return 'Companion offline';
  }
}

// ── Component ──────────────────────────────────────────────────────────────

interface OpsStatusDotProps {
  /** Called when the dot is clicked — opens companion settings. */
  onOpenSettings?: () => void;
}

export function OpsStatusDot({ onOpenSettings }: OpsStatusDotProps): ReactNode {
  const [status, setStatus] = useState<CompanionStatus>('unavailable');
  const [visible, setVisible] = useState(false);

  const refresh = useCallback(async () => {
    // Don't show the indicator if Ops Mode is disabled.
    try {
      const { loadSettings } = await import('@/db/settings-bridge');
      const settings = await loadSettings();
      if (!settings.companion.opsModeEnabled) {
        setVisible(false);
        return;
      }
      setVisible(true);
      const result = await detectCompanionStatus();
      setStatus(result.status);

      // When the companion is (re)connected, flush any queued offline intake
      // entries so captures made while offline are delivered idempotently.
      if (result.status === 'connected') {
        try {
          const { flushOutboxOnReconnect } = await import(
            '@/services/outbox-service'
          );
          const { vacancyIntakeTransport } = await import(
            '@/services/ops-intake'
          );
          await flushOutboxOnReconnect(vacancyIntakeTransport);
        } catch {
          // Connection status is authoritative here. A failed outbox flush is
          // retried on the next poll and must not hide a connected companion.
        }
      }
    } catch {
      setVisible(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    // Poll every 60 seconds.
    const interval = setInterval(() => {
      void refresh();
    }, 60_000);

    return () => clearInterval(interval);
  }, [refresh]);

  // Listen for storage changes that might affect companion status.
  useEffect(() => {
    function onChanged(
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) {
      if (areaName !== 'local') return;
      if (
        changes.app_settings_v1 ||
        changes.companion_client_token_v1
      ) {
        void refresh();
      }
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [refresh]);

  if (!visible) return null;

  return (
    <span
      role="status"
      aria-label={tooltipText(status)}
      title={tooltipText(status)}
      onClick={onOpenSettings}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        cursor: onOpenSettings ? 'pointer' : 'default',
        fontSize: 10,
        color: '#999',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: dotColor(status),
          display: 'inline-block',
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      Ops
    </span>
  );
}
