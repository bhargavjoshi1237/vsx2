const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
// Router integration
let routerFactory;
try { routerFactory = require('../route/route').createRouter; } catch (e) { routerFactory = null; }

class MyWebviewProvider {
  constructor(context) {
    this.context = context;
  }
  safeRead(filePath, fallback) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error('Failed to read', filePath, err && err.message ? err.message : err);
      return fallback;
    }
  }
  resolveWebviewView(webviewView) {
    this.webviewView = webviewView;
    const extensionPath = this.context.extensionUri.fsPath;
  const header = this.safeRead(path.join(extensionPath, 'ui', 'components', 'header.html'), '<div class="p-2 text-gray-200">(header missing)</div>');
  const chatMessages = this.safeRead(path.join(extensionPath, 'ui', 'components', 'chat-messages.html'), '');
  const inputArea = this.safeRead(path.join(extensionPath, 'ui', 'components', 'input-area.html'), '<div class="p-2 text-gray-200">(input area missing)</div>');
  const chatUserTpl = this.safeRead(path.join(extensionPath, 'ui', 'components', 'chat-user.html'), '');
  const chatAssistantTpl = this.safeRead(path.join(extensionPath, 'ui', 'components', 'chat-assistant.html'), '');
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = `
      <!DOCTYPE html>
      <html lang="en" class="h-full">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>VSX Chat</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        <style>
        body { height: 100vh; display: flex; background-color: #181818;
         margin: 0 !important;
         padding: 0 !important;
        }
        .main-content { flex: 1; display: flex; flex-direction: column; }
        .chat-messages { flex: 1; overflow-y: auto; }
        .bg-dark-primary { background-color: #181818; }
        .bg-dark-secondary { background-color: #2a2a2a; }
        .bg-dark-tertiary { background-color: #1a1a1a; }
        .border-thin { border: 1px solid #333; }
        
        /* Chat message animations */
        .message {
          animation: fadeInUp 0.3s ease-out;
        }
        
        @keyframes fadeInUp {
          from {
          opacity: 0;
          transform: translateY(20px);
          }
          to {
          opacity: 1;
          transform: translateY(0);
          }
        }
        
        /* Typing indicator animation */
        @keyframes bounce {
          0%, 80%, 100% {
          transform: translateY(0);
          }
          40% {
          transform: translateY(-5px);
          }
        }
        
        .animate-bounce {
          animation: bounce 1s infinite;
        }
        
        /* Scrollbar styling */
        .chat-messages::-webkit-scrollbar {
          width: 6px;
        }
        
        .chat-messages::-webkit-scrollbar-track {
          background: #2a2a2a;
        }
        
        .chat-messages::-webkit-scrollbar-thumb {
          background: #555;
          border-radius: 3px;
        }
        
        .chat-messages::-webkit-scrollbar-thumb:hover {
          background: #777;
        }
        
        /* Resend button styling */
        .resend-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          outline: none;
          transition: all 0.2s ease;
        }
        
        .resend-btn:hover {
         background: #474747; 
        }
        
        .resend-btn:active {
          transform: scale(0.95);
        }
        
        /* Statistics section styling */
        .message-stats {
          font-weight: normal;
          letter-spacing: normal;
        }
        
        /* New chat button styling */
        #new-chat-btn:hover {
          background-color: #404040;
          border-radius: 4px;
          transition: all 0.2s ease;
        }
        
        #new-chat-btn:active {
          transform: scale(0.95);
        }
        
        /* Options dropdown styling */
        #options-dropdown {
          z-index: 1000;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        }
        
        #options-dropdown button:hover {
          background-color: #3a3a3a;
        }
        
        #options-btn:hover {
          background-color: #404040;
          border-radius: 4px;
          transition: all 0.2s ease;
        }
        </style>
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
        <script>
        (function(){
          window.vscode = acquireVsCodeApi();
          const chatMessagesContainer = document.getElementById('chat-messages-container');
          const attachFileChip = document.getElementById('attachFileChip');
          const setupApiBtn = document.getElementById('setup-api-keys');
          const newChatBtn = document.getElementById('new-chat-btn');
          const textarea = document.getElementById('inputTextArea');
          const modelListEl = document.getElementById('model-list');
          const modelDropdown = document.getElementById('model-dropdown');
          const modeListEl = document.getElementById('mode-list');
          let selectedFiles = [];
          let selectedModelId = null;
          let selectedModeId = 'ask';

              // Updated appendMessage function to handle enhanced metadata
              function appendMessage(role, text, meta, responseData) {
                try {
                  const tplId = role === 'user' ? 'template-chat-user' : 'template-chat-assistant';
                  const tpl = document.getElementById(tplId);
                  if (tpl && tpl.content) {
                    const node = tpl.content.firstElementChild.cloneNode(true);
                    const textEl = node.querySelector('.message-text');
                    const metaEl = node.querySelector('.message-meta');
                    
                    if (textEl) textEl.innerText = text;

                    if (metaEl && role === 'assistant') {
                      // Handle spinner and status for pending/working states
                      const metaTextEl = metaEl.querySelector('.meta-text');
                      const spinnerEl = metaEl.querySelector('.assistant-spinner');
                      const statusEl = metaEl.querySelector('.status-text');
                      
                      if (metaTextEl) metaTextEl.innerText = meta || '';
                      
                      const isPending = String(meta).toLowerCase() === 'pending' || String(meta).toLowerCase() === 'working' || meta === '';
                      if (spinnerEl && statusEl) {
                        if (isPending) {
                          spinnerEl.style.display = 'inline-flex';
                          statusEl.style.display = 'inline';
                        } else {
                          spinnerEl.style.display = 'none';
                          statusEl.style.display = 'none';
                        }
                      }

                      // Populate enhanced metadata if responseData is available
                      if (responseData && !isPending) {
                        populateEnhancedMetadata(node, responseData);
                      }
                    }

                    chatMessagesContainer.appendChild(node);
                    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
                    return node;
                  }
                } catch (e) { 
                  console.error('Error in appendMessage:', e); 
                }
                return null;
              }

              // Function to populate enhanced metadata from NVIDIA response
              function populateEnhancedMetadata(messageNode, responseData) {
                try {
                  const statsEl = messageNode.querySelector('.message-stats');
                  if (!statsEl) return;

                  // Update model info
                  const modelInfoEl = statsEl.querySelector('.model-info');
                    if (modelInfoEl && responseData.metadata) {
                    const model = responseData.metadata.model || 'Unknown';
                    modelInfoEl.textContent = 'Model: ' + model;
                  }

                  // Update timestamp
                  const timestampEl = statsEl.querySelector('.timestamp');
                  if (timestampEl) {
                    const now = new Date();
                    timestampEl.textContent = now.toLocaleTimeString('en-US', { 
                      hour12: false, 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    });
                  }

                  // Update event count
                  const eventCountEl = statsEl.querySelector('.event-count');
                    if (eventCountEl && responseData.events) {
                    eventCountEl.textContent = 'Events: ' + responseData.events;
                  }

                  // Handle thinking data
                  if (responseData.reasoning && responseData.reasoning.trim()) {
                    setupThinkingToggle(messageNode, responseData.reasoning);
                  }

                } catch (e) {
                  console.error('Error populating enhanced metadata:', e);
                }
              }

              // Function to setup thinking toggle functionality
              function setupThinkingToggle(messageNode, reasoningText) {
                try {
                  const thinkingToggle = messageNode.querySelector('.thinking-toggle');
                  const thinkingSection = messageNode.querySelector('.thinking-section');
                  const thinkingTextEl = messageNode.querySelector('.thinking-text');
                  const toggleTextEl = messageNode.querySelector('.toggle-text');
                  const toggleArrow = messageNode.querySelector('.toggle-arrow');

                  if (!thinkingToggle || !thinkingSection || !thinkingTextEl) return;

                  // Show the toggle button
                  thinkingToggle.style.display = 'block';
                  
                  // Set the thinking content
                  thinkingTextEl.textContent = reasoningText;

                  // Add click handler for toggle
                  let isExpanded = false;
                  thinkingToggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    isExpanded = !isExpanded;
                    
                    if (isExpanded) {
                      thinkingSection.style.display = 'block';
                      toggleTextEl.textContent = 'Hide Thinking';
                      toggleArrow.style.transform = 'rotate(180deg)';
                    } else {
                      thinkingSection.style.display = 'none';
                      toggleTextEl.textContent = 'Show Thinking';
                      toggleArrow.style.transform = 'rotate(0deg)';
                    }
                  });

                } catch (e) {
                  console.error('Error setting up thinking toggle:', e);
                }
              }

          function renderSelectedFileChips() {
          let wrapper = document.getElementById('selectedFilesWrapper');
          if (!wrapper && attachFileChip && attachFileChip.parentNode) {
            wrapper = document.createElement('div');
            wrapper.id = 'selectedFilesWrapper';
            wrapper.className = 'flex flex-wrap gap-2 items-center';
            attachFileChip.parentNode.insertBefore(wrapper, attachFileChip.nextSibling);
          }
          if (!wrapper) return;
          wrapper.innerHTML = '';
          selectedFiles.forEach((f, idx) => {
            const chip = document.createElement('div');
            chip.className = 'border rounded-md mb-1 border-gray-700 h-fit w-fit gap-2 flex pl-2 pr-2 items-center justify-center';
            let ext = '';
            try { const parts = f.path.split('.'); ext = parts.length > 1 ? parts.pop().toUpperCase().slice(0,3) : 'F'; } catch (e) { ext = 'F'; }
            const iconContainer = document.createElement('div');
            iconContainer.style.display = 'inline-flex';
            iconContainer.style.alignItems = 'center';
            iconContainer.style.justifyContent = 'center';
            iconContainer.style.width = '16px';
            iconContainer.style.height = '16px';
            iconContainer.style.flex = '0 0 16px';
            iconContainer.style.fontSize = '10px';
            iconContainer.style.color = '#e7e7e7';
            iconContainer.textContent = ext;
            chip.appendChild(iconContainer);
            const label = document.createElement('p');
            label.className = 'text-[7px] text-[#e7e7e7]';
            label.style.margin = '0';
            label.style.padding = '0 6px';
            label.style.maxWidth = '70px';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            label.style.whiteSpace = 'nowrap';
            label.textContent = f.label;
            chip.appendChild(label);
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'ml-1 text-[10px] text-[#e7e7e7] bg-transparent';
            removeBtn.style.border = 'none';
            removeBtn.style.padding = '0 4px';
            removeBtn.style.cursor = 'pointer';
            removeBtn.textContent = '✕';
            removeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            selectedFiles.splice(idx, 1);
            renderSelectedFileChips();
            notifySelectedFiles();
            });
            chip.appendChild(removeBtn);
            wrapper.appendChild(chip);
          });
          notifySelectedFiles();
          try { const inputArea = document.querySelector('.input-area'); if (inputArea) inputArea.scrollTop = inputArea.scrollHeight; } catch (e) {}
          }

          function notifySelectedFiles() {
          try { vscode.postMessage({ command: 'selectedFilesChanged', files: selectedFiles.map(f => f.path) }); } catch (e) {}
          }

          // Model list handling
          function updateModelDropdown(models) {
          if (!modelListEl) return;
          modelListEl.innerHTML = '';
          if (!models || !Array.isArray(models)) return;
          models.forEach(m => {
            const li = document.createElement('li');
            li.className = 'px-4 py-2 hover:bg-gray-700 cursor-pointer';
            li.dataset.modelId = m.id;
            li.textContent = m.name || m.id;
            li.addEventListener('click', () => {
            selectedModelId = m.id;
            // update visible label in dropdown button
            try {
              const btnSpan = modelDropdown.querySelector('button span');
              if (btnSpan) btnSpan.textContent = m.name || m.id;
            } catch (e) {}
            });
            modelListEl.appendChild(li);
          });
          // pick first by default
          if (!selectedModelId && models.length) {
            selectedModelId = models[0].id;
            try { const btnSpan = modelDropdown.querySelector('button span'); if (btnSpan) btnSpan.textContent = models[0].name || models[0].id; } catch (e) {}
          }
          }

          // Mode list handling (moved to top-level so messages can update it)
          function updateModeList(modes) {
            try {
              if (!modeListEl) return;
              modeListEl.innerHTML = '';
              (modes || []).forEach(m => {
                const li = document.createElement('li');
                li.className = 'px-4 py-2 hover:bg-gray-700 cursor-pointer';
                li.dataset.modeId = m.id;
                li.textContent = m.name || m.id;
                li.addEventListener('click', () => {
                  selectedModeId = m.id;
                  try { const btn = document.querySelector('#mode-dropdown button span'); if (btn) btn.textContent = m.name || m.id; } catch (e) {}
                });
                modeListEl.appendChild(li);
              });
              // pick first by default
              if (!selectedModeId && (modes || []).length) {
                selectedModeId = modes[0].id;
                try { const btnSpan = document.querySelector('#mode-dropdown button span'); if (btnSpan) btnSpan.textContent = modes[0].name || modes[0].id; } catch (e) {}
              }
            } catch (e) { console.error(e); }
          }

          // Send prompt flow
          async function sendCurrentPrompt() {
          const text = textarea && textarea.value ? textarea.value.trim() : '';
          if (!text) return;
          const requestId = String(Date.now()) + Math.random().toString(36).slice(2,8);
          // append user message
          appendMessage('user', text);
          // clear input
          if (textarea) textarea.value = '';
                // append assistant placeholder (contains request-id) and show spinner/status
                const placeholderNode = appendMessage('assistant', '', '');
                if (placeholderNode) {
                  placeholderNode.dataset.requestId = requestId;
                  try {
                    const metaEl = placeholderNode.querySelector('.message-meta');
                    if (metaEl) {
                      const spinnerEl = metaEl.querySelector('.assistant-spinner');
                      const statusEl = metaEl.querySelector('.status-text');
                      if (spinnerEl) spinnerEl.style.display = 'inline-flex';
                      if (statusEl) statusEl.style.display = 'inline';
                    }
                  } catch (e) { console.error(e); }
                }
          // send to extension
          try {
            vscode.postMessage({ command: 'sendPrompt', modelId: selectedModelId, prompt: text, requestId });
          } catch (e) {
            console.error('Failed to post sendPrompt', e);
          }
          }

          // wire enter key to send (Enter without Shift)
          if (textarea) {
          textarea.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault();
            sendCurrentPrompt();
            }
          });
          }

          // wire buttons
          if (attachFileChip) attachFileChip.addEventListener('click', () => { vscode.postMessage({ command: 'openFilePicker' }); });
          if (setupApiBtn) setupApiBtn.addEventListener('click', () => { vscode.postMessage({ command: 'openApiKeySetup' }); });
          if (newChatBtn) newChatBtn.addEventListener('click', () => { if (chatMessagesContainer) chatMessagesContainer.innerHTML = ''; });

          // receive messages from extension
          window.addEventListener('message', event => {
          const m = event.data;
          if (!m || !m.command) return;
          switch (m.command) {
            case 'filesSelected':
            if (Array.isArray(m.files)) {
              m.files.forEach(f => { if (!selectedFiles.find(sf => sf.path === f.path)) selectedFiles.push(f); });
              renderSelectedFileChips();
            }
            break;
            case 'filePickerCanceled': break;
            case 'filePickerError':
            const errDiv = document.createElement('div'); errDiv.className = 'p-2 text-red-400'; errDiv.textContent = 'File picker error: ' + (m.error || 'Unknown'); if (chatMessagesContainer) chatMessagesContainer.appendChild(errDiv);
            break;
            case 'modelsResponse':
            if (m.models && Array.isArray(m.models.flatList)) {
              updateModelDropdown(m.models.flatList);
            }
            break;
            case 'modesResponse':
            if (m.modes && Array.isArray(m.modes)) {
              updateModeList(m.modes);
            }
            break;
            case 'promptResponse':
            try {
    const rid = m.requestId;
    const nodes = chatMessagesContainer.querySelectorAll('[data-request-id]');
    let found = null;
    nodes.forEach(n => { if (n.dataset.requestId === String(rid)) found = n; });
    
    const text = m.response && m.response.text ? m.response.text : 
                 (m.error ? ('Error: ' + m.error) : 
                 (m.response && m.response.raw ? JSON.stringify(m.response.raw) : ''));

    if (found) {
      const textEl = found.querySelector('.message-text');
      const metaEl = found.querySelector('.message-meta');
      
      if (textEl) textEl.innerText = text;
      
      if (metaEl) {
        // Hide spinner and status
        const spinnerEl = metaEl.querySelector('.assistant-spinner');
        const statusEl = metaEl.querySelector('.status-text');
        const metaTextEl = metaEl.querySelector('.meta-text');
        
        if (spinnerEl) spinnerEl.style.display = 'none';
        if (statusEl) statusEl.style.display = 'none';
        if (metaTextEl) metaTextEl.innerText = '';
        
        // Populate enhanced metadata if available
        if (m.response) {
          populateEnhancedMetadata(found, m.response);
        }
      }
      
      found.removeAttribute('data-request-id');
    } else {
      // Create new message with enhanced data
      appendMessage('assistant', text, '', m.response);
    }
    
  } catch (e) { 
    console.error('Error processing promptResponse', e); 
  }
  break;
            case 'apiKeyChanged':
            try { vscode.postMessage({ command: 'getApiKey', client: m.client }); } catch (e) { console.error(e); }
            // ask extension for fresh model list
            setTimeout(() => { try { vscode.postMessage({ command: 'getModels' }); } catch (e) {} }, 200);
            break;
            default:
            break;
          }
          });

          // expose a small API for outer scripts to refresh models
          window.chatHandler = {
          updateModelDropdown: function() { try { vscode.postMessage({ command: 'getModels' }); } catch (e) {} }
          };

          // initial model & mode load
          try { vscode.postMessage({ command: 'getModels' }); } catch (e) {}
          try { vscode.postMessage({ command: 'getModes' }); } catch (e) {}
        })();
        </script>
      </body>
      </html>
    `;
    try {
      this.router = routerFactory ? routerFactory(this.context) : null;
    } catch (err) {
      console.error('Failed to create router:', err);
      this.router = null;
    }

    webviewView.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'openFilePicker':
            this.openWorkspaceFilePicker();
            return;
          case 'selectedFilesChanged':
            console.log('Selected files from webview:', message.files);
            return;
          case 'openApiKeySetup':
            this.openApiKeySetup();
            return;
          case 'getApiKey':
            this.getApiKey(message.client);
            return;
          case 'getModels':
            try {
              const models = this.router ? await this.router.getModels() : { flatList: [] };
              this.webviewView.webview.postMessage({ command: 'modelsResponse', models });
            } catch (err) {
              this.webviewView.webview.postMessage({ command: 'modelsResponse', error: String(err), models: { flatList: [] } });
            }
            return;
          case 'getModes':
            try {
              const modes = this.router && typeof this.router.listModes === 'function' ? await this.router.listModes() : [];
              this.webviewView.webview.postMessage({ command: 'modesResponse', modes });
            } catch (err) {
              this.webviewView.webview.postMessage({ command: 'modesResponse', error: String(err), modes: [] });
            }
            return;
          case 'sendPrompt':
            try {
              const modelId = message.modelId;
              const prompt = message.prompt;
              const requestId = message.requestId;
              const modeId = message.modeId;
              if (!this.router) throw new Error('Router not configured');
              // If the router has provider metadata, prefer provider-specific senders
              let resp;
              // If a specific mode is requested, run it (modes can perform pre/post processing)
              if (modeId && typeof this.router.runMode === 'function') {
                try {
                  resp = await this.router.runMode(modeId, { router: this.router, modelId, prompt, requestId });
                } catch (e) {
                  resp = { raw: null, text: String(e) };
                }
              } else {
              try {
                const byId = this.router.getModels ? (await this.router.getModels()).byId : {};
                const modelMeta = byId && byId[modelId] ? byId[modelId] : null;
                if (modelMeta && modelMeta.provider === 'nvidia' && typeof this.router.sendPromptNvidia === 'function') {
                  resp = await this.router.sendPromptNvidia(modelId, prompt);
                } else {
                  resp = await this.router.sendPrompt(modelId, prompt);
                }
              } catch {
                // fallback to generic sendPrompt
                resp = await this.router.sendPrompt(modelId, prompt);
              }
              }
              this.webviewView.webview.postMessage({ command: 'promptResponse', requestId, response: resp });
            } catch (err) {
              const requestId = message.requestId;
              this.webviewView.webview.postMessage({ command: 'promptResponse', requestId, error: String(err) });
            }
            return;
        }
      },
      undefined,
      this.context.subscriptions
    );
  }

  async openApiKeySetup() {
    try {
      const clients = ['gemini', 'nvidia'];
      const clientNames = {
        gemini: 'Google Gemini',
        nvidia: 'NVIDIA AI'
      };
      
      const selectedClient = await vscode.window.showQuickPick(
        clients.map(client => ({
          label: clientNames[client],
          description: `Configure API key for ${clientNames[client]}`,
          client: client
        })),
        {
          placeHolder: 'Select AI client to configure'
        }
      );
      
      if (!selectedClient) return;
      
      const currentKey = vscode.workspace.getConfiguration('vsx').get(`apiKey.${selectedClient.client}`);
      const hasKey = currentKey && currentKey.length > 0;
      
      const action = await vscode.window.showQuickPick([
        {
          label: hasKey ? 'Update API Key' : 'Set API Key',
          description: hasKey ? 'Replace existing API key' : 'Add new API key',
          action: 'set'
        },
        ...(hasKey ? [{
          label: 'Clear API Key',
          description: 'Remove existing API key',
          action: 'clear'
        }] : []),
        {
          label: 'Cancel',
          description: 'Go back without changes',
          action: 'cancel'
        }
      ], {
        placeHolder: `Configure ${selectedClient.label} API key`
      });
      
      if (!action || action.action === 'cancel') return;
      
      if (action.action === 'clear') {
        await vscode.workspace.getConfiguration('vsx').update(`apiKey.${selectedClient.client}`, undefined, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`${selectedClient.label} API key cleared successfully.`);
        // Notify webview that API key changed so UI can refresh models
        if (this.webviewView) {
          this.webviewView.webview.postMessage({ command: 'apiKeyChanged', client: selectedClient.client, action: 'cleared' });
        }
        return;
      }
      
      if (action.action === 'set') {
        const apiKey = await vscode.window.showInputBox({
          prompt: `Enter your ${selectedClient.label} API key`,
          password: true,
          placeHolder: 'API key...',
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return 'API key cannot be empty';
            }
            return null;
          }
        });
        
        if (apiKey) {
          await vscode.workspace.getConfiguration('vsx').update(`apiKey.${selectedClient.client}`, apiKey.trim(), vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage(`${selectedClient.label} API key saved successfully.`);
          // Notify webview that API key changed so UI can refresh models
          if (this.webviewView) {
            this.webviewView.webview.postMessage({ command: 'apiKeyChanged', client: selectedClient.client, action: 'set' });
          }
        }
      }
      
    } catch (error) {
      console.error('Error setting up API key:', error);
      vscode.window.showErrorMessage(`Error setting up API key: ${error.message}`);
    }
  }
  
  async getApiKey(client) {
    try {
      const apiKey = vscode.workspace.getConfiguration('vsx').get(`apiKey.${client}`);
      this.webviewView.webview.postMessage({
        command: 'apiKeyResponse',
        client: client,
        apiKey: apiKey || null
      });
    } catch (error) {
      console.error('Error getting API key:', error);
      this.webviewView.webview.postMessage({
        command: 'apiKeyResponse',
        client: client,
        apiKey: null
      });
    }
  }

  async openWorkspaceFilePicker() {
    try {
      const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
      const items = files.map(f => ({ label: path.relative(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '', f.fsPath), description: f.fsPath }));
      const selection = await vscode.window.showQuickPick(items, { placeHolder: 'Select files from the workspace', canPickMany: true });
      if (selection && selection.length > 0) {
        const filesData = selection.map(s => ({ path: s.description, label: s.label, content: this.safeRead(s.description, '') }));
        this.webviewView.webview.postMessage({ command: 'filesSelected', files: filesData });
      } else {
        this.webviewView.webview.postMessage({ command: 'filePickerCanceled' });
      }
    } catch (err) {
      console.error('Error picking file', err);
      this.webviewView.webview.postMessage({ command: 'filePickerError', error: String(err) });
    }
  }
}

module.exports = MyWebviewProvider;
