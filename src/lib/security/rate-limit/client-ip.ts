/**
 * Trusted client IP resolution and subnet normalization.
 */

function isPrivateIp(ip: string): boolean {
  if (!ip) return false;

  // IPv4 private ranges
  if (ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('192.168.')) {
    return true;
  }
  if (ip.startsWith('169.254.')) {
    return true;
  }
  const match172 = /^172\.(\d+)\./.exec(ip);
  if (match172) {
    const secondOctet = Number.parseInt(match172[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  // IPv6 private / loopback
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
    return true;
  }

  return false;
}

/**
 * Normalizes an IP address for bucket grouping.
 * Valid IPv6 addresses are grouped into their /64 network prefix.
 */
export function normalizeIpForRateLimit(ip: string): string {
  if (!ip || ip.trim() === '') {
    return '0.0.0.0';
  }
  const trimmed = ip.trim();
  if (!trimmed.includes(':')) {
    return trimmed; // IPv4
  }

  // IPv6 normalization: strip zone id if present e.g. %eth0
  const clean = trimmed.split('%')[0].trim();
  const parts = clean.split('::');
  const head = parts[0] ? parts[0].split(':').filter(Boolean) : [];
  const tail = parts.length > 1 && parts[1] ? parts[1].split(':').filter(Boolean) : [];
  const missing = 8 - (head.length + tail.length);
  const full = [...head, ...Array(Math.max(0, missing)).fill('0'), ...tail].map((s) =>
    s.padStart(4, '0').toLowerCase()
  );

  return full.slice(0, 4).join(':') + '::/64';
}

/**
 * Extracts the trusted client IP from HTTP headers following strict precedence.
 */
export function getClientIp(request: Request): string {
  // 1. Vercel edge header when running on Vercel
  if (process.env.VERCEL === '1') {
    const vercelIp = request.headers.get('x-vercel-forwarded-for');
    if (vercelIp) {
      const first = vercelIp.split(',')[0].trim();
      if (first) return first;
    }
  }

  // 2. Cloudflare Connecting IP
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) {
    return cfIp.trim();
  }

  // 3. X-Real-IP
  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  // 4. X-Forwarded-For
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);

    const trustedCountStr = process.env.SHOTISTRY_TRUSTED_PROXY_COUNT;
    const trustedCount = trustedCountStr ? Number.parseInt(trustedCountStr, 10) : NaN;
    if (Number.isInteger(trustedCount) && trustedCount > 0 && hops.length >= trustedCount) {
      return hops[hops.length - trustedCount];
    }

    // Inspect hops from right to left to skip internal/trusted private proxies
    for (let i = hops.length - 1; i >= 0; i--) {
      if (!isPrivateIp(hops[i])) {
        return hops[i];
      }
    }

    // Fallback to first hop if all hops appear private or only 1 hop exists
    if (hops.length > 0) {
      return hops[0];
    }
  }

  return '0.0.0.0';
}
