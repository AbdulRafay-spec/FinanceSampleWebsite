'use strict';

const { isRateLimited, getIp, isAllowedOrigin } = require('./_security');

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Block requests from unknown origins (prevents other sites abusing your API key)
  const origin = req.headers['origin'] || req.headers['referer'] || '';
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Rate limit: max 5 call creations per IP per minute
  // Each call costs money — this is the most important limit
  const ip = getIp(req);
  if (isRateLimited('retell:' + ip, 5, 60_000)) {
    return res.status(429).json({ error: 'Too many requests — please wait a moment' });
  }

  const apiKey  = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_AGENT_ID;

  if (!apiKey || !agentId) {
    console.error('[FinEX] Missing RETELL_API_KEY or RETELL_AGENT_ID in env');
    return res.status(500).json({ error: 'Retell not configured on server' });
  }

  try {
    const r = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agent_id: agentId })
    });

    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return res.status(500).json({ error: body.error_message || 'Retell API error' });
    }

    const data = await r.json();
    res.json({ access_token: data.access_token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
