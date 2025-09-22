const https = require('https');

function ensureApiKey(apiKey) {
  if (!apiKey) throw new Error('CEREBRAS_API_KEY not provided');
}

const modelConfigs = {
  // modelId (short name) -> config
  'gpt-oss-120b': {
    model: 'gpt-oss-120b',
    max_tokens: 65536,
    temperature: 1,
    top_p: 1,
    stream: true,
    supports_reasoning_effort: true,
  },
  'qwen-3-32b': {
    model: 'qwen-3-32b',
    max_tokens: 16382,
    temperature: 0.6,
    top_p: 0.95,
    stream: true,
  },
  'qwen-3-coder-480b': {
    model: 'qwen-3-coder-480b',
    max_tokens: 40000,
    temperature: 0.7,
    top_p: 0.8,
    stream: true,
  },
  'qwen-3-235b-a22b-instruct-2507': {
    model: 'qwen-3-235b-a22b-instruct-2507',
    max_tokens: 20000,
    temperature: 0.7,
    top_p: 0.8,
    stream: true,
  },
};

function findConfig(modelId) {
  if (!modelId) return modelConfigs['gpt-oss-120b'];
  const short = (String(modelId).includes('/')) ? String(modelId).split('/').pop() : String(modelId);
  if (modelConfigs[short]) return modelConfigs[short];
  return Object.values(modelConfigs)[0];
}

function buildPayload(modelId, promptParts, reasoningEffort) {
  const cfg = findConfig(modelId);
  const modelName = cfg.model;

  const messages = [];
  // Include an empty system message (user samples included system: "")
  messages.push({ role: 'system', content: '' });
  for (const p of (promptParts || [])) {
    messages.push({ role: 'user', content: p });
  }
  if (messages.length === 1) messages.push({ role: 'user', content: '' });

  const payload = {
    model: modelName,
    stream: !!cfg.stream,
    max_tokens: cfg.max_tokens,
    temperature: cfg.temperature,
    top_p: cfg.top_p,
    messages,
  };

  if (cfg.supports_reasoning_effort && reasoningEffort) {
    payload.reasoning_effort = reasoningEffort;
  }

  return payload;
}

function callCerebras(apiKey, modelId, promptParts, reasoningEffort) {
  ensureApiKey(apiKey);
  const payload = buildPayload(modelId, promptParts, reasoningEffort);
  const data = JSON.stringify(payload);

  const options = {
    hostname: 'api.cerebras.ai',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Cerebras API error ${res.statusCode}: ${body}`));
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (err) {
          // If non-JSON (streaming), return raw
          resolve({ raw: body, status: res.statusCode, headers: res.headers });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
}

function getModels() {
  return [
    { id: 'cerebras/gpt-oss-120b', name: 'GPT-OSS 120B (Cerebras)', provider: 'cerebras' },
    { id: 'cerebras/qwen-3-32b', name: 'Qwen 3 32B (Cerebras)', provider: 'cerebras' },
    { id: 'cerebras/qwen-3-coder-480b', name: 'Qwen 3 Coder 480B (Cerebras)', provider: 'cerebras' },
    { id: 'cerebras/qwen-3-235b-a22b-instruct-2507', name: 'Qwen 3 235B Instruct (Cerebras)', provider: 'cerebras' },
  ];
}

module.exports = { callCerebras, getModels };
