'use strict';

// Retell calls this mid-call as a Custom Function.
// We fetch the call's current state directly from the Retell API so the
// function always returns the true live values, regardless of what the
// agent passes as args (which can be stale template snapshots).
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Retell not configured on server' });

  // Retell always sends call metadata in req.body.call
  const callId = req.body?.call?.call_id;

  if (!callId) {
    return res.status(400).json({ error: 'call_id missing from request' });
  }

  try {
    const r = await fetch('https://api.retellai.com/v2/get-call/' + encodeURIComponent(callId), {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    });

    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return res.status(500).json({ error: body.error_message || 'Retell API error' });
    }

    const callData = await r.json();
    const vars = callData.override_dynamic_variables || {};

    if (vars.form_inbound_submitted === 'true') {
      return res.json({
        result:                 'Form submitted',
        form_inbound_submitted: 'true',
        form_first_name:        vars.form_first_name || '',
        form_last_name:         vars.form_last_name  || '',
        form_company:           vars.form_company    || '',
        form_email:             vars.form_email      || '',
        form_phone:             vars.form_phone      || ''
      });
    }

    return res.json({
      result:                 'Form not yet submitted',
      form_inbound_submitted: 'false'
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
