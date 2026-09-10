/**
 * Compile-time contract checks for the highest-risk Companion operations.
 *
 * This module has no runtime code.  Referencing operation IDs and generated
 * response bodies here makes a server contract rename or shape drift fail the
 * extension typecheck instead of silently widening an adapter cast.
 */

import type { components, operations } from '../../../shared/contracts/generated/openapi-types';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<T extends true> = T;

type FullV4PreviewOperation = operations[
  'vacancy_analyze_api_v1_vacancies__vacancy_id__analyze_post'
];
type FullV4PreviewResponse = FullV4PreviewOperation['responses'][200]['content']['application/json'];
type OpsWorkItemsOperation = operations['ops_work_items_api_v1_ops_work_items_get'];
type OpsWorkItemsResponse = OpsWorkItemsOperation['responses'][200]['content']['application/json'];
type ApplicationFactoryPreviewOperation = operations[
  'preview_session_api_v1_application_sessions_preview_post'
];
type ApplicationFactoryPreviewResponse = ApplicationFactoryPreviewOperation[
  'responses'
][200]['content']['application/json'];
type FollowUpUpdateOperation = operations[
  'update_followup_api_v1_followups__followup_id__patch'
];
type FollowUpUpdateRequest = FollowUpUpdateOperation[
  'requestBody'
]['content']['application/json'];
type FollowUpUpdateResponse = FollowUpUpdateOperation[
  'responses'
][200]['content']['application/json'];
type HhSyncOperation = operations['sync_vacancies_api_v1_hh_sync_vacancies_post'];
type HhSyncRequest = HhSyncOperation['requestBody']['content']['application/json'];
type HhSyncResponse = HhSyncOperation['responses'][200]['content']['application/json'];

export type CriticalWireContracts = {
  fullV4Preview: Assert<Equal<
    FullV4PreviewResponse,
    components['schemas']['AnalyzeResponse'] | components['schemas']['app__analysis__models__PreviewResponse']
  >>;
  opsWorkItems: Assert<Equal<
    OpsWorkItemsResponse,
    components['schemas']['OpsWorkItemResponse']
  >>;
  applicationFactoryPreview: Assert<Equal<
    ApplicationFactoryPreviewResponse,
    components['schemas']['app__api__r5_application_factory__PreviewResponse']
  >>;
  followUpRequest: Assert<Equal<
    FollowUpUpdateRequest,
    components['schemas']['UpdateFollowUpRequest']
  >>;
  followUpResponse: Assert<Equal<
    FollowUpUpdateResponse,
    components['schemas']['FollowUpResponse']
  >>;
  hhSyncRequest: Assert<Equal<
    HhSyncRequest,
    components['schemas']['VacancySyncRequest']
  >>;
  hhSyncResponse: Assert<Equal<
    HhSyncResponse,
    components['schemas']['SyncResponse']
  >>;
  generatedEnums: Assert<Equal<
    components['schemas']['OpsWorkItemMeta']['view'],
    'vacancies' | 'applications' | 'summary'
  >>;
  receiptRemainsNullable: Assert<Equal<
    components['schemas']['PayloadPreview']['receipt'],
    string | null | undefined
  >>;
  dueAtRemainsNullable: Assert<Equal<
    components['schemas']['UpdateFollowUpRequest']['due_at'],
    string | null | undefined
  >>;
};
