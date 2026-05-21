'use strict';

const { isRateLimited, getIp, isAllowedOrigin } = require('./_security');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const origin = req.headers['origin'] || req.headers['referer'] || '';
  console.log('[FinEX] outbound-call origin:', origin);

  if (!isAllowedOrigin(origin)) {
    console.error('[FinEX] outbound-call blocked origin:', origin);
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ip = getIp(req);
  if (isRateLimited('outbound:' + ip, 3, 60_000)) {
    console.warn('[FinEX] outbound-call rate limited ip:', ip);
    return res.status(429).json({ error: 'Too many requests — please wait a moment' });
  }

  const { name, company, email, phone, message } = req.body || {};
  console.log('[FinEX] outbound-call body:', { name, company, email, phone: phone ? '***' : undefined, message });

  if (!name || !company || !email || !phone || !message) {
    console.error('[FinEX] outbound-call missing fields:', { name: !!name, company: !!company, email: !!email, phone: !!phone, message: !!message });
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('[FinEX] outbound-call invalid email:', email);
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (!/^\+[\d\s\-().]{6,20}$/.test(phone)) {
    console.error('[FinEX] outbound-call invalid phone:', phone);
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  const apiKey     = process.env.RETELL_API_KEY;
  const agentId    = process.env.RETELL_OUTBOUND_AGENT_ID;
  const fromNumber = process.env.RETELL_FROM_NUMBER;

  console.log('[FinEX] outbound-call env check:', { apiKey: !!apiKey, agentId: !!agentId, fromNumber: !!fromNumber });

  if (!apiKey || !agentId || !fromNumber) {
    console.error('[FinEX] Missing RETELL_API_KEY, RETELL_OUTBOUND_AGENT_ID, or RETELL_FROM_NUMBER');
    return res.status(500).json({ error: 'Outbound calling not configured on server' });
  }

  const payload = {
    from_number: fromNumber,
    to_number:   phone,
    agent_id:    agentId,
    retell_llm_dynamic_variables: { name, company, email, phone, message }
  };
  console.log('[FinEX] outbound-call sending to Retell:', { from: fromNumber, to: phone, agent: agentId });

  try {
    const r = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const retellBody = await r.json().catch(() => ({}));
    console.log('[FinEX] Retell response status:', r.status, 'body:', JSON.stringify(retellBody));

    if (!r.ok) {
      console.error('[FinEX] Retell outbound error:', retellBody);
      return res.status(500).json({ error: retellBody.error_message || 'Failed to initiate call' });
    }

    console.log('[FinEX] outbound-call success, call_id:', retellBody.call_id);
    res.json({ success: true });
  } catch (e) {
    console.error('[FinEX] outbound-call exception:', e.message);
    res.status(500).json({ error: e.message });
  }
};
