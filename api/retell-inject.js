'use strict';

const { isRateLimited, getIp, isAllowedOrigin } = require('./_security');
const { getSupabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const origin = req.headers['origin'] || req.headers['referer'] || '';
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: 'Forbidden' });

  const ip = getIp(req);
  if (isRateLimited('inject:' + ip, 10, 60_000)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { call_id, first_name, last_name, company, email, phone } = req.body || {};
  if (!call_id) return res.status(400).json({ error: 'call_id is required' });

  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Retell not configured on server' });

  try {
    // 1. Inject form data into the live Retell call
    const r = await fetch('https://api.retellai.com/v2/update-call/' + encodeURIComponent(call_id), {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        override_dynamic_variables: {
          form_first_name:        first_name || '',
          form_last_name:         last_name  || '',
          form_company:           company    || '',
          form_email:             email      || '',
          form_phone:             phone      || '',
          form_inbound_submitted: 'true'
        }
      })
    });

    const body = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(500).json({ error: body.error_message || 'Retell update failed' });

    // 2. Save to Supabase — fire and forget (don't block the response)
    try {
      const supabase = getSupabase();
      const { error: dbError } = await supabase
        .from('voice_widget_retell_form_submission')
        .insert({
          first_name: first_name || '',
          last_name:  last_name  || '',
          company:    company    || '',
          email:      email      || '',
          phone:      phone      || '',
          call_id:    call_id
        });
      if (dbError) console.error('[FinEX] Supabase insert error (widget form):', dbError.message);
    } catch (dbErr) {
      console.error('[FinEX] Supabase unavailable (widget form):', dbErr.message);
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
