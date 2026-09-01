/** HH public search controls: compact precision editor, preview and bounded sync. */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getOpsClient } from '@/services/companion-service';
import type { HHSearchProfile, HHVacancySyncResponse } from '@/adapters/companion/types';

const periods = [1, 3, 7, 14, 30] as const;
type ProfileForm = { name: string; text: string; searchField: string; period: number; schedule: string; enabled: boolean };
const blankForm: ProfileForm = { name: '', text: '', searchField: 'name', period: 14, schedule: 'remote', enabled: true };

export function describeSyncErrors(errors: HHVacancySyncResponse['data']['errors'], profiles: Array<Pick<HHSearchProfile, 'id' | 'name'>>): string[] {
  const names = new Map(profiles.map((profile) => [profile.id, profile.name]));
  return errors.map(({ profile_id, code }) => `${names.get(profile_id) ?? profile_id}: ${code}`);
}

function profileForm(profile: HHSearchProfile): ProfileForm {
  const query = profile.query;
  return { name: profile.name, text: typeof query.text === 'string' ? query.text : '', searchField: Array.isArray(query.search_field) && typeof query.search_field[0] === 'string' ? query.search_field[0] : 'name', period: typeof query.period === 'number' ? query.period : 14, schedule: Array.isArray(query.schedule) && typeof query.schedule[0] === 'string' ? query.schedule[0] : 'remote', enabled: profile.enabled };
}

function queryFromForm(form: ProfileForm) {
  return { schema_version: 1, text: form.text.trim(), search_field: [form.searchField], period: form.period, ...(form.schedule ? { schedule: [form.schedule] } : {}) };
}

export function HHIntegrationSection(): ReactNode {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [profiles, setProfiles] = useState<HHSearchProfile[]>([]);
  const [form, setForm] = useState<ProfileForm>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<HHVacancySyncResponse['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const client = getOpsClient(); const [status, listed] = await Promise.all([client.hhStatus(), client.listHHSearchProfiles()]); setConfigured(status.data.application_token_configured); setProfiles(listed.data); setError(null); } catch { setError('HH integration is unavailable. Check the local companion.'); } }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async (event: React.FormEvent) => { event.preventDefault(); if (!form.name.trim() || !form.text.trim()) return; setBusy(true); setError(null); try { const client = getOpsClient(); if (editingId) await client.updateHHSearchProfile(editingId, { revision: profiles.find((p) => p.id === editingId)?.revision ?? 1, name: form.name.trim(), query: queryFromForm(form), enabled: form.enabled }); else await client.createHHSearchProfile({ name: form.name.trim(), query: queryFromForm(form), enabled: form.enabled }); setForm(blankForm); setEditingId(null); await load(); } catch { setError('Could not save the search profile.'); } finally { setBusy(false); } };
  const preview = async (profile: HHSearchProfile) => { setBusy(true); setError(null); try { const result = await getOpsClient().previewHHSearchProfile(profile.id); const value = result.data.found === null ? (result.data.error_code ?? 'ERROR') : `${result.data.found} (${result.data.classification})`; setPreviews((current) => ({ ...current, [profile.id]: value })); } catch { setError('Search preview failed.'); } finally { setBusy(false); } };
  const sync = async () => { setBusy(true); setError(null); try { setSummary((await getOpsClient().syncHHVacancies()).data); } catch { setError('HH vacancy sync failed.'); } finally { setBusy(false); } };
  return <section aria-label="HH Integration" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #eee' }}><h3 style={{ margin: '0 0 6px', fontSize: 14 }}>HH Integration</h3><p style={{ fontSize: 11, color: '#777', margin: '0 0 10px' }}>Official vacancy search through the local companion. No applications or messages are sent.</p><div style={{ fontSize: 12, marginBottom: 8 }}>Application API: <strong>{configured === null ? 'Checking…' : configured ? 'Configured' : 'Not configured'}</strong></div>
    <form onSubmit={(event) => void save(event)} style={{ display: 'grid', gap: 6, marginBottom: 10 }}><input aria-label="Search profile name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Profile name" /><input aria-label="Vacancy search text" value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} placeholder="Search text" /><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><label style={{ fontSize: 11 }}>Search in <select aria-label="Search field" value={form.searchField} onChange={(event) => setForm({ ...form, searchField: event.target.value })}><option value="name">Vacancy title</option><option value="description">Description</option><option value="company_name">Company</option></select></label><label style={{ fontSize: 11 }}>Period <select aria-label="Search period" value={form.period} onChange={(event) => setForm({ ...form, period: Number(event.target.value) })}>{periods.map((value) => <option key={value} value={value}>{value} days</option>)}</select></label><label style={{ fontSize: 11 }}>Schedule <select aria-label="Schedule" value={form.schedule} onChange={(event) => setForm({ ...form, schedule: event.target.value })}><option value="remote">Remote</option><option value="">Any</option></select></label><label style={{ fontSize: 11 }}><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> Enabled</label></div><div><button type="submit" disabled={busy || !form.name.trim() || !form.text.trim()}>{editingId ? 'Save profile' : 'Add profile'}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(blankForm); }}>Cancel</button>}</div></form>
    {profiles.length > 0 && <div style={{ display: 'grid', gap: 5, fontSize: 11 }}>{profiles.map((profile) => <div key={profile.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><strong>{profile.name}</strong><span>{profile.enabled ? 'enabled' : 'disabled'}</span><span>{previews[profile.id] ? `Preview: ${previews[profile.id]}` : 'Preview not run'}</span><button type="button" onClick={() => void preview(profile)} disabled={busy}>Preview</button><button type="button" onClick={() => { setEditingId(profile.id); setForm(profileForm(profile)); }}>Edit</button></div>)}</div>}<button type="button" onClick={() => void sync()} disabled={busy || configured !== true} style={{ marginTop: 10 }}>Sync accepted profiles</button>
    {summary && <div role="status" style={{ fontSize: 11, marginTop: 8 }}><div>Last sync: {summary.status}; errors {summary.errors.length}; too broad {summary.too_broad}.</div><table><thead><tr><th>Name</th><th>Found</th><th>Seen</th><th>Created</th><th>Updated</th><th>Unchanged</th><th>Error</th></tr></thead><tbody>{summary.profiles.map((item) => <tr key={item.profile_id}><td>{item.name}</td><td>{item.found ?? '—'}</td><td>{item.seen}</td><td>{item.created}</td><td>{item.updated}</td><td>{item.unchanged}</td><td>{item.error ?? '—'}</td></tr>)}</tbody></table>{summary.errors.length > 0 && <ul aria-label="HH sync errors">{describeSyncErrors(summary.errors, profiles).map((message) => <li key={message}>{message}</li>)}</ul>}</div>}{error && <div role="alert" style={{ color: '#a33', fontSize: 11, marginTop: 8 }}>{error}</div>}</section>;
}
