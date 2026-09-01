/** Minimal AOPS-10 HH public API controls for the existing Settings surface. */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getOpsClient } from '@/services/companion-service';
import type { HHSearchProfile, HHVacancySyncResponse } from '@/adapters/companion/types';

export function describeSyncErrors(
  errors: HHVacancySyncResponse['data']['errors'],
  profiles: Array<Pick<HHSearchProfile, 'id' | 'name'>>,
): string[] {
  const names = new Map(profiles.map((profile) => [profile.id, profile.name]));
  return errors.map(({ profile_id, code }) => `${names.get(profile_id) ?? profile_id}: ${code}`);
}

export function HHIntegrationSection(): ReactNode {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [profiles, setProfiles] = useState<HHSearchProfile[]>([]);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [summary, setSummary] = useState<HHVacancySyncResponse['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const client = getOpsClient();
      const status = await client.hhStatus();
      setConfigured(status.data.application_token_configured);
      const listed = await client.listHHSearchProfiles();
      setProfiles(listed.data);
    } catch {
      setError('HH integration is unavailable. Check the local companion.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!name.trim() || !query.trim()) return;
    setBusy(true); setError(null);
    try {
      await getOpsClient().createHHSearchProfile({
        name: name.trim(), query: { schema_version: 1, text: query.trim() }, enabled: true,
      });
      setName(''); setQuery(''); await load();
    } catch { setError('Could not save the search profile.'); }
    finally { setBusy(false); }
  };

  const sync = async () => {
    setBusy(true); setError(null);
    try { setSummary((await getOpsClient().syncHHVacancies()).data); }
    catch { setError('HH vacancy sync failed.'); }
    finally { setBusy(false); }
  };

  return (
    <section aria-label="HH Integration" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #eee' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>HH Integration</h3>
      <p style={{ fontSize: 11, color: '#777', margin: '0 0 10px' }}>
        Official vacancy search through the local companion. No applications or messages are sent.
      </p>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        Application API: <strong>{configured === null ? 'Checking…' : configured ? 'Configured' : 'Not configured'}</strong>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input aria-label="Search profile name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Profile name" style={{ flex: 1 }} />
        <input aria-label="Vacancy search text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search text" style={{ flex: 1 }} />
        <button type="button" onClick={() => void create()} disabled={busy || !name.trim() || !query.trim()}>Add</button>
      </div>
      {profiles.length > 0 && <ul style={{ fontSize: 11, margin: '0 0 8px', paddingLeft: 18 }}>{profiles.map((profile) => <li key={profile.id}>{profile.name} {profile.enabled ? '(enabled)' : '(disabled)'}</li>)}</ul>}
      <button type="button" onClick={() => void sync()} disabled={busy || configured !== true}>Sync now</button>
      {summary && (
        <div role="status" style={{ fontSize: 11, marginTop: 8 }}>
          <div>
            Last sync: {summary.status}; seen {summary.items_seen}, created {summary.vacancies_created}, updated {summary.vacancies_updated}, unchanged {summary.vacancies_unchanged}; errors {summary.errors.length}.
          </div>
          {summary.errors.length > 0 && (
            <ul aria-label="HH sync errors" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {describeSyncErrors(summary.errors, profiles).map((message) => <li key={message}>{message}</li>)}
            </ul>
          )}
        </div>
      )}
      {error && <div role="alert" style={{ color: '#a33', fontSize: 11, marginTop: 8 }}>{error}</div>}
    </section>
  );
}
