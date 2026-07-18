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

  const { first_name, last_name, company, email, phone, message } = req.body || {};

  if (!first_name || !last_name || !company || !email || !phone || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (!/^\+[\d\s\-().]{6,20}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  const webhookUrl   = process.env.CAPTHER_WEBHOOK_URL;
  const webhookToken = process.env.CAPTHER_WEBHOOK_TOKEN;

  if (!webhookUrl || !webhookToken) {
    return res.status(500).json({ error: 'Outbound calling not configured on server' });
  }

  try {
    const url = webhookUrl
      + '?token=' + encodeURIComponent(webhookToken)
      + '&type=outbound_contact_form';

    // Capther's webhook is the single source of truth for placing the call and
    // recording the submission — it owns both, so this request replaces what
    // used to be a direct call to Retell plus a direct Supabase insert here.
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name, last_name, company, email, phone, message })
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.error('[FinEX] Capther webhook call failed:', JSON.stringify(data));
      return res.status(500).json({ error: data.error || 'Failed to initiate call' });
    }

    console.log('[FinEX] Outbound call requested via Capther:', JSON.stringify(data));
    res.json({ success: true, call_id: data.call_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
