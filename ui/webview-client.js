/* eslint-env browser */
/* global acquireVsCodeApi */
(function(){
  window.vscode = acquireVsCodeApi && acquireVsCodeApi();
  const vscode = window.vscode;
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
  let legacyModeSession = null; // Track Legacy Mode session state
  // store prompt metadata by requestId so reload/edit can resend
  const messageStore = new Map();

  // Performance optimization state
  let loadingStates = new Map();
  let uiUpdateQueue = [];
  let uiUpdateTimer = null;
  let performanceMetrics = {
    uiUpdatesProcessed: 0,
    averageUpdateTime: 0,
    lastUpdateTime: null
  };

  function appendMessage(role, text, meta, responseData) {
    try {
      const tplId = role === 'user' ? 'template-chat-user' : 'template-chat-assistant';
      const tpl = document.getElementById(tplId);
      if (tpl && tpl.content) {
        const node = tpl.content.firstElementChild.cloneNode(true);
        const textEl = node.querySelector('.message-text');
        const metaEl = node.querySelector('.message-meta');
        
        if (textEl) renderMessageContent(textEl, text);

        if (metaEl && role === 'assistant') {
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

          if (responseData && !isPending) {
            populateEnhancedMetadata(node, responseData);
          }
        }

        chatMessagesContainer.appendChild(node);
        // if assistant role, mark as latest and remove latest from previous assistant messages
        if (role === 'assistant') {
          try {
            // remove is-latest from other assistant messages
            const prevLatest = chatMessagesContainer.querySelector('.assistant-message.is-latest');
            if (prevLatest && prevLatest !== node) prevLatest.classList.remove('is-latest');
            node.classList.add('is-latest');
            // attach handlers (controls only visible on latest due to CSS)
            const reloadBtn = node.querySelector('.reload-btn');
            const editBtn = node.querySelector('.edit-btn');
            if (reloadBtn) reloadBtn.addEventListener('click', (ev) => { ev.stopPropagation(); console.debug('reload clicked'); handleReload(node); });
            if (editBtn) editBtn.addEventListener('click', (ev) => { ev.stopPropagation(); console.debug('edit clicked'); handleEdit(node); });
          } catch (e) { console.error('attach control handlers error', e); }
        }
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        return node;
      }
    } catch (e) { 
      console.error('Error in appendMessage:', e); 
    }
    return null;
  }

  function renderSentFileChips(userNode, files) {
    try {
      if (!userNode || !files || !files.length) return;
      // Prefer an internal `.user-message-files` container inside the wrapper
      let chipsWrap = userNode.querySelector && (userNode.querySelector('.user-message-files') || userNode.querySelector('.sent-file-chips'));
      // if not found, try next sibling (older layout)
      if (!chipsWrap) {
        try {
          const next = userNode.nextElementSibling;
          if (next && next.classList && next.classList.contains('user-message-files')) chipsWrap = next;
        } catch (e) { /* ignore */ }
      }
      if (!chipsWrap) return;
      chipsWrap.innerHTML = '';
      files.forEach((f) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.textContent = f.label || f.path || 'file';
        chipsWrap.appendChild(chip);
      });
    } catch (e) { console.error('renderSentFileChips error', e); }
  }

  async function handleReload(assistantNode) {
    try {
      const oldReq = assistantNode.dataset.requestId;
      if (!oldReq) return;
      const meta = messageStore.get(String(oldReq));
      if (!meta) return;
      // remove old assistant node
      assistantNode.remove();
      // create new placeholder assistant and send again
      const newReq = String(Date.now()) + Math.random().toString(36).slice(2,8);
      const placeholderNode = appendMessage('assistant', '', '');
      if (placeholderNode) {
        placeholderNode.dataset.requestId = newReq;
        try { const metaEl = placeholderNode.querySelector('.message-meta'); if (metaEl) { const spinnerEl = metaEl.querySelector('.assistant-spinner'); const statusEl = metaEl.querySelector('.status-text'); if (spinnerEl) spinnerEl.style.display = 'inline-flex'; if (statusEl) statusEl.style.display = 'inline'; } } catch (e) {}
      }
      // store under new id
      messageStore.set(newReq, Object.assign({}, meta));
      // send
      try { vscode.postMessage({ command: 'sendPrompt', modelId: meta.modelId, prompt: meta.prompt, requestId: newReq, modeId: meta.modeId }); } catch (e) { console.error('reload send failed', e); }
    } catch (e) { console.error('handleReload error', e); }
  }

function createInlineEditor(userNode, initialText) {
  const editorWrap = document.createElement('div');
  editorWrap.className = 'inline-editor mt-2 w-full bg-[#1e1e1e] border border-gray-700 rounded-lg shadow-md p-3';

  // header
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-2';
  const headerText = document.createElement('span');
  headerText.textContent = 'Edit Message';
  headerText.className = 'text-sm text-gray-300 font-medium';
  header.appendChild(headerText);
  editorWrap.appendChild(header);

  // textarea
  const ta = document.createElement('textarea');
  ta.className = 'w-full p-3 rounded-md bg-[#111] text-gray-100 text-sm border border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none';
  ta.rows = 3;
  ta.value = initialText || '';
  editorWrap.appendChild(ta);

  // buttons
  const btnRow = document.createElement('div');
  btnRow.className = 'flex gap-2 justify-end mt-3';

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'px-4 py-1.5 rounded-md border border-gray-600 text-gray-100 bg-[#2a2a2a] hover:bg-[#333] hover:border-gray-500 transition text-sm';
  sendBtn.textContent = 'Send';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'px-4 py-1.5 rounded-md border border-gray-700 text-gray-300 bg-transparent hover:bg-[#222] hover:text-white transition text-sm';
  cancelBtn.textContent = 'Cancel';

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(sendBtn);
  editorWrap.appendChild(btnRow);

  return { editorWrap, ta, sendBtn, cancelBtn };
}


  function handleEdit(assistantNode) {
    try {
      const req = assistantNode.dataset.requestId;
      console.debug('handleEdit invoked, req=', req);
      if (!req) return;
      // try dataset lookup first
      let userNode = chatMessagesContainer.querySelector(`.user-message[data-request-id="${req}"]`);
      // if not found, try to find the nearest preceding .user-message element
      if (!userNode) {
        let el = assistantNode.previousElementSibling;
        while (el) {
          if (el.classList && el.classList.contains('user-message')) { userNode = el; break; }
          el = el.previousElementSibling;
        }
      }
      if (!userNode) {
        // fallback: prefill main textarea with original prompt so user can edit and send
        const stored = messageStore.get(String(req));
        const orig = stored ? (Array.isArray(stored.prompt) ? stored.prompt[0] : stored.prompt) : '';
        if (textarea) {
          textarea.value = orig || '';
          textarea.focus();
        }
        console.warn('handleEdit: user node not found, prefilling main input as fallback');
        return;
      }

      const textEl = userNode.querySelector('.message-text');
      const inlineTa = userNode.querySelector('textarea.inline-edit');
      const inlineControls = userNode.querySelector('.inline-controls');
      const sendBtn = userNode.querySelector('.send-edit');
      const cancelBtn = userNode.querySelector('.cancel-edit');

      const originalText = textEl ? textEl.textContent : '';

      // If no inline textarea exists, bail
      if (!inlineTa || !inlineControls || !sendBtn || !cancelBtn) {
        console.warn('handleEdit: inline editor controls not found, falling back to full editor');
        // fallback to existing createInlineEditor
        // avoid multiple editors
        if (userNode.querySelector('.inline-editor')) return;
        const { editorWrap, ta, sendBtn: sB, cancelBtn: cB } = createInlineEditor(userNode, originalText);
        userNode.appendChild(editorWrap);
        cB.addEventListener('click', (ev) => { ev.preventDefault(); editorWrap.remove(); });
        sB.addEventListener('click', async (ev) => {
          ev.preventDefault();
          const newText = ta.value.trim();
          if (!newText) return;
          if (textEl) textEl.textContent = newText;
          editorWrap.remove();
          try { assistantNode.remove(); } catch (e) {}
          const newReq = String(Date.now()) + Math.random().toString(36).slice(2,8);
          const placeholderNode = appendMessage('assistant', '', '');
          if (placeholderNode) placeholderNode.dataset.requestId = newReq;
          const stored = messageStore.get(String(req)) || {};
          let payload = newText;
          if (stored.files && Array.isArray(stored.files) && stored.files.length) {
            payload = [newText, { __files: true, files: stored.files }];
          }
          messageStore.set(newReq, { prompt: payload, modelId: stored.modelId || selectedModelId, modeId: stored.modeId || selectedModeId, files: stored.files || [] });
          try { vscode.postMessage({ command: 'sendPrompt', modelId: stored.modelId || selectedModelId, prompt: payload, requestId: newReq, modeId: stored.modeId || selectedModeId }); } catch (e) { console.error('edit send failed', e); }
        });
        return;
      }

      // Activate inline editing UI
      userNode.classList.add('editing');
      inlineTa.style.display = 'block';
      inlineControls.style.display = 'flex';
      inlineTa.value = originalText || '';
      inlineTa.focus();

      // wire cancel
      const cancelHandler = (ev) => {
        ev && ev.preventDefault();
        userNode.classList.remove('editing');
        inlineTa.style.display = 'none';
        inlineControls.style.display = 'none';
        // restore text content (no change)
        inlineTa.value = '';
        // cleanup handlers
        cancelBtn.removeEventListener('click', cancelHandler);
        sendBtn.removeEventListener('click', sendHandler);
      };

      // wire send
      const sendHandler = async (ev) => {
        ev && ev.preventDefault();
        const newText = inlineTa.value.trim();
        if (!newText) return;
        if (textEl) textEl.textContent = newText;
        // hide editor
        userNode.classList.remove('editing');
        inlineTa.style.display = 'none';
        inlineControls.style.display = 'none';
        // remove old assistant node
        try { assistantNode.remove(); } catch (e) {}
        // send new prompt
        const newReq = String(Date.now()) + Math.random().toString(36).slice(2,8);
        const placeholderNode = appendMessage('assistant', '', '');
        if (placeholderNode) placeholderNode.dataset.requestId = newReq;
        // build payload (preserve files if present)
        const stored = messageStore.get(String(req)) || {};
        let payload = newText;
        if (stored.files && Array.isArray(stored.files) && stored.files.length) {
          payload = [newText, { __files: true, files: stored.files }];
        }
        // store mapping
        messageStore.set(newReq, { prompt: payload, modelId: stored.modelId || selectedModelId, modeId: stored.modeId || selectedModeId, files: stored.files || [] });
        try { vscode.postMessage({ command: 'sendPrompt', modelId: stored.modelId || selectedModelId, prompt: payload, requestId: newReq, modeId: stored.modeId || selectedModeId }); } catch (e) { console.error('edit send failed', e); }

        // cleanup handlers
        cancelBtn.removeEventListener('click', cancelHandler);
        sendBtn.removeEventListener('click', sendHandler);
      };

      cancelBtn.addEventListener('click', cancelHandler);
      sendBtn.addEventListener('click', sendHandler);

    } catch (e) { console.error('handleEdit error', e); }
  }

  function renderMessageContent(container, text) {
    try {
      if (!container) return;
      container.innerHTML = '';
      if (!text && text !== 0) return;
      const str = String(text);
      
      // Check if this is Legacy Mode content
      if (str.includes('# Legacy Mode Execution Report')) {
        renderLegacyModeContent(container, str);
        return;
      }
      
      const fenceRegex = new RegExp('\x60\x60\x60([\\w-]+)?\\n([\\s\\S]*?)\x60\x60\x60','g');
      let lastIndex = 0;
      let match;
      while ((match = fenceRegex.exec(str)) !== null) {
        if (match.index > lastIndex) {
          const plain = str.substring(lastIndex, match.index);
          const p = document.createElement('div');
          p.textContent = plain;
          container.appendChild(p);
        }

        const lang = match[1] || 'text';
        const code = match[2] || '';

        const wrapper = document.createElement('div');
        wrapper.className = 'code-widget-wrapper';

        const widget = document.createElement('div');
        widget.className = 'code-widget mt-4 mb-4';

        const label = document.createElement('div');
        label.className = 'code-lang-label';
        label.textContent = lang;
        widget.appendChild(label);

        const pre = document.createElement('pre');
        const codeEl = document.createElement('code');
        codeEl.textContent = code;
        pre.appendChild(codeEl);
        widget.appendChild(pre);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.type = 'button';
        copyBtn.setAttribute('aria-label', 'Copy code');
        copyBtn.title = 'Copy code';
        copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M18 2H9c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H9V4h9zM3 15v-2h2v2zm0-5.5h2v2H3zM10 20h2v2h-2zm-7-1.5v-2h2v2zM5 22c-1.1 0-2-.9-2-2h2zm3.5 0h-2v-2h2zm5 0v-2h2c0 1.1-.9 2-2 2M5 6v2H3c0-1.1.9-2 2-2"/></svg>';

        const feedback = document.createElement('div');
        feedback.className = 'copy-feedback';
        feedback.textContent = 'Copied';

        copyBtn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          try {
            await navigator.clipboard.writeText(code);
            feedback.style.display = 'block';
            setTimeout(() => { feedback.style.display = 'none'; }, 1200);
          } catch (e) {
            try {
              const range = document.createRange();
              range.selectNodeContents(codeEl);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
              document.execCommand('copy');
              sel.removeAllRanges();
              feedback.style.display = 'block';
              setTimeout(() => { feedback.style.display = 'none'; }, 1200);
            } catch (ee) {
              console.error('Copy failed', ee);
            }
          }
        });

        wrapper.appendChild(widget);
        wrapper.appendChild(copyBtn);
        wrapper.appendChild(feedback);
        container.appendChild(wrapper);

        lastIndex = fenceRegex.lastIndex;
      }

      if (lastIndex < str.length) {
        const rest = str.substring(lastIndex);
        const p2 = document.createElement('div');
        p2.textContent = rest;
        container.appendChild(p2);
      }
    } catch (e) {
      try { container.innerText = text; } catch (ee) {}
    }
  }

  // Legacy Mode Content Rendering Functions
  function renderLegacyModeContent(container, content) {
    try {
      const sessionContainer = document.createElement('div');
      sessionContainer.className = 'legacy-mode-content';
      
      // Parse the Legacy Mode execution report
      const lines = content.split('\n');
      let currentSection = '';
      let sessionData = {
        id: '',
        started: '',
        phase: '',
        todos: [],
        originalTask: '',
        executionLog: [],
        verification: {}
      };
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.includes('Session ID:')) {
          sessionData.id = line.split('Session ID:')[1].trim().replace(/\*\*/g, '');
        } else if (line.includes('Started:')) {
          sessionData.started = line.split('Started:')[1].trim().replace(/\*\*/g, '');
        } else if (line.includes('Phase:')) {
          sessionData.phase = line.split('Phase:')[1].trim().replace(/\*\*/g, '');
        } else if (line.includes('## Original Task')) {
          currentSection = 'task';
        } else if (line.includes('## TODO List')) {
          currentSection = 'todos';
        } else if (line.includes('## Execution Summary')) {
          currentSection = 'execution';
        } else if (line.includes('## Final Verification')) {
          currentSection = 'verification';
        } else if (currentSection === 'task' && line && !line.startsWith('#')) {
          sessionData.originalTask += line + ' ';
        } else if (currentSection === 'todos' && line.match(/^\d+\./)) {
          const todoMatch = line.match(/^\d+\.\s*([✅⏳])\s*(.+)/);
          if (todoMatch) {
            sessionData.todos.push({
              status: todoMatch[1],
              description: todoMatch[2]
            });
          }
        }
      }
      
      // Render the session
      renderLegacySession(sessionContainer, sessionData);
      container.appendChild(sessionContainer);
      
    } catch (e) {
      console.error('Error rendering Legacy Mode content:', e);
      const fallback = document.createElement('div');
      fallback.textContent = content;
      container.appendChild(fallback);
    }
  }
  
  function renderLegacySession(container, sessionData) {
    const sessionEl = document.createElement('div');
    sessionEl.className = 'legacy-session-item bg-[#1e1e1e] border border-gray-600 rounded-lg p-4 mb-4';
    
    sessionEl.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold text-gray-100 flex items-center space-x-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" class="text-purple-400">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5l1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          <span>Legacy Mode</span>
        </h2>
        <span class="session-id text-xs text-gray-500">${sessionData.id}</span>
      </div>
      <div class="session-info grid grid-cols-2 gap-4 text-xs text-gray-400 mb-3">
        <div>
          <span class="text-gray-500">Started:</span>
          <span class="session-started">${sessionData.started}</span>
        </div>
        <div>
          <span class="text-gray-500">Phase:</span>
          <span class="session-phase">${sessionData.phase}</span>
        </div>
      </div>
      <div class="session-task bg-[#2a2a2a] p-3 rounded text-sm text-gray-300 mb-3">
        <div class="text-xs text-gray-500 mb-1">Original Task:</div>
        <div class="session-original-task">${sessionData.originalTask.trim()}</div>
      </div>
    `;
    
    // Add progress bar
    const completedTodos = sessionData.todos.filter(t => t.status === '✅').length;
    const totalTodos = sessionData.todos.length;
    const progressPercent = totalTodos > 0 ? (completedTodos / totalTodos) * 100 : 0;
    
    const progressEl = document.createElement('div');
    progressEl.className = 'legacy-progress-item bg-[#2a2a2a] border border-gray-600 rounded-lg p-4 mb-3';
    progressEl.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-medium text-gray-100">Legacy Mode Progress</h3>
        <span class="progress-phase text-xs text-blue-400">${sessionData.phase}</span>
      </div>
      <div class="progress-bar bg-gray-700 rounded-full h-2 mb-3">
        <div class="progress-fill bg-blue-500 h-2 rounded-full transition-all duration-300" style="width: ${progressPercent}%"></div>
      </div>
      <div class="flex justify-between text-xs text-gray-400">
        <span class="progress-current">${completedTodos}</span>
        <span class="progress-total">${totalTodos}</span>
      </div>
    `;
    
    sessionEl.appendChild(progressEl);
    
    // Add TODO list
    if (sessionData.todos.length > 0) {
      const todosContainer = document.createElement('div');
      todosContainer.className = 'todos-container';
      
      sessionData.todos.forEach((todo, index) => {
        const todoEl = document.createElement('div');
        todoEl.className = 'legacy-todo-item bg-[#2a2a2a] border border-gray-600 rounded-lg p-4 mb-3';
        todoEl.innerHTML = `
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center space-x-2">
              <span class="todo-status text-lg">${todo.status}</span>
              <h4 class="todo-description text-sm font-medium text-gray-100">${todo.description}</h4>
            </div>
            <span class="todo-id text-xs text-gray-500">#${index + 1}</span>
          </div>
        `;
        todosContainer.appendChild(todoEl);
      });
      
      sessionEl.appendChild(todosContainer);
    }
    
    container.appendChild(sessionEl);
  }
  
  function renderLegacyTodo(todo) {
    const todoEl = document.createElement('div');
    todoEl.className = 'legacy-todo-item bg-[#2a2a2a] border border-gray-600 rounded-lg p-4 mb-3';
    
    todoEl.innerHTML = `
      <div class="flex items-start justify-between mb-2">
        <div class="flex items-center space-x-2">
          <span class="todo-status text-lg">${todo.status === 'done' ? '✅' : '⏳'}</span>
          <h4 class="todo-description text-sm font-medium text-gray-100">${todo.description}</h4>
        </div>
        <span class="todo-id text-xs text-gray-500">#${todo.id}</span>
      </div>
      <div class="todo-expected text-xs text-gray-400 mb-2">Expected: ${todo.expectedResult}</div>
      <div class="todo-timestamps text-xs text-gray-500">
        Created: ${new Date(todo.createdAt).toLocaleString()}
        ${todo.completedAt ? `<br>Completed: ${new Date(todo.completedAt).toLocaleString()}` : ''}
      </div>
    `;
    
    return todoEl;
  }
  
  function renderLegacyTerminal(command, output) {
    const terminalEl = document.createElement('div');
    terminalEl.className = 'legacy-terminal-item bg-[#1a1a1a] border border-gray-700 rounded-lg p-3 mb-3';
    
    terminalEl.innerHTML = `
      <div class="flex items-center space-x-2 mb-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" class="text-green-400">
          <path fill="currentColor" d="M2 3h20c1.05 0 2 .95 2 2v14c0 1.05-.95 2-2 2H2c-1.05 0-2-.95-2-2V5c0-1.05.95-2 2-2m0 16h20V7H2v12m3-9.5l6 4.5l-6 4.5V7.5Z"/>
        </svg>
        <span class="text-xs font-medium text-green-400">Terminal Command</span>
      </div>
      <div class="terminal-command bg-[#0f0f0f] p-2 rounded text-xs font-mono text-gray-300 mb-2">$ ${command}</div>
      <div class="terminal-output bg-[#0f0f0f] p-2 rounded text-xs font-mono text-gray-400">${output}</div>
    `;
    
    return terminalEl;
  }
  
  function renderLegacyTool(toolName, input, output) {
    const toolEl = document.createElement('div');
    toolEl.className = 'legacy-tool-item bg-[#2a2a2a] border border-blue-600 rounded-lg p-3 mb-3';
    
    toolEl.innerHTML = `
      <div class="flex items-center space-x-2 mb-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" class="text-blue-400">
          <path fill="currentColor" d="M22.7 19l-9.1-9.1c.9-2.3.4-5.1-1.5-6.9c-2.3-2.3-5.9-2.5-8.4-.6L7.5 6.1L6.1 7.5L2.3 3.7c-1.9 2.5-1.7 6.1.6 8.4c1.8 1.8 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4Z"/>
        </svg>
        <span class="text-xs font-medium text-blue-400">Tool Call</span>
        <span class="tool-name text-xs text-gray-300">${toolName}</span>
      </div>
      <div class="tool-input bg-[#1a1a1a] p-2 rounded text-xs text-gray-300 mb-2">
        <div class="text-xs text-gray-500 mb-1">Input:</div>
        <div class="tool-input-content">${JSON.stringify(input, null, 2)}</div>
      </div>
      <div class="tool-output bg-[#1a1a1a] p-2 rounded text-xs">
        <div class="text-xs text-gray-500 mb-1">Output:</div>
        <div class="tool-output-content text-gray-300">${JSON.stringify(output, null, 2)}</div>
      </div>
    `;
    
    return toolEl;
  }
  
  function renderLegacyError(context, message, suggestion) {
    const errorEl = document.createElement('div');
    errorEl.className = 'legacy-error-item bg-[#2a1a1a] border border-red-600 rounded-lg p-3 mb-3';
    
    errorEl.innerHTML = `
      <div class="flex items-center space-x-2 mb-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" class="text-red-400">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5l1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span class="text-xs font-medium text-red-400">Error</span>
      </div>
      <div class="error-context text-xs text-gray-400 mb-2">${context}</div>
      <div class="error-message bg-[#1a0f0f] p-2 rounded text-xs text-red-300 mb-2">${message}</div>
      <div class="error-suggestion text-xs text-gray-400">${suggestion}</div>
    `;
    
    return errorEl;
  }

  function populateEnhancedMetadata(messageNode, responseData) {
    try {
      const statsEl = messageNode.querySelector('.message-stats');
      if (!statsEl) return;

      const modelInfoEl = statsEl.querySelector('.model-info');
      if (modelInfoEl && responseData.metadata) {
        const model = responseData.metadata.model || 'Unknown';
        modelInfoEl.textContent = 'Model: ' + model;
      }

      const timestampEl = statsEl.querySelector('.timestamp');
      if (timestampEl) {
        const now = new Date();
        timestampEl.textContent = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      }

      const eventCountEl = statsEl.querySelector('.event-count');
      if (eventCountEl && responseData.events) {
        eventCountEl.textContent = 'Events: ' + responseData.events;
      }

      const thinkingData = responseData.thinking_text || responseData.reasoning || '';
      if (thinkingData && thinkingData.trim()) {
        setupThinkingToggle(messageNode, thinkingData);
      }

    } catch (e) {
      console.error('Error populating enhanced metadata:', e);
    }
  }

  function setupThinkingToggle(messageNode, reasoningText) {
    try {
      const thinkingToggle = messageNode.querySelector('.thinking-toggle');
      const thinkingSection = messageNode.querySelector('.thinking-section');
      const thinkingTextEl = messageNode.querySelector('.thinking-text');
      const toggleTextEl = messageNode.querySelector('.toggle-text');
      const toggleArrow = messageNode.querySelector('.toggle-arrow');

      if (!thinkingToggle || !thinkingSection || !thinkingTextEl) return;

      thinkingToggle.style.display = 'block';
      thinkingTextEl.textContent = reasoningText;

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
        try {
          const btnSpan = modelDropdown.querySelector('button span');
          if (btnSpan) btnSpan.textContent = m.name || m.id;
        } catch (e) {}
      });
      modelListEl.appendChild(li);
    });
    if (!selectedModelId && models.length) {
      selectedModelId = models[0].id;
      try { const btnSpan = modelDropdown.querySelector('button span'); if (btnSpan) btnSpan.textContent = models[0].name || models[0].id; } catch (e) {}
    }
  }

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
      if (!selectedModeId && (modes || []).length) {
        selectedModeId = modes[0].id;
        try { const btnSpan = document.querySelector('#mode-dropdown button span'); if (btnSpan) btnSpan.textContent = modes[0].name || modes[0].id; } catch (e) {}
      }
    } catch (e) { console.error(e); }
  }

  async function sendCurrentPrompt() {
    const text = textarea && textarea.value ? textarea.value.trim() : '';
    if (!text) return;
    const requestId = String(Date.now()) + Math.random().toString(36).slice(2,8);
    // append user message and tag it with requestId
    const userNode = appendMessage('user', text);
    if (userNode) {
      // the template now wraps the bubble and the files container in a wrapper
      userNode.dataset.requestId = requestId;
      // also set the requestId on the inner `.user-message` element for selector compatibility
      try { const inner = userNode.querySelector('.user-message'); if (inner) inner.dataset.requestId = requestId; } catch (e) {}
      // render any attached files as chips under the user message
      renderSentFileChips(userNode, selectedFiles || []);
      // editing/reload actions happen via assistant controls or inline controls when editing
    }
    if (textarea) textarea.value = '';
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

    try {
      let payloadPrompt = text;
      const filesPayload = (selectedFiles && Array.isArray(selectedFiles) && selectedFiles.length) ? selectedFiles.map(f => ({ path: f.path, label: f.label, content: f.content })) : [];
      if (filesPayload.length) {
        payloadPrompt = [text, { __files: true, files: filesPayload }];
      }
      // store metadata for reload/edit actions
      messageStore.set(String(requestId), { prompt: payloadPrompt, modelId: selectedModelId, modeId: selectedModeId, files: filesPayload });
      vscode.postMessage({ command: 'sendPrompt', modelId: selectedModelId, prompt: payloadPrompt, requestId, modeId: selectedModeId });
    } catch (e) {
      console.error('Failed to post sendPrompt', e);
    }
  }

  if (textarea) {
    textarea.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        sendCurrentPrompt();
      }
    });
  }

  if (attachFileChip) attachFileChip.addEventListener('click', () => { try { vscode.postMessage({ command: 'openFilePicker' }); } catch (e) {} });
  if (setupApiBtn) setupApiBtn.addEventListener('click', () => { try { vscode.postMessage({ command: 'openApiKeySetup' }); } catch (e) {} });
  if (newChatBtn) newChatBtn.addEventListener('click', () => { if (chatMessagesContainer) chatMessagesContainer.innerHTML = ''; });

  window.addEventListener('message', event => {
    const m = event.data;
    if (!m || !m.command) return;
    switch (m.command) {
      case 'batchedUpdates':
        handleBatchedUpdates(m);
        break;
        
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
          
          const text = m.response && m.response.plain_text ? m.response.plain_text :
                       (m.response && m.response.text ? m.response.text : 
                       (m.error ? ('Error: ' + m.error) : 
                       (m.response && m.response.raw ? JSON.stringify(m.response.raw) : '')));

          const thinking = m.response && m.response.thinking_text ? m.response.thinking_text :
                       (m.response && m.response.text ? m.response.text : 
                       (m.error ? ('Error: ' + m.error) : 
                       (m.response && m.response.raw ? JSON.stringify(m.response.raw) : '')));

          if (found) {
            const textEl = found.querySelector('.message-text');
            const metaEl = found.querySelector('.message-meta');
            const thinkingEl = found.querySelector('.thinking-text');
            
            if (textEl) renderMessageContent(textEl, text);
            if (thinkingEl) renderMessageContent(thinkingEl, thinking);

            if (metaEl) {
              const spinnerEl = metaEl.querySelector('.assistant-spinner');
              const statusEl = metaEl.querySelector('.status-text');
              const metaTextEl = metaEl.querySelector('.meta-text');
              
              if (spinnerEl) spinnerEl.style.display = 'none';
              if (statusEl) statusEl.style.display = 'none';
              if (metaTextEl) metaTextEl.innerText = '';
              
              if (m.response) {
                populateEnhancedMetadata(found, m.response);
              }
            }
            
            // Handle Legacy Mode specific updates
            if (m.response && m.response.legacyMode) {
              handleLegacyModeUpdate(found, m.response);
            }
            
            // keep request-id on assistant node so reload/edit remain available
          } else {
            const newNode = appendMessage('assistant', text, '', m.response);
            
            // Handle Legacy Mode for new messages
            if (newNode && m.response && m.response.legacyMode) {
              handleLegacyModeUpdate(newNode, m.response);
            }
          }
        } catch (e) { 
          console.error('Error processing promptResponse', e); 
        }
        break;
      case 'apiKeyChanged':
        try { vscode.postMessage({ command: 'getApiKey', client: m.client }); } catch (e) { console.error(e); }
        setTimeout(() => { try { vscode.postMessage({ command: 'getModels' }); } catch (e) {} }, 200);
        break;
      case 'legacyModeCommand':
        handleLegacyModeCommand(m);
        break;
      case 'legacyModeConfirmation':
        handleLegacyModeConfirmation(m);
        break;
      default:
        break;
    }
  });

  window.chatHandler = {
    updateModelDropdown: function() { try { vscode.postMessage({ command: 'getModels' }); } catch (e) {} }
  };

  // Legacy Mode Handlers
  function handleLegacyModeUpdate(messageNode, response) {
    try {
      if (response && response.raw && response.raw.session) {
        legacyModeSession = response.raw.session;
        
        // Add Legacy Mode specific styling
        messageNode.classList.add('legacy-mode-message');
        
        // Store session data for future reference
        messageNode.dataset.legacySession = JSON.stringify(response.raw.session);
      }
    } catch (e) {
      console.error('Error handling Legacy Mode update:', e);
    }
  }
  
  function handleLegacyModeCommand(message) {
    try {
      const { command, data } = message;
      
      switch (command) {
        case 'todo_created':
          renderLegacyTodoInChat(data.todo);
          break;
        case 'terminal_executed':
          renderLegacyTerminalInChat(data.command, data.output);
          break;
        case 'tool_called':
          renderLegacyToolInChat(data.toolName, data.input, data.output);
          break;
        case 'error_occurred':
          renderLegacyErrorInChat(data.context, data.message, data.suggestion);
          break;
        case 'confirmation_required':
          renderLegacyConfirmationInChat(data);
          break;
      }
    } catch (e) {
      console.error('Error handling Legacy Mode command:', e);
    }
  }
  
  function handleLegacyModeConfirmation(message) {
    try {
      const { todoId, approved, feedback } = message;
      
      // Send confirmation back to the backend
      vscode.postMessage({
        command: 'legacyModeConfirmationResponse',
        todoId,
        approved,
        feedback
      });
      
      // Update UI to show confirmation status
      const confirmationEl = document.querySelector(`[data-todo-id="${todoId}"]`);
      if (confirmationEl) {
        if (approved) {
          confirmationEl.classList.add('confirmed-approved');
          confirmationEl.classList.remove('pending-confirmation');
        } else {
          confirmationEl.classList.add('confirmed-rejected');
          confirmationEl.classList.remove('pending-confirmation');
        }
      }
    } catch (e) {
      console.error('Error handling Legacy Mode confirmation:', e);
    }
  }
  
  function renderLegacyTodoInChat(todo) {
    const todoEl = renderLegacyTodo(todo);
    chatMessagesContainer.appendChild(todoEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  function renderLegacyTerminalInChat(command, output) {
    const terminalEl = renderLegacyTerminal(command, output);
    chatMessagesContainer.appendChild(terminalEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  function renderLegacyToolInChat(toolName, input, output) {
    const toolEl = renderLegacyTool(toolName, input, output);
    chatMessagesContainer.appendChild(toolEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  function renderLegacyErrorInChat(context, message, suggestion) {
    const errorEl = renderLegacyError(context, message, suggestion);
    chatMessagesContainer.appendChild(errorEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  function renderLegacyConfirmationInChat(data) {
    const confirmationEl = document.createElement('div');
    confirmationEl.className = 'legacy-confirmation-item bg-[#2a2a1a] border border-yellow-600 rounded-lg p-4 mb-3 pending-confirmation';
    confirmationEl.dataset.todoId = data.todoId;
    
    confirmationEl.innerHTML = `
      <div class="flex items-center space-x-2 mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" class="text-yellow-400">
          <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
        </svg>
        <span class="text-sm font-medium text-yellow-400">Confirmation Required</span>
      </div>
      <div class="confirmation-todo text-sm text-gray-300 mb-3">TODO: ${data.todo.description}</div>
      <div class="confirmation-result bg-[#1a1a1a] p-3 rounded text-xs text-gray-400 mb-3">
        Expected: ${data.todo.expectedResult}<br>
        Result: ${data.executionResult.success ? 'Success' : 'Failed'}<br>
        ${data.executionResult.response || data.executionResult.error || ''}
      </div>
      <div class="confirmation-actions flex space-x-2">
        <button class="confirm-yes bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs">
          ✓ Approve
        </button>
        <button class="confirm-no bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs">
          ✗ Reject
        </button>
      </div>
      <div class="confirmation-feedback mt-3" style="display: none;">
        <textarea class="w-full bg-[#1a1a1a] border border-gray-600 rounded p-2 text-xs text-gray-300" 
                  placeholder="Provide feedback for improvement..." rows="3"></textarea>
        <div class="mt-2 flex space-x-2">
          <button class="submit-feedback bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">
            Submit Feedback
          </button>
          <button class="cancel-feedback bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-xs">
            Cancel
          </button>
        </div>
      </div>
    `;
    
    // Add event listeners
    const approveBtn = confirmationEl.querySelector('.confirm-yes');
    const rejectBtn = confirmationEl.querySelector('.confirm-no');
    const feedbackDiv = confirmationEl.querySelector('.confirmation-feedback');
    const submitFeedbackBtn = confirmationEl.querySelector('.submit-feedback');
    const cancelFeedbackBtn = confirmationEl.querySelector('.cancel-feedback');
    const feedbackTextarea = confirmationEl.querySelector('textarea');
    
    approveBtn.addEventListener('click', () => {
      handleLegacyModeConfirmation({
        todoId: data.todoId,
        approved: true,
        feedback: ''
      });
    });
    
    rejectBtn.addEventListener('click', () => {
      feedbackDiv.style.display = 'block';
    });
    
    submitFeedbackBtn.addEventListener('click', () => {
      const feedback = feedbackTextarea.value.trim();
      handleLegacyModeConfirmation({
        todoId: data.todoId,
        approved: false,
        feedback
      });
      feedbackDiv.style.display = 'none';
    });
    
    cancelFeedbackBtn.addEventListener('click', () => {
      feedbackDiv.style.display = 'none';
      feedbackTextarea.value = '';
    });
    
    chatMessagesContainer.appendChild(confirmationEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  try { vscode.postMessage({ command: 'getModels' }); } catch (e) {}
  try { vscode.postMessage({ command: 'getModes' }); } catch (e) {}
})();
  // Legacy Mode JavaScript Functions
  
  // Global functions for Legacy Mode interactions
  window.confirmTodo = function(todoId, approved, requestId) {
    try {
      vscode.postMessage({
        command: 'legacyModeConfirmationResponse',
        todoId: todoId,
        approved: approved,
        feedback: approved ? 'Approved by user' : '',
        requestId: requestId
      });
      
      // Hide confirmation UI
      const confirmationEl = document.querySelector(`[data-todo-id="${todoId}"]`);
      if (confirmationEl) {
        confirmationEl.style.display = 'none';
      }
    } catch (e) {
      console.error('Error confirming TODO:', e);
    }
  };
  
  window.showFeedbackForm = function(todoId, requestId) {
    try {
      const feedbackHtml = `
        <div class="legacy-feedback-dialog fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" id="feedback-dialog-${todoId}">
          <div class="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 class="text-lg font-semibold text-red-400 mb-3">Provide Feedback</h3>
            <div class="mb-4">
              <p class="text-gray-300 mb-3">Please explain what needs to be improved:</p>
              <textarea id="feedback-text-${todoId}" 
                        class="w-full h-24 bg-gray-700 border border-gray-600 rounded p-2 text-gray-100 resize-none"
                        placeholder="Describe what needs to be changed or improved..."></textarea>
            </div>
            <div class="flex gap-3">
              <button class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded" 
                      onclick="submitFeedback('${todoId}', '${requestId}')">
                Submit Feedback
              </button>
              <button class="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded" 
                      onclick="closeFeedbackDialog('${todoId}')">
                Cancel
              </button>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', feedbackHtml);
    } catch (e) {
      console.error('Error showing feedback form:', e);
    }
  };
  
  window.submitFeedback = function(todoId, requestId) {
    try {
      const feedbackTextarea = document.getElementById(`feedback-text-${todoId}`);
      const feedback = feedbackTextarea ? feedbackTextarea.value.trim() : '';
      
      if (!feedback) {
        alert('Please provide feedback before submitting.');
        return;
      }
      
      vscode.postMessage({
        command: 'legacyModeConfirmationResponse',
        todoId: todoId,
        approved: false,
        feedback: feedback,
        requestId: requestId
      });
      
      closeFeedbackDialog(todoId);
    } catch (e) {
      console.error('Error submitting feedback:', e);
    }
  };
  
  window.closeFeedbackDialog = function(todoId) {
    try {
      const dialog = document.getElementById(`feedback-dialog-${todoId}`);
      if (dialog) {
        dialog.remove();
      }
    } catch (e) {
      console.error('Error closing feedback dialog:', e);
    }
  };
  
  window.confirmTodoDialog = function(todoId, approved, feedback, requestId) {
    try {
      vscode.postMessage({
        command: 'legacyModeConfirmationResponse',
        todoId: todoId,
        approved: approved,
        feedback: feedback,
        requestId: requestId
      });
      
      // Close dialog
      const dialog = document.querySelector('.legacy-confirmation-dialog');
      if (dialog) {
        dialog.remove();
      }
    } catch (e) {
      console.error('Error confirming TODO dialog:', e);
    }
  };
  
  window.showFeedbackDialog = function(todoId, requestId) {
    try {
      const existingDialog = document.querySelector('.legacy-confirmation-dialog');
      if (existingDialog) {
        existingDialog.remove();
      }
      
      showFeedbackForm(todoId, requestId);
    } catch (e) {
      console.error('Error showing feedback dialog:', e);
    }
  };
  
  window.legacySessionAction = function(action, requestId) {
    try {
      vscode.postMessage({
        command: 'legacyModeSessionAction',
        action: action,
        requestId: requestId,
        data: {}
      });
    } catch (e) {
      console.error('Error performing session action:', e);
    }
  };
  
  window.executeLegacyTool = function(toolName, params, requestId) {
    try {
      vscode.postMessage({
        command: 'legacyModeToolExecution',
        toolName: toolName,
        params: params,
        requestId: requestId
      });
    } catch (e) {
      console.error('Error executing Legacy Mode tool:', e);
    }
  };
  
  // Handle Legacy Mode updates from the webview provider
  function handleLegacyModeUpdate(updateType, data) {
    try {
      switch (updateType) {
        case 'session_created':
          renderLegacySessionCreated(data);
          break;
        case 'todo_created':
          renderLegacyTodoCreated(data);
          break;
        case 'tool_executed':
          renderLegacyToolExecuted(data);
          break;
        case 'confirmation_requested':
          renderLegacyConfirmationRequest(data);
          break;
        case 'confirmation_processed':
          renderLegacyConfirmationProcessed(data);
          break;
        case 'error_occurred':
          renderLegacyError(data.context, data.message, data.suggestion);
          break;
        case 'session_paused':
          renderLegacySessionPaused(data);
          break;
        case 'session_resumed':
          renderLegacySessionResumed(data);
          break;
        case 'session_stopped':
          renderLegacySessionStopped(data);
          break;
        case 'session_status':
          renderLegacySessionStatus(data);
          break;
        default:
          console.log('Unknown Legacy Mode update type:', updateType, data);
      }
    } catch (e) {
      console.error('Error handling Legacy Mode update:', e);
    }
  }
  
  function renderLegacySessionCreated(data) {
    const sessionEl = document.createElement('div');
    sessionEl.className = 'legacy-session-notification bg-green-900 border border-green-600 rounded-lg p-3 mb-3';
    sessionEl.innerHTML = `
      <div class="flex items-center space-x-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" class="text-green-400">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5l1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span class="text-green-300 font-medium">Legacy Mode Session Created</span>
      </div>
      <div class="text-xs text-green-200 mt-2">
        Session ID: ${data.sessionId}<br>
        Phase: ${data.phase}<br>
        Started: ${data.startTime}
      </div>
    `;
    
    chatMessagesContainer.appendChild(sessionEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  function renderLegacyTodoCreated(data) {
    const todoEl = renderLegacyTodo(data.todo);
    chatMessagesContainer.appendChild(todoEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  function renderLegacyToolExecuted(data) {
    const toolEl = renderLegacyTool(data.toolName, data.params, data.result);
    chatMessagesContainer.appendChild(toolEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  function renderLegacyConfirmationRequest(data) {
    const confirmationEl = document.createElement('div');
    confirmationEl.className = 'legacy-confirmation-request bg-yellow-900 border border-yellow-600 rounded-lg p-4 mb-3';
    confirmationEl.setAttribute('data-todo-id', data.todoId);
    
    confirmationEl.innerHTML = `
      <div class="flex items-center space-x-2 mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" class="text-yellow-400">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
        <span class="text-yellow-300 font-medium">Confirmation Required</span>
      </div>
      <div class="mb-3">
        <div class="text-sm text-yellow-100 mb-2"><strong>Task:</strong> ${data.todoDescription}</div>
        <div class="text-sm text-yellow-100 mb-3"><strong>Result:</strong> ${data.result}</div>
        <div class="text-sm text-yellow-200">Was this task completed successfully?</div>
      </div>
      <div class="flex gap-3">
        <button class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded text-sm" 
                onclick="confirmTodo('${data.todoId}', true, '${data.requestId}')">
          ✓ Yes, Approve
        </button>
        <button class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded text-sm" 
                onclick="showFeedbackForm('${data.todoId}', '${data.requestId}')">
          ✗ No, Needs Work
        </button>
      </div>
    `;
    
    chatMessagesContainer.appendChild(confirmationEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  function renderLegacyConfirmationProcessed(data) {
    const confirmationEl = document.querySelector(`[data-todo-id="${data.todoId}"]`);
    if (confirmationEl) {
      confirmationEl.style.display = 'none';
    }
    
    const processedEl = document.createElement('div');
    processedEl.className = `legacy-confirmation-processed ${data.approved ? 'bg-green-900 border-green-600' : 'bg-red-900 border-red-600'} border rounded-lg p-3 mb-3`;
    
    processedEl.innerHTML = `
      <div class="flex items-center space-x-2">
        <span class="text-lg">${data.approved ? '✅' : '❌'}</span>
        <span class="text-sm font-medium ${data.approved ? 'text-green-300' : 'text-red-300'}">
          TODO ${data.approved ? 'Approved' : 'Rejected'}
        </span>
      </div>
      ${data.feedback ? `<div class="text-xs ${data.approved ? 'text-green-200' : 'text-red-200'} mt-2">Feedback: ${data.feedback}</div>` : ''}
    `;
    
    chatMessagesContainer.appendChild(processedEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  function renderLegacySessionPaused(data) {
    const pausedEl = document.createElement('div');
    pausedEl.className = 'legacy-session-paused bg-yellow-900 border border-yellow-600 rounded-lg p-3 mb-3';
    pausedEl.innerHTML = `
      <div class="flex items-center space-x-2">
        <span class="text-lg">⏸️</span>
        <span class="text-yellow-300 font-medium">Session Paused</span>
      </div>
      <div class="text-xs text-yellow-200 mt-2">Session ${data.requestId} has been paused</div>
    `;
    
    chatMessagesContainer.appendChild(pausedEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  function renderLegacySessionResumed(data) {
    const resumedEl = document.createElement('div');
    resumedEl.className = 'legacy-session-resumed bg-green-900 border border-green-600 rounded-lg p-3 mb-3';
    resumedEl.innerHTML = `
      <div class="flex items-center space-x-2">
        <span class="text-lg">▶️</span>
        <span class="text-green-300 font-medium">Session Resumed</span>
      </div>
      <div class="text-xs text-green-200 mt-2">Session ${data.requestId} has been resumed</div>
    `;
    
    chatMessagesContainer.appendChild(resumedEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  function renderLegacySessionStopped(data) {
    const stoppedEl = document.createElement('div');
    stoppedEl.className = 'legacy-session-stopped bg-red-900 border border-red-600 rounded-lg p-3 mb-3';
    stoppedEl.innerHTML = `
      <div class="flex items-center space-x-2">
        <span class="text-lg">⏹️</span>
        <span class="text-red-300 font-medium">Session Stopped</span>
      </div>
      <div class="text-xs text-red-200 mt-2">Session ${data.requestId} has been stopped</div>
    `;
    
    chatMessagesContainer.appendChild(stoppedEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
  
  function renderLegacySessionStatus(data) {
    const statusEl = document.createElement('div');
    statusEl.className = 'legacy-session-status bg-blue-900 border border-blue-600 rounded-lg p-3 mb-3';
    statusEl.innerHTML = `
      <div class="flex items-center space-x-2 mb-2">
        <span class="text-lg">📊</span>
        <span class="text-blue-300 font-medium">Session Status</span>
      </div>
      <div class="text-xs text-blue-200 space-y-1">
        <div>Session ID: ${data.requestId}</div>
        <div>Phase: ${data.phase}</div>
        <div>Started: ${data.startTime}</div>
        <div>Last Activity: ${data.lastActivity}</div>
        <div>TODOs: ${data.todoCount}</div>
        <div>Execution Log Entries: ${data.executionLogCount}</div>
      </div>
    `;
    
    chatMessagesContainer.appendChild(statusEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  // Enhanced message listener to handle Legacy Mode updates
  const originalMessageListener = window.addEventListener;
  window.addEventListener('message', (event) => {
    try {
      const message = event.data;
      
      if (message.command === 'legacyModeUpdate') {
        handleLegacyModeUpdate(message.updateType, message.data);
        return;
      }
      
      // Handle other message types...
      if (message.command === 'promptResponse') {
        const requestId = message.requestId;
        const response = message.response;
        const error = message.error;
        
        // Find the assistant message with this requestId
        const assistantNode = chatMessagesContainer.querySelector(`.assistant-message[data-request-id="${requestId}"]`);
        if (assistantNode) {
          const textEl = assistantNode.querySelector('.message-text');
          const metaEl = assistantNode.querySelector('.message-meta');
          
          if (error) {
            if (textEl) textEl.textContent = `Error: ${error}`;
            if (metaEl) {
              const metaTextEl = metaEl.querySelector('.meta-text');
              const spinnerEl = metaEl.querySelector('.assistant-spinner');
              const statusEl = metaEl.querySelector('.status-text');
              
              if (metaTextEl) metaTextEl.textContent = 'Error';
              if (spinnerEl) spinnerEl.style.display = 'none';
              if (statusEl) statusEl.style.display = 'none';
            }
          } else if (response) {
            const text = response.plain_text || response.text || '';
            const meta = response.metadata || {};
            
            if (textEl) renderMessageContent(textEl, text);
            if (metaEl) {
              const metaTextEl = metaEl.querySelector('.meta-text');
              const spinnerEl = metaEl.querySelector('.assistant-spinner');
              const statusEl = metaEl.querySelector('.status-text');
              
              if (metaTextEl) metaTextEl.textContent = 'Complete';
              if (spinnerEl) spinnerEl.style.display = 'none';
              if (statusEl) statusEl.style.display = 'none';
              
              populateEnhancedMetadata(assistantNode, response);
            }
          }
        }
      }
      
      // Handle other existing message types...
      if (message.command === 'modelsResponse') {
        populateModelDropdown(message.models, message.error);
      }
      
      if (message.command === 'modesResponse') {
        populateModeDropdown(message.modes, message.error);
      }
      
      if (message.command === 'filesSelected') {
        selectedFiles = message.files || [];
        updateFileChips();
      }
      
      if (message.command === 'filePickerCanceled') {
        // Handle file picker cancellation if needed
      }
      
      if (message.command === 'filePickerError') {
        console.error('File picker error:', message.error);
      }
      
      if (message.command === 'apiKeyChanged') {
        // Refresh models when API key changes
        if (vscode) {
          vscode.postMessage({ command: 'getModels' });
        }
      }
      
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });  
// Legacy Mode JavaScript Functions
  
  // Global Legacy Mode state
  let legacyModeState = {
    currentSession: null,
    activeTodos: [],
    pendingVerifications: new Map(),
    sessionHistory: []
  };
  
  // Legacy Mode Session Management
  function createLegacySession(sessionData) {
    try {
      legacyModeState.currentSession = {
        id: sessionData.sessionId || generateSessionId(),
        originalTask: sessionData.originalTask || '',
        phase: sessionData.phase || 'planning',
        startTime: sessionData.startTime || new Date().toISOString(),
        todos: sessionData.todos || [],
        executionLog: sessionData.executionLog || [],
        modelId: sessionData.modelId || selectedModelId,
        requestId: sessionData.requestId || ''
      };
      
      renderLegacySessionDisplay();
      return legacyModeState.currentSession;
    } catch (e) {
      console.error('Error creating Legacy Mode session:', e);
      return null;
    }
  }
  
  function updateLegacySession(updates) {
    try {
      if (!legacyModeState.currentSession) return false;
      
      Object.assign(legacyModeState.currentSession, updates);
      renderLegacySessionDisplay();
      return true;
    } catch (e) {
      console.error('Error updating Legacy Mode session:', e);
      return false;
    }
  }
  
  function stopLegacySession(sessionId) {
    try {
      if (legacyModeState.currentSession && legacyModeState.currentSession.id === sessionId) {
        // Add to history
        legacyModeState.sessionHistory.push({
          ...legacyModeState.currentSession,
          endTime: new Date().toISOString(),
          status: 'stopped'
        });
        
        // Clear current session
        legacyModeState.currentSession = null;
        legacyModeState.activeTodos = [];
        legacyModeState.pendingVerifications.clear();
        
        // Notify extension
        if (vscode) {
          vscode.postMessage({
            command: 'stopLegacySession',
            sessionId: sessionId
          });
        }
        
        renderLegacySessionStopped(sessionId);
      }
    } catch (e) {
      console.error('Error stopping Legacy Mode session:', e);
    }
  }
  
  // Legacy Mode TODO Management
  function addLegacyTodo(todoData) {
    try {
      const todo = {
        id: todoData.id || generateTodoId(),
        description: todoData.description || '',
        expectedResult: todoData.expectedResult || '',
        status: todoData.status || 'pending',
        createdAt: todoData.createdAt || new Date().toISOString(),
        completedAt: todoData.completedAt || null,
        result: todoData.result || null,
        toolCalls: todoData.toolCalls || []
      };
      
      legacyModeState.activeTodos.push(todo);
      
      if (legacyModeState.currentSession) {
        legacyModeState.currentSession.todos = legacyModeState.activeTodos;
      }
      
      renderLegacyTodoItem(todo);
      return todo;
    } catch (e) {
      console.error('Error adding Legacy Mode TODO:', e);
      return null;
    }
  }
  
  function updateLegacyTodo(todoId, updates) {
    try {
      const todoIndex = legacyModeState.activeTodos.findIndex(t => t.id === todoId);
      if (todoIndex === -1) return false;
      
      Object.assign(legacyModeState.activeTodos[todoIndex], updates);
      
      if (legacyModeState.currentSession) {
        legacyModeState.currentSession.todos = legacyModeState.activeTodos;
      }
      
      renderLegacyTodoItem(legacyModeState.activeTodos[todoIndex]);
      return true;
    } catch (e) {
      console.error('Error updating Legacy Mode TODO:', e);
      return false;
    }
  }
  
  function completeLegacyTodo(todoId, result) {
    try {
      const updates = {
        status: 'done',
        completedAt: new Date().toISOString(),
        result: result
      };
      
      return updateLegacyTodo(todoId, updates);
    } catch (e) {
      console.error('Error completing Legacy Mode TODO:', e);
      return false;
    }
  }
  
  // Legacy Mode Verification System
  function requestTodoVerification(todoId, result) {
    try {
      const todo = legacyModeState.activeTodos.find(t => t.id === todoId);
      if (!todo) return false;
      
      legacyModeState.pendingVerifications.set(todoId, {
        todo: todo,
        result: result,
        timestamp: new Date().toISOString()
      });
      
      renderLegacyVerificationRequest(todoId, todo, result);
      return true;
    } catch (e) {
      console.error('Error requesting TODO verification:', e);
      return false;
    }
  }
  
  function verifyTodo(todoId, approved, feedback) {
    try {
      const verification = legacyModeState.pendingVerifications.get(todoId);
      if (!verification) return false;
      
      // Remove from pending
      legacyModeState.pendingVerifications.delete(todoId);
      
      // Send verification response to extension
      if (vscode) {
        vscode.postMessage({
          command: 'verifyTodo',
          todoId: todoId,
          approved: approved,
          feedback: feedback || '',
          sessionId: legacyModeState.currentSession?.id
        });
      }
      
      // Update UI
      renderLegacyVerificationProcessed(todoId, approved, feedback);
      
      if (approved) {
        completeLegacyTodo(todoId, verification.result);
      }
      
      return true;
    } catch (e) {
      console.error('Error verifying TODO:', e);
      return false;
    }
  }
  
  // Legacy Mode Tool Call Rendering
  function renderLegacyToolCall(toolCall) {
    try {
      const toolEl = document.createElement('div');
      toolEl.className = 'legacy-tool-item';
      toolEl.dataset.toolId = toolCall.id;
      
      const statusIcon = toolCall.success ? '✅' : '❌';
      const statusClass = toolCall.success ? 'success' : 'failed';
      
      toolEl.innerHTML = `
        <div class="tool-header">
          <span class="tool-icon">🔧</span>
          <span class="tool-name">${toolCall.toolName}</span>
          <span class="tool-timestamp">${new Date(toolCall.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="tool-details">
          <div class="tool-input">
            <strong>Input:</strong>
            <pre class="tool-params">${JSON.stringify(toolCall.params, null, 2)}</pre>
          </div>
          ${toolCall.result ? `
            <div class="tool-output">
              <strong>Output:</strong>
              <pre class="tool-result">${JSON.stringify(toolCall.result, null, 2)}</pre>
            </div>
          ` : ''}
          ${toolCall.error ? `
            <div class="tool-error">
              <strong>Error:</strong>
              <pre class="error-message">${toolCall.error}</pre>
            </div>
          ` : ''}
        </div>
        <div class="tool-status ${statusClass}">${statusIcon} ${toolCall.success ? 'Success' : 'Failed'}</div>
      `;
      
      appendToLegacyContent(toolEl);
      return toolEl;
    } catch (e) {
      console.error('Error rendering Legacy Mode tool call:', e);
      return null;
    }
  }
  
  // Legacy Mode Terminal Command Rendering
  function renderLegacyTerminalCommand(command) {
    try {
      const terminalEl = document.createElement('div');
      terminalEl.className = 'legacy-terminal-item';
      terminalEl.dataset.commandId = command.id;
      
      const statusIcon = command.success ? '✅' : '❌';
      
      terminalEl.innerHTML = `
        <div class="terminal-header">
          <span class="terminal-icon">💻</span>
          <span class="terminal-label">Terminal Command</span>
          <span class="terminal-timestamp">${new Date(command.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="terminal-content">
          <div class="terminal-command">
            <span class="command-prompt">$</span>
            <code>${command.command}</code>
          </div>
          ${command.output ? `
            <div class="terminal-output">
              <pre>${command.output}</pre>
            </div>
          ` : ''}
          ${command.error ? `
            <div class="terminal-error">
              <pre>${command.error}</pre>
            </div>
          ` : ''}
        </div>
        <div class="terminal-status">
          <span class="status-${command.success ? 'success' : 'error'}">
            ${statusIcon} Exit code: ${command.exitCode || 0}
          </span>
        </div>
      `;
      
      appendToLegacyContent(terminalEl);
      return terminalEl;
    } catch (e) {
      console.error('Error rendering Legacy Mode terminal command:', e);
      return null;
    }
  }
  
  // Legacy Mode Error Rendering
  function renderLegacyError(errorData) {
    try {
      const errorEl = document.createElement('div');
      errorEl.className = 'legacy-error-item';
      
      errorEl.innerHTML = `
        <div class="error-header">
          <span class="error-icon">⚠️</span>
          <h4 class="error-title">${errorData.errorType || 'Error'}</h4>
        </div>
        <div class="error-message">${errorData.message}</div>
        ${errorData.context ? `
          <div class="error-context">
            <strong>Context:</strong> ${errorData.context}
          </div>
        ` : ''}
        ${errorData.suggestions && errorData.suggestions.length > 0 ? `
          <div class="error-suggestions">
            <strong>Suggested Actions:</strong>
            <ul>
              ${errorData.suggestions.map(s => `<li>${s}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        <div class="error-actions">
          <button class="retry-btn" onclick="retryLastAction()">Retry</button>
          <button class="skip-btn" onclick="skipCurrentTodo()">Skip</button>
          <button class="stop-btn" onclick="stopLegacySession('${legacyModeState.currentSession?.id}')">Stop Session</button>
        </div>
      `;
      
      appendToLegacyContent(errorEl);
      return errorEl;
    } catch (e) {
      console.error('Error rendering Legacy Mode error:', e);
      return null;
    }
  }
  
  // Legacy Mode UI Rendering Functions
  function renderLegacySessionDisplay() {
    try {
      if (!legacyModeState.currentSession) return;
      
      const session = legacyModeState.currentSession;
      const completedTodos = session.todos.filter(t => t.status === 'done').length;
      const totalTodos = session.todos.length;
      const progressPercent = totalTodos > 0 ? (completedTodos / totalTodos) * 100 : 0;
      
      const sessionEl = document.createElement('div');
      sessionEl.className = 'legacy-session-item';
      sessionEl.dataset.sessionId = session.id;
      
      sessionEl.innerHTML = `
        <div class="session-header">
          <h2 class="session-title">Legacy Mode Session</h2>
          <span class="session-id">${session.id}</span>
          <button class="session-stop-btn" onclick="stopLegacySession('${session.id}')">Stop</button>
        </div>
        <div class="session-info">
          <span class="session-time">Started: ${new Date(session.startTime).toLocaleString()}</span>
          <span class="session-phase">Phase: <span class="phase-badge phase-${session.phase}">${session.phase}</span></span>
        </div>
        <div class="session-task">
          <strong>Task:</strong> ${session.originalTask}
        </div>
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progressPercent}%"></div>
          </div>
          <span class="progress-text">${completedTodos}/${totalTodos} TODOs completed</span>
        </div>
      `;
      
      appendToLegacyContent(sessionEl);
      return sessionEl;
    } catch (e) {
      console.error('Error rendering Legacy Mode session display:', e);
      return null;
    }
  }
  
  function renderLegacyTodoItem(todo) {
    try {
      const todoEl = document.createElement('div');
      todoEl.className = `legacy-todo-item todo-${todo.status}`;
      todoEl.dataset.todoId = todo.id;
      
      const statusIcon = getStatusIcon(todo.status);
      
      todoEl.innerHTML = `
        <div class="todo-header">
          <span class="todo-status-icon">${statusIcon}</span>
          <h4 class="todo-description">${todo.description}</h4>
          <span class="todo-id">#${todo.id}</span>
        </div>
        <div class="todo-expected">
          <strong>Expected Result:</strong> ${todo.expectedResult}
        </div>
        ${todo.result ? `
          <div class="todo-result">
            <strong>Actual Result:</strong> ${todo.result}
          </div>
        ` : ''}
        <div class="todo-timestamps">
          <span>Created: ${new Date(todo.createdAt).toLocaleString()}</span>
          ${todo.completedAt ? `<span>Completed: ${new Date(todo.completedAt).toLocaleString()}</span>` : ''}
        </div>
      `;
      
      appendToLegacyContent(todoEl);
      return todoEl;
    } catch (e) {
      console.error('Error rendering Legacy Mode TODO item:', e);
      return null;
    }
  }
  
  function renderLegacyVerificationRequest(todoId, todo, result) {
    try {
      const verificationEl = document.createElement('div');
      verificationEl.className = 'legacy-confirmation-request';
      verificationEl.dataset.todoId = todoId;
      
      verificationEl.innerHTML = `
        <div class="verification-header">
          <h4>TODO Verification Required</h4>
          <span class="todo-ref">#${todoId}</span>
        </div>
        <div class="verification-todo">
          <strong>Description:</strong> ${todo.description}
        </div>
        <div class="verification-expected">
          <strong>Expected:</strong> ${todo.expectedResult}
        </div>
        <div class="verification-result">
          <strong>Actual Result:</strong> ${result}
        </div>
        <div class="verification-question">
          <p>Does this TODO completion look correct?</p>
        </div>
        <div class="verification-buttons">
          <button class="verify-approve-btn" onclick="verifyTodo('${todoId}', true)">✓ Approve</button>
          <button class="verify-reject-btn" onclick="verifyTodo('${todoId}', false)">✗ Reject</button>
        </div>
        <div class="verification-feedback">
          <textarea id="feedback-${todoId}" placeholder="Optional feedback..." rows="3"></textarea>
        </div>
      `;
      
      // Update button handlers to include feedback
      const approveBtn = verificationEl.querySelector('.verify-approve-btn');
      const rejectBtn = verificationEl.querySelector('.verify-reject-btn');
      const feedbackTextarea = verificationEl.querySelector(`#feedback-${todoId}`);
      
      if (approveBtn) {
        approveBtn.onclick = () => verifyTodo(todoId, true, feedbackTextarea?.value);
      }
      
      if (rejectBtn) {
        rejectBtn.onclick = () => verifyTodo(todoId, false, feedbackTextarea?.value);
      }
      
      appendToLegacyContent(verificationEl);
      return verificationEl;
    } catch (e) {
      console.error('Error rendering Legacy Mode verification request:', e);
      return null;
    }
  }
  
  function renderLegacyVerificationProcessed(todoId, approved, feedback) {
    try {
      // Remove the verification request
      const verificationEl = document.querySelector(`[data-todo-id="${todoId}"]`);
      if (verificationEl) {
        verificationEl.remove();
      }
      
      // Show confirmation message
      const confirmationEl = document.createElement('div');
      confirmationEl.className = 'legacy-confirmation-processed';
      
      const statusIcon = approved ? '✅' : '❌';
      const statusText = approved ? 'Approved' : 'Rejected';
      const statusClass = approved ? 'success' : 'rejected';
      
      confirmationEl.innerHTML = `
        <div class="confirmation-header">
          <span class="confirmation-icon">${statusIcon}</span>
          <span class="confirmation-status ${statusClass}">TODO ${statusText}</span>
          <span class="todo-ref">#${todoId}</span>
        </div>
        ${feedback ? `
          <div class="confirmation-feedback">
            <strong>Feedback:</strong> ${feedback}
          </div>
        ` : ''}
      `;
      
      appendToLegacyContent(confirmationEl);
      
      // Auto-remove after 3 seconds
      setTimeout(() => {
        if (confirmationEl.parentNode) {
          confirmationEl.remove();
        }
      }, 3000);
      
      return confirmationEl;
    } catch (e) {
      console.error('Error rendering Legacy Mode verification processed:', e);
      return null;
    }
  }
  
  function renderLegacySessionStopped(sessionId) {
    try {
      const stoppedEl = document.createElement('div');
      stoppedEl.className = 'legacy-session-stopped';
      
      stoppedEl.innerHTML = `
        <div class="session-stopped-header">
          <span class="stopped-icon">🛑</span>
          <h4>Legacy Mode Session Stopped</h4>
        </div>
        <div class="session-stopped-info">
          Session ${sessionId} has been stopped by user request.
        </div>
      `;
      
      appendToLegacyContent(stoppedEl);
      return stoppedEl;
    } catch (e) {
      console.error('Error rendering Legacy Mode session stopped:', e);
      return null;
    }
  }
  
  // Legacy Mode Utility Functions
  function getStatusIcon(status) {
    switch (status) {
      case 'pending': return '⏳';
      case 'in_progress': return '🔄';
      case 'done': return '✅';
      case 'failed': return '❌';
      default: return '❓';
    }
  }
  
  function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  function generateTodoId() {
    return 'todo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  function appendToLegacyContent(element) {
    try {
      if (chatMessagesContainer && element) {
        chatMessagesContainer.appendChild(element);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
      }
    } catch (e) {
      console.error('Error appending to Legacy Mode content:', e);
    }
  }
  
  // Legacy Mode Action Handlers
  function retryLastAction() {
    try {
      if (vscode && legacyModeState.currentSession) {
        vscode.postMessage({
          command: 'retryLastAction',
          sessionId: legacyModeState.currentSession.id
        });
      }
    } catch (e) {
      console.error('Error retrying last action:', e);
    }
  }
  
  function skipCurrentTodo() {
    try {
      if (vscode && legacyModeState.currentSession) {
        vscode.postMessage({
          command: 'skipCurrentTodo',
          sessionId: legacyModeState.currentSession.id
        });
      }
    } catch (e) {
      console.error('Error skipping current TODO:', e);
    }
  }
  
  function pauseLegacySession() {
    try {
      if (vscode && legacyModeState.currentSession) {
        vscode.postMessage({
          command: 'pauseLegacySession',
          sessionId: legacyModeState.currentSession.id
        });
      }
    } catch (e) {
      console.error('Error pausing Legacy Mode session:', e);
    }
  }
  
  function resumeLegacySession() {
    try {
      if (vscode && legacyModeState.currentSession) {
        vscode.postMessage({
          command: 'resumeLegacySession',
          sessionId: legacyModeState.currentSession.id
        });
      }
    } catch (e) {
      console.error('Error resuming Legacy Mode session:', e);
    }
  }
  
  // Legacy Mode Message Handlers
  function handleLegacyModeMessage(data) {
    try {
      switch (data.type) {
        case 'sessionCreated':
          createLegacySession(data.session);
          break;
        case 'sessionUpdated':
          updateLegacySession(data.updates);
          break;
        case 'todoAdded':
          addLegacyTodo(data.todo);
          break;
        case 'todoUpdated':
          updateLegacyTodo(data.todoId, data.updates);
          break;
        case 'todoCompleted':
          completeLegacyTodo(data.todoId, data.result);
          break;
        case 'verificationRequested':
          requestTodoVerification(data.todoId, data.result);
          break;
        case 'toolCallExecuted':
          renderLegacyToolCall(data.toolCall);
          break;
        case 'terminalCommandExecuted':
          renderLegacyTerminalCommand(data.command);
          break;
        case 'errorOccurred':
          renderLegacyError(data.error);
          break;
        case 'sessionStopped':
          stopLegacySession(data.sessionId);
          break;
        default:
          console.warn('Unknown Legacy Mode message type:', data.type);
      }
    } catch (e) {
      console.error('Error handling Legacy Mode message:', e);
    }
  }
  
  // Performance Optimization Functions
  
  /**
   * Show loading state with optional message
   */
  function showLoadingState(requestId, message = "Processing...") {
    const loadingEl = document.createElement('div');
    loadingEl.className = 'loading-state';
    loadingEl.id = `loading-${requestId}`;
    loadingEl.innerHTML = `
      <div class="loading-spinner"></div>
      <span class="loading-message">${message}</span>
    `;
    
    loadingStates.set(requestId, loadingEl);
    
    // Add to chat container
    if (chatMessagesContainer) {
      chatMessagesContainer.appendChild(loadingEl);
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }
  }

  /**
   * Hide loading state
   */
  function hideLoadingState(requestId) {
    const loadingEl = loadingStates.get(requestId);
    if (loadingEl && loadingEl.parentNode) {
      loadingEl.parentNode.removeChild(loadingEl);
    }
    loadingStates.delete(requestId);
  }

  /**
   * Queue UI update for batching
   */
  function queueUIUpdate(updateData) {
    uiUpdateQueue.push({
      ...updateData,
      timestamp: Date.now()
    });
    
    // Schedule batch processing if not already scheduled
    if (!uiUpdateTimer) {
      uiUpdateTimer = setTimeout(() => {
        processBatchedUIUpdates();
      }, 50); // 50ms batching window
    }
  }

  /**
   * Process batched UI updates
   */
  function processBatchedUIUpdates() {
    if (uiUpdateQueue.length === 0) {
      uiUpdateTimer = null;
      return;
    }
    
    const startTime = performance.now();
    const batch = uiUpdateQueue.splice(0, 10); // Process up to 10 updates at once
    
    // Group updates by type for efficiency
    const updatesByType = {};
    batch.forEach(update => {
      if (!updatesByType[update.type]) {
        updatesByType[update.type] = [];
      }
      updatesByType[update.type].push(update);
    });
    
    // Process each type of update
    Object.keys(updatesByType).forEach(type => {
      const updates = updatesByType[type];
      
      switch (type) {
        case 'loading_state':
          updates.forEach(update => {
            if (update.show) {
              showLoadingState(update.requestId, update.message);
            } else {
              hideLoadingState(update.requestId);
            }
          });
          break;
          
        case 'session_cleanup':
          updates.forEach(update => {
            console.log(`Session cleanup: ${update.cleanedCount} sessions cleaned in ${update.duration}ms`);
          });
          break;
          
        case 'performance_update':
          updates.forEach(update => {
            updatePerformanceDisplay(update.metrics);
          });
          break;
          
        default:
          console.log(`Unhandled UI update type: ${type}`, updates);
      }
    });
    
    // Update performance metrics
    const duration = performance.now() - startTime;
    updateUIPerformanceMetrics(duration, batch.length);
    
    // Schedule next batch if more updates pending
    if (uiUpdateQueue.length > 0) {
      uiUpdateTimer = setTimeout(() => {
        processBatchedUIUpdates();
      }, 50);
    } else {
      uiUpdateTimer = null;
    }
  }

  /**
   * Update UI performance metrics
   */
  function updateUIPerformanceMetrics(duration, batchSize) {
    performanceMetrics.uiUpdatesProcessed += batchSize;
    
    const currentAvg = performanceMetrics.averageUpdateTime;
    const count = performanceMetrics.uiUpdatesProcessed;
    
    if (count === batchSize) {
      performanceMetrics.averageUpdateTime = duration;
    } else {
      performanceMetrics.averageUpdateTime = 
        (currentAvg * (count - batchSize) + duration) / count;
    }
    
    performanceMetrics.lastUpdateTime = Date.now();
  }

  /**
   * Update performance display (if performance panel exists)
   */
  function updatePerformanceDisplay(metrics) {
    const perfPanel = document.getElementById('performance-panel');
    if (!perfPanel) return;
    
    perfPanel.innerHTML = `
      <div class="performance-metrics">
        <h4>Performance Metrics</h4>
        <div class="metric">
          <span class="metric-label">UI Updates:</span>
          <span class="metric-value">${performanceMetrics.uiUpdatesProcessed}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg Update Time:</span>
          <span class="metric-value">${performanceMetrics.averageUpdateTime.toFixed(2)}ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">Memory Usage:</span>
          <span class="metric-value">${metrics.memoryUsage ? Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024) : 'N/A'}MB</span>
        </div>
      </div>
    `;
  }

  /**
   * Handle batched updates from extension
   */
  function handleBatchedUpdates(data) {
    const { updates, batchSize, timestamp } = data;
    
    Object.keys(updates).forEach(type => {
      const typeUpdates = updates[type];
      typeUpdates.forEach(update => {
        queueUIUpdate({ ...update, type });
      });
    });
    
    console.log(`Received ${batchSize} batched updates from extension`);
  }

  /**
   * Debounced scroll to bottom function
   */
  const debouncedScrollToBottom = debounce(() => {
    if (chatMessagesContainer) {
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }
  }, 100);

  /**
   * Debounce utility function
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Export Legacy Mode functions for global access
  window.legacyMode = {
    createSession: createLegacySession,
    updateSession: updateLegacySession,
    stopSession: stopLegacySession,
    addTodo: addLegacyTodo,
    updateTodo: updateLegacyTodo,
    completeTodo: completeLegacyTodo,
    verifyTodo: verifyTodo,
    renderToolCall: renderLegacyToolCall,
    renderTerminalCommand: renderLegacyTerminalCommand,
    renderError: renderLegacyError,
    handleMessage: handleLegacyModeMessage,
    getState: () => legacyModeState
  };

  // Export performance functions for global access
  window.performance = {
    showLoading: showLoadingState,
    hideLoading: hideLoadingState,
    queueUpdate: queueUIUpdate,
    getMetrics: () => performanceMetrics,
    handleBatchedUpdates: handleBatchedUpdates
  };