'use strict';

const { isRateLimited, getIp, isAllowedOrigin } = require('./_security');

module.exports = (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Block requests from unknown origins
  const origin = req.headers['origin'] || req.headers['referer'] || '';
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Rate limit: max 10 config fetches per IP per minute
  const ip = getIp(req);
  if (isRateLimited('vapi:' + ip, 10, 60_000)) {
    return res.status(429).json({ error: 'Too many requests — please wait a moment' });
  }

  const key       = process.env.VAPI_PUBLIC_KEY;
  const assistant = process.env.VAPI_ASSISTANT_ID;

  if (!key || !assistant) {
    console.error('[FinEX] Missing VAPI_PUBLIC_KEY or VAPI_ASSISTANT_ID in environment variables');
    return res.status(500).json({ error: 'VAPI not configured on server' });
  }

  res.json({ key, assistant });
};
