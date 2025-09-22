Project: VSX (VS Code extension)

Purpose: Help AI coding agents be immediately productive when working
on this VS Code extension. Focus on where to change behavior, how
requests flow, and how to run common developer workflows.

Quick architecture
- extension entry: `extension.js` — registers the webview provider and commands.
- Web UI: `ui/webviewProvider.js` — builds the webview HTML, receives messages
  from the UI and dispatches to the `router` for model calls and modes.
- Router & providers: `route/route.js` — routes prompts to providers (Gemini,
  NVIDIA, Cerebras) and contains `sendPrompt*` logic. Providers live in
  `route/geminiclient.js`, `route/nvidiaclient.js`, `route/cerebrasclient.js`.
- Response handling: `route/parser.js` and `route/formatter.js` — normalize
  model outputs into `plain_text`, `thinking_text`, `user_text`, and
  `tool_calls` which the UI can render or act on.
- Modes: `modes/*.js` (e.g. `modes/ask.js`, `modes/legacy.js`) — pre/post
  processing wrappers and custom mode execution available via router.runMode.

Important patterns & examples
- buildWrappedPrompt: In `route/route.js` prompts are wrapped with
  mode-specific `wrappers.top` and `wrappers.bottom` before sending to models.
  When sending files, prompt can be an array with a trailing `{__files, files}`
  object — router serializes files as JSON and prepends `fileHeader`.
- Provider selection: Router chooses provider by model metadata (from
  `getModels`) or by model id pattern (NVIDIA ids contain `/`). See
  `sendPrompt` and `sendPromptNvidia` for sample extraction logic.
- Incremental UI updates: `route/formatter.js` calls `webviewProvider.notifyToolCall`
  and `sendIncrementalMessage` to stream partial assistant text or tool-call
  notifications to the webview.
- Legacy Mode: `modes/legacy.js` + `webviewProvider.handleLegacyMode` implement
  an interactive session with tool execution helpers (read/write files,
  run terminal commands). Use these helpers when implementing tooling flows.

Developer workflows
- Run lint: `npm run lint` (uses `eslint` configured in repo).
- Tests: `npm test` runs `vscode-test` harness; `pretest` runs lint.
- Manual extension run: open this folder in VS Code and run the Extension
  Development Host (F5). The webview appears in the Activity Bar view
  id `myView` (registered in `package.json`).

Project-specific conventions
- Config keys: extension stores API keys in workspace settings under
  `vsx.apiKey.{gemini|nvidia|cerebras}`. Use `vscode.workspace.getConfiguration('vsx')`.
- Providers: model lists are merged from multiple clients by `route/getModels`.
  When adding a provider, expose `getModels()` and `call*()` functions that
  the router expects.
- Responses: prefer returning objects shaped `{ raw, text, parsed, user_text }`.
  The UI expects `plain_text`/`thinking_text` in `parsed` (produced by parser).
- Modes: mode modules export `id`, `name`, `wrappers`, and `execute(ctx)`.
  `wrappers` may include `top`, `bottom`, `fileHeader`.

Integration points to be careful with
- `vscode.workspace.getConfiguration` is used across the codebase; changes
  should respect `vscode.ConfigurationTarget.Global` when persisting keys.
- `ui/webview-client.js` communicates via `postMessage`. Keep message
  names and payload shapes stable (see `webviewProvider.onDidReceiveMessage`).
- File reading: `webviewProvider.safeRead` uses sync `fs.readFileSync` — be
  cautious about heavy I/O on activation.

When editing code
- If changing prompt wrapping or mode behavior, update `route/route.js` and
  corresponding `modes/*` files and add tests or manual checks in the Extension
  Development Host.
- If adding a new model provider, implement `route/<provider>client.js` with
  `getModels()` and a `call...` method, and update `route/route.js` to require it.

Files to inspect for most tasks
- `extension.js`, `ui/webviewProvider.js`, `ui/webview-client.js`
- `route/route.js`, `route/parser.js`, `route/formatter.js`, provider files
- `modes/ask.js`, `modes/legacy.js`

If anything here is unclear or you want me to expand examples (message shapes,
or a short checklist for adding a provider or a mode), tell me which area and
I'll iterate the file.
