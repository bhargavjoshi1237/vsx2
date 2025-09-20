const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

let routerFactory;
try {
  routerFactory = require("../route/route").createRouter;
} catch (e) {
  routerFactory = null;
}

// Import Legacy Mode components
let TodoManager, ToolExecutor, contextManager;
try {
  const { TodoManager: TM } = require("../legacy/todoManager");
  const { ToolExecutor: TE } = require("../legacy/toolExecutor");
  const { contextManager: CM } = require("../legacy/contextManager");
  TodoManager = TM;
  ToolExecutor = TE;
  contextManager = CM;
} catch (e) {
  console.warn("Legacy Mode components not available:", e.message);
  TodoManager = null;
  ToolExecutor = null;
  contextManager = null;
}

class MyWebviewProvider {
  constructor(context) {
    this.context = context;
    
    // Initialize Legacy Mode components
    this.legacyModeSessions = new Map();
    this.legacyModeConfirmations = new Map();
    this.toolExecutor = ToolExecutor ? new ToolExecutor(vscode) : null;
    
    // Performance optimizations
    this.requestCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.pendingRequests = new Map();
    this.uiUpdateQueue = [];
    this.uiUpdateTimer = null;
    this.uiUpdateBatchSize = 10;
    this.uiUpdateInterval = 50; // 50ms batching
    
    // Performance metrics
    this.performanceMetrics = {
      requestsProcessed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      uiUpdatesQueued: 0,
      uiUpdatesBatched: 0,
      averageResponseTime: 0,
      lastMetricsReset: new Date()
    };
    
    // Legacy Mode session cleanup interval (30 minutes)
    this.sessionCleanupInterval = setInterval(() => {
      this.cleanupExpiredLegacyModeSessions();
    }, 30 * 60 * 1000);
    
    // Performance monitoring interval (5 minutes)
    this.performanceMonitoringInterval = setInterval(() => {
      this.logPerformanceMetrics();
    }, 5 * 60 * 1000);
  }

  /**
   * Cleanup method for shutdown
   */
  dispose() {
    // Clear all intervals
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
    }
    
    if (this.performanceMonitoringInterval) {
      clearInterval(this.performanceMonitoringInterval);
    }
    
    // Process any pending UI updates
    if (this.uiUpdateTimer) {
      clearTimeout(this.uiUpdateTimer);
      this.processBatchedUIUpdates();
    }
    
    // Clear caches
    this.requestCache.clear();
    this.legacyModeSessions.clear();
    this.legacyModeConfirmations.clear();
    
