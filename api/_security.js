'use strict';

// ── Rate limiting (in-process, per serverless instance) ──────────────────────
// Not distributed, but blocks naive bot spam effectively on warm instances.
const _windows = new Map();

function isRateLimited(key, maxRequests, windowMs) {
  const now    = Date.now();
  const record = _windows.get(key);

  if (!record || now - record.start > windowMs) {
    _windows.set(key, { count: 1, start: now });
    return false;
  }
  if (record.count >= maxRequests) return true;
  record.count += 1;
  return false;
}

// ── IP extraction (works behind Vercel's edge proxy) ─────────────────────────
function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

// ── Origin validation ─────────────────────────────────────────────────────────
// Blocks requests from unknown third-party sites calling your API.
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (origin === 'http://localhost:3000' || origin === 'http://localhost:3001') return true;
  try {
    const { hostname } = new URL(origin);
    // Allow your Vercel domain and any preview deployments
    return hostname.endsWith('.vercel.app') || hostname === 'finex.io';
  } catch {
    return false;
  }
}

module.exports = { isRateLimited, getIp, isAllowedOrigin };
