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
        res.json({ access_token: parsed.access_token });
      } catch {
        res.status(500).json({ error: 'Invalid response from Retell API' });
      }
    });
  });

  apiReq.on('error', (e) => res.status(500).json({ error: e.message }));
  apiReq.write(payload);
  apiReq.end();
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
