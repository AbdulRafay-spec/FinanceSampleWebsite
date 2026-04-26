'use strict';
require('dotenv').config();

const express = require('express');
const path    = require('path');

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
  });
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
