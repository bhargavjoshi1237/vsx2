const https = require('https');

function ensureApiKey(apiKey) {
  if (!apiKey) throw new Error('GEMINI_API_KEY not provided');
}

function callGemini(apiKey, modelId, promptParts) {
  ensureApiKey(apiKey);

  return new Promise((resolve, reject) => {
    const payload = {
      contents: [
        {
          parts: promptParts.map(text => ({ text }))
        }
      ]
    };

    const data = JSON.stringify(payload);

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-goog-api-key': apiKey
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (err) {
          reject(new Error('Failed to parse Gemini response: ' + err.message + ' -- raw: ' + body));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

function getModels() {
  return [
    // { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini' }
  ];
}

module.exports = {
  callGemini,
  getModels
};
