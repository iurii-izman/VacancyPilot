/** Shared wording and validation for the only local Applied confirmation. */
export const NATIVE_HH_SUBMISSION_CONFIRMATION =
  "I submitted this application on HH";

export function isNativeHhSubmissionConfirmed(value: unknown): value is true {
  return value === true;
}
