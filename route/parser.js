      const vscode = (() => {
        try {
          return require("vscode");
        } catch {
          return null;
        }
      })();

      const fs = require("fs");
      const path = require("path");

      // parseResponse accepts optional options: { modeId: 'ask' }
      function parseResponse(raw, options = {}) {
        const out = { plain_text: "", thinking_text: "", raw: raw, metadata: {} };

        if (!raw) return out;

        if (typeof raw === "string" || (raw.raw && typeof raw.raw === "string")) {
          const sseData = raw.raw || raw;

          // If this string looks like an SSE stream (contains `data: ` lines),
          // parse it as such. Otherwise try to detect and unwrap simple
          // `(json\n{...})` wrappers or raw JSON strings and extract the
          // useful content (user_text or the JSON body) so the UI doesn't
          // display the wrapper verbatim.
          if (!sseData.includes("data: ")) {
            const str = String(sseData).trim();

            // sanitize potential wrapper like `(json\n{...})` or `json\n{...}`
            const wrapMatch = str.match(/^\(?\s*json\s*\n([\s\S]+)\)?$/i);
            const candidate = wrapMatch && wrapMatch[1] ? wrapMatch[1].trim() : str;

            // If candidate is JSON, try to parse and extract `user_text`.
            try {
              const parsedJson = JSON.parse(candidate);
              if (parsedJson && typeof parsedJson.user_text === 'string') {
                out.plain_text = parsedJson.user_text.trim();
                out.raw = parsedJson;
                processFileChips(out, options);
                return out;
              }
              // Not a user_text-wrapped object — stringify for display
              out.plain_text = typeof candidate === 'string' ? candidate : JSON.stringify(parsedJson);
              out.raw = parsedJson;
              processFileChips(out, options);
              return out;
            } catch {
              // Not JSON — treat candidate as plain text
              out.plain_text = candidate;
              processFileChips(out, options);
              return out;
            }
          }

          // Fallback: treat as SSE stream with `data: ` lines
          const texts = [];
          const thinkingParts = [];
          const lines = sseData.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ") && !line.includes("[DONE]")) {
              try {
                const jsonStr = line.substring(6);
                const chunk = JSON.parse(jsonStr);

                if (chunk.choices && Array.isArray(chunk.choices)) {
                  for (const choice of chunk.choices) {
                    if (choice.delta) {
                      if (
                        choice.delta.content &&
                        typeof choice.delta.content === "string"
                      ) {
                        texts.push(choice.delta.content);
                      }
                      if (
                        choice.delta.reasoning_content &&
                        typeof choice.delta.reasoning_content === "string"
                      ) {
                        thinkingParts.push(choice.delta.reasoning_content);
                      }
                    }
                  }
                }
              } catch {}
            }
          }

          out.plain_text = texts.join("").trim();
          out.thinking_text = thinkingParts.join("").trim();
          // process file chips in the plain_text
          processFileChips(out, options);
          return out;
        }

        if (Array.isArray(raw.choices) && raw.choices.length) {
          const texts = [];
          const thinkingParts = [];
          for (const c of raw.choices) {
            if (!c) continue;
            if (c.message && typeof c.message === "object") {
              if (typeof c.message.content === "string")
                texts.push(c.message.content);
              else if (Array.isArray(c.message.content))
                texts.push(c.message.content.join("\n"));
            } else if (typeof c.text === "string") {
              texts.push(c.text);
            }

            if (typeof c.reasoning === "string") thinkingParts.push(c.reasoning);
            if (typeof c.thinking === "string") thinkingParts.push(c.thinking);
          }
          out.plain_text = texts.join("\n").trim();
          out.thinking_text = thinkingParts.join("\n").trim();
          if (raw.metadata && typeof raw.metadata === "object") out.metadata = raw.metadata;
          processFileChips(out, options);
          return out;
        }

        if (Array.isArray(raw.candidates) && raw.candidates.length) {
          const texts = [];
          for (const cand of raw.candidates) {
            if (!cand) continue;
            if (typeof cand.text === "string") texts.push(cand.text);
            else if (typeof cand.content === "string") texts.push(cand.content);
            else if (Array.isArray(cand.content)) texts.push(cand.content.join("\n"));
          }
          out.plain_text = texts.join("\n").trim();
          if (raw.metadata && typeof raw.metadata.reasoning === "string") out.thinking_text = raw.metadata.reasoning.trim();
          processFileChips(out, options);
          return out;
        }

        if (raw.output && typeof raw.output === "string") out.plain_text = raw.output.trim();
        if (raw.message && typeof raw.message === "string") out.plain_text = out.plain_text || raw.message.trim();
        if (raw.reasoning && typeof raw.reasoning === "string") out.thinking_text = raw.reasoning.trim();
        if (raw.thinking && typeof raw.thinking === "string") out.thinking_text = out.thinking_text || raw.thinking.trim();
        if (raw.metadata && typeof raw.metadata === "object") out.metadata = raw.metadata;

        processFileChips(out, options);

        // If a mode is given, attempt to extract validator embedded in the mode file.
        if (options && options.modeId) {
          const embedded = tryExtractValidatorFromMode(options.modeId);
          if (embedded) out.metadata._embedded_validator = embedded;
        }

        return out;
      }

  function processFileChips(out) {
        if (!out || !out.plain_text) return;

        // Normalize and unwrap provider wrappers such as `(json\n... )` which
        // some models emit. This makes subsequent JSON parsing and UI display
        // more reliable.
        function sanitizePlainText(s) {
          if (!s || typeof s !== 'string') return s;
          // Match patterns like `(json\n{...})` or `json\n{...}` (case-insensitive)
          const m = s.match(/^\(?\s*json\s*\n([\s\S]+)\)?$/i);
          if (m && m[1]) {
            return m[1].trim();
          }
          return s;
        }

        const chipPattern = /\*\*\*\s*file:\s*([^*]+?)\s*\*\*\*/gi;
        const chips = [];
        const sanitized = sanitizePlainText(out.plain_text);
        let newText = sanitized.replace(chipPattern, (match, p1) => {
          const filename = p1.trim();
          const label = `file: ${filename}`;
          chips.push({ label, filename });
          return `\n[${label}]\n`;
        });
        if (chips.length) {
          out.plain_text = newText.trim();
          out.metadata = out.metadata || {};
          out.metadata.file_chips = chips;
        } else {
          // If no chips were replaced, still ensure plain_text is sanitized.
          out.plain_text = sanitized;
        }
      }


      // Attempt to read a mode file and parse an embedded validator JSON object.
      // Modes are expected at ../modes/<modeId>.js relative to this file.
      function tryExtractValidatorFromMode(modeId) {
        try {
          const modePath = path.join(__dirname, "..", "modes", `${modeId}.js`);
          if (!fs.existsSync(modePath)) return null;
          const content = fs.readFileSync(modePath, "utf8");
          // Look for a JS comment block like: /* ASK_MODE_VALIDATOR: { ... } */
          const re = /ASK_MODE_VALIDATOR\s*:\s*(\{[\s\S]*?\})/m;
          const m = content.match(re);
          if (!m) return null;
          try {
            const json = JSON.parse(m[1]);
            return json;
          } catch {
            return null;
          }
        } catch {
          return null;
        }
      }

      function sendPlainTextToWebview(plainText, meta = "done", responseData = null) {
        try {
          if (!vscode) return false;

          try {
            vscode.commands.executeCommand("vscode.postMessageToWebview", {
              command: "appendMessage",
              role: "assistant",
              text: plainText,
              meta,
              responseData,
            });
            return true;
          } catch {
            return false;
          }
        } catch {
          return false;
        }
      }

      module.exports = { parseResponse, sendPlainTextToWebview };
