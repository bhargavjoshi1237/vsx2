// Formatter: normalize provider response using shared parser and extract
// structured fields like `user_text` and `tool_calls` when present.
//
// Example JSON payload (how it should look in chat):
// {
//   "user_text": "Do this task",
//   "tool_calls": [
//     { "tool": "search", "args": { "q": "nodejs formatter" } },
//     { "tool": "calculator", "args": { "expr": "2+2" } }
//   ]
// }
function tryParseJsonSafe(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractUserTextFromParsed(parsed, raw) {
  if (!parsed && !raw) return null;
  let user_text = null;
  try {
    if (parsed && typeof parsed.plain_text === 'string' && parsed.plain_text.length) {
      const maybe = tryParseJsonSafe(parsed.plain_text);
      if (maybe && typeof maybe.user_text === 'string') user_text = maybe.user_text;
    }
  } catch {
    // ignore
  }

  if (!user_text) {
    try {
      if (typeof raw === 'string') {
        const maybe2 = tryParseJsonSafe(raw);
        if (maybe2 && typeof maybe2.user_text === 'string') user_text = maybe2.user_text;
      } else if (raw && typeof raw === 'object' && typeof raw.user_text === 'string') {
        user_text = raw.user_text;
      }
    } catch {
      // ignore
    }
  }

  return user_text;
}

function extractToolCallsFromParsed(parsed, raw, webviewProvider, requestId) {
  if (!parsed && !raw) return null;
  let tool_calls = null;
  try {
    if (parsed && typeof parsed.plain_text === 'string' && parsed.plain_text.length) {
      const maybe = tryParseJsonSafe(parsed.plain_text);
      if (maybe && Array.isArray(maybe.tool_calls)) tool_calls = maybe.tool_calls;
    }
  } catch {
    // ignore
  }

  if (!tool_calls) {
    try {
      if (typeof raw === 'string') {
        const maybe2 = tryParseJsonSafe(raw);
        if (maybe2 && Array.isArray(maybe2.tool_calls)) tool_calls = maybe2.tool_calls;
      } else if (raw && typeof raw === 'object' && Array.isArray(raw.tool_calls)) {
        tool_calls = raw.tool_calls;
      }
    } catch {
      // ignore
    }
  }

  if (Array.isArray(tool_calls)) {
    tool_calls.forEach((item, idx) => {
      try {
        console.log(`tool_calls[${idx}]:`, item);
        // Notify webview about the tool call, include requestId when available
        if (webviewProvider && typeof webviewProvider.notifyToolCall === 'function') {
          webviewProvider.notifyToolCall({
            tool: item.tool || item.name || 'Unknown Tool',
            args: item.args || item.parameters || {},
            index: idx,
            requestId: requestId || null
          });
        }
      } catch {
        // ignore logging errors
      }
    });
  }

  return tool_calls;
}

function formatResponse(resp, modeId, webviewProvider, requestId) {
  try {
    const parser = require('./parser');
    const parsed = parser.parseResponse(resp, { modeId });
    const user_text = extractUserTextFromParsed(parsed, resp);
    const tool_calls = extractToolCallsFromParsed(parsed, resp, webviewProvider, requestId);

    // Send incremental message to webview if user_text is found
    if (user_text && webviewProvider && typeof webviewProvider.sendIncrementalMessage === 'function') {
      webviewProvider.sendIncrementalMessage({
        command: 'appendChatMessage',
        role: 'assistant',
        text: user_text,
        meta: modeId,
        requestId: requestId
      });
    }

    return { parsed, user_text, tool_calls };
  } catch {
    const user_text = extractUserTextFromParsed(null, resp);
    const tool_calls = extractToolCallsFromParsed(null, resp, webviewProvider, requestId);

    // Send incremental message to webview if user_text is found
    if (user_text && webviewProvider && typeof webviewProvider.sendIncrementalMessage === 'function') {
      webviewProvider.sendIncrementalMessage({
        command: 'appendChatMessage',
        role: 'assistant',
        text: user_text,
        meta: modeId,
        requestId: requestId
      });
    }

    return { parsed: null, user_text, tool_calls };
  }
}

module.exports = { formatResponse };
