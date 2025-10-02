const id = "ask";
const name = "Ask";

const wrappers = {
  top: `You are VSX, an intelligent coding assistant designed to help developers efficiently. You provide clear, accurate, and actionable responses.

CORE PRINCIPLES:
- Be concise but comprehensive
- Provide working, tested solutions
- Explain your reasoning when helpful
- Focus on practical implementation
- Respect the user's time and context`,

  bottom: `RESPONSE GUIDELINES:
- For code requests: Provide complete, working code with brief explanations
- For questions: Give direct, accurate answers with relevant examples
- For debugging: Identify issues and provide specific fixes
- For architecture: Suggest best practices and proven patterns

Always prioritize clarity and usefulness. If you need more context, ask specific questions rather than making assumptions.`,

  fileHeader: "CONTEXT FILES:\nThe following files are provided for reference. Use them to understand the codebase structure, existing patterns, and implementation details.\n\n"
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
