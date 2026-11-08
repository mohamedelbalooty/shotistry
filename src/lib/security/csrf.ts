import crypto from 'node:crypto';

function collectAllowedOrigins(request: Request): Set<string> {
  const allowed = new Set<string>();
  try {
    const reqUrl = new URL(request.url);
    allowed.add(reqUrl.origin);

    const host = request.headers.get('x-forwarded-host')?.trim() || request.headers.get('host')?.trim();
    if (host) {
      const proto =
        request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
        reqUrl.protocol.replace(':', '') ||
        'https';
      allowed.add(`${proto}://${host}`);
    }
  } catch {
    // Ignore malformed request URL
  }

  for (const configured of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (configured) {
      try {
        allowed.add(new URL(configured).origin);
      } catch {
        // Ignore invalid configured URL
      }
    }
  }

  return allowed;
}

export function validateSameOrigin(request: Request): {
  valid: boolean;
  reason?: string;
} {
  const secFetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return {
      valid: false,
      reason: `FORBIDDEN: Cross-origin request blocked (Sec-Fetch-Site: ${secFetchSite})`,
    };
  }

  const allowedOrigins = collectAllowedOrigins(request);
  const originHeader = request.headers.get('origin')?.trim();
  if (originHeader) {
    if (originHeader === 'null' || !allowedOrigins.has(originHeader)) {
      return {
        valid: false,
        reason: `FORBIDDEN: Origin mismatch (${originHeader})`,
      };
    }
    return { valid: true };
  }

  const refererHeader = request.headers.get('referer')?.trim();
  if (refererHeader) {
    try {
      const refOrigin = new URL(refererHeader).origin;
      if (!allowedOrigins.has(refOrigin)) {
        return {
          valid: false,
          reason: `FORBIDDEN: Referer origin mismatch (${refOrigin})`,
        };
      }
    } catch {
      return {
        valid: false,
        reason: 'FORBIDDEN: Invalid Referer header',
      };
    }
  }

  return { valid: true };
}

export function validateCsrfRequest(
  request: Request,
  expectedCsrfToken: string
): { valid: boolean; reason?: string } {
  const originCheck = validateSameOrigin(request);
  if (!originCheck.valid) {
    return originCheck;
  }

  const providedToken = request.headers.get('x-csrf-token')?.trim() ?? '';
  if (!providedToken || !expectedCsrfToken) {
    return {
      valid: false,
      reason: 'FORBIDDEN: Missing CSRF protection token (x-csrf-token)',
    };
  }

  const providedHash = crypto.createHash('sha256').update(providedToken, 'utf8').digest();
  const expectedHash = crypto.createHash('sha256').update(expectedCsrfToken, 'utf8').digest();

  if (!crypto.timingSafeEqual(providedHash, expectedHash)) {
    return {
      valid: false,
      reason: 'FORBIDDEN: Invalid CSRF protection token',
    };
  }

  return { valid: true };
}
