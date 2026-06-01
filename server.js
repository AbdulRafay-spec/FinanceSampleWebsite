'use strict';
require('dotenv').config();

const express = require('express');
const path    = require('path');
const https   = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Returns VAPI connection config to the browser.
// The public key is intentionally limited — it can only start voice calls,
// not read account data or make any other API changes.
// The private key (for server-side call management) never leaves this file.
app.post('/api/vapi-config', (req, res) => {
  const key       = process.env.VAPI_PUBLIC_KEY;
  const assistant = process.env.VAPI_ASSISTANT_ID;

  if (!key || !assistant) {
    console.error('[FinEX] Missing VAPI_PUBLIC_KEY or VAPI_ASSISTANT_ID in .env');
    return res.status(500).json({ error: 'VAPI not configured on server' });
  }

  res.json({ key, assistant });
});

// Quick health check — open http://localhost:3000/api/health in your browser to verify .env is loaded
app.get('/api/health', (req, res) => {
  res.json({
    vapi_public_key_set:   !!process.env.VAPI_PUBLIC_KEY,
    vapi_assistant_id_set: !!process.env.VAPI_ASSISTANT_ID,
    retell_api_key_set:    !!process.env.RETELL_API_KEY,
    retell_agent_id_set:   !!process.env.RETELL_AGENT_ID,
  });
});

// Creates a Retell web-call and returns the ephemeral access_token to the browser.
// The private Retell API key never leaves this server.
app.post('/api/retell-call', (req, res) => {
  const apiKey  = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_AGENT_ID;

  if (!apiKey || !agentId) {
    console.error('[FinEX] Missing RETELL_API_KEY or RETELL_AGENT_ID in .env');
    return res.status(500).json({ error: 'Retell not configured on server' });
  }

  const payload = JSON.stringify({ agent_id: agentId });
  const options = {
    hostname: 'api.retellai.com',
    path:     '/v2/create-web-call',
    method:   'POST',
    headers: {
      'Authorization':  'Bearer ' + apiKey,
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => data += chunk);
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (apiRes.statusCode >= 400) {
          return res.status(500).json({ error: parsed.error_message || 'Retell API error' });
        }
        res.json({ access_token: parsed.access_token, call_id: parsed.call_id });
      } catch {
        res.status(500).json({ error: 'Invalid response from Retell API' });
      }
    });
  });

  apiReq.on('error', (e) => res.status(500).json({ error: e.message }));
  apiReq.write(payload);
  apiReq.end();
});

// Injects widget form data into an active Retell web call via override_dynamic_variables
app.post('/api/retell-inject', require('./api/retell-inject'));

// Retell Custom Function endpoint — called by the agent mid-call to check form submission status
app.post('/api/check-form', require('./api/check-form'));

// Triggers a Retell outbound phone call and passes caller context as dynamic variables
app.post('/api/outbound-call', async (req, res) => {
  const { name, company, email, phone, message } = req.body || {};

  if (!name || !company || !email || !phone || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const apiKey     = process.env.RETELL_API_KEY;
  const agentId    = process.env.RETELL_OUTBOUND_AGENT_ID;
  const fromNumber = process.env.RETELL_FROM_NUMBER;

  if (!apiKey || !agentId || !fromNumber) {
    console.error('[FinEX] Missing RETELL_API_KEY, RETELL_AGENT_ID, or RETELL_FROM_NUMBER in .env');
    return res.status(500).json({ error: 'Outbound calling not configured' });
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
        to_number: phone,
        agent_id: agentId,
        retell_llm_dynamic_variables: {
          name:    name,
          company: company,
          email:   email,
          phone:   phone,
          message: message
        }
      })
    });

    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data.error_message || 'Failed to initiate call' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Export app for Vercel's serverless runtime
module.exports = app;

// Local development only — Vercel ignores this
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n  FinEX server running → http://localhost:${PORT}\n`);
  });
}
