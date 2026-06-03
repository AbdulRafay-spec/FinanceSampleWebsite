'use strict';

const { isRateLimited, getIp, isAllowedOrigin } = require('./_security');
const { getSupabase } = require('./_supabase');

async function callRetell(apiKey, agentId, fromNumber, phone, first_name, last_name, company, email, message) {
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
      retell_llm_dynamic_variables: { first_name, last_name, company, email, phone, message }
    })
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

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

  const apiKey     = process.env.RETELL_API_KEY;
  const agentId    = process.env.RETELL_OUTBOUND_AGENT_ID;
  const fromNumber = process.env.RETELL_FROM_NUMBER;

  if (!apiKey || !agentId || !fromNumber) {
    return res.status(500).json({ error: 'Outbound calling not configured on server' });
  }

  try {
    let result = await callRetell(apiKey, agentId, fromNumber, phone, first_name, last_name, company, email, message);

    // Retry once after 3s if Retell rejects — handles cold SIP re-registration after inactivity
    if (!result.ok) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      result = await callRetell(apiKey, agentId, fromNumber, phone, first_name, last_name, company, email, message);
    }

    if (!result.ok) {
      console.error('[FinEX] Retell outbound call failed:', JSON.stringify(result.body));
      return res.status(500).json({ error: result.body.error_message || 'Failed to initiate call', retell: result.body });
    }

    console.log('[FinEX] Retell outbound call created:', JSON.stringify(result.body));

    // Save to Supabase — fire and forget (don't block the response)
    try {
      const supabase = getSupabase();
      const { error: dbError } = await supabase
        .from('retell_form_submissions')
        .insert({
          form_first_name: first_name,
          form_last_name:  last_name,
          form_email:      email,
          form_phone:      phone,
          form_company:    company,
          message:         message,
          call_id:         result.body.call_id || null
        });
      if (dbError) console.error('[FinEX] Supabase insert error (contact form):', dbError.message);
    } catch (dbErr) {
      console.error('[FinEX] Supabase unavailable (contact form):', dbErr.message);
    }

    res.json({ success: true, call_id: result.body.call_id, call_status: result.body.call_status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
