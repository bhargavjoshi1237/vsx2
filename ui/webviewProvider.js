const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

let routerFactory;
try {
  routerFactory = require("../route/route").createRouter;
    } catch {
  routerFactory = null;
}

class MyWebviewProvider {
  constructor(context) {
    this.context = context;
  }
  safeRead(filePath, fallback) {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch (err) {
      console.error(
        "Failed to read",
        filePath,
        err && err.message ? err.message : err
      );
      return fallback;
    }
  }
  resolveWebviewView(webviewView) {
    this.webviewView = webviewView;
    const extensionPath = this.context.extensionUri.fsPath;
    const header = this.safeRead(
      path.join(extensionPath, "ui", "components", "header.html"),
      '<div class="p-2 text-gray-200">(header missing)</div>'
    );
    const chatMessages = this.safeRead(
      path.join(extensionPath, "ui", "components", "chat-messages.html"),
      ""
    );
    const inputArea = this.safeRead(
      path.join(extensionPath, "ui", "components", "input-area.html"),
      '<div class="p-2 text-gray-200">(input area missing)</div>'
    );
    const chatUserTpl = this.safeRead(
      path.join(extensionPath, "ui", "components", "chat-user.html"),
      ""
    );
    const chatAssistantTpl = this.safeRead(
      path.join(extensionPath, "ui", "components", "chat-assistant.html"),
      ""
    );
    const legacyTemplates = this.safeRead(
      path.join(extensionPath, "ui", "components", "legacy-templates.html"),
      ""
    );
    const placeholderTpl = this.safeRead(
      path.join(extensionPath, "ui", "components", "placeholder.html"),
      ""
    );
    const toolNotifierTpl = this.safeRead(
      path.join(extensionPath, "ui", "components", "tool-notifier.html"),
      ""
    );
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    const scriptPathOnDisk = vscode.Uri.file(
      path.join(extensionPath, "ui", "webview-client.js")
    );
    const scriptUri = webviewView.webview.asWebviewUri(scriptPathOnDisk);
    const stylePathOnDisk = vscode.Uri.file(
      path.join(extensionPath, "ui", "webview-styles.css")
    );
    const styleUri = webviewView.webview.asWebviewUri(stylePathOnDisk);
    const iconPathOnDisk = vscode.Uri.file(path.join(extensionPath, 'media', 'icon.svg'));
    const iconUri = webviewView.webview.asWebviewUri(iconPathOnDisk);

    webviewView.webview.html = `
      <!DOCTYPE html>
      <html lang="en" class="h-full">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>VSX Chat</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        <link rel="stylesheet" href="${styleUri}">
      </head>
      <body>
        <div class="main-content">
        ${header}
        <div id="chat-messages-container" class="chat-messages">
          ${chatMessages}
          ${placeholderTpl}
        </div>
    ${inputArea}
    ${chatUserTpl}
    ${chatAssistantTpl}
    </div>
  ${legacyTemplates}
  ${toolNotifierTpl}
  <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
    // Set initial autopilot state
    try {
      const config = vscode.workspace.getConfiguration('vsx');
      const enabled = Boolean(config.get('autopilot.enabled') || false);
      webviewView.webview.postMessage({ command: 'autoPilotChanged', enabled });
    } catch (e) {
      console.error('Failed to set initial autopilot state', e);
    }
    // Provide placeholder resources (iconUri) to webview client
    try { 
      webviewView.webview.postMessage({ 
        command: 'placeholderResources', 
        iconUri: String(iconUri) 
      }); 
    } catch (e) {
      console.error('Failed to send placeholder resources:', e);
    }
    try {
      this.router = routerFactory ? routerFactory(this.context, this) : null;
    } catch (err) {
      console.error("Failed to create router:", err);
      this.router = null;
    }

    // Initialize session management
    this.initializeSessionManagement();

    // Send mode taglines mapping to webview so UI can show the appropriate placeholder tagline
    try {
      if (this.router && typeof this.router.listModes === 'function') {
        this.router.listModes().then((modesList) => {
          const modesArr = Array.isArray(modesList) ? modesList : (modesList && modesList.length ? modesList : []);
          const taglines = {};
          for (const m of modesArr) {
            try {
              if (m && m.id) taglines[m.id] = m.tagline || (m.wrappers && m.wrappers.title) || '';
            } catch {
            }
          }
          if (this.webviewView && this.webviewView.webview) {
            this.webviewView.webview.postMessage({ command: 'modesTaglines', taglines });
          }
        }).catch(() => {});
      }
    } catch (e) {}

    // Parser for normalizing responses into plain_text and thinking_text
    let parser = null;
    try {
      parser = require("../route/parser");
    } catch {
      parser = null;
    }

    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'newChat':
            try {
              console.log('New chat requested from webview');
              // Notify UI to clear messages and reset any UI state
              if (this.webviewView) {
                this.webviewView.webview.postMessage({ command: 'newChat' });
                this.webviewView.webview.postMessage({ command: 'clearWorkingStatus' });
                
                // Re-send placeholder resources to ensure icon shows up
                const iconPathOnDisk = vscode.Uri.file(path.join(this.context.extensionUri.fsPath, 'media', 'icon.svg'));
                const iconUri = this.webviewView.webview.asWebviewUri(iconPathOnDisk);
                this.webviewView.webview.postMessage({ 
                  command: 'placeholderResources', 
                  iconUri: String(iconUri) 
                });
              }
            } catch (err) {
              console.error('Error handling newChat', err);
            }
            return;
          case "selectFiles":
            this.selectFiles();
            return;
          case "openFilePicker":
            this.openWorkspaceFilePicker();
            return;
          case "selectedFilesChanged":
            console.log("Selected files from webview:", message.files);
            return;
          case "openApiKeySetup":
            this.openApiKeySetup();
            return;
          case "setCerebrasReasoning":
            try {
              await this.promptSetCerebrasReasoning();
            } catch {
            }
            return;
          case "setDualitySubtaskMode":
            try {
              await this.promptSetDualitySubtaskMode();
            } catch {
            }
            return;
          case "getApiKey":
            this.getApiKey(message.client);
            return;
          case "getModels":
            try {
              const models = this.router
                ? await this.router.getModels()
                : { flatList: [] };
              this.webviewView.webview.postMessage({
                command: "modelsResponse",
                models,
              });
            } catch (err) {
              this.webviewView.webview.postMessage({
                command: "modelsResponse",
                error: String(err),
                models: { flatList: [] },
              });
            }
            return;
          case "getModes":
            try {
              const modes =
                this.router && typeof this.router.listModes === "function"
                  ? await this.router.listModes()
                  : [];
              this.webviewView.webview.postMessage({
                command: "modesResponse",
                modes,
              });
            } catch (err) {
              this.webviewView.webview.postMessage({
                command: "modesResponse",
                error: String(err),
                modes: [],
              });
            }
            return;
          case "sendPrompt":
            try {
              let modelId = message.modelId;
              const prompt = message.prompt;
              const requestId = message.requestId;
              const modeId = message.modeId;
              if (!this.router) throw new Error("Router not configured");
              
              // Special handling for Legacy Mode
              if (modeId === 'legacy') {
                await this.handleLegacyMode(modelId, prompt, requestId, message);
                return;
              }
              
              // Special handling for Duality Mode
              if (modeId === 'duality') {
                // For Duality mode, construct modelId from primaryModelId and secondaryModelId
                const primaryModelId = message.primaryModelId;
                const secondaryModelId = message.secondaryModelId;
                if (primaryModelId && secondaryModelId) {
                  modelId = `${primaryModelId}|${secondaryModelId}`;
                } else if (!modelId) {
                  throw new Error("Primary and secondary model IDs are required for Duality mode");
                }
                await this.handleDualityMode(modelId, prompt, requestId, message);
                return;
              }
              
              // If the router has provider metadata, prefer provider-specific senders
              let resp;
              // If a specific mode is requested, run it (modes can perform pre/post processing)
              if (modeId && typeof this.router.runMode === "function") {
                try {
                  resp = await this.router.runMode(modeId, {
                    router: this.router,
                    modelId,
                    prompt,
                    requestId,
                  });
                } catch (e) {
                  resp = { raw: null, text: String(e) };
                }
              } else {
                try {
                  const byId = this.router.getModels
                    ? (await this.router.getModels()).byId
                    : {};
                  const modelMeta =
                    byId && byId[modelId] ? byId[modelId] : null;
                  if (
                    modelMeta &&
                    modelMeta.provider === "nvidia" &&
                    typeof this.router.sendPromptNvidia === "function"
                  ) {
                    resp = await this.router.sendPromptNvidia(modelId, prompt, modeId, requestId);
                  } else {
                    resp = await this.router.sendPrompt(modelId, prompt, modeId, requestId);
                  }
                } catch {
                  // fallback to generic sendPrompt
                  resp = await this.router.sendPrompt(modelId, prompt, modeId, requestId);
                }
              }
              // Use parser to extract exact plain_text and thinking_text when available
              try {
                const parsed = parser
                  ? parser.parseResponse(
                      resp && resp.raw !== undefined ? resp.raw : resp
                    )
                  : { plain_text: "", thinking_text: "", metadata: {} };
                // Attach parsed fields onto the response object sent to the webview
                const responseForUI = Object.assign({}, resp);
                // If router returned a direct `user_text`, prefer that for UI.
                responseForUI.plain_text =
                  (resp && typeof resp.user_text === 'string' && resp.user_text.length)
                    ? resp.user_text
                    : parsed.plain_text;
                responseForUI.thinking_text = parsed.thinking_text;
                responseForUI.metadata = parsed.metadata || responseForUI.metadata || {};
                this.webviewView.webview.postMessage({
                  command: "promptResponse",
                  requestId,
                  response: responseForUI,
                });
              } catch {
                // Fallback to original behavior
                this.webviewView.webview.postMessage({
                  command: "promptResponse",
                  requestId,
                  response: resp,
                });
              }
            } catch (err) {
              const requestId = message.requestId;
              this.webviewView.webview.postMessage({
                command: "promptResponse",
                requestId,
                error: String(err),
              });
            }
            return;
          case 'setAutoPilot':
            try {
              const enabled = Boolean(message.enabled);
              // store in workspace state for the extension
              try {
                const vscode = require('vscode');
                await vscode.workspace.getConfiguration('vsx').update('autopilot.enabled', enabled, vscode.ConfigurationTarget.Global);
              } catch {}
              // notify webview
              if (this.webviewView && this.webviewView.webview) this.webviewView.webview.postMessage({ command: 'autoPilotChanged', enabled });
            } catch (e) {}
            return;
            case 'setAutoPilotTerminalExecution':
              try {
                const enabled = Boolean(message.enabled);
                try {
                  // Persist like Cerebras reasoning: use workspace configuration update and notify user
                  const vscodeCfg = require('vscode');
                  await vscodeCfg.workspace.getConfiguration('vsx').update('autopilot.runTerminalCommands', enabled, vscodeCfg.ConfigurationTarget.Global);
                  try {
                    // Show a brief info message to confirm the change
                    vscodeCfg.window.showInformationMessage(`Autopilot terminal execution ${enabled ? 'enabled' : 'disabled'}`);
                  } catch (e) {}
                } catch (err) {
                  console.error('Failed to update autopilot.runTerminalCommands setting', err);
                }
                if (this.webviewView && this.webviewView.webview) this.webviewView.webview.postMessage({ command: 'autoPilotTerminalChanged', enabled });
              } catch (e) {
                console.error('setAutoPilotTerminalExecution handler error', e);
              }
              return;
            case 'getAutoPilotTerminalExecution':
              try {
                const enabled = Boolean(vscode.workspace.getConfiguration('vsx').get('autopilot.runTerminalCommands') || false);
                if (this.webviewView && this.webviewView.webview) this.webviewView.webview.postMessage({ command: 'autoPilotTerminalChanged', enabled });
              } catch (e) {}
              return;
          case 'runTerminalCommand':
            try {
              const toolCall = message.toolCall || {};
              const requestId = message.requestId || (toolCall && toolCall.requestId) || String(Date.now());
              const cmd = toolCall.args && (toolCall.args.command || toolCall.args.cmd) ? (toolCall.args.command || toolCall.args.cmd) : '';
              let cwd = toolCall.args && toolCall.args.cwd ? toolCall.args.cwd : this.getWorkspaceRoot(); // Default to workspace root
              if (!cmd) {
                if (this.webviewView && this.webviewView.webview) this.webviewView.webview.postMessage({ command: 'terminalCommandResult', requestId, output: 'No command provided' });
                return;
              }
              // Resolve cwd if relative
              cwd = this.resolveFilePath(cwd) || cwd;
              // Execute the command using child_process.exec for convenience
              const child_process = require('child_process');
              child_process.exec(cmd, { cwd: cwd, windowsHide: true, maxBuffer: 1024 * 500 }, (err, stdout, stderr) => {
                const out = (stdout || '').toString();
                const errOut = (stderr || '').toString();
                const combined = (out + (errOut ? '\n' + errOut : '')).trim();
                const outputText = combined.length ? combined : (err ? String(err.message || err) : '');
                // Send result to webview
                try { this.webviewView.webview.postMessage({ command: 'terminalCommandResult', requestId, output: outputText }); } catch (e) {}
                // Don't send incremental message - let the conversation continue naturally
              });
            } catch (e) {
              try { this.webviewView.webview.postMessage({ command: 'terminalCommandResult', requestId: message.requestId, output: String(e) }); } catch (err) {}
            }
            return;
          case 'skipTerminalCommand':
            try {
              const requestId = message.requestId || (message.toolCall && message.toolCall.requestId) || String(Date.now());
              try { this.webviewView.webview.postMessage({ command: 'terminalCommandSkipped', requestId }); } catch (e) {}
              // Don't send incremental message - let the conversation continue naturally
            } catch (e) {}
            return;
          case "legacyModeConfirmationResponse":
            this.handleLegacyModeConfirmation(message);
            return;
          case "dualityModeProgressUpdate":
            this.handleDualityModeProgressUpdate(message);
            return;
          case "dualityModeSubtaskUpdate":
            this.handleDualityModeSubtaskUpdate(message);
            return;
          case "tool.writeFile":
            // message: { command: 'tool.writeFile', filePath, newContent }
            try {
              await this.handleWriteFileTool(message.filePath, message.newContent, message.requestId);
            } catch (err) {
              console.error('Error handling tool.writeFile', err);
              this.webviewView.webview.postMessage({ command: 'tool.writeFile.response', requestId: message.requestId, success: false, error: String(err) });
            }
            return;
          case 'autoAcceptFileEdit':
          case 'acceptFileEdit':
            try {
              await this.handleAcceptFileEdit(message.filePath, message.changes, message.requestId, message.command === 'autoAcceptFileEdit');
            } catch (err) {
              console.error('Error handling acceptFileEdit', err);
            }
            return;
          case 'rejectFileEdit':
            try {
              await this.handleRejectFileEdit(message.filePath, message.requestId);
            } catch (err) {
              console.error('Error handling rejectFileEdit', err);
            }
            return;
        }
      },
      undefined,
      this.context.subscriptions
    );
  }

  // Get current workspace root (fallback to process.cwd if no workspace)
  getWorkspaceRoot() {
    try {
      if (vscode.workspace && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
      }
      return process.cwd();
    } catch {
      return process.cwd();
    }
  }

  // Helper to resolve file path: absolute if starts with /, else relative to workspace root
  resolveFilePath(filePath) {
    try {
      const root = this.getWorkspaceRoot();
      if (typeof filePath !== 'string' || !filePath.trim()) return null;
      const trimmed = filePath.trim();
      if (trimmed.startsWith('/') || trimmed.startsWith('\\') || path.isAbsolute(trimmed)) {
        return trimmed; // Already absolute
      }
      return path.resolve(root, trimmed); // Resolve relative to workspace
    } catch {
      return filePath; // Fallback
    }
  }

  async openApiKeySetup() {
    try {
      const clients = ["gemini", "nvidia", "cerebras"];
      const clientNames = {
        gemini: "Google Gemini",
        nvidia: "NVIDIA AI",
        cerebras: "Cerebras",
      };

      const selectedClient = await vscode.window.showQuickPick(
        clients.map((client) => ({
          label: clientNames[client],
          description: `Configure API key for ${clientNames[client]}`,
          client: client,
        })),
        {
          placeHolder: "Select AI client to configure",
        }
      );

      if (!selectedClient) return;

      const currentKey = vscode.workspace
        .getConfiguration("vsx")
        .get(`apiKey.${selectedClient.client}`);
      const hasKey = currentKey && currentKey.length > 0;

      const action = await vscode.window.showQuickPick(
        [
          {
            label: hasKey ? "Update API Key" : "Set API Key",
            description: hasKey
              ? "Replace existing API key"
              : "Add new API key",
            action: "set",
          },
          ...(hasKey
            ? [
                {
                  label: "Clear API Key",
                  description: "Remove existing API key",
                  action: "clear",
                },
              ]
            : []),
          {
            label: "Cancel",
            description: "Go back without changes",
            action: "cancel",
          },
        ],
        {
          placeHolder: `Configure ${selectedClient.label} API key`,
        }
      );

      if (!action || action.action === "cancel") return;

      if (action.action === "clear") {
        await vscode.workspace
          .getConfiguration("vsx")
          .update(
            `apiKey.${selectedClient.client}`,
            undefined,
            vscode.ConfigurationTarget.Global
          );
        vscode.window.showInformationMessage(
          `${selectedClient.label} API key cleared successfully.`
        );
        // Notify webview that API key changed so UI can refresh models
        if (this.webviewView) {
          this.webviewView.webview.postMessage({
            command: "apiKeyChanged",
            client: selectedClient.client,
            action: "cleared",
          });
        }
        return;
      }

      if (action.action === "set") {
        // If user selected Cerebras, also ask for reasoning effort preference
        let reasoningPref = null;
        if (selectedClient.client === 'cerebras') {
          const r = await vscode.window.showQuickPick([
            { label: 'Low', description: 'Lower reasoning effort (faster)', value: 'low' },
            { label: 'Medium', description: 'Balanced reasoning effort', value: 'medium' },
            { label: 'High', description: 'High reasoning effort (slower)', value: 'high' },
          ], { placeHolder: 'Select default reasoning effort for Cerebras' });
          if (r && r.value) reasoningPref = r.value;
        }
        const apiKey = await vscode.window.showInputBox({
          prompt: `Enter your ${selectedClient.label} API key`,
          password: true,
          placeHolder: "API key...",
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "API key cannot be empty";
            }
            return null;
          },
        });

        if (apiKey) {
          await vscode.workspace
            .getConfiguration("vsx")
            .update(
              `apiKey.${selectedClient.client}`,
              apiKey.trim(),
              vscode.ConfigurationTarget.Global
            );
          if (selectedClient.client === 'cerebras' && reasoningPref) {
            await vscode.workspace.getConfiguration('vsx').update('cerebras.reasoningEffort', reasoningPref, vscode.ConfigurationTarget.Global);
          }
          vscode.window.showInformationMessage(
            `${selectedClient.label} API key saved successfully.`
          );
          // Notify webview that API key changed so UI can refresh models
          if (this.webviewView) {
            this.webviewView.webview.postMessage({
              command: "apiKeyChanged",
              client: selectedClient.client,
              action: "set",
            });
          }
        }
      }
    } catch (error) {
      console.error("Error setting up API key:", error);
      vscode.window.showErrorMessage(
        `Error setting up API key: ${error.message}`
      );
    }
  }

  async getApiKey(client) {
    try {
      const apiKey = vscode.workspace
        .getConfiguration("vsx")
        .get(`apiKey.${client}`);
      this.webviewView.webview.postMessage({
        command: "apiKeyResponse",
        client: client,
        apiKey: apiKey || null,
      });
    } catch (error) {
      console.error("Error getting API key:", error);
      this.webviewView.webview.postMessage({
        command: "apiKeyResponse",
        client: client,
        apiKey: null,
      });
    }
  }

  async selectFiles() {
    try {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Select Files',
        filters: {
          'All Files': ['*']
        }
      });
      
      if (uris && uris.length > 0) {
        const filesData = uris.map((uri) => ({
          path: uri.fsPath,
          name: path.basename(uri.fsPath),
          content: this.safeRead(uri.fsPath, "")
        }));
        
        this.webviewView.webview.postMessage({
          command: "filesSelected",
          files: filesData,
        });
      }
    } catch (err) {
      console.error("Error selecting files", err);
      vscode.window.showErrorMessage(`Error selecting files: ${err.message}`);
    }
  }

  async openWorkspaceFilePicker() {
    try {
      const files = await vscode.workspace.findFiles(
        "**/*",
        "**/node_modules/**"
      );
      const items = files.map((f) => ({
        label: path.relative(
          vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : "",
          f.fsPath
        ),
        description: f.fsPath,
      }));
      const selection = await vscode.window.showQuickPick(items, {
        placeHolder: "Select files from the workspace",
        canPickMany: true,
      });
      if (selection && selection.length > 0) {
        const filesData = selection.map((s) => ({
          path: s.description,
          label: s.label,
          content: this.safeRead(s.description, ""),
        }));
        this.webviewView.webview.postMessage({
          command: "filesSelected",
          files: filesData,
        });
      } else {
        this.webviewView.webview.postMessage({ command: "filePickerCanceled" });
      }
    } catch (err) {
      console.error("Error picking file", err);
      this.webviewView.webview.postMessage({
        command: "filePickerError",
        error: String(err),
      });
    }
  }

  async promptSetCerebrasReasoning() {
    try {
      const vscode = require('vscode');
      const choice = await vscode.window.showQuickPick([
        { label: 'Low', description: 'Lower reasoning effort (faster)', value: 'low' },
        { label: 'Medium', description: 'Balanced reasoning effort', value: 'medium' },
        { label: 'High', description: 'High reasoning effort (slower)', value: 'high' },
      ], { placeHolder: 'Select default reasoning effort for Cerebras' });
      if (!choice) return;
      await vscode.workspace.getConfiguration('vsx').update('cerebras.reasoningEffort', choice.value, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Cerebras reasoning effort set to ${choice.label}`);
      if (this.webviewView) this.webviewView.webview.postMessage({ command: 'cerebrasReasoningChanged', value: choice.value });
    } catch {
    }
  }

  async promptSetDualitySubtaskMode() {
    try {
      const vscode = require('vscode');
      
      
      const choice = await vscode.window.showQuickPick([
        { 
          label: 'Auto-decide (Default)', 
          value: false,
          description: 'Let the primary model decide between direct execution or subtasks'
        },
        { 
          label: 'Force Subtasks', 
          value: true,
          description: 'Always create subtasks without asking the primary model to decide'
        }
      ], { 
        placeHolder: 'Select duality mode behavior'
      });
      
      if (choice === undefined) return;
      
      await vscode.workspace.getConfiguration('vsx').update('duality.forceSubtasks', choice.value, vscode.ConfigurationTarget.Global);
      
      const modeText = choice.value ? 'Force Subtasks' : 'Auto-decide';
      vscode.window.showInformationMessage(`Duality mode set to: ${modeText}`);
      
      if (this.webviewView) {
        this.webviewView.webview.postMessage({ 
          command: 'dualitySubtaskModeChanged', 
          value: choice.value 
        });
      }
    } catch (error) {
      console.error('Error setting duality subtask mode:', error);
    }
  }

  // Legacy Mode Handlers
  async handleLegacyMode(modelId, prompt, requestId, message) {
    try {
      console.log('Handling Legacy Mode execution for request:', requestId);
      
      // Initialize Legacy Mode session storage
      if (!this.legacyModeSessions) {
        this.legacyModeSessions = new Map();
      }
      
      // Create session context
      const sessionContext = {
        modelId,
        prompt,
        requestId,
        startTime: new Date().toISOString(),
        webviewProvider: this,
        confirmationCallbacks: new Map()
      };
      
      this.legacyModeSessions.set(requestId, sessionContext);
      
      // Run Legacy Mode
      // If the webview included `previous_chat_history` in the original message, forward it to the mode
      let prevHistory = null;
      try {
        if (message && Array.isArray(message.previous_chat_history)) prevHistory = message.previous_chat_history;
      } catch { }

      const resp = await this.router.runMode('legacy', {
        router: this.router,
        modelId,
        prompt,
        requestId,
        context: this.context,
        previous_chat_history: prevHistory,
      });

      // Check for terminal commands that require confirmation
      if (resp && resp.tools_called && Array.isArray(resp.tools_called)) {
        const terminalCommands = resp.tools_called.filter(tool => 
          tool.requiresConfirmation && 
          (tool.tool === 'terminal_command' || tool.tool === 'terminalcommand' || tool.tool === 'execute_command')
        );
        
        if (terminalCommands.length > 0) {
          // Handle terminal command confirmations
          try {
            await this.handleLegacyModeTerminalConfirmations(resp, terminalCommands, sessionContext);
            return; // Don't send response yet, wait for confirmations
          } catch (err) {
            console.error('Error handling terminal confirmations:', err);
            // Fall back to sending response without terminal execution
          }
        }
      }

      // Clean up session for non-terminal responses
      this.legacyModeSessions.delete(sessionContext.requestId);

      // Normalize and format response for UI: prefer a router-provided
      // `user_text` if present, otherwise use parsed plain_text.
      const responseForUI = Object.assign({}, resp);
      try {
        let parserLocal = null;
        try {
          parserLocal = require('../route/parser');
        } catch {
          parserLocal = null;
        }

        const parsed = parserLocal
          ? parserLocal.parseResponse(resp && resp.raw !== undefined ? resp.raw : resp)
          : { plain_text: '', thinking_text: '', metadata: {} };

        // If router already returned `user_text`, use it. Otherwise try to
        // parse parsed.plain_text as JSON and extract `user_text` field.
        let user_text = null;
        if (resp && typeof resp.user_text === 'string' && resp.user_text.length) {
          user_text = resp.user_text;
        } else if (parsed && typeof parsed.plain_text === 'string') {
          try {
            const maybeJson = JSON.parse(parsed.plain_text);
            if (maybeJson && typeof maybeJson.user_text === 'string') user_text = maybeJson.user_text;
          } catch {
            // not JSON
          }
        }

        responseForUI.plain_text = user_text || parsed.plain_text;
        responseForUI.thinking_text = parsed.thinking_text;
        responseForUI.metadata = parsed.metadata || responseForUI.metadata || {};
        // Ensure there is a top-level `text` field the UI can use to render content
        try {
          if (!responseForUI.text || String(responseForUI.text).trim().length === 0) {
            if (typeof responseForUI.plain_text === 'string' && responseForUI.plain_text.trim().length) {
              responseForUI.text = responseForUI.plain_text;
            } else if (typeof responseForUI.user_text === 'string' && responseForUI.user_text.trim().length) {
              responseForUI.text = responseForUI.user_text;
            } else if (responseForUI.raw !== undefined) {
              try {
                responseForUI.text = typeof responseForUI.raw === 'string' ? responseForUI.raw : JSON.stringify(responseForUI.raw);
              } catch {
                responseForUI.text = String(responseForUI.raw || '');
              }
            } else {
              responseForUI.text = '';
            }
          }
        } catch (err) {
          // best-effort; don't fail the entire response
          try { responseForUI.text = responseForUI.plain_text || responseForUI.user_text || ''; } catch (e) { responseForUI.text = ''; }
        }
      } catch {
        // If parsing fails, fall back to sending raw router response
      }

      // Send final response to webview so the UI can update the assistant message
      try {
        this.webviewView.webview.postMessage({
          command: 'promptResponse',
          requestId,
          response: responseForUI,
          final: true,
        });
      } catch (err) {
        console.error('Failed to post final promptResponse for legacy mode', err);
      }

      // Send message to clear working status and hide spinner
      try {
        this.webviewView.webview.postMessage({
          command: 'clearWorkingStatus',
          requestId,
        });
      } catch (err) {
        console.error('Failed to post clearWorkingStatus for legacy mode', err);
      }
      
    } catch (err) {
      console.error('Legacy Mode execution error:', err);
      this.webviewView.webview.postMessage({
        command: "promptResponse",
        requestId,
        error: String(err),
      });
    }
  }
  
  handleLegacyModeConfirmation(message) {
    try {
      const { todoId, approved, feedback } = message;
      console.log('Legacy Mode confirmation received:', { todoId, approved, feedback });
      
      // Find the session that requested this confirmation
      for (const session of this.legacyModeSessions.values()) {
        if (session.confirmationCallbacks && session.confirmationCallbacks.has(todoId)) {
          const callback = session.confirmationCallbacks.get(todoId);
          callback({ approved, feedback });
          session.confirmationCallbacks.delete(todoId);
          break;
        }
      }
    } catch (err) {
      console.error('Error handling Legacy Mode confirmation:', err);
    }
  }

  async handleLegacyModeTerminalConfirmations(resp, terminalCommands, sessionContext) {
    try {
      console.log('Handling terminal command confirmations for legacy mode');

      // If workspace setting allows autopilot to run terminal commands, execute them immediately
      try {
        const autoRun = Boolean(vscode.workspace.getConfiguration('vsx').get('autopilot.runTerminalCommands') || false);
        if (autoRun) {
          console.log('Autopilot is allowed to run terminal commands automatically; executing commands');
          const confirmationResults = [];
          for (const tc of terminalCommands) {
            try {
              const terminal = require('../tools/terminal_command');
              const r = await terminal(tc.args || {});
              confirmationResults.push({ ...r, approved: true, todoId: `terminal_${sessionContext.requestId}_${confirmationResults.length}` });
            } catch (err) {
              confirmationResults.push({ tool: 'terminal_command', success: false, error: String(err && err.message ? err.message : err), approved: true, todoId: `terminal_${sessionContext.requestId}_${confirmationResults.length}` });
            }
          }

          // Update the tools_called array with actual results
          const updatedToolsCalled = [...(resp.tools_called || [])];
          let resultIndex = 0;
          for (let i = 0; i < updatedToolsCalled.length && resultIndex < confirmationResults.length; i++) {
            const t = updatedToolsCalled[i];
            if (t.requiresConfirmation && (t.tool === 'terminal_command' || t.tool === 'terminalcommand' || t.tool === 'execute_command')) {
              updatedToolsCalled[i] = { ...t, ...confirmationResults[resultIndex], requiresConfirmation: false };
              resultIndex++;
            }
          }

          // Send final response with updated tool results
          if (this.webviewView && this.webviewView.webview) {
            this.webviewView.webview.postMessage({
              command: 'terminalConfirmationsComplete',
              tools_called: updatedToolsCalled,
              requestId: sessionContext.requestId
            });
          }

          // Clean up session
          this.legacyModeSessions.delete(sessionContext.requestId);
          return;
        }
      } catch (err) {
        console.error('Error checking autopilot.runTerminalCommands setting', err);
      }
      
      // Send initial response with terminal command widgets
      const responseForUI = Object.assign({}, resp);
      
      // Process response for UI display
      try {
        let parserLocal = null;
        try {
          parserLocal = require('../route/parser');
        } catch {
          parserLocal = null;
        }

        const parsed = parserLocal
          ? parserLocal.parseResponse(resp && resp.raw !== undefined ? resp.raw : resp)
          : { plain_text: '', thinking_text: '', metadata: {} };

        let user_text = null;
        if (resp && typeof resp.user_text === 'string' && resp.user_text.length) {
          user_text = resp.user_text;
        } else if (parsed && typeof parsed.plain_text === 'string') {
          try {
            const maybeJson = JSON.parse(parsed.plain_text);
            if (maybeJson && typeof maybeJson.user_text === 'string') user_text = maybeJson.user_text;
          } catch {
            // not JSON
          }
        }

        responseForUI.plain_text = user_text || parsed.plain_text;
        responseForUI.thinking_text = parsed.thinking_text;
        responseForUI.metadata = parsed.metadata || responseForUI.metadata || {};
        
        // Ensure there is a top-level `text` field
        if (!responseForUI.text || String(responseForUI.text).trim().length === 0) {
          if (typeof responseForUI.plain_text === 'string' && responseForUI.plain_text.trim().length) {
            responseForUI.text = responseForUI.plain_text;
          } else if (typeof responseForUI.user_text === 'string' && responseForUI.user_text.trim().length) {
            responseForUI.text = responseForUI.user_text;
          } else if (responseForUI.raw !== undefined) {
            try {
              responseForUI.text = typeof responseForUI.raw === 'string' ? responseForUI.raw : JSON.stringify(responseForUI.raw);
            } catch {
              responseForUI.text = String(responseForUI.raw || '');
            }
          } else {
            responseForUI.text = '';
          }
        }
      } catch {
        // If parsing fails, fall back to sending raw router response
      }

      // Send response to webview with terminal commands requiring confirmation
      if (this.webviewView && this.webviewView.webview) {
        this.webviewView.webview.postMessage({
          command: 'assistantMessage',
          text: responseForUI.text || '',
          plain_text: responseForUI.plain_text || '',
          thinking_text: responseForUI.thinking_text || '',
          metadata: responseForUI.metadata || {},
          tools_called: resp.tools_called || [],
          requestId: sessionContext.requestId
        });
      }

      // Wait for all terminal command confirmations
      const confirmationPromises = terminalCommands.map(async (terminalCommand, index) => {
        const todoId = `terminal_${sessionContext.requestId}_${index}`;
        
        return new Promise((resolve) => {
          // Set up timeout to prevent hanging
          const timeout = setTimeout(() => {
            sessionContext.confirmationCallbacks.delete(todoId);
            resolve({ 
              tool: 'terminal_command', 
              success: false, 
              skipped: true, 
              message: 'User confirmation timeout',
              approved: false,
              todoId
            });
          }, 300000); // 5 minute timeout
          
          sessionContext.confirmationCallbacks.set(todoId, async ({ approved }) => {
            clearTimeout(timeout);
            
            if (approved) {
              // Execute the terminal command
              try {
                const terminal = require('../tools/terminal_command');
                const result = await terminal(terminalCommand.args || {});
                resolve({ ...result, approved: true, todoId });
              } catch (error) {
                resolve({ 
                  tool: 'terminal_command', 
                  success: false, 
                  error: `terminal_command module failed: ${error.message}`,
                  approved: true,
                  todoId
                });
              }
            } else {
              // Command was skipped
              resolve({ 
                tool: 'terminal_command', 
                success: false, 
                skipped: true, 
                message: 'User declined execution',
                approved: false,
                todoId
              });
            }
          });
        });
      });

      // Wait for all confirmations to complete
      const confirmationResults = await Promise.all(confirmationPromises);
      
      // Update the tools_called array with actual results
      const updatedToolsCalled = [...(resp.tools_called || [])];
      confirmationResults.forEach((result) => {
        const terminalCommandIndex = updatedToolsCalled.findIndex(tool => 
          tool.requiresConfirmation && 
          (tool.tool === 'terminal_command' || tool.tool === 'terminalcommand' || tool.tool === 'execute_command')
        );
        if (terminalCommandIndex !== -1) {
          updatedToolsCalled[terminalCommandIndex] = {
            ...updatedToolsCalled[terminalCommandIndex],
            ...result,
            requiresConfirmation: false
          };
        }
      });

      // Send final response with updated tool results
      if (this.webviewView && this.webviewView.webview) {
        this.webviewView.webview.postMessage({
          command: 'terminalConfirmationsComplete',
          tools_called: updatedToolsCalled,
          requestId: sessionContext.requestId
        });
      }

      // Clean up session
      this.legacyModeSessions.delete(sessionContext.requestId);
      
    } catch (err) {
      console.error('Error handling legacy mode terminal confirmations:', err);
      
      // Send error response
      if (this.webviewView && this.webviewView.webview) {
        this.webviewView.webview.postMessage({
          command: 'assistantMessage',
          text: 'Error processing terminal command confirmations',
          requestId: sessionContext.requestId
        });
      }
    }
  }

  // Duality Mode Handlers
  async handleDualityMode(modelId, prompt, requestId, message) {
    try {
      console.log('Handling Duality Mode execution for request:', requestId);
      
      // Initialize Duality Mode session storage
      if (!this.dualityModeSessions) {
        this.dualityModeSessions = new Map();
      }
      
      // Create session context
      const sessionContext = {
        modelId,
        prompt,
        requestId,
        startTime: new Date().toISOString(),
        webviewProvider: this,
        status: 'initializing'
      };
      
      this.dualityModeSessions.set(requestId, sessionContext);
      
      // Run Duality Mode
      // If the webview included `previous_chat_history` in the original message, forward it to the mode
      let prevHistory = null;
      try {
        if (message && Array.isArray(message.previous_chat_history)) prevHistory = message.previous_chat_history;
      } catch { }

      const resp = await this.router.runMode('duality', {
        router: this.router,
        modelId,
        prompt,
        requestId,
        context: this.context,
        previous_chat_history: prevHistory,
        webviewProvider: this,
      });

      // Clean up session
      this.dualityModeSessions.delete(requestId);

      // Normalize and format response for UI
      const responseForUI = Object.assign({}, resp);
      try {
        let parserLocal = null;
        try {
          parserLocal = require('../route/parser');
        } catch {
          parserLocal = null;
        }

        const parsed = parserLocal
          ? parserLocal.parseResponse(resp && resp.raw !== undefined ? resp.raw : resp)
          : { plain_text: '', thinking_text: '', metadata: {} };

        // If router returned a direct `user_text`, prefer that for UI.
        responseForUI.plain_text =
          (resp && typeof resp.user_text === 'string' && resp.user_text.length)
            ? resp.user_text
            : parsed.plain_text;
        responseForUI.thinking_text = parsed.thinking_text;
        responseForUI.metadata = parsed.metadata || responseForUI.metadata || {};
        
        // Add Duality mode specific metadata
        if (resp && resp.isDualityExecution) {
          responseForUI.isDualityExecution = true;
          responseForUI.dualityMetadata = resp.raw || {};
        }
      } catch {
        // If parsing fails, fall back to sending raw router response
      }

      // Send final response to webview so the UI can update the assistant message
      try {
        this.webviewView.webview.postMessage({
          command: 'promptResponse',
          requestId,
          response: responseForUI,
          final: true,
        });
      } catch (err) {
        console.error('Failed to post final promptResponse for duality mode:', err);
      }

    } catch (err) {
      console.error('Error handling Duality Mode:', err);
      
      // Clean up session
      if (this.dualityModeSessions) {
        this.dualityModeSessions.delete(requestId);
      }
      
      // Send error response to webview
      try {
        this.webviewView.webview.postMessage({
          command: 'promptResponse',
          requestId,
          error: String(err),
        });
      } catch (postErr) {
        console.error('Failed to post error response for duality mode:', postErr);
      }
    }
  }

  // Send Duality mode error to UI
  async sendDualityError(requestId, errorData) {
    try {
      if (this.webviewView && this.webviewView.webview) {
        this.webviewView.webview.postMessage({
          command: 'dualityModeError',
          requestId,
          errorData
        });
      }
    } catch (err) {
      console.error('Failed to send Duality mode error:', err);
    }
  }

  handleDualityModeProgressUpdate(message) {
    try {
      const { requestId, progressData } = message;
      console.log('Duality Mode progress update received:', { requestId, progressData });
      
      // Find the session that requested this update
      if (this.dualityModeSessions && this.dualityModeSessions.has(requestId)) {
        const session = this.dualityModeSessions.get(requestId);
        session.lastProgressUpdate = progressData;
        session.lastUpdateTime = new Date().toISOString();
      }
      
      // Forward progress update to UI
      if (this.webviewView && this.webviewView.webview) {
        this.webviewView.webview.postMessage({
          command: 'dualityModeProgress',
          requestId,
          progressData
        });
      }
    } catch (err) {
      console.error('Error handling Duality Mode progress update:', err);
    }
  }

  handleDualityModeSubtaskUpdate(message) {
    try {
      const { requestId, subtaskIndex, status, result, verification } = message;
      console.log('Duality Mode subtask update received:', { requestId, subtaskIndex, status });
      
      // Find the session that requested this update
      if (this.dualityModeSessions && this.dualityModeSessions.has(requestId)) {
        const session = this.dualityModeSessions.get(requestId);
        if (!session.subtaskUpdates) session.subtaskUpdates = [];
        session.subtaskUpdates.push({
          subtaskIndex,
          status,
          result,
          verification,
          timestamp: new Date().toISOString()
        });
      }
      
      // Forward subtask update to UI
      if (this.webviewView && this.webviewView.webview) {
        this.webviewView.webview.postMessage({
          command: 'dualityModeSubtaskUpdate',
          requestId,
          subtaskIndex,
          status,
          result,
          verification
        });
      }
    } catch (err) {
      console.error('Error handling Duality Mode subtask update:', err);
    }
  }
  
  // Legacy Mode Tool Execution Methods
  async executeLegacyTool(toolName, params) {
    try {
      let result;
      
      switch (toolName) {
        case 'readFile':
          result = await this.legacyReadFile(params.filePath);
          break;
        case 'writeFile':
          result = await this.legacyWriteFile(params.filePath, params.content);
          break;
        case 'createFile':
          result = await this.legacyCreateFile(params.filePath, params.content);
          break;
        case 'deleteFile':
          result = await this.legacyDeleteFile(params.filePath);
          break;
        case 'searchFiles':
          result = await this.legacySearchFiles(params.pattern, params.excludePattern);
          break;
        case 'executeCommand':
          result = await this.legacyExecuteCommand(params.command, params.args);
          break;
        case 'showMessage':
          result = await this.legacyShowMessage(params.message, params.type);
          break;
        case 'executeTerminal':
          result = await this.legacyExecuteTerminal(params.command, params.workingDirectory);
          break;
        default:
          result = { success: false, error: `Unknown tool: ${toolName}` };
      }
      
      // Notify webview of tool execution
      this.webviewView.webview.postMessage({
        command: 'legacyModeCommand',
        command: 'tool_called',
        data: {
          toolName,
          input: params,
          output: result
        }
      });
      
      return result;
    } catch (err) {
      const errorResult = { success: false, error: err.message };
      
      // Notify webview of error
      this.webviewView.webview.postMessage({
        command: 'legacyModeCommand',
        command: 'error_occurred',
        data: {
          context: `Tool execution: ${toolName}`,
          message: err.message,
          suggestion: 'Check the tool parameters and try again'
        }
      });
      
      return errorResult;
    }
  }
  
  // Legacy Mode File Operations
  async legacyReadFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, content, filePath };
    } catch (error) {
      return { success: false, error: error.message, filePath };
    }
  }
  
  async legacyWriteFile(filePath, content) {
    try {
      const resolvedPath = this.resolveFilePath(filePath); // Resolve to workspace
      // Ensure directory exists (recursive)
      const dir = path.dirname(resolvedPath);
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      fs.writeFileSync(resolvedPath, content || '', 'utf8'); // Preserve exact extension from resolvedPath
      return { success: true, filePath: resolvedPath };
    } catch (error) {
      return { success: false, error: error.message, filePath };
    }
  }
  
  async legacyCreateFile(filePath, content = '') {
    try {
      const resolvedPath = this.resolveFilePath(filePath); // Resolve to workspace
      if (fs.existsSync(resolvedPath)) {
        return { success: false, error: 'File already exists', filePath: resolvedPath };
      }
      // Ensure directory exists (recursive)
      const dir = path.dirname(resolvedPath);
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      fs.writeFileSync(resolvedPath, content, 'utf8'); // Preserve exact extension
      return { success: true, filePath: resolvedPath };
    } catch (error) {
      return { success: false, error: error.message, filePath };
    }
  }
  
  async legacyDeleteFile(filePath) {
    try {
      fs.unlinkSync(filePath);
      return { success: true, filePath };
    } catch (error) {
      return { success: false, error: error.message, filePath };
    }
  }
  
  async legacySearchFiles(pattern, excludePattern = '**/node_modules/**') {
    try {
      const files = await vscode.workspace.findFiles(pattern, excludePattern);
      return { 
        success: true, 
        files: files.map(f => ({
          path: f.fsPath,
          relativePath: vscode.workspace.asRelativePath(f)
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  async legacyExecuteCommand(command, args = []) {
    try {
      const result = await vscode.commands.executeCommand(command, ...args);
      return { success: true, result, command };
    } catch (error) {
      return { success: false, error: error.message, command };
    }
  }
  
  async legacyShowMessage(message, type = 'info') {
    try {
      let result;
      switch (type) {
        case 'error':
          result = await vscode.window.showErrorMessage(message);
          break;
        case 'warning':
          result = await vscode.window.showWarningMessage(message);
          break;
        default:
          result = await vscode.window.showInformationMessage(message);
      }
      return { success: true, result, message, type };
    } catch (error) {
      return { success: false, error: error.message, message, type };
    }
  }
  
  async legacyExecuteTerminal(command, workingDirectory) {
    try {
      let cwd = workingDirectory || this.getWorkspaceRoot(); // Default to workspace root
      cwd = this.resolveFilePath(cwd) || cwd; // Resolve if relative
      // Create a terminal for Legacy Mode
      const terminal = vscode.window.createTerminal({
        name: 'Legacy Mode',
        cwd: cwd
      });
      terminal.sendText(command);
      terminal.show();
      
      // Notify webview
      this.webviewView.webview.postMessage({
        command: 'legacyModeCommand',
        command: 'terminal_executed',
        data: {
          command,
          output: `Executed: ${command}`
        }
      });
      
      return { 
        success: true, 
        command, 
        workingDirectory: cwd,
        output: `Executed: ${command}` // Simulated output
      };
    } catch (error) {
      return { success: false, error: error.message, command };
    }
  }

  // New: handle write-file tool which shows a diff and offers Keep/Undo
  async handleWriteFileTool(filePath, newContent, requestId) {
    try {
      const resolvedPath = this.resolveFilePath(filePath); // Resolve to workspace
      const originalExists = fs.existsSync(resolvedPath);
      const originalContent = originalExists ? fs.readFileSync(resolvedPath, 'utf8') : '';

      // Check autopilot setting (global workspace config)
      let autopilot = false;
      try {
        const vscode = require('vscode');
        autopilot = Boolean(vscode.workspace.getConfiguration('vsx').get('autopilot.enabled'));
      } catch {}

      if (autopilot) {
        try {
          // Ensure directory exists
          try { require('fs').mkdirSync(require('path').dirname(resolvedPath), { recursive: true }); } catch {}
          fs.writeFileSync(resolvedPath, newContent || '', 'utf8'); // Use resolvedPath to preserve extension
          // Summarize changes: simple line diff counts
          const oldLines = (originalContent || '').split(/\r?\n/);
          const newLines = (newContent || '').split(/\r?\n/);
          let added = 0, removed = 0;
          // simple heuristic by comparing lengths and scanning
          try {
            const jsdiff = require('diff');
            const parts = jsdiff.diffLines(originalContent || '', newContent || '');
            for (const p of parts) {
              if (p.added) added += String(p.count || (p.value || '').split(/\n/).length).replace(/NaN/, '0') * 1 || ((p.value||'').split(/\n/).length || 0);
              else if (p.removed) removed += String(p.count || (p.value || '').split(/\n/).length).replace(/NaN/, '0') * 1 || ((p.value||'').split(/\n/).length || 0);
            }
          } catch {
            added = Math.max(0, newLines.length - oldLines.length);
            removed = Math.max(0, oldLines.length - newLines.length);
          }

          // Notify webview and caller
          if (this.webviewView && this.webviewView.webview) {
            this.webviewView.webview.postMessage({ command: 'tool.writeFile.response', requestId, success: true, action: 'autokept', filePath: resolvedPath, added, removed });
          }
          // Also inform LLM via appendChatMessage
          return { success: true, action: 'autokept', filePath: resolvedPath, added, removed };
        } catch (err) {
          console.error('autopilot write failed', err);
          if (this.webviewView && this.webviewView.webview) this.webviewView.webview.postMessage({ command: 'tool.writeFile.response', requestId, success: false, error: String(err) });
          return { success: false, error: String(err), filePath: resolvedPath };
        }
      }

    // Show the diff to the user (inline unified diff preview) and wait for action
    const keep = await this.showDiffAndPrompt(originalContent, newContent || '', resolvedPath, requestId); // Use resolvedPath

    if (keep) {
      // Apply the write using resolvedPath
      try { require('fs').mkdirSync(require('path').dirname(resolvedPath), { recursive: true }); } catch {}
      fs.writeFileSync(resolvedPath, newContent || '', 'utf8');
      // Notify UI that change was kept
      this.webviewView.webview.postMessage({ command: 'tool.writeFile.response', requestId, success: true, action: 'kept', filePath: resolvedPath });
      return { success: true, action: 'kept', filePath: resolvedPath };
    } else {
      // Notify UI that change was undone
      this.webviewView.webview.postMessage({ command: 'tool.writeFile.response', requestId, success: true, action: 'undone', filePath: resolvedPath });
      return { success: true, action: 'undone', filePath: resolvedPath };
    }
    } catch (error) {
      console.error('handleWriteFileTool error', error);
      this.webviewView.webview.postMessage({ command: 'tool.writeFile.response', requestId, success: false, error: String(error) });
      return { success: false, error: String(error), filePath };
    }
  }

  async showDiffAndPrompt(originalContent, proposedContent, targetPath) {
    const vscode = require('vscode');
    // Ensure a map for pending proposals exists
    if (!this.pendingWriteProposals) this.pendingWriteProposals = new Map();
    try {
      // Use js 'diff' to compute line diffs if available
      let parts = null;
      try {
        const jsdiff = require('diff');
        parts = jsdiff.diffLines(originalContent || '', proposedContent || '');
      } catch {
        // fallback: treat whole file as replaced
        parts = [{ removed: true, value: originalContent || '' }, { added: true, value: proposedContent || '' }];
      }

      // Build display lines with prefixes and collect types for decorations
      const displayLines = [];
      const lineTypes = []; // 'added'|'removed'|'context'
      for (const p of parts) {
        const segLines = String(p.value || '').split(/\n/);
        // drop final empty line caused by trailing newline split
        if (segLines.length > 0 && segLines[segLines.length - 1] === '') segLines.pop();
        for (const l of segLines) {
          if (p.added) {
            displayLines.push('+ ' + l);
            lineTypes.push('added');
          } else if (p.removed) {
            displayLines.push('- ' + l);
            lineTypes.push('removed');
          } else {
            displayLines.push('  ' + l);
            lineTypes.push('context');
          }
        }
      }

      const diffText = displayLines.join('\n');

      // Try to reuse an existing visible editor for the target file so we replace its tab content.
      let editor = null;
      let doc = null;
      try {
        const fs = require('fs');
        if (fs.existsSync(targetPath)) {
          const absPath = require('path').resolve(targetPath);
          const visible = vscode.window.visibleTextEditors || [];
          for (const ve of visible) {
            try {
              if (ve.document && ve.document.uri && ve.document.uri.fsPath && require('path').resolve(ve.document.uri.fsPath) === absPath) {
                editor = ve;
                doc = ve.document;
                break;
              }
            } catch { }
          }
          if (!editor) {
            doc = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
            const active = vscode.window.activeTextEditor;
            const viewColumn = active ? active.viewColumn : vscode.ViewColumn.Active;
            editor = await vscode.window.showTextDocument(doc, { preview: false, viewColumn });
          }
        } else {
          // file doesn't exist: open an untitled doc to preview
          doc = await vscode.workspace.openTextDocument({ content: originalContent || '', language: 'plaintext' });
          const active = vscode.window.activeTextEditor;
          const viewColumn = active ? active.viewColumn : vscode.ViewColumn.Active;
          editor = await vscode.window.showTextDocument(doc, { preview: false, viewColumn });
        }
      } catch {
        doc = await vscode.workspace.openTextDocument({ content: originalContent || '', language: 'plaintext' });
        const active = vscode.window.activeTextEditor;
        const viewColumn = active ? active.viewColumn : vscode.ViewColumn.Active;
        editor = await vscode.window.showTextDocument(doc, { preview: false, viewColumn });
      }

      // Save original buffer for restore if needed
      const originalBuffer = doc.getText();

      // Replace editor content with diffText (unsaved change)
      await editor.edit((eb) => {
        const lastLine = doc.lineCount > 0 ? doc.lineAt(doc.lineCount - 1).range.end : new vscode.Position(0, 0);
        eb.replace(new vscode.Range(new vscode.Position(0, 0), lastLine), diffText);
      });

      // Create decoration types that mimic git added/removed styling
      const addedDeco = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        overviewRulerColor: 'rgba(16, 185, 129, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        border: '1px solid rgba(16,185,129,0.12)',
        after: { margin: '0 0 0 10px' }
      });
      const removedDeco = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: 'rgba(239, 68, 68, 0.06)',
        overviewRulerColor: 'rgba(239, 68, 68, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        border: '1px solid rgba(239,68,68,0.08)'
      });

      // Compute ranges for decorations accurately based on current document line lengths
      const addedRanges = [];
      const removedRanges = [];
      for (let i = 0; i < lineTypes.length; i++) {
        const t = lineTypes[i];
        try {
          const line = editor.document.lineAt(i);
          const range = new vscode.Range(new vscode.Position(i, 0), line.range.end);
          if (t === 'added') addedRanges.push(range);
          else if (t === 'removed') removedRanges.push(range);
        } catch {
          // ignore out-of-range lines
        }
      }

      try { editor.setDecorations(addedDeco, addedRanges); } catch {}
      try { editor.setDecorations(removedDeco, removedRanges); } catch {}

      // Create interactive in-editor controls: status bar items and hover command links
      const id = String(targetPath) + '::' + String(Date.now()) + '::' + Math.random().toString(36).slice(2,8);

      // Prepare a promise that will be resolved when user acts
      let resolvePromise;
      const actionPromise = new Promise((res) => { resolvePromise = res; });

      // Save pending proposal info so commands can act on it
      this.pendingWriteProposals.set(id, {
        targetPath,
        originalContent,
        proposedContent,
        editor,
        originalBuffer,
        addedDeco,
        removedDeco,
        resolve: resolvePromise,
      });

      // Create status bar items for Keep and Undo. Register dynamic commands so
      // status bar clicks can invoke handlers with the proposal id.
      try {
        const keepItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        keepItem.text = '$(check) Keep';
        keepItem.command = { command: 'vsx.keepChange', title: 'Keep change', arguments: [id] };
        keepItem.tooltip = `Apply proposed changes to ${targetPath}`;
        keepItem.show();

        const undoItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        undoItem.text = '$(close) Undo';
        undoItem.command = { command: 'vsx.undoChange', title: 'Undo change', arguments: [id] };
        undoItem.tooltip = `Discard proposed changes for ${targetPath}`;
        undoItem.show();

        // store items so they can be disposed after action
        const pEntry = this.pendingWriteProposals.get(id);
        pEntry.keepItem = keepItem;
        pEntry.undoItem = undoItem;
        try { if (this.context && this.context.subscriptions) { this.context.subscriptions.push(keepItem); this.context.subscriptions.push(undoItem); } } catch {}
      } catch (e) { console.error('status bar creation failed', e); }

      // Also add a hover with clickable command links on the first line to mimic in-editor buttons
      try {
        const pEntry = this.pendingWriteProposals.get(id);
        const hoverRange = new vscode.Range(new vscode.Position(0,0), new vscode.Position(0,0));
        const md = new vscode.MarkdownString(`[Keep](command:vsx.keepChange?${encodeURIComponent(JSON.stringify([id]))}) ⠀ [Undo](command:vsx.undoChange?${encodeURIComponent(JSON.stringify([id]))})`);
        md.isTrusted = true;
        const hoverDeco = vscode.window.createTextEditorDecorationType({ after: { contentText: ' ⠀ ⠀(Keep / Undo) ', margin: '0 0 0 20px' } });
        try { editor.setDecorations(hoverDeco, [{ range: hoverRange, hoverMessage: md }]); } catch (e) { console.error('set hover decoration failed', e); }
        pEntry.hoverDeco = hoverDeco;
      } catch (e) { console.error('hover creation failed', e); }

      // Notify the webview UI so it can show a small banner/notification
      // Notification removed to reduce message spam

      // Also show a native info message so the user notices the status bar buttons
      try {
        try { vscode.window.showInformationMessage(`Preview opened for ${targetPath}. Use status bar Keep/Undo.`); } catch (e) {}
      } catch (e) {}

      // Return a promise that resolves when keep/undo command is executed
      return actionPromise;
    } catch (err) {
      console.error('showDiffAndPrompt failed', err);
      return false;
    }
  }

  // Commands invoked by status bar or hover links
  async handleKeepById(id) {
    try {
      if (!this.pendingWriteProposals || !this.pendingWriteProposals.has(id)) return false;
      const p = this.pendingWriteProposals.get(id);
      const vscode = require('vscode');
      const fs = require('fs');
      const path = require('path');
      try { fs.mkdirSync(path.dirname(p.targetPath), { recursive: true }); } catch {}
      fs.writeFileSync(p.targetPath, p.proposedContent || '', 'utf8');

      // Replace editor buffer with proposed content
      try {
        await p.editor.edit((eb) => {
          const last = p.editor.document.lineCount > 0 ? p.editor.document.lineAt(p.editor.document.lineCount - 1).range.end : new vscode.Position(0,0);
          eb.replace(new vscode.Range(new vscode.Position(0,0), last), p.proposedContent || '');
        });
        try { await p.editor.document.save(); } catch {}
      } catch {}

      // cleanup decorations and status bar
      try { p.editor.setDecorations(p.addedDeco, []); } catch {}
      try { p.editor.setDecorations(p.removedDeco, []); } catch {}
      try { p.addedDeco.dispose(); } catch {}
      try { p.removedDeco.dispose(); } catch {}
      try { p.hoverDeco && p.hoverDeco.dispose(); } catch {}
      try { p.keepItem && p.keepItem.dispose(); } catch {}
      try { p.undoItem && p.undoItem.dispose(); } catch {}

      // resolve promise
      try { p.resolve(true); } catch {}
      this.pendingWriteProposals.delete(id);
      return true;
    } catch (err) {
      console.error('handleKeepById failed', err);
      return false;
    }
  }

  async handleUndoById(id) {
    try {
      if (!this.pendingWriteProposals || !this.pendingWriteProposals.has(id)) return false;
      const p = this.pendingWriteProposals.get(id);
      // Restore original buffer
      try {
        await p.editor.edit((eb) => {
          const last = p.editor.document.lineCount > 0 ? p.editor.document.lineAt(p.editor.document.lineCount - 1).range.end : new vscode.Position(0,0);
          eb.replace(new vscode.Range(new vscode.Position(0,0), last), p.originalBuffer || '');
        });
      } catch {}

      // cleanup decorations and status bar
      try { p.editor.setDecorations(p.addedDeco, []); } catch {}
      try { p.editor.setDecorations(p.removedDeco, []); } catch {}
      try { p.addedDeco.dispose(); } catch {}
      try { p.removedDeco.dispose(); } catch {}
      try { p.hoverDeco && p.hoverDeco.dispose(); } catch {}
      try { p.keepItem && p.keepItem.dispose(); } catch {}
      try { p.undoItem && p.undoItem.dispose(); } catch {}

      try { p.resolve(false); } catch {}
      this.pendingWriteProposals.delete(id);
      return true;
    } catch (err) {
      console.error('handleUndoById failed', err);
      return false;
    }
  }

  // Method to notify webview about tool calls
  notifyToolCall(toolCallData) {
    try {
      if (this.webviewView && this.webviewView.webview) {
        this.webviewView.webview.postMessage({
          command: 'toolCallNotification',
          toolCall: toolCallData
        });
      }
    } catch (error) {
      console.error('Failed to send tool call notification:', error);
    }
  }

  // Method to send incremental messages to webview
  sendIncrementalMessage(messageData) {
    try {
      if (this.webviewView && this.webviewView.webview) {
        this.webviewView.webview.postMessage(messageData);
      }
    } catch (error) {
      console.error('Failed to send incremental message:', error);
    }
  }

  // Handle accepting file edits (both manual and auto)
  async handleAcceptFileEdit(filePath, changes, requestId, isAuto = false) {
    try {
      const fs = require('fs');
      
      
      // Resolve file path
      const resolvedPath = this.resolveFilePath(filePath);
      if (!resolvedPath) {
        throw new Error('Invalid file path');
      }
      
      // Write changes to file
      if (typeof changes === 'string') {
        fs.writeFileSync(resolvedPath, changes, 'utf8');
      }
      
      // Calculate diff stats (simplified)
      const lines = changes ? changes.split('\n') : [];
      const added = lines.filter(line => line.startsWith('+')).length;
      const removed = lines.filter(line => line.startsWith('-')).length;
      
      // Notify webview
      if (this.webviewView && this.webviewView.webview) {
        this.webviewView.webview.postMessage({
          command: 'tool.writeFile.response',
          requestId,
          success: true,
          action: isAuto ? 'autokept' : 'kept',
          filePath: resolvedPath,
          added,
          removed
        });
      }
      
      console.log(`File ${isAuto ? 'auto-' : ''}accepted: ${resolvedPath}`);
    } catch (err) {
      console.error('handleAcceptFileEdit failed:', err);
      if (this.webviewView && this.webviewView.webview) {
        this.webviewView.webview.postMessage({
          command: 'tool.writeFile.response',
          requestId,
          success: false,
          error: String(err)
        });
      }
    }
  }

  // Handle rejecting file edits
  async handleRejectFileEdit(filePath, requestId) {
    try {
      // For now, just notify that the edit was rejected
      if (this.webviewView && this.webviewView.webview) {
        this.webviewView.webview.postMessage({
          command: 'tool.writeFile.response',
          requestId,
          success: true,
          action: 'rejected',
          filePath
        });
      }
      
      console.log(`File edit rejected: ${filePath}`);
    } catch (err) {
      console.error('handleRejectFileEdit failed:', err);
    }
  }

  // Session Management Methods
  initializeSessionManagement() {
    try {
      // Initialize session storage maps
      if (!this.dualityModeSessions) {
        this.dualityModeSessions = new Map();
      }
      if (!this.legacyModeSessions) {
        this.legacyModeSessions = new Map();
      }
      
      // Set up periodic cleanup
      this.setupSessionCleanup();
      
      console.log('Session management initialized');
    } catch (err) {
      console.error('Error initializing session management:', err);
    }
  }

  setupSessionCleanup() {
    try {
      // Clean up expired sessions every 5 minutes
      if (this.sessionCleanupInterval) {
        clearInterval(this.sessionCleanupInterval);
      }
      
      this.sessionCleanupInterval = setInterval(() => {
        this.cleanupExpiredSessions();
      }, 300000); // 5 minutes
      
      // Clean up on extension deactivation
      if (this.context && this.context.subscriptions) {
        this.context.subscriptions.push({
          dispose: () => {
            if (this.sessionCleanupInterval) {
              clearInterval(this.sessionCleanupInterval);
            }
            this.cleanupAllSessions();
          }
        });
      }
    } catch (err) {
      console.error('Error setting up session cleanup:', err);
    }
  }

  cleanupExpiredSessions() {
    try {
      const now = Date.now();
      const maxAge = 3600000; // 1 hour
      
      // Clean up Duality mode sessions
      for (const [requestId, session] of this.dualityModeSessions.entries()) {
        if (session.startTime && (now - new Date(session.startTime).getTime()) > maxAge) {
          this.dualityModeSessions.delete(requestId);
          console.log(`Cleaned up expired Duality mode session: ${requestId}`);
        }
      }
      
      // Clean up Legacy mode sessions
      for (const [requestId, session] of this.legacyModeSessions.entries()) {
        if (session.startTime && (now - new Date(session.startTime).getTime()) > maxAge) {
          this.legacyModeSessions.delete(requestId);
          console.log(`Cleaned up expired Legacy mode session: ${requestId}`);
        }
      }
      
      // Clean up Duality mode internal sessions
      try {
        const dualityMode = require('../modes/duality');
        if (dualityMode.SessionManager) {
          dualityMode.SessionManager.cleanupExpiredSessions(maxAge);
        }
      } catch (err) {
        // Duality mode might not be available
      }
    } catch (err) {
      console.error('Error cleaning up expired sessions:', err);
    }
  }

  cleanupAllSessions() {
    try {
      // Clean up all webview provider sessions
      this.dualityModeSessions.clear();
      this.legacyModeSessions.clear();
      
      // Clean up Duality mode internal sessions
      try {
        const dualityMode = require('../modes/duality');
        if (dualityMode.SessionManager) {
          const activeSessions = dualityMode.SessionManager.getAllActiveSessions();
          for (const session of activeSessions) {
            dualityMode.SessionManager.cleanupSession(session.requestId);
          }
        }
      } catch (err) {
        // Duality mode might not be available
      }
      
      console.log('All sessions cleaned up');
    } catch (err) {
      console.error('Error cleaning up all sessions:', err);
    }
  }

  recoverDualitySession(requestId) {
    try {
      const dualityMode = require('../modes/duality');
      if (dualityMode.SessionManager) {
        const recoveredSession = dualityMode.SessionManager.recoverSession(requestId);
        if (recoveredSession) {
          recoveredSession.webviewProvider = this;
          this.dualityModeSessions.set(requestId, {
            requestId,
            startTime: new Date().toISOString(),
            webviewProvider: this,
            status: 'recovered',
            recoveredSession: recoveredSession
          });
          return recoveredSession;
        }
      }
      return null;
    } catch (err) {
      console.error(`Error recovering Duality session ${requestId}:`, err);
      return null;
    }
  }
}

module.exports = MyWebviewProvider;