    console.log('WebView Provider disposed with performance optimizations');
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
  <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
    try {
      if (routerFactory) {
        this.router = routerFactory();
      } else {
        console.error("Router factory not available");
        this.router = null;
      }
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
              if (!this.router) {
                console.error("Router not configured");
                this.webviewView.webview.postMessage({
                  command: "promptResponse",
                  requestId,
                  error: "Router not configured. Please check your API keys.",
                  response: {
                    text: "Error: Router not configured. Please check your API keys and try again.",
                    error: true
                  }
                });
                return;
              }
              
              // Special handling for Legacy Mode
              if (modeId === 'legacy') {
                try {
                  await this.handleLegacyMode(modelId, prompt, requestId, message);
                } catch (err) {
                  console.error('Legacy Mode error:', err);
                  this.webviewView.webview.postMessage({
                    command: "promptResponse",
                    requestId,
                    error: String(err),
                    response: {
                      text: `Legacy Mode Error: ${err.message || String(err)}`,
                      error: true
                    }
                  });
                }
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
                    resp = await this.router.sendPromptNvidia(modelId, prompt);
                  } else {
                    resp = await this.router.sendPrompt(modelId, prompt);
                  }
                } catch (fallbackError) {
                  // fallback to generic sendPrompt
                  try {
                    resp = await this.router.sendPrompt(modelId, prompt);
                  } catch (finalError) {
                    resp = { raw: null, text: String(finalError), error: String(finalError) };
                  }
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
                responseForUI.plain_text = parsed.plain_text;
                responseForUI.thinking_text = parsed.thinking_text;
                responseForUI.metadata =
                  parsed.metadata || responseForUI.metadata || {};
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
                response: {
                  text: `Error: ${err.message || String(err)}`,
                  error: true
                }
              });
            }
            return;
          case "legacyModeConfirmationResponse":
            this.handleLegacyModeConfirmation(message);
            return;
          case "legacyModeToolExecution":
            this.handleLegacyModeToolExecution(message);
            return;
          case "legacyModeSessionAction":
            this.handleLegacyModeSessionAction(message);
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

  async openLegacyModeSettings() {
    try {
      const LegacyConfigManager = require('../legacy/configManager');
      const configManager = new LegacyConfigManager();
      
      const settingsOptions = [
        {
          label: "Enable/Disable Legacy Mode",
          description: `Currently: ${configManager.isEnabled() ? 'Enabled' : 'Disabled'}`,
          action: "toggle-enabled"
        },
        {
          label: "Configure Timeouts",
          description: "Set execution and verification timeouts",
          action: "timeouts"
        },
        {
          label: "Auto-Approval Settings",
          description: "Configure automatic task approval",
          action: "auto-approval"
        },
        {
          label: "Security Settings",
          description: "Configure file access and command restrictions",
          action: "security"
        },
        {
          label: "UI Preferences",
          description: "Configure display and notification settings",
          action: "ui"
        },
        {
          label: "Reset to Defaults",
          description: "Reset all Legacy Mode settings to default values",
          action: "reset"
        }
      ];

      const selectedOption = await vscode.window.showQuickPick(settingsOptions, {
        placeHolder: "Select Legacy Mode setting to configure"
      });

      if (!selectedOption) return;

      switch (selectedOption.action) {
        case "toggle-enabled":
          await this.toggleLegacyModeEnabled(configManager);
          break;
        case "timeouts":
          await this.configureTimeouts(configManager);
          break;
        case "auto-approval":
          await this.configureAutoApproval(configManager);
          break;
        case "security":
          await this.configureSecurity(configManager);
          break;
        case "ui":
          await this.configureUI(configManager);
          break;
        case "reset":
          await this.resetLegacyModeSettings(configManager);
          break;
      }
    } catch (error) {
      console.error("Error opening Legacy Mode settings:", error);
      vscode.window.showErrorMessage(`Error opening Legacy Mode settings: ${error.message}`);
    }
  }

  async toggleLegacyModeEnabled(configManager) {
    const currentState = configManager.isEnabled();
    await configManager.updateSetting('enabled', !currentState);
    vscode.window.showInformationMessage(
      `Legacy Mode ${!currentState ? 'enabled' : 'disabled'}`
    );
  }

  async configureTimeouts(configManager) {
    const timeouts = configManager.getTimeouts();
    
    const timeoutOptions = [
      {
        label: "Task Execution Timeout",
        description: `Current: ${timeouts.taskExecution / 1000}s`,
        key: "timeouts.taskExecution"
      },
      {
        label: "User Verification Timeout", 
        description: `Current: ${timeouts.userVerification / 1000}s`,
        key: "timeouts.userVerification"
      },
      {
        label: "Session Total Timeout",
        description: `Current: ${timeouts.sessionTotal / 1000}s`,
        key: "timeouts.sessionTotal"
      }
    ];

    const selectedTimeout = await vscode.window.showQuickPick(timeoutOptions, {
      placeHolder: "Select timeout to configure"
    });

    if (!selectedTimeout) return;

    const newValue = await vscode.window.showInputBox({
      prompt: `Enter new timeout value in seconds`,
      value: String(timeouts[selectedTimeout.key.split('.')[1]] / 1000),
      validateInput: (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
          return "Please enter a valid number greater than 0";
        }
        return null;
      }
    });

    if (newValue) {
      await configManager.updateSetting(selectedTimeout.key, parseInt(newValue) * 1000);
      vscode.window.showInformationMessage(`${selectedTimeout.label} updated to ${newValue}s`);
    }
  }

  async configureAutoApproval(configManager) {
    const autoApproval = configManager.getAutoApprovalSettings();
    
    const approvalOptions = [
      {
        label: "Enable Auto-Approval",
        description: `Current: ${autoApproval.enabled ? 'Enabled' : 'Disabled'}`,
        key: "autoApproval.enabled"
      },
      {
        label: "Auto-Approve File Operations",
        description: `Current: ${autoApproval.fileOperations ? 'Enabled' : 'Disabled'}`,
        key: "autoApproval.fileOperations"
      },
      {
        label: "Auto-Approve Terminal Commands",
        description: `Current: ${autoApproval.terminalCommands ? 'Enabled' : 'Disabled'}`,
        key: "autoApproval.terminalCommands"
      }
    ];

    const selectedOption = await vscode.window.showQuickPick(approvalOptions, {
      placeHolder: "Select auto-approval setting to toggle"
    });

    if (!selectedOption) return;

    const currentValue = autoApproval[selectedOption.key.split('.')[1]];
    await configManager.updateSetting(selectedOption.key, !currentValue);
    vscode.window.showInformationMessage(
      `${selectedOption.label} ${!currentValue ? 'enabled' : 'disabled'}`
    );
  }

  async configureSecurity(configManager) {
    const security = configManager.getSecuritySettings();
    
    const securityOptions = [
      {
        label: "Restrict to Workspace",
        description: `Current: ${security.restrictToWorkspace ? 'Enabled' : 'Disabled'}`,
        action: "toggle-workspace"
      },
      {
        label: "Configure Allowed Commands",
        description: `Current: ${security.allowedCommands.length} commands`,
        action: "allowed-commands"
      },
      {
        label: "Configure Blocked Paths",
        description: `Current: ${security.blockedPaths.length} patterns`,
        action: "blocked-paths"
      },
      {
        label: "Set Maximum File Size",
        description: `Current: ${Math.round(security.maxFileSize / 1024 / 1024)}MB`,
        action: "max-file-size"
      }
    ];

    const selectedOption = await vscode.window.showQuickPick(securityOptions, {
      placeHolder: "Select security setting to configure"
    });

    if (!selectedOption) return;

    switch (selectedOption.action) {
      case "toggle-workspace":
        await configManager.updateSetting('security.restrictToWorkspace', !security.restrictToWorkspace);
        vscode.window.showInformationMessage(
          `Workspace restriction ${!security.restrictToWorkspace ? 'enabled' : 'disabled'}`
        );
        break;
      case "max-file-size":
        const newSize = await vscode.window.showInputBox({
          prompt: "Enter maximum file size in MB",
          value: String(Math.round(security.maxFileSize / 1024 / 1024)),
          validateInput: (value) => {
            const num = parseInt(value);
            if (isNaN(num) || num < 1) {
              return "Please enter a valid number greater than 0";
            }
            return null;
          }
        });
        if (newSize) {
          await configManager.updateSetting('security.maxFileSize', parseInt(newSize) * 1024 * 1024);
          vscode.window.showInformationMessage(`Maximum file size set to ${newSize}MB`);
        }
        break;
    }
  }

  async configureUI(configManager) {
    const ui = configManager.getUISettings();
    
    const uiOptions = [
      {
        label: "Show Progress Bar",
        description: `Current: ${ui.showProgressBar ? 'Enabled' : 'Disabled'}`,
        key: "ui.showProgressBar"
      },
      {
        label: "Show Detailed Logs",
        description: `Current: ${ui.showDetailedLogs ? 'Enabled' : 'Disabled'}`,
        key: "ui.showDetailedLogs"
      },
      {
        label: "Auto Scroll",
        description: `Current: ${ui.autoScroll ? 'Enabled' : 'Disabled'}`,
        key: "ui.autoScroll"
      },
      {
        label: "Notification Level",
        description: `Current: ${ui.notificationLevel}`,
        key: "ui.notificationLevel"
      }
    ];

    const selectedOption = await vscode.window.showQuickPick(uiOptions, {
      placeHolder: "Select UI setting to configure"
    });

    if (!selectedOption) return;

    if (selectedOption.key === "ui.notificationLevel") {
      const levelOptions = [
        { label: "None", value: "none" },
        { label: "Errors Only", value: "errors" },
        { label: "Warnings and Errors", value: "warnings" },
        { label: "All Notifications", value: "all" }
      ];

      const selectedLevel = await vscode.window.showQuickPick(levelOptions, {
        placeHolder: "Select notification level"
      });

      if (selectedLevel) {
        await configManager.updateSetting('ui.notificationLevel', selectedLevel.value);
        vscode.window.showInformationMessage(`Notification level set to ${selectedLevel.label}`);
      }
    } else {
      const currentValue = ui[selectedOption.key.split('.')[1]];
      await configManager.updateSetting(selectedOption.key, !currentValue);
      vscode.window.showInformationMessage(
        `${selectedOption.label} ${!currentValue ? 'enabled' : 'disabled'}`
      );
    }
  }

  async resetLegacyModeSettings(configManager) {
    const confirm = await vscode.window.showWarningMessage(
      "Are you sure you want to reset all Legacy Mode settings to defaults?",
      "Yes", "No"
    );

    if (confirm === "Yes") {
      await configManager.resetToDefaults();
      vscode.window.showInformationMessage("Legacy Mode settings reset to defaults");
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

  // Performance Optimization Methods
  
  /**
   * Cache management for request responses
   */
  getCachedResponse(cacheKey) {
    const cached = this.requestCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      this.performanceMetrics.cacheHits++;
      return cached.response;
    }
    
    if (cached) {
      this.requestCache.delete(cacheKey); // Remove expired cache
    }
    
    this.performanceMetrics.cacheMisses++;
    return null;
  }

  setCachedResponse(cacheKey, response) {
    // Limit cache size to prevent memory bloat
    if (this.requestCache.size >= 100) {
      // Remove oldest entries
      const entries = Array.from(this.requestCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, 20); // Remove oldest 20%
      toRemove.forEach(([key]) => this.requestCache.delete(key));
    }
    
    this.requestCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });
  }

  /**
   * Batch UI updates for better performance
   */
  queueUIUpdate(updateData) {
    this.uiUpdateQueue.push({
      ...updateData,
      timestamp: Date.now()
    });
    
    this.performanceMetrics.uiUpdatesQueued++;
    
    // Schedule batch processing if not already scheduled
    if (!this.uiUpdateTimer) {
      this.uiUpdateTimer = setTimeout(() => {
        this.processBatchedUIUpdates();
      }, this.uiUpdateInterval);
    }
  }

  processBatchedUIUpdates() {
    if (this.uiUpdateQueue.length === 0) {
      this.uiUpdateTimer = null;
      return;
    }
    
    // Process updates in batches
    const batch = this.uiUpdateQueue.splice(0, this.uiUpdateBatchSize);
    this.performanceMetrics.uiUpdatesBatched += batch.length;
    
    // Group updates by type for efficiency
    const updatesByType = {};
    batch.forEach(update => {
      if (!updatesByType[update.type]) {
        updatesByType[update.type] = [];
      }
      updatesByType[update.type].push(update);
    });
    
    // Send batched updates to webview
    if (this.webviewView) {
      this.webviewView.webview.postMessage({
        command: "batchedUpdates",
        updates: updatesByType,
        batchSize: batch.length,
        timestamp: Date.now()
      });
    }
    
    // Schedule next batch if more updates pending
    if (this.uiUpdateQueue.length > 0) {
      this.uiUpdateTimer = setTimeout(() => {
        this.processBatchedUIUpdates();
      }, this.uiUpdateInterval);
    } else {
      this.uiUpdateTimer = null;
    }
  }

  /**
   * Async wrapper for heavy operations to maintain UI responsiveness
   */
  async executeWithLoadingState(operation, loadingMessage = "Processing...") {
    const startTime = Date.now();
    
    // Show loading state
    this.queueUIUpdate({
      type: "loading_state",
      message: loadingMessage,
      show: true
    });
    
    try {
      // Use setImmediate to yield control to event loop
      await new Promise(resolve => setImmediate(resolve));
      
      const result = await operation();
      
      // Update performance metrics
      const duration = Date.now() - startTime;
      this.updateAverageResponseTime(duration);
      this.performanceMetrics.requestsProcessed++;
      
      return result;
      
    } finally {
      // Hide loading state
      this.queueUIUpdate({
        type: "loading_state",
        show: false
      });
    }
  }

  updateAverageResponseTime(newTime) {
    const currentAvg = this.performanceMetrics.averageResponseTime;
    const count = this.performanceMetrics.requestsProcessed;
    
    if (count === 0) {
      this.performanceMetrics.averageResponseTime = newTime;
    } else {
      // Calculate rolling average
      this.performanceMetrics.averageResponseTime = 
        (currentAvg * count + newTime) / (count + 1);
    }
  }

  /**
   * Log performance metrics for monitoring
   */
  logPerformanceMetrics() {
    const metrics = {
      ...this.performanceMetrics,
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
    
    console.log('WebView Performance Metrics:', JSON.stringify(metrics, null, 2));
    
    // Reset counters periodically to prevent overflow
    const now = new Date();
    const timeSinceReset = now - this.performanceMetrics.lastMetricsReset;
    if (timeSinceReset > 60 * 60 * 1000) { // 1 hour
      this.resetPerformanceMetrics();
    }
  }

  resetPerformanceMetrics() {
    this.performanceMetrics = {
      requestsProcessed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      uiUpdatesQueued: 0,
      uiUpdatesBatched: 0,
      averageResponseTime: 0,
      lastMetricsReset: new Date()
    };
  }

  /**
   * Clean up expired Legacy Mode sessions with performance tracking
   */
  cleanupExpiredLegacyModeSessions() {
    const startTime = Date.now();
    const initialCount = this.legacyModeSessions.size;
    
    const now = new Date();
    const expiredSessions = [];
    
    for (const [requestId, session] of this.legacyModeSessions) {
      const lastActivity = new Date(session.lastActivity);
      const timeSinceActivity = now - lastActivity;
      
      // 30 minute timeout
      if (timeSinceActivity > 30 * 60 * 1000) {
        expiredSessions.push(requestId);
      }
    }
    
    expiredSessions.forEach(requestId => {
      this.legacyModeSessions.delete(requestId);
    });
    
    const duration = Date.now() - startTime;
    const cleanedCount = expiredSessions.length;
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired Legacy Mode sessions in ${duration}ms`);
      
      // Notify UI of cleanup
      this.queueUIUpdate({
        type: "session_cleanup",
        cleanedCount,
        remainingCount: this.legacyModeSessions.size,
        duration
      });
    }
  }

  // Legacy Mode Handlers
  async handleLegacyMode(modelId, prompt, requestId, originalMessage) {
    return await this.executeWithLoadingState(async () => {
      
      // Check cache first for similar requests
      const promptText = Array.isArray(prompt) ? prompt[0] : prompt;
      const cacheKey = `${modelId}:${String(promptText).substring(0, 100)}`;
      const cachedResponse = this.getCachedResponse(cacheKey);
      
      if (cachedResponse && !originalMessage.forceRefresh) {
        this.webviewView.webview.postMessage({
          command: "promptResponse",
          requestId,
          response: cachedResponse,
          fromCache: true
        });
        return;
      }
      
      // Create or get session context
      let sessionContext = this.legacyModeSessions.get(requestId);
      
      if (!sessionContext) {
        // Create new session
        sessionContext = {
          modelId,
          prompt,
          requestId,
          startTime: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          webviewProvider: this,
          confirmationCallbacks: new Map(),
          todoManager: TodoManager ? new TodoManager() : null,
          phase: 'planning',
          executionLog: []
        };
        
        this.legacyModeSessions.set(requestId, sessionContext);
        
        // Create context manager session if available
        if (contextManager) {
          const taskText = Array.isArray(prompt) ? prompt[0] : prompt;
          const cmSession = contextManager.createSession(taskText, modelId, requestId);
          sessionContext.contextManagerSessionId = cmSession.id;
        }
        
        // Notify webview of session creation
        const taskText = Array.isArray(prompt) ? prompt[0] : prompt;
        this.sendLegacyModeUpdate('session_created', {
          sessionId: requestId,
          originalTask: taskText,
          phase: 'planning',
          startTime: sessionContext.startTime
        });
      }
      
      // Update last activity
      sessionContext.lastActivity = new Date().toISOString();
      
      // Run Legacy Mode with enhanced context
      const resp = await this.router.runMode('legacy', {
        router: this.router,
        modelId,
        prompt,
        requestId,
        context: this.context,
        legacyModeSession: sessionContext
      });
      
      // Cache successful responses
      if (resp && !resp.error) {
        this.setCachedResponse(cacheKey, resp);
      }
      
      // Send response
      this.webviewView.webview.postMessage({
        command: "promptResponse",
        requestId,
        response: resp,
      });
      
    }, "Executing Legacy Mode...");
  }
  
  handleLegacyModeConfirmation(message) {
    try {
      const { todoId, approved, feedback, requestId } = message;
      console.log('Legacy Mode confirmation received:', { todoId, approved, feedback, requestId });
      
      // Find the session that requested this confirmation
      const session = this.legacyModeSessions.get(requestId);
      
      if (session && session.confirmationCallbacks && session.confirmationCallbacks.has(todoId)) {
        const callback = session.confirmationCallbacks.get(todoId);
        callback({ approved, feedback });
        session.confirmationCallbacks.delete(todoId);
        
        // Update session activity
        session.lastActivity = new Date().toISOString();
        
        // Update TODO status if TodoManager is available
        if (session.todoManager) {
          if (approved) {
            session.todoManager.markTodoComplete(todoId, feedback || 'Approved by user');
          } else {
            session.todoManager.markTodoFailed(todoId, feedback || 'Rejected by user');
          }
        }
        
        // Notify webview of confirmation processing
        this.sendLegacyModeUpdate('confirmation_processed', {
          todoId,
          approved,
          feedback
        });
      } else {
        console.warn('No confirmation callback found for TODO:', todoId);
        this.sendLegacyModeUpdate('error_occurred', {
          context: 'Confirmation handling',
          message: `No pending confirmation found for TODO ${todoId}`,
          suggestion: 'The confirmation may have already been processed or expired'
        });
      }
    } catch (err) {
      console.error('Error handling Legacy Mode confirmation:', err);
      this.sendLegacyModeUpdate('error_occurred', {
        context: 'Confirmation handling',
        message: err.message,
        suggestion: 'Try refreshing the session or restarting Legacy Mode'
      });
    }
  }
  
  handleLegacyModeToolExecution(message) {
    try {
      const { toolName, params, requestId } = message;
      console.log('Legacy Mode tool execution requested:', { toolName, params, requestId });
      
      // Execute tool asynchronously
      this.executeLegacyTool(toolName, params, requestId)
        .then(result => {
          this.sendLegacyModeUpdate('tool_executed', {
            toolName,
            params,
            result,
            requestId
          });
        })
        .catch(error => {
          this.sendLegacyModeUpdate('error_occurred', {
            context: `Tool execution: ${toolName}`,
            message: error.message,
            suggestion: 'Check the tool parameters and try again'
          });
        });
        
    } catch (err) {
      console.error('Error handling Legacy Mode tool execution:', err);
      this.sendLegacyModeUpdate('error_occurred', {
        context: 'Tool execution setup',
        message: err.message,
        suggestion: 'Check the tool request format and try again'
      });
    }
  }
  
  handleLegacyModeSessionAction(message) {
    try {
      const { action, requestId, data } = message;
      console.log('Legacy Mode session action:', { action, requestId, data });
      
      const session = this.legacyModeSessions.get(requestId);
      
      if (!session) {
        this.sendLegacyModeUpdate('error_occurred', {
          context: 'Session action',
          message: `Session ${requestId} not found`,
          suggestion: 'The session may have expired. Try starting a new Legacy Mode session'
        });
        return;
      }
      
      switch (action) {
        case 'pause':
          session.phase = 'paused';
          this.sendLegacyModeUpdate('session_paused', { requestId });
          break;
          
        case 'resume':
          session.phase = session.previousPhase || 'execution';
          this.sendLegacyModeUpdate('session_resumed', { requestId });
          break;
          
        case 'stop':
          this.cleanupLegacyModeSession(requestId);
          this.sendLegacyModeUpdate('session_stopped', { requestId });
          break;
          
        case 'get_status':
          this.sendLegacyModeUpdate('session_status', {
            requestId,
            phase: session.phase,
            startTime: session.startTime,
            lastActivity: session.lastActivity,
            todoCount: session.todoManager ? session.todoManager.getAllTodos().length : 0,
            executionLogCount: session.executionLog.length
          });
          break;
          
        default:
          this.sendLegacyModeUpdate('error_occurred', {
            context: 'Session action',
            message: `Unknown action: ${action}`,
            suggestion: 'Use one of: pause, resume, stop, get_status'
          });
      }
      
      // Update session activity
      session.lastActivity = new Date().toISOString();
      
    } catch (err) {
      console.error('Error handling Legacy Mode session action:', err);
      this.sendLegacyModeUpdate('error_occurred', {
        context: 'Session action handling',
        message: err.message,
        suggestion: 'Check the action format and try again'
      });
    }
  }
  
  // Legacy Mode Tool Execution Methods
  async executeLegacyTool(toolName, params, requestId) {
    try {
      const session = this.legacyModeSessions.get(requestId);
      let result;
      
      // Use ToolExecutor if available, otherwise fallback to direct methods
      if (this.toolExecutor) {
        result = await this.toolExecutor.executeTool(toolName, params, {
          sessionId: requestId,
          webviewProvider: this
        });
      } else {
        // Fallback to direct method calls
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
          case 'findInFiles':
            result = await this.legacyFindInFiles(params.searchTerm, params.filePattern);
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
          case 'openFile':
            result = await this.legacyOpenFile(params.filePath, params.line, params.column);
            break;
          case 'executeVSCodeCommand':
            result = await this.legacyExecuteVSCodeCommand(params.command, params.args);
            break;
          default:
            result = { 
              success: false, 
              error: `Unknown tool: ${toolName}`,
              toolName,
              timestamp: new Date().toISOString()
            };
        }
      }
      
      // Log tool execution in session
      if (session) {
        session.executionLog.push({
          type: 'tool_execution',
          toolName,
          params,
          result,
          timestamp: new Date().toISOString()
        });
        session.lastActivity = new Date().toISOString();
      }
      
      // Notify webview of tool execution
      this.sendLegacyModeUpdate('tool_executed', {
        toolName,
        params,
        result,
        requestId
      });
      
      return result;
    } catch (err) {
      const errorResult = { 
        success: false, 
        error: err.message,
        toolName,
        timestamp: new Date().toISOString()
      };
      
      // Log error in session
      const session = this.legacyModeSessions.get(requestId);
      if (session) {
        session.executionLog.push({
          type: 'tool_error',
          toolName,
          params,
          error: err.message,
          timestamp: new Date().toISOString()
        });
      }
      
      // Notify webview of error
      this.sendLegacyModeUpdate('error_occurred', {
        context: `Tool execution: ${toolName}`,
        message: err.message,
        suggestion: 'Check the tool parameters and try again',
        requestId
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
      
      return { 
        success: true, 
        command, 
        workingDirectory,
        output: `Executed: ${command}`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message, 
        command,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  async legacyFindInFiles(searchTerm, filePattern = '**/*') {
    try {
      const files = await vscode.workspace.findFiles(filePattern, '**/node_modules/**', 100);
      const results = [];
      
      for (const file of files) {
        try {
          const content = fs.readFileSync(file.fsPath, 'utf8');
          const lines = content.split('\n');
          const matches = [];
          
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(searchTerm)) {
              matches.push({
                line: i + 1,
                content: lines[i].trim()
              });
            }
          }
          
          if (matches.length > 0) {
            results.push({
              file: vscode.workspace.asRelativePath(file),
              matches
            });
          }
        } catch (err) {
          // Skip files that can't be read
          continue;
        }
      }
      
      return { 
        success: true, 
        searchTerm, 
        filePattern, 
        results,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message, 
        searchTerm,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  async legacyOpenFile(filePath, line, column) {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder open');
      }
      
      const fullPath = path.resolve(workspaceFolder.uri.fsPath, filePath);
      const uri = vscode.Uri.file(fullPath);
      
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);
      
      if (line !== undefined) {
        const position = new vscode.Position(
          Math.max(0, line - 1), 
          Math.max(0, (column || 1) - 1)
        );
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
      }
      
      return { 
        success: true, 
        filePath, 
        line, 
        column,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message, 
        filePath,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  async legacyExecuteVSCodeCommand(command, args = []) {
    try {
      const result = await vscode.commands.executeCommand(command, ...args);
      return { 
        success: true, 
        command, 
        args, 
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message, 
        command, 
        args,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  // Legacy Mode Session Management
  sendLegacyModeUpdate(updateType, data) {
    try {
      this.webviewView.webview.postMessage({
        command: 'legacyModeUpdate',
        updateType,
        data,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error sending Legacy Mode update:', err);
    }
  }
  
  requestLegacyModeConfirmation(todoId, todoDescription, result, requestId) {
    return new Promise((resolve) => {
      const session = this.legacyModeSessions.get(requestId);
      if (!session) {
        resolve({ approved: false, feedback: 'Session not found' });
        return;
      }
      
      // Store callback for this confirmation
      session.confirmationCallbacks.set(todoId, resolve);
      
      // Send confirmation request to webview
      this.sendLegacyModeUpdate('confirmation_requested', {
        todoId,
        todoDescription,
        result,
        requestId
      });
      
      // Set timeout for auto-approval (5 minutes)
      setTimeout(() => {
        if (session.confirmationCallbacks.has(todoId)) {
          session.confirmationCallbacks.delete(todoId);
          resolve({ 
            approved: true, 
            feedback: 'Auto-approved after timeout',
            autoApproved: true 
          });
        }
      }, 5 * 60 * 1000);
    });
  }
  
  cleanupLegacyModeSession(requestId) {
    const session = this.legacyModeSessions.get(requestId);
    if (session) {
      // Clear any pending confirmations
      if (session.confirmationCallbacks) {
        for (const [todoId, callback] of session.confirmationCallbacks) {
          callback({ approved: false, feedback: 'Session terminated' });
        }
        session.confirmationCallbacks.clear();
      }
      
      // Clean up context manager session
      if (session.contextManagerSessionId && contextManager) {
        contextManager.deleteSession(session.contextManagerSessionId);
      }
      
      this.legacyModeSessions.delete(requestId);
      console.log(`Cleaned up Legacy Mode session: ${requestId}`);
    }
  }
  
  cleanupExpiredLegacyModeSessions() {
    const now = new Date();
    const expiredSessions = [];
    
    for (const [requestId, session] of this.legacyModeSessions) {
      const lastActivity = new Date(session.lastActivity);
      const timeSinceActivity = now - lastActivity;
      
      // Expire sessions after 30 minutes of inactivity
      if (timeSinceActivity > 30 * 60 * 1000) {
        expiredSessions.push(requestId);
      }
    }
    
    expiredSessions.forEach(requestId => {
      this.cleanupLegacyModeSession(requestId);
    });
    
    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired Legacy Mode sessions`);
    }
  }
  
  getLegacyModeSessionStats() {
    const sessions = Array.from(this.legacyModeSessions.values());
    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.phase !== 'completed' && s.phase !== 'failed').length,
      oldestSession: sessions.length > 0 ? Math.min(...sessions.map(s => new Date(s.startTime))) : null,
      totalTodos: sessions.reduce((sum, s) => sum + (s.todoManager ? s.todoManager.getAllTodos().length : 0), 0),
      totalExecutionLogEntries: sessions.reduce((sum, s) => sum + s.executionLog.length, 0)
    };
  }
  
  // Cleanup on provider disposal
  dispose() {
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
    }
    
    // Clean up all Legacy Mode sessions
    for (const requestId of this.legacyModeSessions.keys()) {
      this.cleanupLegacyModeSession(requestId);
    }
  }
}

module.exports = MyWebviewProvider;
