/**
 * Redaction helpers — strip sensitive data before external transmission.
 *
 * Section 20.3: remove emails, phones, unnecessary URLs, tokens, hidden metadata.
 * These are pure functions: no side effects, no I/O, no dependencies.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const PHONE_PATTERNS: RegExp[] = [
  // Russian: +7 (999) 123-45-67, 8 999 123 45 67, +7-999-123-45-67
  /(?:\+7|8)[\s()-]*\d{3}[\s()-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g,
  // International: +1-555-123-4567, +44 20 1234 5678
  /\+\d{1,3}[\s-]*\d{2,4}[\s-]*\d{2,4}[\s-]*\d{2,4}[\s-]*\d{2,4}/g,
  // Plain digits: 89991234567 (11-digit Russian mobile)
  /(?<!\d)8\d{10}(?!\d)/g,
];

const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

const TOKEN_PATTERNS: RegExp[] = [
  // JWT-like: eyJ... (three base64url segments)
  /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  // API key patterns: sk-..., rk-..., pk-..., ak-...
  /\b[a-z]{2,4}_[a-zA-Z0-9]{20,}\b/g,
  // Hex tokens (40+ hex chars — SHA1 length and above; avoids MD5/UUID false positives)
  /\b[a-fA-F0-9]{40,}\b/g,
  // Bearer tokens in text
  /bearer\s+[a-zA-Z0-9._-]+/gi,
  // session IDs
  /session[=:]\s*[a-zA-Z0-9_-]+/gi,
  // csrf tokens
  /csrf[=:]\s*[a-zA-Z0-9_-]+/gi,
];

/**
 * Remove email addresses from text.
 */
export function redactEmails(text: string): string {
  return text.replace(EMAIL_RE, "[email redacted]");
}

/**
 * Remove phone numbers from text.
 */
export function redactPhones(text: string): string {
  let result = text;
  for (const re of PHONE_PATTERNS) {
    result = result.replace(re, "[phone redacted]");
  }
  return result;
}

/**
 * Remove URLs from text.
 */
export function redactUrls(text: string): string {
  return text.replace(URL_RE, "[url redacted]");
}

/**
 * Remove token-like patterns (JWT, API keys, bearer tokens, session IDs) from text.
 */
export function redactTokens(text: string): string {
  let result = text;
  for (const re of TOKEN_PATTERNS) {
    result = result.replace(re, "[token redacted]");
  }
  return result;
}

/**
 * Redact contact information: emails + phones.
 * Used when `settings.privacy.redactContacts` is enabled.
 */
export function redactContacts(text: string): string {
  return redactPhones(redactEmails(text));
}

/**
 * Full redaction — emails, phones, URLs, and tokens.
 * Apply to all AI-bound text by default.
 */
export function redactText(text: string): string {
  return redactTokens(redactUrls(redactPhones(redactEmails(text))));
}

/**
 * Base redaction for AI-bound text that always removes URLs and token-like data.
 * Contact redaction is optional and controlled by settings at the builder layer.
 */
export function redactBaseText(text: string): string {
  return redactTokens(redactUrls(text));
}

/**
 * Truncate description to a maximum character count while keeping whole words.
 *
 * @param text — the text to truncate
 * @param maxChars — maximum allowed characters (default 3000)
 * @param suffix — string appended when truncation occurs
 */
export function truncateDescription(
  text: string,
  maxChars = 3000,
  suffix = "…",
): string {
  if (text.length <= maxChars) return text;

  // Try to break at the last space before maxChars
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.8) {
    return cut.slice(0, lastSpace) + suffix;
  }
  return cut + suffix;
}
