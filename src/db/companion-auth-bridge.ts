/**
 * Companion client token storage — AOPS-04.
 *
 * The client token is stored in chrome.storage.local but under a separate
 * key from AppSettings so it is never included in normal settings export.
 *
 * Token lifecycle:
 * 1. POST /pair/start → challenge_id
 * 2. POST /pair/confirm → client_token stored here
 * 3. All protected requests include X-VacancyPilot-Client
 * 4. Disconnect → token deleted + POST /pair/revoke
 */

const CLIENT_TOKEN_KEY = 'companion_client_token_v1';
const CLIENT_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function isValidClientToken(token: string): boolean {
  return CLIENT_TOKEN_PATTERN.test(token);
}

/**
 * Load the stored companion client token, or null if not paired.
 */
export async function loadClientToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(CLIENT_TOKEN_KEY);
  const token = result[CLIENT_TOKEN_KEY];
  if (typeof token === 'string' && isValidClientToken(token)) {
    return token;
  }
  return null;
}

/**
 * Persist the companion client token.
 */
export async function saveClientToken(token: string): Promise<void> {
  if (!isValidClientToken(token)) {
    throw new Error('Invalid companion client token');
  }
  await chrome.storage.local.set({ [CLIENT_TOKEN_KEY]: token });
}

/**
 * Delete the stored companion client token.
 */
export async function deleteClientToken(): Promise<void> {
  await chrome.storage.local.remove(CLIENT_TOKEN_KEY);
}
