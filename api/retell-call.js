'use strict';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey  = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_AGENT_ID;

  if (!apiKey || !agentId) {
    console.error('[FinEX] Missing RETELL_API_KEY or RETELL_AGENT_ID in env');
    return res.status(500).json({ error: 'Retell not configured on server' });
  }

  try {
    const r = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agent_id: agentId })
    });

    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return res.status(500).json({ error: body.error_message || 'Retell API error' });
    }

    const data = await r.json();
    res.json({ access_token: data.access_token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
