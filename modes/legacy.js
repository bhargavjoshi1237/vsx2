const id = "legacy";
const name = "Legacy";
// searchfile tool moved to `tools/searchfile.js` - no top-level fs/vscode import here

const wrappers = {
  top: `You are the legacy VSX assistant. Keep responses concise and compatible with older clients. Respond in this JSON payload format: {
    "user_text": "RESPOND TO THE USER HERE, OTHER FIELDS ARE HIDDEN FOR USER",
    "tool_calls": [
      { "tool": "searchfile", "args": { "q": "readme" } },
      { "tool": "fileread", "args": { "path": "FULL/path/to/file" } }
    ],
    "other": ...
  }
If you need to perform a task, you can use tools by calling them. Supported Tool Calls:
 - \`searchfile\`: search for files in the workspace by name or pattern.
 - \`fileread\`: read one or more files by specifying \`path\`, \`paths\` (array) or \`files\` (array of {\`path\`, label}).

When the assistant calls \`fileread\`, include the precise path(s) you want read. The host will attach file contents and return a \`fileread\` tool response with \`files: [{path, relativePath, content, success}]\`. If the assistant requests file reads, the UI will show a compact widget indicating which files were read and expose their contents to the user.`,
    bottom: "When returning code, prefer plain code blocks and avoid advanced formatting. If unsure, ask for clarification. At the end of your response, always include a concise summary of what was done or found, suitable for the user to read. Keep responses brief and to the point.",
    fileHeader: "Legacy mode: files are provided as context in a simplified format."
};

