'use strict';

// Retell calls this mid-call as a Custom Function.
// The agent passes the current dynamic variables as args — no external API call needed.
module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const args = (req.body || {}).args || {};
  const { form_submitted, form_name, form_company, form_email, form_phone } = args;

  if (form_submitted === 'yes') {
    return res.json({
      result:       'Form submitted',
      form_name:    form_name    || '',
      form_company: form_company || '',
      form_email:   form_email   || '',
      form_phone:   form_phone   || ''
    });
  }

  return res.json({ result: 'Form not yet submitted' });
};
