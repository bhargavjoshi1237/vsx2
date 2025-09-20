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