async function execute({ router, modelId, prompt }) {
  if (!router) throw new Error("Router is required for legacy mode");

  // Legacy mode doesn't support procedures. If the prompt includes a 'do:'
  // instruction, return a note rather than attempting to run procedures.
  if (typeof prompt === 'string' && /do:\s*/i.test(prompt)) {
    // Keep behavior simple: strip the procedure part and notify in result.
    const parts = prompt.split(/do:\s*/i);
    prompt = parts[0].trim();
  }

  // We'll implement a loop: if the assistant's response contains tool calls
  // (a `tool_calls` array in JSON), execute those tools locally and then
  // re-send the same prompt augmented with two fields:
  //  - `conversation_till_now`: { prompt: <previous prompt>, response: <previous response> }
  //  - `tools_called`: [<tool responses only>]
  // Repeat until no tool_calls are returned or we reach 10 iterations.

  const maxIterations = 10;
  let iteration = 0;
  let lastPrompt = prompt;
  let lastResp = null;
  let finalOut = null;
  const collectedTools = [];

  // helper to perform supported tools (delegates to modules in /tools)
  async function performToolCall(toolEntry) {
    const tool = toolEntry.tool || toolEntry.name || '';
    const args = toolEntry.args || {};
    try {
      if (tool === 'searchfile' || tool === 'searchFiles' || tool === 'searchFiles_v1') {
        // delegate to tools/searchfile.js
        try {
          const searchfile = require('../tools/searchfile');
          const res = await searchfile(args);
          return res;
        } catch {
          return { tool: 'searchfile', success: false, error: 'searchfile module failed' };
        }
      }
      if (tool === 'fileread' || tool === 'fileRead' || tool === 'readfile') {
        try {
          const fileread = require('../tools/fileread');
          const res = await fileread(args);
          return res;
        } catch {
          return { tool: 'fileread', success: false, error: 'fileread module failed' };
        }
      }

      // Unknown tool
      return { tool, success: false, error: 'Unknown tool' };
    } catch {
      return { tool, success: false, error: 'tool execution error' };
    }
  }

  // helper to extract text/plain_text and parsed JSON from a router response
  function normalizeResp(resp) {
    let text = '';
    if (resp && typeof resp.text === 'string' && resp.text.length) {
      text = resp.text;
    } else if (resp && resp.raw !== undefined) {
      text = typeof resp.raw === 'string' ? resp.raw : JSON.stringify(resp.raw);
    } else if (resp && typeof resp === 'string') {
      text = resp;
    }

    const raw = resp && resp.raw !== undefined ? resp.raw : resp;

    let plain_text = '';
    let thinking_text = '';
    try {
      const parser = require('../route/parser');
      const parsed = parser.parseResponse(raw, { modeId: id });
      if (parsed) {
        plain_text = parsed.plain_text || '';
        thinking_text = parsed.thinking_text || '';
      }
    } catch {
      // ignore
    }

    return { text, raw, plain_text, thinking_text };
  }

  while (iteration < maxIterations) {
    iteration += 1;
    const resp = await router.sendPrompt(modelId, lastPrompt, id);
    const norm = normalizeResp(resp);
    lastResp = resp;

    // Try to extract tool_calls from (in order): resp.tool_calls, resp.raw.tool_calls,
    // parsed plain_text JSON, or resp.text as JSON.
    let toolCalls = null;
    try {
      if (resp && resp.tool_calls && Array.isArray(resp.tool_calls)) toolCalls = resp.tool_calls;
      else if (resp && resp.raw && resp.raw.tool_calls && Array.isArray(resp.raw.tool_calls)) toolCalls = resp.raw.tool_calls;
    } catch {
      toolCalls = null;
    }

    if (!toolCalls) {
      // try parse plain_text as JSON
      if (norm.plain_text && norm.plain_text.length) {
        try {
          const maybe = JSON.parse(norm.plain_text);
          if (maybe && Array.isArray(maybe.tool_calls)) toolCalls = maybe.tool_calls;
          else if (maybe && Array.isArray(maybe.toolCalls)) toolCalls = maybe.toolCalls;
          else if (maybe && Array.isArray(maybe.tools)) toolCalls = maybe.tools;
        } catch {
          // not JSON
        }
      }
    }

    if (!toolCalls) {
      // try parse text as JSON
      if (norm.text && norm.text.length) {
        try {
          const maybe2 = JSON.parse(norm.text);
          if (maybe2 && Array.isArray(maybe2.tool_calls)) toolCalls = maybe2.tool_calls;
          else if (maybe2 && Array.isArray(maybe2.toolCalls)) toolCalls = maybe2.toolCalls;
        } catch {
          // ignore
        }
      }
    }

    // If no tool calls found, prepare final output and return
    if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
      // Build output object similar to previous implementation
      const out = { text: norm.text, raw: norm.raw };
      if (norm.plain_text && norm.plain_text.length) out.plain_text = norm.plain_text;
      if (norm.thinking_text && norm.thinking_text.length) out.thinking_text = norm.thinking_text;

      // Prefer user_text returned directly from the router, otherwise try to
      // parse the `plain_text` as JSON and extract `user_text` field.
      try {
        let user_text = null;
        if (resp && typeof resp.user_text === 'string' && resp.user_text.length) {
          user_text = resp.user_text;
        } else if (norm.plain_text && norm.plain_text.length) {
          try {
            const maybeJson = JSON.parse(norm.plain_text);
            if (maybeJson && typeof maybeJson.user_text === 'string') user_text = maybeJson.user_text;
          } catch {
            // not JSON
          }
        }
        if (!user_text) {
          try {
            if (typeof norm.raw === 'string') {
              try {
                const maybeJson2 = JSON.parse(norm.raw);
                if (maybeJson2 && typeof maybeJson2.user_text === 'string') user_text = maybeJson2.user_text;
              } catch {
              }
            } else if (norm.raw && typeof norm.raw === 'object' && typeof norm.raw.user_text === 'string') {
              user_text = norm.raw.user_text;
            }
          } catch {
          }
        }
        if (user_text) out.user_text = user_text;
      } catch {
        // ignore
      }

      finalOut = out;
      break;
    }

    // We have tool calls: execute them and prepare next prompt
    const toolsCalled = [];
    for (const t of toolCalls) {
      const res = await performToolCall(t);
      toolsCalled.push(res);
    }
  // collect tools for UI rendering later
  try { collectedTools.push(...toolsCalled); } catch {}

    // Build augmented prompt: keep original prompt content but append the
    // conversation and tools_called fields as JSON at the end.
    const conversationField = {
      prompt: lastPrompt,
      response: (norm.plain_text && norm.plain_text.length) ? norm.plain_text : norm.text,
    };

    const augment = {
      conversation_till_now: conversationField,
      tools_called: toolsCalled,
    };

    // Prepare next prompt by appending JSON block
    try {
      const augmentJson = JSON.stringify(augment);
      lastPrompt = (typeof lastPrompt === 'string' ? lastPrompt : JSON.stringify(lastPrompt)) + '\n\n' + augmentJson;
    } catch {
      lastPrompt = (typeof lastPrompt === 'string' ? lastPrompt : JSON.stringify(lastPrompt)) + '\n\n' + String(augment);
    }

    // continue loop to re-query the model
  } 

  // If we exited loop without producing finalOut, create fallback
  if (!finalOut) {
    finalOut = { text: '', raw: lastResp };
  }

  // Attach any collected tool results so the UI can render file attachments
  try {
    if (collectedTools.length) {
      if (!finalOut || typeof finalOut !== 'object') finalOut = { text: '', raw: lastResp };
      finalOut.tools_called = collectedTools;
    }
  } catch {}

  return finalOut;
}

module.exports = { id, name, execute, wrappers };
