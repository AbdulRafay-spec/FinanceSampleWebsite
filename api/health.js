'use strict';

module.exports = (req, res) => {
  res.json({
    vapi_public_key_set:   !!process.env.VAPI_PUBLIC_KEY,
    vapi_assistant_id_set: !!process.env.VAPI_ASSISTANT_ID,
  });
};
