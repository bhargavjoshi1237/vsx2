// ui/webview-client.js
// Clean, minimal webview chat client implementation.
(function () {
  'use strict';

  const vscode = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;

  const container = document.getElementById('chat-messages-container');
  const tmplUser = document.getElementById('template-chat-user');
  const tmplAssistant = document.getElementById('template-chat-assistant');

  let selectedModel = '';
  let selectedMode = '';
  let loadingNode = null;
  let modelsRequestAttempts = 0;
  let modesRequestAttempts = 0;
  const maxRetryAttempts = 3;

  function renderMessageContent(el, text) {
    el = el || document.createElement('div');
    el.innerHTML = '';
    if (text === null || text === undefined) return;
    const parts = String(text).split(/```/g);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        const d = document.createElement('div');
        d.textContent = parts[i];
        el.appendChild(d);
      } else {
        // Render a code showcase with copy button
        const raw = parts[i] || '';
        let lang = '';
        let codeText = raw;
        const firstNewline = raw.indexOf('\n');
        if (firstNewline !== -1) {
          const possible = raw.slice(0, firstNewline).trim();
          if (/^[a-zA-Z0-9+#-]+$/.test(possible)) {
            lang = possible;
            codeText = raw.slice(firstNewline + 1);
          }
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'code-widget-wrapper';

        const widget = document.createElement('div');
        widget.className = 'code-widget';

        if (lang) {
          const lab = document.createElement('div');
          lab.className = 'code-lang-label';
          lab.textContent = lang;
          widget.appendChild(lab);
        }

        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = codeText;
        pre.appendChild(code);
        widget.appendChild(pre);

        const btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Copy code');
        btn.title = 'Copy code';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18 2H9c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H9V4h9zM3 15v-2h2v2zm0-5.5h2v2H3zM10 20h2v2h-2zm-7-1.5v-2h2v2zM5 22c-1.1 0-2-.9-2-2h2zm3.5 0h-2v-2h2zm5 0v-2h2c0 1.1-.9 2-2 2M5 6v2H3c0-1.1.9-2 2-2"/></svg>`;

        const fb = document.createElement('div');
        fb.className = 'copy-feedback';
        fb.textContent = 'Copied';

        wrapper.appendChild(widget);
        wrapper.appendChild(btn);
        wrapper.appendChild(fb);
        el.appendChild(wrapper);

        btn.addEventListener('click', async (ev) => {
          try {
            await navigator.clipboard.writeText(code.textContent || '');
            fb.style.display = 'block';
            setTimeout(() => { try { fb.style.display = 'none'; } catch (e) {} }, 1500);
          } catch (err) {
            console.error('copy failed', err);
            fb.textContent = 'Copy failed';
            fb.style.display = 'block';
            setTimeout(() => { try { fb.style.display = 'none'; fb.textContent = 'Copied'; } catch (e) {} }, 2000);
          }
        });
      }
    }
  }

  function metaText(meta) {
    meta = meta || {};
    const m = meta.model || selectedModel || '';
    const mo = meta.mode || selectedMode || '';
    if (!m && !mo) return '';
    return (`Model: ${m}${m && mo ? ' • ' : ' '}${mo}`).trim();
  }

  function ensureLoading() {
    if (loadingNode) return loadingNode;
    loadingNode = document.createElement('div');
    loadingNode.id = 'global-loading';
    loadingNode.className = 'loading-node m-3 text-gray-400';

    const spinners = `
      <span class="spinner-icons inline-flex items-center space-x-2" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"><path fill="currentColor" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/><path fill="currentColor" d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"><animateTransform attributeName="transform" dur="0.75s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/></path></svg>
         </span>
    `;

    loadingNode.innerHTML = `
      <div class="loading-inner flex flex-row items-center space-x-2 ml-2.5">
        ${spinners}
        <span class="loading-text align-middle -mt-0.5">Working...</span>
      </div>
    `;
    return loadingNode;
  }

  function appendMessage(role, text, meta, requestId) {
    if (!container) return null;
    const tpl = role === 'assistant' ? tmplAssistant : tmplUser;
    if (!tpl || !tpl.content || !tpl.content.firstElementChild) return null;
    const node = tpl.content.firstElementChild.cloneNode(true);
    if (requestId) {
      try { node.dataset.requestId = String(requestId); } catch (e) {}
    }
    const textEl = node.querySelector('.message-text');
    const metaEl = node.querySelector('.meta-text');
    renderMessageContent(textEl, text);
    if (metaEl) metaEl.textContent = metaText(meta);
    container.appendChild(node);
    if (loadingNode && loadingNode.parentNode === container) container.appendChild(loadingNode);
    container.scrollTop = container.scrollHeight;
    updatePlaceholderVisibility();
    return node;
  }

  function updateAssistantNode(requestId, text, meta) {
    if (!container || !requestId) return null;
    const sel = `.assistant-message[data-request-id="${String(requestId)}"]`;
    const nodes = container.querySelectorAll(sel);
    const node = nodes && nodes.length ? nodes[nodes.length - 1] : null;
    if (!node) return null;
    const textEl = node.querySelector('.message-text');
    const metaEl = node.querySelector('.meta-text');
    renderMessageContent(textEl, text);
    if (metaEl) metaEl.textContent = metaText(meta);
    const spinner = node.querySelector('.assistant-spinner'); if (spinner) spinner.style.display = 'none';
    const status = node.querySelector('.status-text'); if (status) status.style.display = 'none';
    return node;
  }

  function setLoading(flag, meta) {
    if (!container) return;
    if (flag) {
      const ln = ensureLoading();
      const metaEl = ln.querySelector('.loading-meta'); if (metaEl) metaEl.textContent = metaText(meta);
      container.appendChild(ln);
      container.scrollTop = container.scrollHeight;
    } else {
      if (loadingNode && loadingNode.parentNode) loadingNode.parentNode.removeChild(loadingNode);
    }
  }

  function showNotification(text) {
    if (!container) return;
    const n = document.createElement('div');
    n.className = 'notification-chip m-2 text-sm text-gray-300';
    n.textContent = text;
    container.appendChild(n);
    if (loadingNode && loadingNode.parentNode === container) container.appendChild(loadingNode);
    container.scrollTop = container.scrollHeight;
  }

  function clearMessages() {
    if (!container) return;
    container.innerHTML = '';
    loadingNode = null;
    updatePlaceholderVisibility();
  }

  // Placeholder management
  let placeholderIcon = '';
  let modesTaglines = {};
  function updatePlaceholderVisibility() {
    try {
      const ph = document.getElementById('vsx-placeholder');
      if (!ph) return;
  // Determine if there are actual chat message nodes (assistant or user)
  const userMsgs = container ? container.querySelectorAll('.user-message') : [];
  const assistantMsgs = container ? container.querySelectorAll('.assistant-message') : [];
  const hasMessages = (userMsgs && userMsgs.length) || (assistantMsgs && assistantMsgs.length);
      if (!hasMessages) {
        const tagline = modesTaglines[selectedMode] || modesTaglines['legacy'] || 'Build with VSX';
        const tagEl = document.getElementById('vsx-placeholder-tagline'); if (tagEl) tagEl.textContent = tagline;
        const imgEl = document.getElementById('vsx-placeholder-icon'); if (imgEl && placeholderIcon) imgEl.src = placeholderIcon;
        ph.style.display = '';
      } else {
        ph.style.display = 'none';
      }
    } catch (e) { /* ignore */ }
  }

  function setSelectedModel(id) { selectedModel = id || ''; }
  function setSelectedMode(id) { selectedMode = id || ''; }

  function updateModelDropdown(modelsPayload) {
    try {
      const listEl = document.getElementById('model-list');
      const dropdown = document.getElementById('model-dropdown');
      if (!listEl || !dropdown) return;
      
      console.log('[webview-client] Updating model dropdown with:', modelsPayload);
      
      const models = (modelsPayload && modelsPayload.flatList) ? modelsPayload.flatList : (Array.isArray(modelsPayload) ? modelsPayload : []);
      listEl.innerHTML = '';
      
      if (!models || !models.length) {
        const li = document.createElement('li');
        li.className = 'px-4 py-3 text-gray-400 text-center cursor-pointer';
        li.innerHTML = `
          <div>No models available</div>
          <div class="text-xs mt-1">Click to configure API keys</div>
        `;
        li.addEventListener('click', () => {
          console.log('[webview-client] Requesting API key setup');
          if (vscode) {
            vscode.postMessage({ command: 'openApiKeySetup' });
          }
        });
        listEl.appendChild(li);
        return;
      }
      
      models.forEach(m => {
        const id = m.id || m.modelId || m.name || String(m);
        const name = m.name || m.displayName || m.id || id;
        const disabled = m.disabled || false;
        
        const li = document.createElement('li');
        li.className = disabled 
          ? 'px-4 py-2 text-gray-500 cursor-pointer text-sm'
          : 'px-4 py-2 hover:bg-gray-700 cursor-pointer text-sm text-[#e7e7e7]';
        li.dataset.modelId = id;
        li.setAttribute('role', 'option');
        li.textContent = name;
        
        li.addEventListener('click', () => {
          if (disabled) {
            console.log('[webview-client] Requesting API key setup for disabled model');
            if (vscode) {
              vscode.postMessage({ command: 'openApiKeySetup' });
            }
            return;
          }
          
          selectedModel = id;
          try {
            const btnSpan = dropdown.querySelector('button span'); 
            if (btnSpan) btnSpan.textContent = name;
          } catch (err) { 
            console.error('updateModelDropdown click set label error', err); 
          }
          try { dropdown.dataset.selectedModelId = id; } catch (err) {}
          try { if (dropdown.__x && dropdown.__x.$data) dropdown.__x.$data.selected = name; } catch (err) {}
        });
        listEl.appendChild(li);
      });
      
      // Set default selected if none and we have enabled models
      const enabledModels = models.filter(m => !m.disabled);
      if (!selectedModel && enabledModels.length) {
        const first = enabledModels[0];
        selectedModel = first.id || first.modelId || first.name || String(first);
        try { 
          const btnSpan = dropdown.querySelector('button span'); 
          if (btnSpan) btnSpan.textContent = first.name || first.id || selectedModel; 
        } catch (err) { 
          console.error(err); 
        }
        try { 
          if (dropdown.__x && dropdown.__x.$data) dropdown.__x.$data.selected = first.name || first.id || selectedModel; 
        } catch (err) { }
        try { dropdown.dataset.selectedModelId = selectedModel; } catch (err) {}
      } else if (!selectedModel && models.length) {
        // All models are disabled, show first one but indicate it needs setup
        const first = models[0];
        try { 
          const btnSpan = dropdown.querySelector('button span'); 
          if (btnSpan) btnSpan.textContent = 'Configure API Keys'; 
        } catch (err) { 
          console.error(err); 
        }
      }
    } catch (e) { 
      console.error('updateModelDropdown error', e); 
    }
  }

  function updateModeList(modes) {
    try {
      const listEl = document.getElementById('mode-list');
      const dropdown = document.getElementById('mode-dropdown');
      if (!listEl || !dropdown) return;
      
      console.log('[webview-client] Updating mode list with:', modes);
      
      listEl.innerHTML = '';
      if (!modes || !Array.isArray(modes) || modes.length === 0) {
        const li = document.createElement('li');
        li.className = 'px-4 py-3 text-gray-400 text-center';
        li.textContent = 'No modes available';
        listEl.appendChild(li);
        return;
      }
      
      modes.forEach(m => {
        const id = m.id || m.modeId || m.name || String(m);
        const name = m.name || m.displayName || m.id || id;
        const li = document.createElement('li');
        li.className = 'px-4 py-2 hover:bg-gray-700 cursor-pointer text-sm text-[#e7e7e7]';
        li.dataset.modeId = id;
        li.textContent = name;
        li.setAttribute('role', 'option');
        li.addEventListener('click', () => {
          selectedMode = id;
          try { const btnSpan = dropdown.querySelector('button span'); if (btnSpan) btnSpan.textContent = name; } catch (err) { console.error(err); }
          try { dropdown.dataset.selectedModeId = id; } catch (err) {}
          try { if (dropdown.__x && dropdown.__x.$data) dropdown.__x.$data.selected = name; } catch (err) {}
        });
        listEl.appendChild(li);
      });
      
      if (!selectedMode && modes.length) {
        const first = modes[0];
        selectedMode = first.id || first.modeId || first.name || String(first);
        try { 
          const btnSpan = dropdown.querySelector('button span'); 
          if (btnSpan) btnSpan.textContent = first.name || first.id || selectedMode; 
        } catch (err) {}
        try { 
          if (dropdown.__x && dropdown.__x.$data) dropdown.__x.$data.selected = first.name || first.id || selectedMode; 
        } catch (err) {}
        try { dropdown.dataset.selectedModeId = selectedMode; } catch (err) {}
      }
    } catch (e) { 
      console.error('updateModeList error', e); 
    }
  }

  // Public API
  window.chatUI = {
    addUserMessage: (t, m, id) => appendMessage('user', t, m, id),
    addBotMessage: (t, m, id) => appendMessage('assistant', t, m, id),
    updateAssistantNode,
    setLoading,
    showNotification,
    clearMessages,
    setSelectedModel,
    setSelectedMode
    ,
    // Helper to request the extension host show a diff and apply/undo a file write
    invokeWriteFile: (filePath, newContent, requestId) => {
      try { if (vscode) vscode.postMessage({ command: 'tool.writeFile', filePath, newContent, requestId }); } catch (e) { console.error('invokeWriteFile failed', e); }
    }
  };

  // Listen for messages from extension host
  window.addEventListener('message', (ev) => {
    const msg = ev.data || {};
    const cmd = msg.command;
    console.debug('[webview-client] received message', cmd, msg);
    
    switch (cmd) {
      case 'modelsResponse':
        try { 
          console.debug('[webview-client] modelsResponse', msg.models); 
          updateModelDropdown(msg.models || msg.modelsResponse || []); 
        } catch (err) { 
          console.error('modelsResponse handler error', err); 
        }
        break;
        
      case 'modesResponse':
        try { 
          console.debug('[webview-client] modesResponse', msg.modes); 
          updateModeList(msg.modes || []); 
        } catch (err) { 
          console.error('modesResponse handler error', err); 
        }
        break;
      case 'modesTaglines':
        try { modesTaglines = msg.taglines || {}; updatePlaceholderVisibility(); } catch (e) { console.error(e); }
        break;
      case 'placeholderResources':
        try { placeholderIcon = msg.iconUri || ''; updatePlaceholderVisibility(); } catch (e) { console.error(e); }
        break;
        
      case 'appendChatMessage':
        appendMessage(msg.role || 'assistant', msg.text || '', msg.meta || {}, msg.requestId);
        break;
        
      case 'promptResponse': {
        try {
          const rid = msg.requestId;
          const text = (msg.response && (msg.response.plain_text || msg.response.text)) || msg.text || '';
          const meta = (msg.response && msg.response.metadata) || msg.meta || { model: msg.modelId, mode: msg.modeId };
          const updated = rid ? updateAssistantNode(rid, text, meta) : null;
          if (!updated) {
            appendMessage('assistant', text, meta, rid);
          }
          if (msg.final || (msg.response && msg.response.done)) setLoading(false, meta);
        } catch (e) {
          console.error('promptResponse error', e);
        }
        break;
      }
      
      case 'setLoading':
        setLoading(Boolean(msg.loading), msg.meta || {});
        break;
        
      case 'clear':
        clearMessages();
        break;
        
      case 'newChat':
        clearMessages();
        setSelectedModel('');
        setSelectedMode('');
        break;
        
      case 'showNotification':
        showNotification(msg.text || '');
        break;
        
      case 'clearWorkingStatus':
        setLoading(false);
        break;
        
      case 'apiKeyChanged':
        console.log('[webview-client] API key changed, requesting models refresh');
        requestModelsAndModes(false);
        break;
      case 'toolCallNotification': {
        try {
          const tc = msg.toolCall || {};
          // If the tool indicates a write operation, forward to host to show diff
          const name = (tc.tool || '').toString().toLowerCase();
          if (name === 'writefile' || name === 'write_file' || name.includes('write')) {
            const args = tc.args || {};
            // Common arg names: filePath, path, file, content, newContent
            const filePath = args.filePath || args.path || args.file || args.target || args.file_path;
            const newContent = args.content || args.newContent || args.proposed || args.lines || '';
            const requestId = tc.requestId || msg.requestId || String(Date.now());
            if (filePath && (typeof newContent === 'string' || Array.isArray(newContent))) {
              const contentStr = Array.isArray(newContent) ? newContent.join('\n') : String(newContent);
              try { if (vscode) vscode.postMessage({ command: 'tool.writeFile', filePath, newContent: contentStr, requestId }); } catch (e) { console.error('forward tool.writeFile failed', e); }
            }
          }
        } catch (e) { console.error('toolCallNotification handler error', e); }
        break;
      }
        
      default:
        break;
    }
  });

  // Forward custom DOM events from header to host in case header-side postMessage doesn't work
  try {
    window.addEventListener('vsx-openApiKeySetup', () => {
      try { if (vscode) vscode.postMessage({ command: 'openApiKeySetup' }); } catch (e) { console.error('forward openApiKeySetup failed', e); }
    });
    window.addEventListener('vsx-setCerebrasReasoning', () => {
      try { if (vscode) vscode.postMessage({ command: 'setCerebrasReasoning' }); } catch (e) { console.error('forward setCerebrasReasoning failed', e); }
    });
  } catch (e) {
    console.error('Failed to attach vsx DOM event forwarders', e);
  }

  // Request initial models and modes lists from host with retry logic
  function requestModelsAndModes(isRetry = false) {
    console.log(`[webview-client] Requesting models and modes (attempt ${isRetry ? modelsRequestAttempts + 1 : 1})`);
    
    try { 
      if (vscode) { 
        console.debug('[webview-client] requesting models'); 
        vscode.postMessage({ command: 'getModels' }); 
      } 
    } catch (err) { 
      console.error('getModels postMessage failed', err); 
    }
    
    try { 
      if (vscode) { 
        console.debug('[webview-client] requesting modes'); 
        vscode.postMessage({ command: 'getModes' }); 
      } 
    } catch (err) { 
      console.error('getModes postMessage failed', err); 
    }

    if (!isRetry) {
      // Schedule retries with exponential backoff
      setTimeout(() => {
        if (modelsRequestAttempts < maxRetryAttempts) {
          modelsRequestAttempts++;
          requestModelsAndModes(true);
        }
      }, 1000);
      
      setTimeout(() => {
        if (modelsRequestAttempts < maxRetryAttempts) {
          modelsRequestAttempts++;
          requestModelsAndModes(true);
        }
      }, 3000);
    }
  }
  
  // Initial request with slight delay to ensure DOM is ready
  setTimeout(() => requestModelsAndModes(false), 300);

  // Ensure placeholder visibility is evaluated shortly after startup
  setTimeout(() => { try { updatePlaceholderVisibility(); } catch (e) {} }, 500);

  // Optional: textarea wiring to post prompts to host
  const inputTa = document.getElementById('inputTextArea');
  if (inputTa && vscode) {
    inputTa.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        const text = inputTa.value.trim();
        if (!text) return;
        
        if (!selectedModel) {
          showNotification('Please select a model first or configure API keys');
          return;
        }
        
        const requestId = String(Date.now()) + Math.random().toString(36).slice(2,8);
        appendMessage('user', text, { model: selectedModel, mode: selectedMode }, requestId);
        setLoading(true, { model: selectedModel, mode: selectedMode });
        inputTa.value = '';
        
        try {
          // Collect visible chat messages (role + text) from the DOM
          const chatNodes = [];
          try {
            const allNodes = [];
            if (container) {
              const children = Array.from(container.children || []);
              for (const c of children) {
                if (c.classList && (c.classList.contains('user-message') || c.classList.contains('assistant-message'))) {
                  allNodes.push(c);
                }
              }
            }
            for (const n of allNodes) {
              try {
                const role = n.classList.contains('user-message') ? 'user' : 'assistant';
                const textEl = n.querySelector('.message-text');
                const txt = textEl ? (textEl.innerText || textEl.textContent || '') : '';
                if (txt && String(txt).trim().length) chatNodes.push({ role, text: String(txt).trim() });
              } catch { }
            }
          } catch { }

          vscode.postMessage({ 
            command: 'sendPrompt', 
            prompt: text, 
            requestId, 
            modelId: selectedModel, 
            modeId: selectedMode,
            previous_chat_history: chatNodes
          });
        } catch (e) {
          console.error('postMessage failed', e);
          setLoading(false);
          showNotification('Failed to send message');
        }
      }
    });
  }

})(); 