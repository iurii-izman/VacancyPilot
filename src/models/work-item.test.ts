import { describe, expect, it } from 'vitest';
import { fromOps } from './work-item';
import type { OpsWorkItem } from '@/adapters/companion/ops-projection-types';
import type { Job } from './job';

const opsFixture: OpsWorkItem = {
  authority: 'ops',
  vacancy_state: 'active',
  vacancy: {
    vacancy_id: 'companion-vacancy-static-test',
    hh_vacancy_id: 'hh-vacancy-static-test',
    source: 'hh',
    source_url: 'https://hh.ru/vacancy/hh-vacancy-static-test',
    title: 'Static projection test',
    company_id: 'company-static-test',
    company_name: 'Static Test Company',
    salary_min: null,
    salary_max: null,
    currency: null,
    city: null,
    work_mode: null,
    experience: null,
    description: null,
    description_hash: null,
    skills: [],
    published_at: null,
    first_seen_at: '2026-09-01T00:00:00Z',
    last_seen_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    archived: false,
    revision: 1,
    hydration_state: 'partial',
  },
  applications: [],
  application_state: 'none',
  analysis: {
    run_id: null,
    state: 'not_analyzed',
    status: null,
    repair_status: null,
    ready: false,
    score: null,
    decision: null,
    confidence: null,
    created_at: null,
  },
  analysis_state: 'not_analyzed',
  follow_ups: [],
  follow_up_state: 'none',
  active_follow_up_count: 0,
  provenance: { hits: [] },
  availability: {
    application: 'available',
    analysis: 'available',
    follow_up: 'available',
    provenance: 'available',
  },
};

function persistStandaloneJob(job: Job): Job {
  return job;
}

describe('WorkItem authority boundary', () => {
  it('keeps Ops identity separate from Standalone persistence identity', () => {
    const view = fromOps(opsFixture);

    expect(view.authority).toBe('ops');
    expect(view.vacancyId).toEqual({
      companionVacancyId: 'companion-vacancy-static-test',
      hhVacancyId: 'hh-vacancy-static-test',
    });
    expect('job' in view).toBe(false);

    // @ts-expect-error Ops presentation is not a Standalone Job persistence record.
    persistStandaloneJob(view);
  });
});
