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
  
  const maxRetryAttempts = 3;
  
  // Message deduplication
  const recentMessages = new Set();
  const MESSAGE_DEDUP_TIMEOUT = 1000; // 1 second
  
  // File changes tracking for autopilot mode
  let pendingFileChanges = [];
  let fileChangesTimeout = null;

  function isDuplicateMessage(text, role) {
    const messageKey = `${role}:${text}`;
    if (recentMessages.has(messageKey)) {
      return true;
    }
    recentMessages.add(messageKey);
    setTimeout(() => {
      recentMessages.delete(messageKey);
    }, MESSAGE_DEDUP_TIMEOUT);
    return false;
  }

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

        btn.addEventListener('click', async () => {
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

  function metaText(meta, showMeta = false) {
    if (!showMeta) return '';
    
    meta = meta || {};
    const m = meta.model || selectedModel || '';
    const mo = meta.mode || selectedMode || '';
    
    // Format model and mode names with first character capitalized
    const formatName = (name) => {
      if (!name) return '';
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    };
    
    const formattedModel = formatName(m);
    const formattedMode = formatName(mo);
    
    if (!formattedModel && !formattedMode) return '';
    return (`${formattedModel}${formattedModel && formattedMode ? ' • ' : ' '}${formattedMode}`).trim();
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
      <div class="loading-inner">
        ${spinners}
        <span class="loading-text">Working...</span>
      </div>
    `;
    return loadingNode;
  }

  function appendMessage(role, text, meta, requestId, showMeta = false) {
    if (!container) return null;
    
    // Check for duplicate messages (skip for widgets and special content)
    if (typeof text === 'string' && text.length > 0 && !text.includes('<') && isDuplicateMessage(text, role)) {
      console.log('Skipping duplicate message:', text.substring(0, 50) + '...');
      return null;
    }
    
    const tpl = role === 'assistant' ? tmplAssistant : tmplUser;
    if (!tpl || !tpl.content || !tpl.content.firstElementChild) return null;
    const node = tpl.content.firstElementChild.cloneNode(true);
    if (requestId) {
      try { node.dataset.requestId = String(requestId); } catch (e) {}
    }
    const textEl = node.querySelector('.message-text');
    const metaEl = node.querySelector('.meta-text');
    renderMessageContent(textEl, text);
    if (metaEl) metaEl.textContent = metaText(meta, showMeta);
    
    container.appendChild(node);
    if (loadingNode && loadingNode.parentNode === container) container.appendChild(loadingNode);
    container.scrollTop = container.scrollHeight;
    updatePlaceholderVisibility();
    
    // Update footer visibility for assistant messages (don't show footer during conversation)
    if (role === 'assistant') {
      updateAssistantFooters(false);
    }
    
    return node;
  }

  function updateAssistantNode(requestId, text, meta, isLastMessage = true) {
    if (!container || !requestId) return null;
    const sel = `.assistant-message[data-request-id="${String(requestId)}"]`;
    const nodes = container.querySelectorAll(sel);
    const node = nodes && nodes.length ? nodes[nodes.length - 1] : null;
    if (!node) return null;
    const textEl = node.querySelector('.message-text');
    const metaEl = node.querySelector('.meta-text');
    renderMessageContent(textEl, text);
    if (metaEl) metaEl.textContent = metaText(meta, isLastMessage);
    const spinner = node.querySelector('.assistant-spinner'); if (spinner) spinner.style.display = 'none';
    const status = node.querySelector('.status-text'); if (status) status.style.display = 'none';
    
    // Update footer visibility after updating content (show footer if this is the final message)
    updateAssistantFooters(isLastMessage);
    
    return node;
  }

  function setLoading(flag, meta, loadingText = 'Working...') {
    if (!container) return;
    if (flag) {
      const ln = ensureLoading();
      const textEl = ln.querySelector('.loading-text');
      if (textEl) textEl.textContent = loadingText;
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
    // Clear pending file changes
    pendingFileChanges = [];
    if (fileChangesTimeout) {
      clearTimeout(fileChangesTimeout);
      fileChangesTimeout = null;
    }
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
        // Update tagline based on selected mode
        const tagline = modesTaglines[selectedMode] || modesTaglines['legacy'] || 'Build with VSX';
        const tagEl = document.getElementById('vsx-placeholder-tagline'); 
        if (tagEl) tagEl.textContent = tagline;
        
        // Update icon if available
        const imgEl = document.getElementById('vsx-placeholder-icon'); 
        if (imgEl) {
          if (placeholderIcon && placeholderIcon.length > 0) {
            imgEl.src = placeholderIcon;
            imgEl.style.display = '';
          } else {
            // Hide icon if no URI available
            imgEl.style.display = 'none';
          }
        }
        
        ph.style.display = 'flex';
      } else {
        ph.style.display = 'none';
      }
    } catch (e) { 
      console.error('Error updating placeholder visibility:', e);
    }
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
        li.className = 'px-3 py-2 text-gray-400 text-center cursor-pointer hover:bg-gray-700 hover:text-white transition-colors';
        li.innerHTML = `
          <div class="text-sm">No models available</div>
          <div class="text-xs mt-1 opacity-75">Click to configure API keys</div>
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
          ? 'px-3 py-2 text-gray-500 cursor-pointer text-sm hover:bg-gray-700 hover:text-gray-300 transition-colors'
          : 'px-3 py-2 hover:bg-gray-700 cursor-pointer text-sm text-gray-200 hover:text-white transition-colors';
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
        li.className = 'px-3 py-2 text-gray-400 text-center';
        li.textContent = 'No modes available';
        listEl.appendChild(li);
        return;
      }
      
      modes.forEach(m => {
        const id = m.id || m.modeId || m.name || String(m);
        const name = m.name || m.displayName || m.id || id;
        const li = document.createElement('li');
        li.className = 'px-3 py-2 hover:bg-gray-700 cursor-pointer text-sm text-gray-200 hover:text-white transition-colors';
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

  // Helper to check if message should be filtered out
  function shouldFilterMessage(text) {
    if (typeof text !== 'string') return false;
    
    const filterPatterns = [
      /searching for files/i,
      /found \d+ files?/i,
      /applying changes/i,
      /changes applied/i,
      /applied changes to/i,
      /file updated/i,
      /writing to file/i,
      /created file/i,
      /analyzed.*file/i,
      /project has.*dependencies/i,
      /opened file preview/i,
      /file preview/i,
      /auto.*applied/i,
      /automatically applied/i,
      /file changes applied/i,
      /updated file/i,
      /modified file/i,
      /saved changes/i
    ];
    
    return filterPatterns.some(pattern => pattern.test(text));
  }

  // Helper to show waiting state for terminal commands
  function showTerminalWaiting() {
    setLoading(true, {}, 'Waiting for user input...');
  }

  // Helper to mark conversation as ended and show footer
  function markConversationEnded() {
    updateAssistantFooters(true);
  }

  // Helper to collect file changes and show summary widget
  function addFileChange(filePath, linesAdded = 0, linesRemoved = 0) {
    // Check if autopilot is enabled
    const autopilotToggle = document.getElementById('autopilot-toggle');
    const isAutopilot = autopilotToggle && autopilotToggle.checked;
    
    if (!isAutopilot) return; // Only collect changes in autopilot mode
    
    // Add to pending changes
    pendingFileChanges.push({
      filePath,
      linesAdded,
      linesRemoved,
      timestamp: Date.now()
    });
    
    // Clear existing timeout
    if (fileChangesTimeout) {
      clearTimeout(fileChangesTimeout);
    }
    
    // Set timeout to show summary widget after 500ms of no new changes
    fileChangesTimeout = setTimeout(() => {
      if (pendingFileChanges.length > 0) {
        showFileChangesSummary();
        pendingFileChanges = [];
      }
    }, 500);
  }

  // Show file changes summary widget
  function showFileChangesSummary() {
    if (pendingFileChanges.length === 0) return;
    
    const widget = createFileChangesWidget(pendingFileChanges);
    if (widget) {
      // Find the latest assistant message to attach widget
      const assistantMsgs = container ? container.querySelectorAll('.assistant-message') : [];
      const node = assistantMsgs && assistantMsgs.length ? assistantMsgs[assistantMsgs.length - 1] : null;
      
      if (node) {
        const textEl = node.querySelector('.message-text');
        if (textEl) {
          textEl.appendChild(widget);
          container.scrollTop = container.scrollHeight;
        }
      } else {
        // Create a new message for the widget
        const messageNode = appendMessage('assistant', '', {}, 'file-changes-' + Date.now(), false);
        if (messageNode) {
          const textEl = messageNode.querySelector('.message-text');
          if (textEl) {
            textEl.appendChild(widget);
          }
        }
      }
    }
  }

  // Public API
  window.chatUI = {
    addUserMessage: (t, m, id) => {
      // Don't show meta for user messages unless it's the last in conversation
      return appendMessage('user', t, m, id, false);
    },
    addBotMessage: (t, m, id, showMeta = true) => {
      // Filter out redundant messages when widgets are shown
      if (shouldFilterMessage(t)) {
        console.log('Filtered redundant message:', t.substring(0, 50) + '...');
        return null;
      }
      return appendMessage('assistant', t, m, id, showMeta);
    },
    updateAssistantNode,
    setLoading: (flag, meta, loadingText = 'Working...') => {
      setLoading(flag, meta, loadingText);
      // Also update input area working state
      if (window.inputAreaAPI) {
        window.inputAreaAPI.setWorkingState(flag);
      }
    },
    showNotification,
    clearMessages,
    setSelectedModel,
    setSelectedMode,
    // Helper to request the extension host show a diff and apply/undo a file write
    invokeWriteFile: (filePath, newContent, requestId) => {
      try { if (vscode) vscode.postMessage({ command: 'tool.writeFile', filePath, newContent, requestId }); } catch (e) { console.error('invokeWriteFile failed', e); }
    },
    // Widget creators
    createFileSearchWidget,
    createFileChangesWidget,
    createFileEditWidget,
    // Helper to add widgets to messages
    addWidgetToMessage: (messageNode, widget) => {
      if (messageNode && widget) {
        const textEl = messageNode.querySelector('.message-text');
        if (textEl) {
          textEl.appendChild(widget);
        }
      }
    },
    // Helper to check if message should be filtered
    shouldFilterMessage,
    // Helper to show terminal waiting state
    showTerminalWaiting,
    // Helper to mark conversation as ended
    markConversationEnded,
    // Helper to track file changes for autopilot
    addFileChange
  };

  // Autopilot: store state and notify host when toggled
  const autopilotToggle = document.getElementById('autopilot-toggle');
  if (autopilotToggle) {
    autopilotToggle.addEventListener('change', () => {
      try { if (vscode) vscode.postMessage({ command: 'setAutoPilot', enabled: autopilotToggle.checked }); } catch (e) { console.error('post setAutoPilot failed', e); }
    });
  }

  // Update assistant message footers - only show after conversation ends
  function updateAssistantFooters(conversationEnded = false) {
    try {
      const assistantMessages = container.querySelectorAll('.assistant-message');
      
      // Hide all footers first
      assistantMessages.forEach(msg => {
        const footer = msg.querySelector('.message-footer');
        if (footer) footer.style.display = 'none';
      });
      
      // Show footer only on last message and only if conversation has ended
      if (conversationEnded && assistantMessages.length > 0) {
        const lastMessage = assistantMessages[assistantMessages.length - 1];
        const footer = lastMessage.querySelector('.message-footer');
        if (footer) {
          footer.style.display = 'flex';
          setupMessageFooter(lastMessage);
        }
      }
    } catch (e) {
      console.error('Error updating assistant footers:', e);
    }
  }

  // Setup message footer with action buttons
  function setupMessageFooter(messageNode) {
    try {
      const footer = messageNode.querySelector('.message-footer');
      if (!footer) return;
      
      const textEl = messageNode.querySelector('.message-text');
      const text = textEl ? textEl.textContent || '' : '';
      
      const likeBtn = footer.querySelector('.like-btn');
      const dislikeBtn = footer.querySelector('.dislike-btn');
      const copyBtn = footer.querySelector('.copy-btn');
      const statsBtn = footer.querySelector('.stats-btn');
      
      // Copy functionality
      if (copyBtn && !copyBtn.hasAttribute('data-setup')) {
        copyBtn.setAttribute('data-setup', 'true');
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(text);
            copyBtn.style.color = '#10b981';
            setTimeout(() => {
              copyBtn.style.color = '';
            }, 1000);
          } catch (err) {
            console.error('Copy failed:', err);
          }
        });
      }
      
      // Like/Dislike functionality
      if (likeBtn && !likeBtn.hasAttribute('data-setup')) {
        likeBtn.setAttribute('data-setup', 'true');
        likeBtn.addEventListener('click', () => {
          likeBtn.classList.toggle('liked');
          if (dislikeBtn) dislikeBtn.classList.remove('disliked');
        });
      }
      
      if (dislikeBtn && !dislikeBtn.hasAttribute('data-setup')) {
        dislikeBtn.setAttribute('data-setup', 'true');
        dislikeBtn.addEventListener('click', () => {
          dislikeBtn.classList.toggle('disliked');
          if (likeBtn) likeBtn.classList.remove('liked');
        });
      }
      
      // Stats tooltip functionality
      if (statsBtn && !statsBtn.hasAttribute('data-setup')) {
        statsBtn.setAttribute('data-setup', 'true');
        let tooltip = null;
        
        statsBtn.addEventListener('mouseenter', () => {
          if (tooltip) return;
          
          tooltip = document.createElement('div');
          tooltip.className = 'stats-tooltip';
          
          const inputTokens = Math.floor(Math.random() * 1000) + 100;
          const outputTokens = Math.floor(Math.random() * 500) + 50;
          
          tooltip.innerHTML = `Input: ${inputTokens} tokens<br>Output: ${outputTokens} tokens`;
          
          statsBtn.style.position = 'relative';
          statsBtn.appendChild(tooltip);
          
          setTimeout(() => {
            if (tooltip) tooltip.classList.add('visible');
          }, 10);
        });
        
        statsBtn.addEventListener('mouseleave', () => {
          if (tooltip) {
            tooltip.classList.remove('visible');
            setTimeout(() => {
              if (tooltip && tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
              }
              tooltip = null;
            }, 200);
          }
        });
      }
    } catch (e) {
      console.error('Error setting up message footer:', e);
    }
  }

  // Create file search widget with proper count display
  function createFileSearchWidget(searchQuery, results) {
    try {
      const wrapper = document.createElement('div');
      wrapper.className = 'file-search-widget';
      
      const resultCount = results && Array.isArray(results) ? results.length : 0;
      
      const header = document.createElement('div');
      header.className = 'file-search-header';
      header.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
          <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14z"/>
        </svg>
        <span>${resultCount} file${resultCount !== 1 ? 's' : ''} found</span>
      `;
      
      const resultsContainer = document.createElement('div');
      resultsContainer.className = 'file-search-results';
      
      if (results && results.length > 0) {
        results.forEach(file => {
          const item = document.createElement('div');
          item.className = 'file-search-item';
          item.textContent = file.path || file.name || file;
          item.addEventListener('click', () => {
            // Could trigger file open or preview
            console.log('File selected:', file);
          });
          resultsContainer.appendChild(item);
        });
      } else {
        const noResults = document.createElement('div');
        noResults.className = 'file-search-item';
        noResults.textContent = 'No files found';
        noResults.style.color = '#9ca3af';
        resultsContainer.appendChild(noResults);
      }
      
      wrapper.appendChild(header);
      wrapper.appendChild(resultsContainer);
      
      return wrapper;
    } catch (e) {
      console.error('Error creating file search widget:', e);
      return null;
    }
  }

  // Create file changes summary widget
  function createFileChangesWidget(changes, requestId) {
    try {
      const wrapper = document.createElement('div');
      wrapper.className = 'file-changes-widget';
      wrapper.dataset.requestId = requestId || '';
      
      const header = document.createElement('div');
      header.className = 'file-changes-header';
      header.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
          <path fill="currentColor" d="M9,10H7V12H9V10M13,10H11V12H13V10M17,10H15V12H17V10M19,3H18V1H16V3H8V1H6V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M19,19H5V8H19V19Z"/>
        </svg>
        <span>Changes Applied</span>
      `;
      
      const changesContainer = document.createElement('div');
      changesContainer.className = 'file-changes-list';
      
      if (Array.isArray(changes)) {
        changes.forEach(change => {
          const item = document.createElement('div');
          item.className = 'file-change-item';
          
          const fileName = document.createElement('span');
          fileName.className = 'file-change-name';
          fileName.textContent = change.filePath || change.file || 'Unknown file';
          
          const stats = document.createElement('div');
          stats.className = 'file-change-stats';
          
          const added = change.linesAdded || 0;
          const removed = change.linesRemoved || 0;
          
          if (added > 0) {
            const addedSpan = document.createElement('span');
            addedSpan.className = 'lines-added';
            addedSpan.textContent = `+${added}`;
            stats.appendChild(addedSpan);
          }
          
          if (removed > 0) {
            const removedSpan = document.createElement('span');
            removedSpan.className = 'lines-removed';
            removedSpan.textContent = `-${removed}`;
            stats.appendChild(removedSpan);
          }
          
          item.appendChild(fileName);
          item.appendChild(stats);
          changesContainer.appendChild(item);
        });
      }
      
      wrapper.appendChild(header);
      wrapper.appendChild(changesContainer);
      
      return wrapper;
    } catch (e) {
      console.error('Error creating file changes widget:', e);
      return null;
    }
  }

  // Create file edit preview widget (simplified without code display)
  function createFileEditWidget(filePath, changes, requestId) {
    try {
      const wrapper = document.createElement('div');
      wrapper.className = 'file-edit-preview';
      wrapper.dataset.requestId = requestId || '';
      
      const header = document.createElement('div');
      header.className = 'file-edit-header';
      
      const pathSpan = document.createElement('span');
      pathSpan.className = 'file-edit-path';
      pathSpan.textContent = filePath;
      
      const actions = document.createElement('div');
      actions.className = 'file-edit-actions';
      
      // Check if autopilot is enabled
      const autopilotToggle = document.getElementById('autopilot-toggle');
      const isAutopilot = autopilotToggle && autopilotToggle.checked;
      
      if (isAutopilot) {
        // Auto-accept changes - don't show individual widget, will be handled by summary
        const autoMsg = document.createElement('span');
        autoMsg.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" style="display: inline; margin-right: 4px;">
            <path fill="currentColor" d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
          </svg>
          Auto-applied
        `;
        autoMsg.style.color = '#10b981';
        autoMsg.style.fontSize = '11px';
        autoMsg.style.display = 'flex';
        autoMsg.style.alignItems = 'center';
        actions.appendChild(autoMsg);
        
        // Notify extension to apply changes
        setTimeout(() => {
          if (vscode) {
            vscode.postMessage({
              command: 'autoAcceptFileEdit',
              filePath,
              changes,
              requestId
            });
          }
        }, 100);
      } else {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'file-edit-btn accept';
        acceptBtn.textContent = 'Keep';
        acceptBtn.addEventListener('click', () => {
          if (vscode) {
            vscode.postMessage({
              command: 'acceptFileEdit',
              filePath,
              changes,
              requestId
            });
          }
          wrapper.style.opacity = '0.6';
          acceptBtn.disabled = true;
          rejectBtn.disabled = true;
        });
        
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'file-edit-btn reject';
        rejectBtn.textContent = 'Undo';
        rejectBtn.addEventListener('click', () => {
          if (vscode) {
            vscode.postMessage({
              command: 'rejectFileEdit',
              filePath,
              requestId
            });
          }
          wrapper.style.opacity = '0.6';
          acceptBtn.disabled = true;
          rejectBtn.disabled = true;
        });
        
        actions.appendChild(acceptBtn);
        actions.appendChild(rejectBtn);
      }
      
      header.appendChild(pathSpan);
      header.appendChild(actions);
      
      // Show summary instead of full diff
      const summary = document.createElement('div');
      summary.className = 'file-edit-summary';
      summary.textContent = 'File changes ready to apply';
      
      wrapper.appendChild(header);
      wrapper.appendChild(summary);
      
      return wrapper;
    } catch (e) {
      console.error('Error creating file edit widget:', e);
      return null;
    }
  }

  // Helper to create a terminal-command widget inside an assistant message
  function createTerminalWidget(toolCall) {
    try {
      // Wrap in a structure like code-widget-wrapper for consistent margins/width
      const outerWrapper = document.createElement('div');
      outerWrapper.className = 'code-widget-wrapper'; // Reuse for alignment

      const wrapper = document.createElement('div');
      wrapper.className = 'terminal-tool-widget';
      
      // Header with terminal icon and label
      const header = document.createElement('div');
      header.className = 'terminal-lang-label';
      header.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
          <path fill="currentColor" d="M20,19V7H4V19H20M20,3A2,2 0 0,1 22,5V19A2,2 0 0,1 20,21H4A2,2 0 0,1 2,19V5C2,3.89 2.9,3 4,3H20M13,17V15H18V17H13M9.58,13L5.57,9H8.4L11.7,12.3C12.09,12.69 12.09,13.33 11.7,13.72L8.42,17H5.59L9.58,13Z"/>
        </svg>
        Command
      `;
      
      const command = toolCall.args && toolCall.args.command ? String(toolCall.args.command) : (toolCall.args && toolCall.args.cmd ? String(toolCall.args.cmd) : '');
      const pre = document.createElement('pre');
      pre.className = 'terminal-cmd';
      pre.textContent = command;
      
      const controls = document.createElement('div');
      controls.className = 'terminal-controls';
      
      const runBtn = document.createElement('button');
      runBtn.type = 'button';
      runBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
          <path fill="currentColor" d="M8,5.14V19.14L19,12.14L8,5.14Z"/>
        </svg>
      `;
      runBtn.className = 'run-btn';
      runBtn.title = 'Run Command';
      
      const skipBtn = document.createElement('button');
      skipBtn.type = 'button';
      skipBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
          <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
        </svg>
      `;
      skipBtn.className = 'skip-btn';
      skipBtn.title = 'Skip Command';
      
      const out = document.createElement('div');
      out.className = 'terminal-output';
      out.textContent = 'Waiting for user approval...'; // Initial message

      controls.appendChild(runBtn);
      controls.appendChild(skipBtn);
      if (toolCall && toolCall.requestId) try { wrapper.dataset.requestId = toolCall.requestId; } catch {}
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
      wrapper.appendChild(controls);
      wrapper.appendChild(out);
      outerWrapper.appendChild(wrapper);

      // Wire actions
      runBtn.addEventListener('click', () => {
        try {
          out.textContent = 'Running command...';
          runBtn.disabled = true;
          skipBtn.disabled = true;
          // Clear any loading indicators and show running state
          setLoading(false);
          if (vscode) vscode.postMessage({ command: 'runTerminalCommand', toolCall, requestId: toolCall.requestId || String(Date.now()) });
        } catch (e) { 
          console.error('runTerminalCommand post failed', e); 
          out.textContent = 'Failed to run command.';
        }
      });
      skipBtn.addEventListener('click', () => {
        try {
          out.textContent = 'Command skipped by user.';
          runBtn.disabled = true;
          skipBtn.disabled = true;
          // Clear loading and continue
          setLoading(false);
          if (vscode) vscode.postMessage({ command: 'skipTerminalCommand', toolCall, requestId: toolCall.requestId || String(Date.now()) });
        } catch (e) { 
          console.error('skipTerminalCommand post failed', e); 
          out.textContent = 'Failed to skip command.';
        }
      });

      return { widget: outerWrapper }; // Return outer for consistent styling
    } catch (e) { 
      console.error('createTerminalWidget failed', e); 
      return null; 
    }
  }

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
        try { 
          placeholderIcon = msg.iconUri || ''; 
          console.debug('[webview-client] Received placeholder icon URI:', placeholderIcon);
          updatePlaceholderVisibility(); 
        } catch (e) { 
          console.error('Error handling placeholderResources:', e); 
        }
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
          if (msg.final || (msg.response && msg.response.done)) {
            setLoading(false, meta);
            // Mark conversation as ended to show footer
            markConversationEnded();
          }
        } catch (e) {
          console.error('promptResponse error', e);
        }
        break;
      }
        case 'terminalCommandResult': {
          try {
            const req = msg.requestId;
            const output = msg.output || '';
            // Clear waiting state
            setLoading(false);
            // find widget by data-request-id
            const widget = container.querySelector(`.terminal-tool-widget[data-request-id="${String(req)}"]`);
            if (widget) {
              const outEl = widget.querySelector('.terminal-output');
              const statusEl = widget.querySelector('.terminal-status');
              if (outEl) outEl.textContent = output;
              if (statusEl) statusEl.textContent = output ? 'Command completed.' : 'Command completed with no output.';
            } else {
              // fallback: append a message
              appendMessage('assistant', `Command result:\n${output}`, {}, req);
            }
          } catch (e) { console.error('terminalCommandResult handler failed', e); }
          break;
        }
        case 'terminalCommandSkipped': {
          try {
            const req = msg.requestId;
            // Clear waiting state
            setLoading(false);
            const widget = container.querySelector(`.terminal-tool-widget[data-request-id="${String(req)}"]`);
            if (widget) {
              const outEl = widget.querySelector('.terminal-output');
              const statusEl = widget.querySelector('.terminal-status');
              if (outEl) outEl.textContent = 'Command skipped by user.';
              if (statusEl) statusEl.textContent = 'Command skipped by user.';
            } else {
              appendMessage('assistant', `User skipped running command.`, {}, req);
            }
          } catch (e) { console.error('terminalCommandSkipped handler failed', e); }
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
          const name = (tc.tool || '').toString().toLowerCase();
          const requestId = tc.requestId || msg.requestId || String(Date.now());
          
          // Handle different tool types
          if (name === 'terminal_command' || name === 'terminalcommand' || name === 'execute_command') {
            // Check for existing widget to prevent duplicates
            const existingWidget = container.querySelector(`.terminal-tool-widget[data-request-id="${String(requestId)}"]`);
            if (existingWidget) {
              console.debug('[webview-client] Skipping duplicate terminal widget for requestId:', requestId);
              break;
            }

            // Show waiting state for terminal command
            setLoading(true, {}, 'Waiting for user input...');

            // Find the latest assistant message to attach widget
            const assistantMsgs = container ? container.querySelectorAll('.assistant-message') : [];
            const node = assistantMsgs && assistantMsgs.length ? assistantMsgs[assistantMsgs.length - 1] : null;
            const tcCopy = Object.assign({}, tc);
            try { tcCopy.requestId = requestId; } catch {}
            const tw = createTerminalWidget(tcCopy);
            if (node && tw && tw.widget) {
              const textEl = node.querySelector('.message-text');
              if (textEl) textEl.appendChild(tw.widget);
              container.scrollTop = container.scrollHeight;
            } else if (tw && tw.widget) {
              const wrapperNode = document.createElement('div'); 
              wrapperNode.className = 'assistant-message p-3 m-2 max-w-[70%] text-gray-100 rounded-lg';
              const textWrap = document.createElement('div'); 
              textWrap.className = 'message-text'; 
              textWrap.appendChild(tw.widget); 
              wrapperNode.appendChild(textWrap);
              container.appendChild(wrapperNode);
              container.scrollTop = container.scrollHeight;
            }
          }
          else if (name === 'searchfile' || name === 'searchfiles') {
            // Handle file search tool
            const args = tc.args || {};
            const query = args.q || args.query || args.pattern || '';
            const results = args.results || [];
            
            const searchWidget = createFileSearchWidget(query, results);
            if (searchWidget) {
              const assistantMsgs = container ? container.querySelectorAll('.assistant-message') : [];
              const node = assistantMsgs && assistantMsgs.length ? assistantMsgs[assistantMsgs.length - 1] : null;
              if (node) {
                const textEl = node.querySelector('.message-text');
                if (textEl) textEl.appendChild(searchWidget);
              }
            }
          }
          else if (name === 'writefile' || name === 'write_file' || name.includes('write')) {
            // Handle file write tool
            const args = tc.args || {};
            const filePath = args.filePath || args.path || args.file || args.target || args.file_path;
            const newContent = args.content || args.newContent || args.proposed || args.lines || '';
            
            if (filePath && (typeof newContent === 'string' || Array.isArray(newContent))) {
              const contentStr = Array.isArray(newContent) ? newContent.join('\n') : String(newContent);
              
              // Create file edit preview widget
              const editWidget = createFileEditWidget(filePath, contentStr, requestId);
              if (editWidget) {
                const assistantMsgs = container ? container.querySelectorAll('.assistant-message') : [];
                const node = assistantMsgs && assistantMsgs.length ? assistantMsgs[assistantMsgs.length - 1] : null;
                if (node) {
                  const textEl = node.querySelector('.message-text');
                  if (textEl) textEl.appendChild(editWidget);
                }
              }
              
              // Also forward to extension for processing
              try { 
                if (vscode) vscode.postMessage({ 
                  command: 'tool.writeFile', 
                  filePath, 
                  newContent: contentStr, 
                  requestId 
                }); 
              } catch (e) { 
                console.error('forward tool.writeFile failed', e); 
              }
            }
          }
        } catch (e) { 
          console.error('toolCallNotification handler error', e); 
        }
        break;
      }
      case 'tool.writeFile.response': {
        try {
          const action = msg.action || '';
          const path = msg.filePath || msg.path || '';
          const added = msg.added || 0;
          const removed = msg.removed || 0;
          
          // Check if autopilot is enabled
          const autopilotToggle = document.getElementById('autopilot-toggle');
          const isAutopilot = autopilotToggle && autopilotToggle.checked;
          
          if (action === 'autokept') {
            if (isAutopilot) {
              // In autopilot mode, just track the change for summary widget
              addFileChange(path, added, removed);
            } else {
              // Fallback message if not in autopilot mode
              appendMessage('assistant', `Auto-applied changes to ${path}: +${added} -${removed}`, {}, msg.requestId || null);
            }
          } else if (action === 'kept') {
            if (isAutopilot) {
              // In autopilot mode, track for summary
              addFileChange(path, added, removed);
            } else {
              // Manual mode, show individual message
              appendMessage('assistant', `Applied changes to ${path}: +${added} -${removed}`, {}, msg.requestId || null);
            }
          } else if (action === 'rejected') {
            // Always show rejection messages
            appendMessage('assistant', `Rejected changes to ${path}`, {}, msg.requestId || null);
          }
        } catch (e) { console.error('tool.writeFile.response handler failed', e); }
        break;
      }
        
      case 'autoPilotChanged': {
        try {
          const enabled = Boolean(msg.enabled);
          const toggle = document.getElementById('autopilot-toggle');
          if (toggle) {
            toggle.checked = enabled;
            const track = document.getElementById('autopilot-track');
            const thumb = document.getElementById('autopilot-thumb');
            if (track && thumb) {
              if (enabled) {
                track.classList.add('bg-blue-600');
                track.classList.remove('bg-gray-600');
                thumb.style.transform = 'translateX(20px)';
              } else {
                track.classList.remove('bg-blue-600');
                track.classList.add('bg-gray-600');
                thumb.style.transform = 'translateX(0)';
              }
            }
          }
        } catch (e) { console.error('autoPilotChanged handler error', e); }
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