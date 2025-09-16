const https = require("https");

function ensureApiKey(apiKey) {
  if (!apiKey) throw new Error("NVIDIA_API_KEY not provided");
}

const modelConfigs = {
  "qwen/qwen3-next-80b-a3b-thinking": {
    path: "/v1/chat/completions",
    temperature: 0.6,
    top_p: 0.7,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: 4096,
    stream: true,
  },
  "deepseek-ai/deepseek-v3.1": {
    path: "/v1/chat/completions",
    temperature: 0.2,
    top_p: 0.7,
    max_tokens: 8192,
    seed: 42,
    stream: true,
    chat_template_kwargs: { thinking: true },
  },
  "qwen/qwen3-coder-480b-a35b-instruct": {
    path: "/v1/chat/completions",
    temperature: 0.7,
    top_p: 0.8,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: 4096,
    stream: true,
  },
  "nvidia/nvidia-nemotron-nano-9b-v2": {
    path: "/v1/chat/completions",
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 2048,
    min_thinking_tokens: 1024,
    max_thinking_tokens: 2048,
    stream: true,
    add_system_think: true,
  },
  "moonshotai/kimi-k2-instruct": {
    path: "/v1/chat/completions",
    temperature: 0.6,
    top_p: 0.9,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: 4096,
    stream: true,
  },
  "openai/gpt-oss-120b": {
    path: "/v1/chat/completions",
    temperature: 1,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: 4096,
    stream: true,
    reasoning_effort: "medium",
  },
  "openai/gpt-oss-20b": {
    path: "/v1/chat/completions",
    temperature: 1,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: 4096,
    stream: true,
    reasoning_effort: "medium",
  },
};

function findConfig(modelId) {
  if (modelConfigs[modelId]) return modelConfigs[modelId];
  if (modelId.startsWith("openai/gpt-oss"))
    return modelConfigs["openai/gpt-oss-120b"];
  if (modelId.startsWith("qwen/"))
    return modelConfigs["qwen/qwen3-next-80b-a3b-thinking"];
  return {
    path: "/v1/chat/completions",
    temperature: 0.6,
    top_p: 0.7,
    max_tokens: 4096,
    stream: true,
  };
}

function buildPayload(modelId, promptParts) {
  const cfg = findConfig(modelId);
  const prompts = promptParts || [];

  if (cfg.path === "/v1/responses") {
    const payload = {
      model: modelId,
      input: prompts.length ? prompts : [""],
      max_output_tokens: cfg.max_output_tokens || cfg.max_tokens || 4096,
      top_p: cfg.top_p,
      temperature: cfg.temperature,
      stream: !!cfg.stream,
    };
    return payload;
  }

  const messages = [];
  if (cfg.add_system_think) {
    messages.push({ role: "system", content: "/think" });
  }
  for (const text of prompts) {
    messages.push({ role: "user", content: text });
  }
  if (messages.length === 0) messages.push({ role: "user", content: "" });

  const payload = {
    model: modelId,
    messages,
    temperature: cfg.temperature,
    top_p: cfg.top_p,
    frequency_penalty: cfg.frequency_penalty,
    presence_penalty: cfg.presence_penalty,
    max_tokens: cfg.max_tokens,
    stream: !!cfg.stream,
  };

  if (cfg.seed !== undefined) payload.seed = cfg.seed;
  if (cfg.chat_template_kwargs !== undefined)
    payload.chat_template_kwargs = cfg.chat_template_kwargs;
  if (cfg.min_thinking_tokens !== undefined)
    payload.min_thinking_tokens = cfg.min_thinking_tokens;
  if (cfg.max_thinking_tokens !== undefined)
    payload.max_thinking_tokens = cfg.max_thinking_tokens;

  if (cfg.reasoning_effort !== undefined)
    payload.reasoning_effort = cfg.reasoning_effort;

  return payload;
}

function callNvidia(apiKey, modelId, promptParts) {
  ensureApiKey(apiKey);

  const cfg = findConfig(modelId);
  const payload = buildPayload(modelId, promptParts);
  const data = JSON.stringify(payload);

  const options = {
    hostname: "integrate.api.nvidia.com",
    path: cfg.path || "/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {

        if (res.statusCode >= 400) {
          return reject(
            new Error(`NVIDIA API error ${res.statusCode}: ${body}`)
          );
        }
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch {
          resolve({ raw: body, status: res.statusCode, headers: res.headers });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

function getModels() {
  return [
    {
      id: "qwen/qwen3-next-80b-a3b-thinking",
      name: "Qwen 3 Next 80B (NVIDIA)",
      provider: "nvidia",
    },
    {
      id: "deepseek-ai/deepseek-v3.1",
      name: "DeepSeek V3.1",
      provider: "nvidia",
    },
    {
      id: "qwen/qwen3-coder-480b-a35b-instruct",
      name: "Qwen 3 Coder 480B Instruct",
      provider: "nvidia",
    },
    {
      id: "moonshotai/kimi-k2-instruct",
      name: "Moonshot Kimi K2 Instruct",
      provider: "nvidia",
    },
    {
      id: "nvidia/nvidia-nemotron-nano-9b-v2",
      name: "NVIDIA Nemotron Nano 9B V2",
      provider: "nvidia",
    },
    {
      id: "openai/gpt-oss-120b",
      name: "GPT-OSS 120B (openai) via NVIDIA",
      provider: "nvidia",
    },
    {
      id: "openai/gpt-oss-20b",
      name: "GPT-OSS 20B (openai) via NVIDIA",
      provider: "nvidia",
    },
  ];
}

module.exports = { callNvidia, getModels };
