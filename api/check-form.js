'use strict';

// Retell calls this endpoint mid-call as a Custom Function.
// It reads the call metadata to check if the widget form has been submitted,
// then returns a result string the agent speaks immediately.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { call_id } = req.body || {};
  if (!call_id) return res.json({ result: 'No call ID provided — cannot check form status.' });

  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) return res.json({ result: 'Server configuration error.' });

  try {
    const r = await fetch('https://api.retellai.com/v2/call/' + encodeURIComponent(call_id), {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    });

    if (!r.ok) return res.json({ result: 'Could not retrieve call information.' });

    const call = await r.json().catch(() => ({}));
    const meta = call.metadata || {};

    if (meta.form_submitted) {
      return res.json({
        result:       'Form submitted',
        form_name:    meta.form_name    || '',
        form_company: meta.form_company || '',
        form_email:   meta.form_email   || '',
        form_phone:   meta.form_phone   || ''
      });
    }

    return res.json({ result: 'Form not yet submitted' });

  } catch (e) {
    return res.json({ result: 'Error checking form status.' });
  }
};
