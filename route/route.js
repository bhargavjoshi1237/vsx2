const gemini = require("./geminiclient");
const modes = require("../modes");

function createRouter() {
  function getApiKey() {
    try {
      const vscode = require("vscode");
      const key = vscode.workspace.getConfiguration("vsx").get("apiKey.gemini");
      return key || null;
    } catch {
      return null;
    }
  }

  async function getModels() {
    let geminiModels = [];
    let nvidiaModels = [];
    try {
      if (typeof gemini.getModels === "function")
        geminiModels = gemini.getModels() || [];
    } catch {
      geminiModels = [];
    }
    try {
      if (typeof nvidia.getModels === "function")
        nvidiaModels = nvidia.getModels() || [];
    } catch {
      nvidiaModels = [];
    }

    const combined = [];
    if (Array.isArray(geminiModels) && geminiModels.length)
      combined.push(...geminiModels);
    if (Array.isArray(nvidiaModels) && nvidiaModels.length)
      combined.push(...nvidiaModels);
    return {
      flatList: combined,
      byId: combined.reduce((acc, m) => {
        acc[m.id] = m;
        return acc;
      }, {}),
    };
  }

  async function sendPrompt(modelId, prompt) {
    try {
      const models = await getModels();
      const byId = models.byId || {};
      const modelMeta = modelId && byId[modelId] ? byId[modelId] : null;
      const looksLikeNvidia = typeof modelId === 'string' && modelId.includes('/');
      if ((modelMeta && modelMeta.provider === 'nvidia') || (!modelMeta && looksLikeNvidia)) {
        return await sendPromptNvidia(modelId, prompt);
      }
    } catch {
    }

    const apiKey = getApiKey();
    if (!apiKey) throw new Error("Gemini API key not configured");
    const parts = Array.isArray(prompt) ? prompt : [prompt];
    const resp = await gemini.callGemini(apiKey, modelId || "", parts);
    function extractTextFromResponse(r) {
      try {
        if (!r) return "";
        if (Array.isArray(r.candidates)) {
          const texts = [];
          for (const cand of r.candidates) {
            const content = cand.content;
            if (!content) continue;
            let partsArr = null;
            if (Array.isArray(content)) partsArr = content;
            else if (content.parts && Array.isArray(content.parts))
              partsArr = content.parts;
            if (partsArr) {
              for (const p of partsArr) {
                if (!p) continue;
                if (typeof p === "string") texts.push(p);
                else if (typeof p.text === "string") texts.push(p.text);
                else if (typeof p.content === "string") texts.push(p.content);
              }
            } else if (typeof cand.text === "string") {
              texts.push(cand.text);
            }
          }

          if (texts.length > 0) return texts.join("\n").trim();
        }
        if (r.output && typeof r.output === "string") return r.output.trim();
        if (r.message && typeof r.message === "string") return r.message.trim();
        return JSON.stringify(r);
      } catch {
        return JSON.stringify(r);
      }
    }
    const text = extractTextFromResponse(resp);
    return { raw: resp, text };
  }
  const nvidia = require("./nvidiaclient");
  function getNvidiaApiKey() {
    try {
      const vscode = require("vscode");
      const key = vscode.workspace.getConfiguration("vsx").get("apiKey.nvidia");
      return key || null;
    } catch {
      return null;
    }
  }

  async function sendPromptNvidia(modelId, prompt) {
    const apiKey = getNvidiaApiKey();
    if (!apiKey) throw new Error("NVIDIA API key not configured");

    const parts = Array.isArray(prompt) ? prompt : [prompt];
    const resp = await nvidia.callNvidia(apiKey, modelId, parts);

    function extractTextFromNvidia(r) {
      try {
        if (!r) return "";
        if (Array.isArray(r.choices)) {
          const texts = [];
          for (const c of r.choices) {
            if (c && c.message) {
              if (typeof c.message === "string") texts.push(c.message);
              else if (typeof c.message.content === "string")
                texts.push(c.message.content);
              else if (Array.isArray(c.message.content))
                texts.push(c.message.content.join("\n"));
            } else if (typeof c.text === "string") {
              texts.push(c.text);
            }
          }
          if (texts.length) return texts.join("\n").trim();
        }

        if (r.output && typeof r.output === "string") return r.output.trim();
        if (r.message && typeof r.message === "string") return r.message.trim();

        return JSON.stringify(r);
      } catch {
        return JSON.stringify(r);
      }
    }

    const text = extractTextFromNvidia(resp);
    return { raw: resp, text };
  }

  return {
    getModels,
    sendPrompt,
    sendPromptNvidia,

    listModes: modes.listModes,
    getModeById: modes.getModeById,
    runMode: async function (modeId, ctx) {
      const m = modes.getModeById(modeId);
      if (!m) throw new Error("Unknown mode: " + modeId);
      return await m.execute(ctx);
    },
    runProcedure: async function (name) {
      return { error: "no-procedure-implemented", name };
    },
  };
}

module.exports = {
  createRouter,
};
