'use strict';

const { isRateLimited, getIp, isAllowedOrigin } = require('./_security');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const origin = req.headers['origin'] || req.headers['referer'] || '';
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: 'Forbidden' });

  const ip = getIp(req);
  if (isRateLimited('outbound:' + ip, 3, 60_000)) {
    return res.status(429).json({ error: 'Too many requests — please wait a moment' });
  }

  const { name, company, email, phone, message } = req.body || {};

  if (!name || !company || !email || !phone || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (!/^\+[\d\s\-().]{6,20}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  const apiKey     = process.env.RETELL_API_KEY;
  const agentId    = process.env.RETELL_OUTBOUND_AGENT_ID;
  const fromNumber = process.env.RETELL_FROM_NUMBER;

  if (!apiKey || !agentId || !fromNumber) {
    return res.status(500).json({ error: 'Outbound calling not configured on server' });
  }

  try {
    const r = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from_number: fromNumber,
        to_number:   phone,
        agent_id:    agentId,
        retell_llm_dynamic_variables: { name, company, email, phone, message }
      })
    });

    const retellBody = await r.json().catch(() => ({}));

    if (!r.ok) {
      return res.status(500).json({ error: retellBody.error_message || 'Failed to initiate call' });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
