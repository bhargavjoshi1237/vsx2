const gemini = require("./geminiclient");
const nvidia = require("./nvidiaclient");
let cerebras = null;
try { cerebras = require('./cerebrasclient'); } catch { cerebras = null; }
const modes = require("../modes");

function createRouter(context, webviewProvider) {

  function buildWrappedPrompt(userPrompt, modeId) {
    let top = '';
    let bottom = '';
    let fileHeader = '';
    try {
      if (modeId && typeof modes.getModeById === 'function') {
        const m = modes.getModeById(modeId);
        if (m && m.wrappers) {
          top = m.wrappers.top || '';
          bottom = m.wrappers.bottom || '';
          fileHeader = m.wrappers.fileHeader || '';
        }
      }
      if (!top && !bottom && typeof modes.getModeById === 'function') {
        const askMode = modes.getModeById('ask');
        if (askMode && askMode.wrappers) {
          top = askMode.wrappers.top || '';
          bottom = askMode.wrappers.bottom || '';
          fileHeader = askMode.wrappers.fileHeader || fileHeader || '';
        }
      }
    } catch {
    }

    // Simplify workflow: Add concise tool hint for ask/legacy modes to avoid loops
    let toolHint = '';
    if (modeId === 'ask' || modeId === 'legacy') {
      toolHint = '\n\nUse tools like terminal commands only for essential actions; suggest one step at a time and wait for confirmation.';
    }

    // Support passing files as a special marker: if userPrompt is an array and the
    // last element has a `__files` property, treat it specially so we can prepend
    // a file header and JSON-serialize the files for the model.
    if (Array.isArray(userPrompt)) {
      let parts = userPrompt.slice();
      let filesBlock = null;
      if (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (last && typeof last === 'object' && last.__files && Array.isArray(last.files)) {
          filesBlock = last.files;
          parts = parts.slice(0, parts.length - 1);
        }
      }
      let main = parts.join('\n\n');
      if (filesBlock && filesBlock.length) {
        const headerText = fileHeader ? (String(fileHeader) + '\n\n') : '';
        // Safely JSON stringify contents; keep indentation minimal for model consumption
        const filesJson = JSON.stringify(filesBlock);
        main = main + '\n\n' + headerText + filesJson;
      }
      userPrompt = main;
    }

    return `${top}\n\n${userPrompt}${toolHint}\n\n${bottom}`;
  }

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
    let cerebrasModels = [];
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
    try {
      if (cerebras && typeof cerebras.getModels === 'function') cerebrasModels = cerebras.getModels() || [];
    } catch {
      cerebrasModels = [];
    }

    const combined = [];
    if (Array.isArray(geminiModels) && geminiModels.length)
      combined.push(...geminiModels);
    if (Array.isArray(nvidiaModels) && nvidiaModels.length)
      combined.push(...nvidiaModels);
    if (Array.isArray(cerebrasModels) && cerebrasModels.length)
      combined.push(...cerebrasModels);
    return {
      flatList: combined,
      byId: combined.reduce((acc, m) => {
        acc[m.id] = m;
        return acc;
      }, {}),
    };
  }

  async function sendPrompt(modelId, prompt, modeId, requestId) {
    try {
      const models = await getModels();
      const byId = models.byId || {};
      const modelMeta = modelId && byId[modelId] ? byId[modelId] : null;
      const looksLikeNvidia = typeof modelId === 'string' && modelId.includes('/');
      if ((modelMeta && modelMeta.provider === 'nvidia') || (!modelMeta && looksLikeNvidia)) {
        return await sendPromptNvidia(modelId, prompt, modeId, requestId);
      }
      if (modelMeta && modelMeta.provider === 'cerebras') {
        return await sendPromptCerebras(modelId, prompt, modeId, requestId);
      }
    } catch {
    }

  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API key not configured");

  // build wrapped prompt and log it
  const prepared = buildWrappedPrompt(prompt, modeId);
  console.log('Prepared prompt for Gemini:', prepared);

  const parts = Array.isArray(prepared) ? prepared : [prepared];
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

    const formatter = require('./formatter');
    const formatted = formatter.formatResponse(resp, modeId, webviewProvider, requestId, modelId);
    return { raw: resp, text, parsed: formatted.parsed, user_text: formatted.user_text };
  }
  
  function getNvidiaApiKey() {
    try {
      const vscode = require("vscode");
      const key = vscode.workspace.getConfiguration("vsx").get("apiKey.nvidia");
      return key || null;
    } catch {
      return null;
    }
  }

  async function sendPromptNvidia(modelId, prompt, modeId, requestId) {
    const apiKey = getNvidiaApiKey();
    if (!apiKey) throw new Error("NVIDIA API key not configured");
    // build wrapped prompt and log it
    const prepared = buildWrappedPrompt(prompt, modeId);
    console.log('Prepared prompt for NVIDIA:', prepared);

    const parts = Array.isArray(prepared) ? prepared : [prepared];
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

  const formatter = require('./formatter');
  const formatted = formatter.formatResponse(resp, modeId, webviewProvider, requestId, modelId);
    return { raw: resp, text, parsed: formatted.parsed, user_text: formatted.user_text };
  }

  function getCerebrasApiKey() {
    try {
      const vscode = require('vscode');
      const key = vscode.workspace.getConfiguration('vsx').get('apiKey.cerebras');
      return key || null;
    } catch {
      return null;
    }
  }

  async function sendPromptCerebras(modelId, prompt, modeId, requestId) {
    const apiKey = getCerebrasApiKey();
    if (!apiKey) throw new Error('Cerebras API key not configured');
    if (!cerebras) throw new Error('Cerebras client not available');
    const prepared = buildWrappedPrompt(prompt, modeId);
    const parts = Array.isArray(prepared) ? prepared : [prepared];
    // read configured default reasoning effort for Cerebras (low|medium|high)
    let reasoningEffort;
    try {
      const vscode = require('vscode');
      const cfg = vscode.workspace.getConfiguration('vsx');
      const pref = cfg.get('cerebras.reasoningEffort');
      if (pref && (pref === 'low' || pref === 'medium' || pref === 'high')) reasoningEffort = pref;
    } catch {
      reasoningEffort = undefined;
    }
    const resp = await cerebras.callCerebras(apiKey, modelId, parts, reasoningEffort);

    let text = '';
    try {
      if (!resp) text = '';
      else if (typeof resp === 'string') text = resp;
      else if (resp.choices && Array.isArray(resp.choices)) {
        const texts = resp.choices.map(c => (c && c.message && (c.message.content || c.message)) || c.text || '').filter(Boolean);
        text = texts.join('\n').trim();
      } else if (resp.output && typeof resp.output === 'string') text = resp.output;
      else if (resp.raw && typeof resp.raw === 'string') text = resp.raw;
      else text = JSON.stringify(resp);
    } catch (e) {
      text = JSON.stringify(resp);
    }

    const formatter = require('./formatter');
    const formatted = formatter.formatResponse(resp, modeId, webviewProvider, requestId, modelId);
    return { raw: resp, text, parsed: formatted.parsed, user_text: formatted.user_text };
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
