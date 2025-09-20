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
        </div>
        ${inputArea}
        ${chatUserTpl}
        ${chatAssistantTpl}
        </div>
  ${chatUserTpl}
  ${legacyTemplates}
  ${toolNotifierTpl}
  <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
    try {
      this.router = routerFactory ? routerFactory(this.context, this) : null;
    } catch (err) {
      console.error("Failed to create router:", err);
      this.router = null;
    }

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
          case "openFilePicker":
            this.openWorkspaceFilePicker();
            return;
          case "selectedFilesChanged":
            console.log("Selected files from webview:", message.files);
            return;
          case "openApiKeySetup":
            this.openApiKeySetup();
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
              const modelId = message.modelId;
              const prompt = message.prompt;
              const requestId = message.requestId;
              const modeId = message.modeId;
              if (!this.router) throw new Error("Router not configured");
              
              // Special handling for Legacy Mode
              if (modeId === 'legacy') {
                await this.handleLegacyMode(modelId, prompt, requestId, message);
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
          case "legacyModeConfirmationResponse":
            this.handleLegacyModeConfirmation(message);
            return;
        }
      },
      undefined,
      this.context.subscriptions
    );
  }

  async openApiKeySetup() {
    try {
      const clients = ["gemini", "nvidia"];
      const clientNames = {
        gemini: "Google Gemini",
        nvidia: "NVIDIA AI",
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

  // Legacy Mode Handlers
  async handleLegacyMode(modelId, prompt, requestId) {
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
      const resp = await this.router.runMode('legacy', {
        router: this.router,
        modelId,
        prompt,
        requestId,
        context: this.context,
      });

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
      } catch {
        // If parsing fails, fall back to sending raw router response
      }

      // COMMENTED OUT: Prevent updating first message with final text
      // this.webviewView.webview.postMessage({
      //   command: 'promptResponse',
      //   requestId,
      //   response: responseForUI,
      // });
      
      // Send message to clear working status and hide spinner
      this.webviewView.webview.postMessage({
        command: 'clearWorkingStatus',
        requestId,
      });
      
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
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, filePath };
    } catch (error) {
      return { success: false, error: error.message, filePath };
    }
  }
  
  async legacyCreateFile(filePath, content = '') {
    try {
      if (fs.existsSync(filePath)) {
        return { success: false, error: 'File already exists', filePath };
      }
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, filePath };
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
      // Create a terminal for Legacy Mode
      const terminal = vscode.window.createTerminal({
        name: 'Legacy Mode',
        cwd: workingDirectory
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
        workingDirectory,
        output: `Executed: ${command}` // Simulated output
      };
    } catch (error) {
      return { success: false, error: error.message, command };
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
}

module.exports = MyWebviewProvider;
