'use strict';
require('dotenv').config();

const express = require('express');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  FinEX server running → http://localhost:${PORT}\n`);
});
