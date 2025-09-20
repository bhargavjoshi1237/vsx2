const gemini = require("./geminiclient");
const modes = require("../modes");
const { parseLegacyResponse } = require("./legacyParser");
const { contextManager } = require("../legacy/contextManager");

function createRouter() {

  function buildWrappedPrompt(userPrompt, modeId, context = {}) {
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

    // Handle Legacy Mode context injection
    if (modeId === 'legacy' && context.sessionId) {
      const legacyContext = buildLegacyModeContext(context.sessionId, userPrompt);
      if (legacyContext) {
        userPrompt = legacyContext;
      }
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

    return `${top}\n\n${userPrompt}\n\n${bottom}`;
  }

  /**
   * Build Legacy Mode context with session information
   * @param {string} sessionId - The session ID
   * @param {string} userPrompt - The user's prompt
   * @returns {string|null} Enhanced prompt with context or null if session not found
   */
  function buildLegacyModeContext(sessionId, userPrompt) {
    try {
      const contextPrompt = contextManager.buildContextPrompt(sessionId);
      if (contextPrompt) {
        return `${contextPrompt}\n\n## Current Request\n${userPrompt}`;
      }
    } catch (error) {
      console.warn('Failed to build Legacy Mode context:', error.message);
    }
    return null;
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

  async function sendPrompt(modelId, prompt, modeId, context = {}) {
    try {
      const models = await getModels();
      const byId = models.byId || {};
      const modelMeta = modelId && byId[modelId] ? byId[modelId] : null;
      const looksLikeNvidia = typeof modelId === 'string' && modelId.includes('/');
      if ((modelMeta && modelMeta.provider === 'nvidia') || (!modelMeta && looksLikeNvidia)) {
        return await sendPromptNvidia(modelId, prompt, modeId, context);
      }
    } catch {
    }

    const apiKey = getApiKey();
    if (!apiKey) throw new Error("Gemini API key not configured");

    // build wrapped prompt and log it
    const prepared = buildWrappedPrompt(prompt, modeId, context);
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
    const result = { raw: resp, text };
    
    // Process Legacy Mode response if applicable
    if (modeId === 'legacy') {
      return processLegacyModeResponse(result, context);
    }
    
    return result;
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

  async function sendPromptNvidia(modelId, prompt, modeId, context = {}) {
    const apiKey = getNvidiaApiKey();
    if (!apiKey) throw new Error("NVIDIA API key not configured");
    
    // build wrapped prompt and log it
    const prepared = buildWrappedPrompt(prompt, modeId, context);
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
    const result = { raw: resp, text };
    
    // Process Legacy Mode response if applicable
    if (modeId === 'legacy') {
      return processLegacyModeResponse(result, context);
    }
    
    return result;
  }

  /**
   * Process Legacy Mode response with specialized parsing and error handling
   * @param {Object} result - The raw LLM response result
   * @param {Object} context - Request context including sessionId
   * @returns {Object} Processed Legacy Mode response
   */
  function processLegacyModeResponse(result, context = {}) {
    try {
      // Parse the Legacy Mode JSON response
      const parsedLegacy = parseLegacyResponse(result.text);
      
      // Log successful parsing
      console.log('Legacy Mode response parsed successfully:', {
        phase: parsedLegacy.phase,
        todoCount: parsedLegacy.todos ? parsedLegacy.todos.length : 0,
        hasToolCall: !!parsedLegacy.toolCall,
        hasVerification: !!parsedLegacy.verification,
        complete: parsedLegacy.complete
      });
      
      // Update session context if sessionId provided
      if (context.sessionId && parsedLegacy.phase) {
        try {
          contextManager.updateSession(context.sessionId, {
            phase: parsedLegacy.phase,
            lastResponse: parsedLegacy
          });
        } catch (contextError) {
          console.warn('Failed to update session context:', contextError.message);
        }
      }
      
      // Return enhanced result with Legacy Mode data
      return {
        ...result,
        legacyData: parsedLegacy,
        phase: parsedLegacy.phase,
        todos: parsedLegacy.todos,
        toolCall: parsedLegacy.toolCall,
        verification: parsedLegacy.verification,
        complete: parsedLegacy.complete,
        sessionId: context.sessionId,
        parseSuccess: true
      };
      
    } catch (error) {
      console.error('Legacy Mode response processing failed:', error);
      
      // Return error response with fallback data
      return {
        ...result,
        legacyData: {
          type: 'legacy_response',
          phase: 'execution',
          message: `Response processing error: ${error.message}`,
          complete: false,
          todos: [],
          toolCall: null,
          verification: null,
          _processingError: error.message
        },
        parseSuccess: false,
        error: error.message
      };
    }
  }

  /**
   * Enhanced runMode function with Legacy Mode support
   * @param {string} modeId - The mode ID to run
   * @param {Object} ctx - Execution context
   * @returns {Promise<Object>} Mode execution result
   */
  async function runModeEnhanced(modeId, ctx) {
    const m = modes.getModeById(modeId);
    if (!m) throw new Error("Unknown mode: " + modeId);
    
    // For Legacy Mode, enhance context with router reference
    if (modeId === 'legacy') {
      const enhancedCtx = {
        ...ctx,
        router: {
          sendPrompt: (modelId, prompt, context) => sendPrompt(modelId, prompt, modeId, context),
          getModels,
          contextManager
        }
      };
      return await m.execute(enhancedCtx);
    }
    
    return await m.execute(ctx);
  }

  /**
   * Create or get Legacy Mode session
   * @param {string} task - The task description
   * @param {string} modelId - The model ID
   * @param {string} requestId - The request ID
   * @returns {Object} Session information
   */
  function createLegacySession(task, modelId, requestId) {
    try {
      const session = contextManager.createSession(task, modelId, requestId);
      return {
        success: true,
        sessionId: session.id,
        session: {
          id: session.id,
          originalTask: session.originalTask,
          phase: session.phase,
          startTime: session.startTime
        }
      };
    } catch (error) {
      console.error('Failed to create Legacy Mode session:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get Legacy Mode session information
   * @param {string} sessionId - The session ID
   * @returns {Object} Session information or error
   */
  function getLegacySession(sessionId) {
    try {
      const context = contextManager.getSessionContext(sessionId);
      if (!context) {
        return {
          success: false,
          error: 'Session not found'
        };
      }
      
      return {
        success: true,
        sessionId: context.sessionId,
        context
      };
    } catch (error) {
      console.error('Failed to get Legacy Mode session:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  return {
    getModels,
    sendPrompt,
    sendPromptNvidia,
    buildWrappedPrompt,
    buildLegacyModeContext,
    processLegacyModeResponse,

    listModes: modes.listModes,
    getModeById: modes.getModeById,
    runMode: runModeEnhanced,
    runProcedure: async function (name) {
      return { error: "no-procedure-implemented", name };
    },

    // Legacy Mode specific functions
    createLegacySession,
    getLegacySession,
    contextManager
  };
}

module.exports = {
  createRouter,
};
