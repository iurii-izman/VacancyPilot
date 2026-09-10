/**
 * Canonical HH vacancy URL boundary.
 *
 * The extension currently supports hh.ru and its existing regional
 * subdomains through HTTPS content-script matches.  Every value that came
 * from a link, storage, or a message must pass this boundary before it is
 * used for vacancy identity or external navigation.
 */

export const HH_CANONICAL_HOST = "hh.ru";

export interface CanonicalHhVacancy {
  vacancyId: string;
  url: string;
  hostname: string;
}

export function isSupportedHhHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === HH_CANONICAL_HOST ||
    normalized.endsWith(`.${HH_CANONICAL_HOST}`)
  );
}

function parseVacancyPath(pathname: string): string | null {
  const match = pathname.match(/^\/vacancy\/(\d+)\/?$/i);
  return match?.[1] ?? null;
}

/**
 * Parse a direct HH vacancy URL or a relative vacancy link.
 *
 * Query strings and fragments are intentionally discarded.  Protocol
 * relative values are rejected instead of inheriting a caller-controlled
 * scheme.  Nested redirect parameters are handled by
 * ``extractHhVacancyIdFromHref`` below, not by this direct parser.
 */
export function parseCanonicalHhVacancyUrl(
  value: string | URL | null | undefined,
  baseUrl = "https://hh.ru",
): CanonicalHhVacancy | null {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw || raw.startsWith("//")) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw, baseUrl);
  } catch {
    return null;
  }

  // URL normalizes an explicit default port away. Keep the boundary strict by
  // rejecting a port before parsing can erase that distinction.
  const authority = raw.match(/^https:\/\/([^/?#]+)/i)?.[1];
  const hostPort = authority?.slice(authority.lastIndexOf("@") + 1);
  if (hostPort?.includes(":")) return null;

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !isSupportedHhHostname(parsed.hostname)
  ) {
    return null;
  }

  const vacancyId = parseVacancyPath(parsed.pathname);
  if (!vacancyId) return null;

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  return {
    vacancyId,
    hostname,
    url: `https://${hostname}/vacancy/${vacancyId}`,
  };
}

/** Return a canonical URL or null when the input is not an approved vacancy. */
export function canonicalizeHhVacancyUrl(
  value: string | URL | null | undefined,
  baseUrl = "https://hh.ru",
): string | null {
  return parseCanonicalHhVacancyUrl(value, baseUrl)?.url ?? null;
}

/** Return a validated HH vacancy ID from a direct URL. */
export function extractHhVacancyIdFromUrl(
  value: string | URL | null | undefined,
  baseUrl = "https://hh.ru",
): string | null {
  return parseCanonicalHhVacancyUrl(value, baseUrl)?.vacancyId ?? null;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Extract a vacancy ID from a search link, including HH's encoded redirect
 * links.  The final identity always comes from the same canonical parser.
 */
export function extractHhVacancyIdFromHref(
  value: string | null | undefined,
  baseUrl = "https://hh.ru",
  depth = 0,
): string | null {
  if (value === null || value === undefined || depth > 3) return null;
  const raw = value.trim();
  if (!raw) return null;

  const direct = extractHhVacancyIdFromUrl(raw, baseUrl);
  if (direct) return direct;

  const decoded = safeDecode(raw);
  if (decoded && decoded !== raw) {
    const decodedId = extractHhVacancyIdFromHref(decoded, baseUrl, depth + 1);
    if (decodedId) return decodedId;
  }

  try {
    const parsed = new URL(raw, baseUrl);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !isSupportedHhHostname(parsed.hostname)
    ) {
      return null;
    }
    for (const parameter of parsed.searchParams.values()) {
      const nestedId = extractHhVacancyIdFromHref(
        parameter,
        baseUrl,
        depth + 1,
      );
      if (nestedId) return nestedId;
    }
  } catch {
    return null;
  }

  return null;
}

/** Validate that an ID and a URL describe exactly the same vacancy. */
export function isCanonicalHhVacancyReference(
  vacancyId: unknown,
  value: unknown,
  baseUrl = "https://hh.ru",
): value is string {
  return (
    typeof vacancyId === "string" &&
    /^\d+$/.test(vacancyId) &&
    typeof value === "string" &&
    parseCanonicalHhVacancyUrl(value, baseUrl)?.vacancyId === vacancyId
  );
}

/** Return true only for an approved HH search page URL. */
export function isHhSearchUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    !parsed.username &&
    !parsed.password &&
    !parsed.port &&
    isSupportedHhHostname(parsed.hostname) &&
    /^\/search\/vacancy\/?$/i.test(parsed.pathname)
  );
}

/** Return true for the HTTPS HH origin set already supported by the extension. */
export function isSupportedHhPageUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      isSupportedHhHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
}
