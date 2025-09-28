const id = "ask";
const name = "Ask";

const wrappers = {
  top: "Your name is VSX, You are a helpful assistant. Respond concisely.",
  bottom: "If the user asks for code, provide only the code block. For terminal commands, suggest only if essential and wait for user approval—do not loop or repeat unnecessarily. Structure responses directly: explain briefly, then act or suggest one clear next step. If unsure, ask for clarification once.",

  fileHeader: "The following files are provided for context. Use them as reference when answering.\n\nFile contents are provided as a JSON array with {path, label, content} objects. "
};

async function execute({ router, modelId, prompt, requestId }) {
  if (!router) throw new Error("Router is required for ask mode");

  let procedureResult = null;
  try {
    if (typeof prompt === "string" && prompt.includes("do:")) {
      const parts = prompt.split(/do:\s*/i);
      prompt = parts[0].trim();
      const procName = parts[1] ? parts[1].trim() : null;
      if (procName) {
        if (router && typeof router.runProcedure === "function") {
          try {
            procedureResult = await router.runProcedure(procName, {
              prompt,
              modelId,
              requestId,
            });
          } catch (e) {
            procedureResult = { error: String(e) };
          }
        } else {
          procedureResult = { note: "No router procedure handler registered" };
        }
      }
    }
  } catch (e) {
    console.error("Error parsing procedure:", e);
  }

  const resp = await router.sendPrompt(modelId, prompt, id);
  // Ensure text is always a string for the UI. Prefer resp.text, otherwise
  // stringify resp.raw when available.
  let text = '';
  if (resp && typeof resp.text === 'string' && resp.text.length) {
    text = resp.text;
  } else if (resp && resp.raw !== undefined) {
    text = typeof resp.raw === 'string' ? resp.raw : JSON.stringify(resp.raw);
  } else if (resp && typeof resp === 'string') {
    text = resp;
  }

  // Provide the actual raw provider response as `raw` so parsers can inspect it.
  const raw = resp && resp.raw !== undefined ? resp.raw : resp;

  // Include a `done` flag so the UI knows to hide loading indicators
  return { text, raw, procedureResult, done: true };
}

const tagline = 'Ask VSX';
module.exports = { id, name, execute, wrappers, tagline };
