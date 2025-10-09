// ui/webview-client.js
// Clean, minimal webview chat client implementation.
/* eslint-env browser */
/* global acquireVsCodeApi, document, window, navigator */
/* eslint-disable no-unused-vars */
(function () {
  "use strict";

  const vscode =
    typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;

  const container = document.getElementById("chat-messages-container");
  const tmplUser = document.getElementById("template-chat-user");
  const tmplAssistant = document.getElementById("template-chat-assistant");

  let selectedModel = "";
  let selectedMode = "";
  let selectedPrimaryModel = "";
  let selectedSecondaryModel = "";
  let loadingNode = null;
  // Track active duality subtask executions so we can keep the send-button
  // in a loading/disabled state until all subtasks finish.
  const activeDualitySubtasks = {};
  let modelsRequestAttempts = 0;
  let currentRequestId = null;
  let currentRequestStartTime = null;
  let requestTimeout = null;
  let isWaitingForUserInput = false;
  let toolCallRetries = new Map(); // Track retry attempts per tool call

  const maxRetryAttempts = 3;
  const REQUEST_TIMEOUT = 120000; // 2 minutes
  const TOOL_RETRY_DELAY = 2000; // 2 seconds between retries

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
    el = el || document.createElement("div");
    el.innerHTML = "";
    if (text === null || text === undefined) return;
    const parts = String(text).split(/```/g);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        const d = document.createElement("div");
        d.textContent = parts[i];
        el.appendChild(d);
      } else {
        // Render a code showcase with copy button
        const raw = parts[i] || "";
        let lang = "";
        let codeText = raw;
        const firstNewline = raw.indexOf("\n");
        if (firstNewline !== -1) {
          const possible = raw.slice(0, firstNewline).trim();
          if (/^[a-zA-Z0-9+#-]+$/.test(possible)) {
            lang = possible;
            codeText = raw.slice(firstNewline + 1);
          }
        }

        const wrapper = document.createElement("div");
        wrapper.className = "code-widget-wrapper";

        const widget = document.createElement("div");
        widget.className = "code-widget";

        if (lang) {
          const lab = document.createElement("div");
          lab.className = "code-lang-label";
          lab.textContent = lang;
          widget.appendChild(lab);
        }

        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = codeText;
        pre.appendChild(code);
        widget.appendChild(pre);

        const btn = document.createElement("button");
        btn.className = "code-copy-btn";
        btn.type = "button";
        btn.setAttribute("aria-label", "Copy code");
        btn.title = "Copy code";
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18 2H9c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H9V4h9zM3 15v-2h2v2zm0-5.5h2v2H3zM10 20h2v2h-2zm-7-1.5v-2h2v2zM5 22c-1.1 0-2-.9-2-2h2zm3.5 0h-2v-2h2zm5 0v-2h2c0 1.1-.9 2-2 2M5 6v2H3c0-1.1.9-2 2-2"/></svg>`;

        const fb = document.createElement("div");
        fb.className = "copy-feedback";
        fb.textContent = "Copied";

        wrapper.appendChild(widget);
        wrapper.appendChild(btn);
        wrapper.appendChild(fb);
        el.appendChild(wrapper);

        btn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(code.textContent || "");
            fb.style.display = "block";
            setTimeout(() => {
              try {
                fb.style.display = "none";
              } catch (e) {}
            }, 1500);
          } catch (err) {
            console.error("copy failed", err);
            fb.textContent = "Copy failed";
            fb.style.display = "block";
            setTimeout(() => {
              try {
                fb.style.display = "none";
                fb.textContent = "Copied";
              } catch (e) {}
            }, 2000);
          }
        });
      }
    }
  }

  function metaText(meta, showMeta = false) {
    if (!showMeta) return "";

    meta = meta || {};
    const m = meta.model || selectedModel || "";
    const mo = meta.mode || selectedMode || "";

    // Format model and mode names with first character capitalized
    const formatName = (name) => {
      if (!name) return "";
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    };

    const formattedModel = formatName(m);
    const formattedMode = formatName(mo);

    if (!formattedModel && !formattedMode) return "";
    return `${formattedModel}${
      formattedModel && formattedMode ? " • " : " "
    }${formattedMode}`.trim();
  }

  function ensureLoading() {
    if (loadingNode) return loadingNode;
    loadingNode = document.createElement("div");
    loadingNode.id = "global-loading";
    // Remove the top margin (m-3) which causes an unwanted gap above messages.
    loadingNode.className = "loading-node text-gray-400";
    // Use a compact SVG spinner and include a stop button to allow cancelling the request
    const spinnerSvg = `
      <svg class="mt-0.5" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><!-- Icon from SVG Spinners by Utkarsh Verma - https://github.com/n3r4zzurr0/svg-spinners/blob/main/LICENSE --><path fill="currentColor" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/><path fill="currentColor" d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"><animateTransform attributeName="transform" dur="0.75s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/></path></svg>
    `;

    loadingNode.innerHTML = `
      <div class="loading-inner">
        <span class="spinner-icons">${spinnerSvg}</span>
        <span class="loading-text">Working...</span>
      </div>
      <div class="loading-actions">
      </div>
    `;

    // Wire stop button
    try {
      const stopBtn = loadingNode.querySelector(".stop-btn");
      if (stopBtn) {
        stopBtn.addEventListener("click", () => {
          try {
            // Let host know to cancel the current request
            if (vscode && currentRequestId) {
              vscode.postMessage({
                command: "cancelRequest",
                requestId: currentRequestId,
              });
            }
            // provide immediate feedback
            stopBtn.disabled = true;
            stopBtn.textContent = "Stopping...";
          } catch (e) {
            console.error("stopBtn click failed", e);
          }
        });
      }
    } catch (e) {
      /* ignore wiring errors */
    }
    return loadingNode;
  }

  function appendMessage(role, text, meta, requestId, showMeta = false) {
    if (!container) return null;

    // Check for duplicate messages (skip for widgets and special content)
    if (
      typeof text === "string" &&
      text.length > 0 &&
      !text.includes("<") &&
      isDuplicateMessage(text, role)
    ) {
      console.log("Skipping duplicate message:", text.substring(0, 50) + "...");
      return null;
    }

    const tpl = role === "assistant" ? tmplAssistant : tmplUser;
    if (!tpl || !tpl.content || !tpl.content.firstElementChild) return null;
    const node = tpl.content.firstElementChild.cloneNode(true);
    if (requestId) {
      try {
        node.dataset.requestId = String(requestId);
      } catch (e) {}
    }
    const textEl = node.querySelector(".message-text");
    const metaEl = node.querySelector(".meta-text");
    renderMessageContent(textEl, text);
    if (metaEl) metaEl.textContent = metaText(meta, showMeta);

    container.appendChild(node);
    // Ensure there's no extra gap above the first message
    try {
      if (container.firstElementChild) {
        container.firstElementChild.style.marginTop = "0px";
      }
    } catch (e) {
      /* ignore DOM write errors */
    }
    if (loadingNode && loadingNode.parentNode === container)
      container.appendChild(loadingNode);
    container.scrollTop = container.scrollHeight;
    updatePlaceholderVisibility();

    // Update footer visibility for assistant messages (don't show footer during conversation)
    if (role === "assistant") {
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
    const textEl = node.querySelector(".message-text");
    const metaEl = node.querySelector(".meta-text");

    // Preserve widget elements inside the message (duality widget, terminal widgets, code widgets, etc.)
    const preservedSelectors = [
      ".duality-mode-widget",
      ".subtask-progress-widget",
      ".code-widget-wrapper",
      ".terminal-tool-widget",
      ".file-changes-widget",
      ".file-edit-preview",
    ];
    const preserved = [];
    try {
      preservedSelectors.forEach((selc) => {
        const els = textEl.querySelectorAll(selc);
        els.forEach((el) => {
          preserved.push(el);
          el.parentNode && el.parentNode.removeChild(el);
        });
      });
    } catch (err) {
      // ignore
    }

    // Render the assistant text (this will clear message-text)
    renderMessageContent(textEl, text);

    // Restore preserved widgets so they remain sticky while text updates
    try {
      preserved.forEach((w) => textEl.appendChild(w));
    } catch (err) {
      // ignore
    }

    if (metaEl) metaEl.textContent = metaText(meta, isLastMessage);
    const spinner = node.querySelector(".assistant-spinner");
    if (spinner) spinner.style.display = "none";
    const status = node.querySelector(".status-text");
    if (status) status.style.display = "none";

    // Update footer visibility after updating content (show footer if this is the final message)
    updateAssistantFooters(isLastMessage);

    return node;
  }

  function setLoading(flag, meta, loadingText = "Working...") {
    if (!container) return;
    if (flag) {
      const ln = ensureLoading();
      const textEl = ln.querySelector(".loading-text");
      if (textEl) textEl.textContent = loadingText;
      const metaEl = ln.querySelector(".loading-meta");
      if (metaEl) metaEl.textContent = metaText(meta);
      container.appendChild(ln);
      container.scrollTop = container.scrollHeight;
    } else {
      if (loadingNode && loadingNode.parentNode)
        loadingNode.parentNode.removeChild(loadingNode);
    }
  }

  function showNotification(text) {
    if (!container) return;
    const n = document.createElement("div");
    n.className = "notification-chip m-2 text-sm text-gray-300";
    n.textContent = text;
    container.appendChild(n);
    if (loadingNode && loadingNode.parentNode === container)
      container.appendChild(loadingNode);
    container.scrollTop = container.scrollHeight;
  }

  function clearMessages() {
    if (!container) return;
    container.innerHTML = "";
    loadingNode = null;
    
    // Clear all state
    currentRequestId = null;
    currentRequestStartTime = null;
    isWaitingForUserInput = false;
    toolCallRetries.clear();
    
    // Clear pending file changes
    pendingFileChanges = [];
    if (fileChangesTimeout) {
      clearTimeout(fileChangesTimeout);
      fileChangesTimeout = null;
    }
    
    // Clear any timeouts
    if (requestTimeout) {
      clearTimeout(requestTimeout);
      requestTimeout = null;
    }
    
    // Clear validation and error messages
    clearValidationMessage();
    clearErrorWidgets();
    
    updatePlaceholderVisibility();
  }

  // Placeholder management
  let placeholderIcon = "";
  let modesTaglines = {};
  function updatePlaceholderVisibility() {
    try {
      const ph = document.getElementById("vsx-placeholder");
      if (!ph) return;

      // Determine if there are actual chat message nodes (assistant or user)
      const userMsgs = container
        ? container.querySelectorAll(".user-message")
        : [];
      const assistantMsgs = container
        ? container.querySelectorAll(".assistant-message")
        : [];
      const hasMessages =
        (userMsgs && userMsgs.length) ||
        (assistantMsgs && assistantMsgs.length);

      if (!hasMessages) {
        // Update tagline based on selected mode
        const tagline =
          modesTaglines[selectedMode] ||
          modesTaglines["legacy"] ||
          "Build with VSX";
        const tagEl = document.getElementById("vsx-placeholder-tagline");
        if (tagEl) tagEl.textContent = tagline;

        // Update icon if available
        const imgEl = document.getElementById("vsx-placeholder-icon");
        if (imgEl) {
          if (placeholderIcon && placeholderIcon.length > 0) {
            imgEl.src = placeholderIcon;
            imgEl.style.display = "";
          } else {
            // Hide icon if no URI available
            imgEl.style.display = "none";
          }
        }

        ph.style.display = "flex";
      } else {
        ph.style.display = "none";
      }
    } catch (e) {
      console.error("Error updating placeholder visibility:", e);
    }
  }

  function setSelectedModel(id) {
    selectedModel = id || "";
  }
  function setSelectedMode(id) {
    selectedMode = id || "";
    updateModelSelectorVisibility();
  }
  function setSelectedPrimaryModel(id) {
    selectedPrimaryModel = id || "";
    updateSendButtonState();
  }
  function setSelectedSecondaryModel(id) {
    selectedSecondaryModel = id || "";
    updateSendButtonState();
  }

  function updateModelSelectorVisibility() {
    const singleModelDropdown = document.getElementById("model-dropdown");
    const dualityModelSelectors = document.getElementById(
      "duality-model-selectors"
    );

    if (selectedMode === "duality") {
      // Show dual model selectors, hide single model dropdown
      if (singleModelDropdown) singleModelDropdown.style.display = "none";
      if (dualityModelSelectors)
        dualityModelSelectors.classList.remove("hidden");
    } else {
      // Show single model dropdown, hide dual model selectors
      if (singleModelDropdown) singleModelDropdown.style.display = "block";
      if (dualityModelSelectors) dualityModelSelectors.classList.add("hidden");
    }
  }

  function updateSendButtonState() {
    const sendBtn = document.getElementById("send-btn");
    if (!sendBtn) return;

    // Check if currently processing a request or waiting for user input
    if (loadingNode || isWaitingForUserInput) {
      sendBtn.disabled = true;
      sendBtn.style.opacity = "0.5";
      sendBtn.title = isWaitingForUserInput 
        ? "Waiting for user input..." 
        : "Processing request...";
      return;
    }

    if (selectedMode === "duality") {
      // For Duality mode, validate both models and provide detailed feedback
      const hasPrimary =
        selectedPrimaryModel && selectedPrimaryModel.trim() !== "";
      const hasSecondary =
        selectedSecondaryModel && selectedSecondaryModel.trim() !== "";
      const isValid = hasPrimary && hasSecondary;

      sendBtn.disabled = !isValid;
      sendBtn.style.opacity = isValid ? "1" : "0.5";

      if (!hasPrimary && !hasSecondary) {
        sendBtn.title =
          "Please select both primary and secondary models for Duality mode";
        showValidationMessage(
          "Both primary and secondary models are required for Duality mode",
          "warning"
        );
      } else if (!hasPrimary) {
        sendBtn.title = "Please select a primary model";
        showValidationMessage("Primary model is required", "warning");
      } else if (!hasSecondary) {
        sendBtn.title = "Please select a secondary model";
        showValidationMessage("Secondary model is required", "warning");
      } else {
        sendBtn.title = "Send Message (Duality Mode)";
        clearValidationMessage();
      }
    } else {
      // For other modes, validate single model selection
      const isValid = selectedModel && selectedModel.trim() !== "";
      sendBtn.disabled = !isValid;
      sendBtn.style.opacity = isValid ? "1" : "0.5";

      if (!isValid) {
        sendBtn.title = "Please select a model first";
        showValidationMessage("Please select a model to continue", "warning");
      } else {
        sendBtn.title = "Send Message";
        clearValidationMessage();
      }
    }
  }

  // Show validation messages to user
  function showValidationMessage(message, type = "info") {
    clearValidationMessage();

    const validationEl = document.createElement("div");
    validationEl.id = "validation-message";
    validationEl.className = `validation-message ${type}`;

    const icon = type === "warning" ? "⚠️" : type === "error" ? "❌" : "ℹ️";
    validationEl.innerHTML = `
      <span class="validation-icon">${icon}</span>
      <span class="validation-text">${message}</span>
    `;

    // Insert before input area
    const inputArea = document.querySelector(".input-area");
    if (inputArea) {
      inputArea.parentNode.insertBefore(validationEl, inputArea);

      // Auto-hide after 5 seconds for non-error messages
      if (type !== "error") {
        setTimeout(() => {
          clearValidationMessage();
        }, 5000);
      }
    }
  }

  // Clear validation messages
  function clearValidationMessage() {
    const existing = document.getElementById("validation-message");
    if (existing) {
      existing.remove();
    }
  }

  // Show loading state with progress indicator
  function showLoadingState(message = "Processing...") {
    const sendBtn = document.getElementById("send-btn");
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.style.opacity = "0.5";
      sendBtn.innerHTML = `
        <div class="loading-spinner"></div>
        <span>${message}</span>
      `;
    }

    clearValidationMessage();
  }

  // Hide loading state
  function hideLoadingState() {
    const sendBtn = document.getElementById("send-btn");
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.style.opacity = "1";
      sendBtn.innerHTML = "Send";
    }

    updateSendButtonState();
  }

  // Handle request timeout
  function handleRequestTimeout(requestId) {
    console.warn(`Request ${requestId} timed out`);

    if (currentRequestId === requestId) {
      cleanupCurrentRequest();
      setLoading(false);
      isWaitingForUserInput = false;

      showErrorWidget({
        title: "Request Timeout",
        message:
          "The request took too long to complete. This might be due to network issues or model unavailability.",
        type: "timeout",
        requestId: requestId,
        actions: [
          { label: "Retry", action: "retry" },
          { label: "Cancel", action: "cancel" },
        ],
      });
    }
  }

  // Handle request errors
  function handleRequestError(requestId, errorMessage, errorData = {}) {
    console.error(`Request ${requestId} failed:`, errorMessage, errorData);

    if (currentRequestId === requestId) {
      cleanupCurrentRequest();
      setLoading(false);
      isWaitingForUserInput = false;

      const isRetryable = errorData.recoverable !== false;
      const actions = [];

      if (isRetryable) {
        actions.push({ label: "Retry", action: "retry" });
      }
      actions.push({ label: "Cancel", action: "cancel" });

      showErrorWidget({
        title:
          errorData.type === "network" ? "Network Error" : "Request Failed",
        message: errorMessage,
        type: errorData.type || "error",
        requestId: requestId,
        actions: actions,
        details: errorData,
      });
    }
  }

  // Clean up current request
  function cleanupCurrentRequest() {
    if (requestTimeout) {
      clearTimeout(requestTimeout);
      requestTimeout = null;
    }

    currentRequestId = null;
    currentRequestStartTime = null;
    isWaitingForUserInput = false;
    hideLoadingState();
    clearValidationMessage();
    clearErrorWidgets();
  }

  // Show error widget with recovery options
  function showErrorWidget(errorInfo) {
    clearValidationMessage();
    clearErrorWidgets(); // Clear any existing error widgets

    const errorWidget = createErrorWidget(errorInfo);
    if (errorWidget) {
      // Find the latest assistant message to attach widget
      const assistantMsgs = container
        ? container.querySelectorAll(".assistant-message")
        : [];
      const node =
        assistantMsgs && assistantMsgs.length
          ? assistantMsgs[assistantMsgs.length - 1]
          : null;

      if (node) {
        const textEl = node.querySelector(".message-text");
        if (textEl) {
          textEl.appendChild(errorWidget);
          container.scrollTop = container.scrollHeight;
        }
      } else {
        // Create a new message for the error widget
        const messageNode = appendMessage(
          "assistant",
          "",
          {},
          "error-" + Date.now(),
          false
        );
        if (messageNode) {
          const textEl = messageNode.querySelector(".message-text");
          if (textEl) {
            textEl.appendChild(errorWidget);
          }
        }
      }
    }
  }

  // Create error widget
  function createErrorWidget(errorInfo) {
    try {
      const wrapper = document.createElement("div");
      wrapper.className = "error-widget";
      wrapper.dataset.requestId = errorInfo.requestId || "";

      const header = document.createElement("div");
      header.className = "error-widget-header";
      
      const icon = getErrorIcon(errorInfo.type);
      header.innerHTML = `
        ${icon}
        <span class="error-title">${errorInfo.title}</span>
      `;

      const message = document.createElement("div");
      message.className = "error-widget-message";
      message.textContent = errorInfo.message;

      wrapper.appendChild(header);
      wrapper.appendChild(message);

      // Add action buttons if provided
      if (errorInfo.actions && errorInfo.actions.length > 0) {
        const actions = document.createElement("div");
        actions.className = "error-widget-actions";

        errorInfo.actions.forEach((action) => {
          const btn = document.createElement("button");
          btn.className = `error-action-btn ${action.action}`;
          btn.textContent = action.label;
          btn.addEventListener("click", () => {
            handleErrorAction(action.action, errorInfo.requestId, errorInfo);
          });
          actions.appendChild(btn);
        });

        wrapper.appendChild(actions);
      }

      return wrapper;
    } catch (e) {
      console.error("Error creating error widget:", e);
      return null;
    }
  }

  // Get appropriate icon for error type
  function getErrorIcon(type) {
    switch (type) {
      case "timeout":
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z"/></svg>`;
      case "network":
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M15.5,17L12,13.5L8.5,17L7,15.5L10.5,12L7,8.5L8.5,7L12,10.5L15.5,7L17,8.5L13.5,12L17,15.5L15.5,17Z"/></svg>`;
      case "tool_failure":
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M22.7,19L13.6,9.9C14.5,7.6 14,4.9 12.1,3C10.1,1 7.1,0.6 4.7,1.7L9,6L6,9L1.6,4.7C0.4,7.1 0.9,10.1 2.9,12.1C4.8,14 7.5,14.5 9.8,13.6L18.9,22.7C19.3,23.1 19.9,23.1 20.3,22.7L22.6,20.4C23.1,20 23.1,19.3 22.7,19Z"/></svg>`;
      default:
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>`;
    }
  }

  // Handle error action buttons
  function handleErrorAction(action, requestId, errorInfo) {
    clearErrorWidgets();

    switch (action) {
      case "retry":
        // Retry the last request
        const inputTa = document.getElementById("inputTextArea");
        if (inputTa && errorInfo.originalPrompt) {
          inputTa.value = errorInfo.originalPrompt;
          // Trigger send button click
          const sendBtn = document.getElementById("send-btn");
          if (sendBtn) {
            sendBtn.click();
          }
        }
        break;
      case "cancel":
        // Just clear the error widget
        break;
    }
  }

  // Tool call retry management
  function shouldRetryToolCall(toolCallId, errorType) {
    const retryKey = `${toolCallId}_${errorType}`;
    const currentRetries = toolCallRetries.get(retryKey) || 0;
    
    if (currentRetries >= maxRetryAttempts) {
      return false;
    }
    
    toolCallRetries.set(retryKey, currentRetries + 1);
    return true;
  }

  function clearToolCallRetries(toolCallId) {
    // Clear all retry counters for this tool call
    for (const [key] of toolCallRetries.entries()) {
      if (key.startsWith(toolCallId + "_")) {
        toolCallRetries.delete(key);
      }
    }
  }

  // Show tool retry indicator
  function showToolRetryWidget(toolCallId, toolType, attempt, maxAttempts, errorMessage) {
    const widget = createToolRetryWidget(toolCallId, toolType, attempt, maxAttempts, errorMessage);
    if (widget) {
      // Find the latest assistant message to attach widget
      const assistantMsgs = container
        ? container.querySelectorAll(".assistant-message")
        : [];
      const node =
        assistantMsgs && assistantMsgs.length
          ? assistantMsgs[assistantMsgs.length - 1]
          : null;

      if (node) {
        const textEl = node.querySelector(".message-text");
        if (textEl) {
          textEl.appendChild(widget);
          container.scrollTop = container.scrollHeight;
        }
      }
    }
  }

  // Create tool retry widget
  function createToolRetryWidget(toolCallId, toolType, attempt, maxAttempts, errorMessage) {
    try {
      const wrapper = document.createElement("div");
      wrapper.className = "tool-retry-widget";
      wrapper.dataset.toolCallId = toolCallId;

      const header = document.createElement("div");
      header.className = "tool-retry-header";
      header.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12,6V9L16,5L12,1V4A8,8 0 0,0 4,12C4,13.57 4.46,15.03 5.24,16.26L6.7,14.8C6.25,13.97 6,13 6,12A6,6 0 0,1 12,6M18.76,7.74L17.3,9.2C17.74,10.04 18,11 18,12A6,6 0 0,1 12,18V15L8,19L12,23V20A8,8 0 0,0 20,12C20,10.43 19.54,8.97 18.76,7.74Z"/>
        </svg>
        <span>Retrying ${toolType} (${attempt}/${maxAttempts})</span>
      `;

      const message = document.createElement("div");
      message.className = "tool-retry-message";
      message.textContent = errorMessage || "Tool call failed, retrying...";

      const progress = document.createElement("div");
      progress.className = "tool-retry-progress";
      const progressBar = document.createElement("div");
      progressBar.className = "tool-retry-progress-bar";
      progressBar.style.width = `${(attempt / maxAttempts) * 100}%`;
      progress.appendChild(progressBar);

      wrapper.appendChild(header);
      wrapper.appendChild(message);
      wrapper.appendChild(progress);

      // Auto-remove after 10 seconds
      setTimeout(() => {
        if (wrapper.parentNode) {
          wrapper.remove();
        }
      }, 10000);

      return wrapper;
    } catch (e) {
      console.error("Error creating tool retry widget:", e);
      return null;
    }
  }

  // Clear error widgets
  function clearErrorWidgets() {
    const errorWidgets = document.querySelectorAll(".error-widget");
    errorWidgets.forEach((el) => el.remove());
  }

  // Show retry indicator
  function showRetryIndicator(requestId, message, attempt, maxAttempts) {
    // Remove existing retry indicator
    const existing = document.getElementById(`retry-indicator-${requestId}`);
    if (existing) {
      existing.remove();
    }

    const retryEl = document.createElement("div");
    retryEl.className = "retry-indicator";
    retryEl.id = `retry-indicator-${requestId}`;

    retryEl.innerHTML = `
      <div class="retry-spinner"></div>
      <span>${message} (${attempt}/${maxAttempts})</span>
    `;

    // Insert before input area
    const inputArea = document.querySelector(".input-area");
    if (inputArea) {
      inputArea.parentNode.insertBefore(retryEl, inputArea);

      // Auto-remove after 10 seconds
      setTimeout(() => {
        if (retryEl.parentNode) {
          retryEl.remove();
        }
      }, 10000);
    }
  }

  // Clear retry indicators

  function updateModelDropdown(modelsPayload) {
    try {
      const listEl = document.getElementById("model-list");
      const dropdown = document.getElementById("model-dropdown");
      if (!listEl || !dropdown) return;

      // Also update dual model selectors
      updateDualModelDropdowns(modelsPayload);

      console.log(
        "[webview-client] Updating model dropdown with:",
        modelsPayload
      );

      const models =
        modelsPayload && modelsPayload.flatList
          ? modelsPayload.flatList
          : Array.isArray(modelsPayload)
          ? modelsPayload
          : [];
      listEl.innerHTML = "";

      if (!models || !models.length) {
        const li = document.createElement("li");
        li.className =
          "px-3 py-2 text-gray-400 text-center cursor-pointer hover:bg-gray-700 hover:text-white transition-colors";
        li.innerHTML = `
          <div class="text-sm">No models available</div>
          <div class="text-xs mt-1 opacity-75">Click to configure API keys</div>
        `;
        li.addEventListener("click", () => {
          console.log("[webview-client] Requesting API key setup");
          if (vscode) {
            vscode.postMessage({ command: "openApiKeySetup" });
          }
        });
        listEl.appendChild(li);
        return;
      }

      models.forEach((m) => {
        const id = m.id || m.modelId || m.name || String(m);
        const name = m.name || m.displayName || m.id || id;
        const disabled = m.disabled || false;

        const li = document.createElement("li");
        li.className = disabled
          ? "px-3 py-2 text-gray-500 cursor-pointer text-sm hover:bg-gray-700 hover:text-gray-300 transition-colors"
          : "px-3 py-2 hover:bg-gray-700 cursor-pointer text-sm text-gray-200 hover:text-white transition-colors";
        li.dataset.modelId = id;
        li.setAttribute("role", "option");
        li.textContent = name;

        li.addEventListener("click", () => {
          if (disabled) {
            console.log(
              "[webview-client] Requesting API key setup for disabled model"
            );
            if (vscode) {
              vscode.postMessage({ command: "openApiKeySetup" });
            }
            return;
          }

          selectedModel = id;
          try {
            const btnSpan = dropdown.querySelector("button span");
            if (btnSpan) btnSpan.textContent = name;
          } catch (err) {
            console.error("updateModelDropdown click set label error", err);
          }
          try {
            dropdown.dataset.selectedModelId = id;
          } catch (err) {}
          try {
            if (dropdown.__x && dropdown.__x.$data)
              dropdown.__x.$data.selected = name;
          } catch (err) {}
        });
        listEl.appendChild(li);
      });

      // Set default selected if none and we have enabled models
      const enabledModels = models.filter((m) => !m.disabled);
      if (!selectedModel && enabledModels.length) {
        const first = enabledModels[0];
        selectedModel =
          first.id || first.modelId || first.name || String(first);
        try {
          const btnSpan = dropdown.querySelector("button span");
          if (btnSpan)
            btnSpan.textContent = first.name || first.id || selectedModel;
        } catch (err) {
          console.error(err);
        }
        try {
          if (dropdown.__x && dropdown.__x.$data)
            dropdown.__x.$data.selected =
              first.name || first.id || selectedModel;
        } catch (err) {}
        try {
          dropdown.dataset.selectedModelId = selectedModel;
        } catch (err) {}
      } else if (!selectedModel && models.length) {
        // All models are disabled, show first one but indicate it needs setup

        try {
          const btnSpan = dropdown.querySelector("button span");
          if (btnSpan) btnSpan.textContent = "Configure API Keys";
        } catch (err) {
          console.error(err);
        }
      }
    } catch (e) {
      console.error("updateModelDropdown error", e);
    }
  }

  function updateDualModelDropdowns(modelsPayload) {
    try {
      const primaryListEl = document.getElementById("primary-model-list");
      const secondaryListEl = document.getElementById("secondary-model-list");
      const primaryDropdown = document.getElementById("primary-model-dropdown");
      const secondaryDropdown = document.getElementById(
        "secondary-model-dropdown"
      );

      if (
        !primaryListEl ||
        !secondaryListEl ||
        !primaryDropdown ||
        !secondaryDropdown
      )
        return;

      const models =
        modelsPayload && modelsPayload.flatList
          ? modelsPayload.flatList
          : Array.isArray(modelsPayload)
          ? modelsPayload
          : [];

      // Clear existing lists
      primaryListEl.innerHTML = "";
      secondaryListEl.innerHTML = "";

      if (!models || !Array.isArray(models) || models.length === 0) {
        const createEmptyLi = () => {
          const li = document.createElement("li");
          li.className = "px-3 py-2 text-gray-400 text-center";
          li.textContent = "No models available";
          return li;
        };
        primaryListEl.appendChild(createEmptyLi());
        secondaryListEl.appendChild(createEmptyLi());
        return;
      }

      // Populate both dropdowns with the same models
      models.forEach((m) => {
        const id = m.id || m.modelId || m.name || String(m);
        const name = m.name || m.displayName || m.id || id;
        const disabled = m.disabled || false;

        // Create primary model option
        const primaryLi = document.createElement("li");
        primaryLi.className = disabled
          ? "px-3 py-2 text-gray-500 cursor-pointer text-sm hover:bg-gray-700 hover:text-gray-300 transition-colors"
          : "px-3 py-2 hover:bg-gray-700 cursor-pointer text-sm text-gray-200 hover:text-white transition-colors";
        primaryLi.dataset.modelId = id;
        primaryLi.setAttribute("role", "option");
        primaryLi.textContent = name;

        primaryLi.addEventListener("click", () => {
          if (disabled) {
            if (vscode) {
              vscode.postMessage({ command: "openApiKeySetup" });
            }
            return;
          }

          selectedPrimaryModel = id;
          try {
            const btnSpan = primaryDropdown.querySelector("button span");
            if (btnSpan) btnSpan.textContent = name;
          } catch (err) {
            console.error("updateDualModelDropdowns primary click error", err);
          }
          try {
            primaryDropdown.dataset.selectedModelId = id;
          } catch (err) {}
          try {
            if (primaryDropdown.__x && primaryDropdown.__x.$data)
              primaryDropdown.__x.$data.selected = name;
          } catch (err) {}
          updateSendButtonState();
        });

        // Create secondary model option
        const secondaryLi = document.createElement("li");
        secondaryLi.className = disabled
          ? "px-3 py-2 text-gray-500 cursor-pointer text-sm hover:bg-gray-700 hover:text-gray-300 transition-colors"
          : "px-3 py-2 hover:bg-gray-700 cursor-pointer text-sm text-gray-200 hover:text-white transition-colors";
        secondaryLi.dataset.modelId = id;
        secondaryLi.setAttribute("role", "option");
        secondaryLi.textContent = name;

        secondaryLi.addEventListener("click", () => {
          if (disabled) {
            if (vscode) {
              vscode.postMessage({ command: "openApiKeySetup" });
            }
            return;
          }

          selectedSecondaryModel = id;
          try {
            const btnSpan = secondaryDropdown.querySelector("button span");
            if (btnSpan) btnSpan.textContent = name;
          } catch (err) {
            console.error(
              "updateDualModelDropdowns secondary click error",
              err
            );
          }
          try {
            secondaryDropdown.dataset.selectedModelId = id;
          } catch (err) {}
          try {
            if (secondaryDropdown.__x && secondaryDropdown.__x.$data)
              secondaryDropdown.__x.$data.selected = name;
          } catch (err) {}
          updateSendButtonState();
        });

        primaryListEl.appendChild(primaryLi);
        secondaryListEl.appendChild(secondaryLi);
      });

      // Set default selections if none and we have enabled models
      const enabledModels = models.filter((m) => !m.disabled);
      if (!selectedPrimaryModel && enabledModels.length) {
        const first = enabledModels[0];
        selectedPrimaryModel =
          first.id || first.modelId || first.name || String(first);
        try {
          const btnSpan = primaryDropdown.querySelector("button span");
          if (btnSpan)
            btnSpan.textContent =
              first.name || first.id || selectedPrimaryModel;
        } catch (err) {
          console.error(err);
        }
        try {
          if (primaryDropdown.__x && primaryDropdown.__x.$data)
            primaryDropdown.__x.$data.selected =
              first.name || first.id || selectedPrimaryModel;
        } catch (err) {}
        try {
          primaryDropdown.dataset.selectedModelId = selectedPrimaryModel;
        } catch (err) {}
      }

      if (!selectedSecondaryModel && enabledModels.length > 1) {
        // Default to second model if available, otherwise same as primary
        const second = enabledModels[1] || enabledModels[0];
        selectedSecondaryModel =
          second.id || second.modelId || second.name || String(second);
        try {
          const btnSpan = secondaryDropdown.querySelector("button span");
          if (btnSpan)
            btnSpan.textContent =
              second.name || second.id || selectedSecondaryModel;
        } catch (err) {
          console.error(err);
        }
        try {
          if (secondaryDropdown.__x && secondaryDropdown.__x.$data)
            secondaryDropdown.__x.$data.selected =
              second.name || second.id || selectedSecondaryModel;
        } catch (err) {}
        try {
          secondaryDropdown.dataset.selectedModelId = selectedSecondaryModel;
        } catch (err) {}
      }

      updateSendButtonState();
    } catch (e) {
      console.error("updateDualModelDropdowns error", e);
    }
  }

  function updateModeList(modes) {
    try {
      const listEl = document.getElementById("mode-list");
      const dropdown = document.getElementById("mode-dropdown");
      if (!listEl || !dropdown) return;

      console.log("[webview-client] Updating mode list with:", modes);

      listEl.innerHTML = "";
      if (!modes || !Array.isArray(modes) || modes.length === 0) {
        const li = document.createElement("li");
        li.className = "px-3 py-2 text-gray-400 text-center";
        li.textContent = "No modes available";
        listEl.appendChild(li);
        return;
      }

      modes.forEach((m) => {
        const id = m.id || m.modeId || m.name || String(m);
        const name = m.name || m.displayName || m.id || id;
        const li = document.createElement("li");
        li.className =
          "px-3 py-2 hover:bg-gray-700 cursor-pointer text-sm text-gray-200 hover:text-white transition-colors";
        li.dataset.modeId = id;
        li.textContent = name;
        li.setAttribute("role", "option");
        li.addEventListener("click", () => {
          selectedMode = id;
          try {
            const btnSpan = dropdown.querySelector("button span");
            if (btnSpan) btnSpan.textContent = name;
          } catch (err) {
            console.error(err);
          }
          try {
            dropdown.dataset.selectedModeId = id;
          } catch (err) {}
          try {
            if (dropdown.__x && dropdown.__x.$data)
              dropdown.__x.$data.selected = name;
          } catch (err) {}
          updateModelSelectorVisibility();
          updateSendButtonState();
        });
        listEl.appendChild(li);
      });

      if (!selectedMode && modes.length) {
        const first = modes[0];
        selectedMode = first.id || first.modeId || first.name || String(first);
        try {
          const btnSpan = dropdown.querySelector("button span");
          if (btnSpan)
            btnSpan.textContent = first.name || first.id || selectedMode;
        } catch (err) {}
        try {
          if (dropdown.__x && dropdown.__x.$data)
            dropdown.__x.$data.selected =
              first.name || first.id || selectedMode;
        } catch (err) {}
        try {
          dropdown.dataset.selectedModeId = selectedMode;
        } catch (err) {}
        updateModelSelectorVisibility();
        updateSendButtonState();
      }
    } catch (e) {
      console.error("updateModeList error", e);
    }
  }

  // Helper to check if message should be filtered out
  function shouldFilterMessage(text) {
    if (typeof text !== "string") return false;

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
      /saved changes/i,
    ];

    return filterPatterns.some((pattern) => pattern.test(text));
  }

  // Helper to show waiting state for terminal commands
  function showTerminalWaiting() {
    setLoading(true, {}, "Waiting for user input...");
  }

  // Helper to mark conversation as ended and show footer
  function markConversationEnded() {
    updateAssistantFooters(true);
  }

  // Helper to collect file changes and show summary widget
  function addFileChange(filePath, linesAdded = 0, linesRemoved = 0) {
    // Check if autopilot is enabled
    const autopilotToggle = document.getElementById("autopilot-toggle");
    const isAutopilot = autopilotToggle && autopilotToggle.checked;

    if (!isAutopilot) return; // Only collect changes in autopilot mode

    // Add to pending changes
    pendingFileChanges.push({
      filePath,
      linesAdded,
      linesRemoved,
      timestamp: Date.now(),
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
      const assistantMsgs = container
        ? container.querySelectorAll(".assistant-message")
        : [];
      const node =
        assistantMsgs && assistantMsgs.length
          ? assistantMsgs[assistantMsgs.length - 1]
          : null;

      if (node) {
        const textEl = node.querySelector(".message-text");
        if (textEl) {
          textEl.appendChild(widget);
          container.scrollTop = container.scrollHeight;
        }
      } else {
        // Create a new message for the widget
        const messageNode = appendMessage(
          "assistant",
          "",
          {},
          "file-changes-" + Date.now(),
          false
        );
        if (messageNode) {
          const textEl = messageNode.querySelector(".message-text");
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
      return appendMessage("user", t, m, id, false);
    },
    addBotMessage: (t, m, id, showMeta = true) => {
      // Filter out redundant messages when widgets are shown
      if (shouldFilterMessage(t)) {
        console.log("Filtered redundant message:", t.substring(0, 50) + "...");
        return null;
      }
      return appendMessage("assistant", t, m, id, showMeta);
    },
    updateAssistantNode,
    setLoading: (flag, meta, loadingText = "Working...") => {
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
    setSelectedPrimaryModel,
    setSelectedSecondaryModel,
    // Helper to request the extension host show a diff and apply/undo a file write
    invokeWriteFile: (filePath, newContent, requestId) => {
      try {
        if (vscode)
          vscode.postMessage({
            command: "tool.writeFile",
            filePath,
            newContent,
            requestId,
          });
      } catch (e) {
        console.error("invokeWriteFile failed", e);
      }
    },
    // Widget creators
    createFileSearchWidget,
    createFileChangesWidget,
    createFileEditWidget,
    createSubtaskProgressWidget,
    createDualityModeWidget,
    createPrimaryDecisionWidget,
    updateSubtaskProgress,
    // Helper to add widgets to messages
    addWidgetToMessage: (messageNode, widget) => {
      if (messageNode && widget) {
        const textEl = messageNode.querySelector(".message-text");
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
    addFileChange,
  };

  // Autopilot: store state and notify host when toggled
  const autopilotToggle = document.getElementById("autopilot-toggle");
  if (autopilotToggle) {
    autopilotToggle.addEventListener("change", () => {
      try {
        if (vscode)
          vscode.postMessage({
            command: "setAutoPilot",
            enabled: autopilotToggle.checked,
          });
      } catch (e) {
        console.error("post setAutoPilot failed", e);
      }
    });
  }

  // Create and wire an option to allow autopilot to run terminal commands
  function ensureAutoPilotTerminalOption() {
    try {
      const optionsRoot = document.getElementById("options-dropdown");
      if (!optionsRoot) return;

      // Avoid creating twice
      if (document.getElementById("autopilot-terminal-option")) return;

      const row = document.createElement("div");
      row.id = "autopilot-terminal-option";
      row.className =
        "px-3 py-2 text-sm text-gray-200 flex items-center justify-between";

      const label = document.createElement("div");
      label.style.display = "flex";
      label.style.flexDirection = "column";
      label.innerHTML = `
        <span style="font-weight:600;">Allow autopilot to run terminal commands</span>
        <span style="font-size:11px;color:#9aa7b2;">When enabled, autopilot may execute terminal tool-calls automatically.</span>
      `;

      const control = document.createElement("input");
      control.type = "checkbox";
      control.id = "autopilot-terminal-toggle";
      control.style.width = "18px";
      control.style.height = "18px";

      control.addEventListener("change", () => {
        try {
          const enabled = Boolean(control.checked);
          if (vscode)
            vscode.postMessage({
              command: "setAutoPilotTerminalExecution",
              enabled,
            });
        } catch (e) {
          console.error("post setAutoPilotTerminalExecution failed", e);
        }
      });

      row.appendChild(label);
      row.appendChild(control);

      // Try to place this option directly below the Cerebras Reasoning row if it exists
      let inserted = false;
      try {
        // Common ids or data attributes that might identify the Cerebras row
        const cerebrasRow = optionsRoot.querySelector(
          '#cerebras-reasoning-row, #set-cerebras-reasoning, [data-setting="cerebras-reasoning"]'
        );
        if (cerebrasRow && cerebrasRow.parentNode === optionsRoot) {
          optionsRoot.insertBefore(row, cerebrasRow.nextSibling);
          inserted = true;
        } else {
          // fallback: search for an element containing the word 'Cerebras' in its text
          const children = Array.from(optionsRoot.children || []);
          for (let i = 0; i < children.length; i++) {
            const ch = children[i];
            try {
              if (
                ch &&
                ch.textContent &&
                ch.textContent.toLowerCase().includes("cerebras")
              ) {
                optionsRoot.insertBefore(row, ch.nextSibling);
                inserted = true;
                break;
              }
            } catch (e) {
              /* ignore read errors */
            }
          }
        }
      } catch (e) {
        console.error("Insertion search for cerebras row failed", e);
      }

      if (!inserted) optionsRoot.appendChild(row);

      // Request current state from host (host may send back autoPilotTerminalChanged message)
      try {
        if (vscode)
          vscode.postMessage({ command: "getAutoPilotTerminalExecution" });
      } catch (e) {}
    } catch (e) {
      console.error("Failed to create autopilot terminal option", e);
    }
  }

  // Ensure the option is available when the webview initializes
  try {
    ensureAutoPilotTerminalOption();
  } catch (e) {
    console.error("ensureAutoPilotTerminalOption init failed", e);
  }

  // Update assistant message footers - only show after conversation ends
  function updateAssistantFooters(conversationEnded = false) {
    try {
      const assistantMessages =
        container.querySelectorAll(".assistant-message");

      // Hide all footers first
      assistantMessages.forEach((msg) => {
        const footer = msg.querySelector(".message-footer");
        if (footer) footer.style.display = "none";
      });

      // Show footer only on last message and only if conversation has ended
      if (conversationEnded && assistantMessages.length > 0) {
        const lastMessage = assistantMessages[assistantMessages.length - 1];
        const footer = lastMessage.querySelector(".message-footer");
        if (footer) {
          footer.style.display = "flex";
          setupMessageFooter(lastMessage);
        }
      }
    } catch (e) {
      console.error("Error updating assistant footers:", e);
    }
  }

  // Setup message footer with action buttons
  function setupMessageFooter(messageNode) {
    try {
      const footer = messageNode.querySelector(".message-footer");
      if (!footer) return;

      const textEl = messageNode.querySelector(".message-text");
      const text = textEl ? textEl.textContent || "" : "";

      const likeBtn = footer.querySelector(".like-btn");
      const dislikeBtn = footer.querySelector(".dislike-btn");
      const copyBtn = footer.querySelector(".copy-btn");
      const statsBtn = footer.querySelector(".stats-btn");

      // Copy functionality
      if (copyBtn && !copyBtn.hasAttribute("data-setup")) {
        copyBtn.setAttribute("data-setup", "true");
        copyBtn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(text);
            copyBtn.style.color = "#10b981";
            setTimeout(() => {
              copyBtn.style.color = "";
            }, 1000);
          } catch (err) {
            console.error("Copy failed:", err);
          }
        });
      }

      // Like/Dislike functionality
      if (likeBtn && !likeBtn.hasAttribute("data-setup")) {
        likeBtn.setAttribute("data-setup", "true");
        likeBtn.addEventListener("click", () => {
          likeBtn.classList.toggle("liked");
          if (dislikeBtn) dislikeBtn.classList.remove("disliked");
        });
      }

      if (dislikeBtn && !dislikeBtn.hasAttribute("data-setup")) {
        dislikeBtn.setAttribute("data-setup", "true");
        dislikeBtn.addEventListener("click", () => {
          dislikeBtn.classList.toggle("disliked");
          if (likeBtn) likeBtn.classList.remove("liked");
        });
      }

      // Stats tooltip functionality
      if (statsBtn && !statsBtn.hasAttribute("data-setup")) {
        statsBtn.setAttribute("data-setup", "true");
        let tooltip = null;

        statsBtn.addEventListener("mouseenter", () => {
          if (tooltip) return;

          tooltip = document.createElement("div");
          tooltip.className = "stats-tooltip";

          const inputTokens = Math.floor(Math.random() * 1000) + 100;
          const outputTokens = Math.floor(Math.random() * 500) + 50;

          tooltip.innerHTML = `Input: ${inputTokens} tokens<br>Output: ${outputTokens} tokens`;

          statsBtn.style.position = "relative";
          statsBtn.appendChild(tooltip);

          setTimeout(() => {
            if (tooltip) tooltip.classList.add("visible");
          }, 10);
        });

        statsBtn.addEventListener("mouseleave", () => {
          if (tooltip) {
            tooltip.classList.remove("visible");
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
      console.error("Error setting up message footer:", e);
    }
  }

  // Create file search widget with proper count display
  function createFileSearchWidget(searchQuery, results) {
    try {
      const wrapper = document.createElement("div");
      wrapper.className = "file-search-widget";

      const resultCount =
        results && Array.isArray(results) ? results.length : 0;

      const header = document.createElement("div");
      header.className = "file-search-header";
      header.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
          <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14z"/>
        </svg>
        <span>${resultCount} file${resultCount !== 1 ? "s" : ""} found</span>
      `;

      const resultsContainer = document.createElement("div");
      resultsContainer.className = "file-search-results";

      if (results && results.length > 0) {
        results.forEach((file) => {
          const item = document.createElement("div");
          item.className = "file-search-item";
          item.textContent = file.path || file.name || file;
          item.addEventListener("click", () => {
            // Could trigger file open or preview
            console.log("File selected:", file);
          });
          resultsContainer.appendChild(item);
        });
      } else {
        const noResults = document.createElement("div");
        noResults.className = "file-search-item";
        noResults.textContent = "No files found";
        noResults.style.color = "#9ca3af";
        resultsContainer.appendChild(noResults);
      }

      wrapper.appendChild(header);
      wrapper.appendChild(resultsContainer);

      return wrapper;
    } catch (e) {
      console.error("Error creating file search widget:", e);
      return null;
    }
  }

  // Create file changes summary widget
  function createFileChangesWidget(changes, requestId) {
    try {
      const wrapper = document.createElement("div");
      wrapper.className = "file-changes-widget";
      wrapper.dataset.requestId = requestId || "";

      const header = document.createElement("div");
      header.className = "file-changes-header";
      header.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
          <path fill="currentColor" d="M9,10H7V12H9V10M13,10H11V12H13V10M17,10H15V12H17V10M19,3H18V1H16V3H8V1H6V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M19,19H5V8H19V19Z"/>
        </svg>
        <span>Changes Applied</span>
      `;

      const changesContainer = document.createElement("div");
      changesContainer.className = "file-changes-list";

      if (Array.isArray(changes)) {
        changes.forEach((change) => {
          const item = document.createElement("div");
          item.className = "file-change-item";

          const fileName = document.createElement("span");
          fileName.className = "file-change-name";
          fileName.textContent =
            change.filePath || change.file || "Unknown file";

          const stats = document.createElement("div");
          stats.className = "file-change-stats";

          const added = change.linesAdded || 0;
          const removed = change.linesRemoved || 0;

          if (added > 0) {
            const addedSpan = document.createElement("span");
            addedSpan.className = "lines-added";
            addedSpan.textContent = `+${added}`;
            stats.appendChild(addedSpan);
          }

          if (removed > 0) {
            const removedSpan = document.createElement("span");
            removedSpan.className = "lines-removed";
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
      console.error("Error creating file changes widget:", e);
      return null;
    }
  }

  // Create file edit preview widget (simplified without code display)
  function createFileEditWidget(filePath, changes, requestId) {
    try {
      const wrapper = document.createElement("div");
      wrapper.className = "file-edit-preview";
      wrapper.dataset.requestId = requestId || "";

      const header = document.createElement("div");
      header.className = "file-edit-header";

      const pathSpan = document.createElement("span");
      pathSpan.className = "file-edit-path";
      pathSpan.textContent = filePath;

      const actions = document.createElement("div");
      actions.className = "file-edit-actions";

      // Check if autopilot is enabled
      const autopilotToggle = document.getElementById("autopilot-toggle");
      const isAutopilot = autopilotToggle && autopilotToggle.checked;

      if (isAutopilot) {
        // Auto-accept changes - don't show individual widget, will be handled by summary
        const autoMsg = document.createElement("span");
        autoMsg.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" style="display: inline; margin-right: 4px;">
            <path fill="currentColor" d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
          </svg>
          Auto-applied
        `;
        autoMsg.style.color = "#10b981";
        autoMsg.style.fontSize = "11px";
        autoMsg.style.display = "flex";
        autoMsg.style.alignItems = "center";
        actions.appendChild(autoMsg);

        // Notify extension to apply changes
        setTimeout(() => {
          if (vscode) {
            vscode.postMessage({
              command: "autoAcceptFileEdit",
              filePath,
              changes,
              requestId,
            });
          }
        }, 100);
      } else {
        const acceptBtn = document.createElement("button");
        acceptBtn.className = "file-edit-btn accept";
        acceptBtn.textContent = "Keep";
        acceptBtn.addEventListener("click", () => {
          if (vscode) {
            vscode.postMessage({
              command: "acceptFileEdit",
              filePath,
              changes,
              requestId,
            });
          }
          wrapper.style.opacity = "0.6";
          acceptBtn.disabled = true;
          rejectBtn.disabled = true;
        });

        const rejectBtn = document.createElement("button");
        rejectBtn.className = "file-edit-btn reject";
        rejectBtn.textContent = "Undo";
        rejectBtn.addEventListener("click", () => {
          if (vscode) {
            vscode.postMessage({
              command: "rejectFileEdit",
              filePath,
              requestId,
            });
          }
          wrapper.style.opacity = "0.6";
          acceptBtn.disabled = true;
          rejectBtn.disabled = true;
        });

        actions.appendChild(acceptBtn);
        actions.appendChild(rejectBtn);
      }

      header.appendChild(pathSpan);
      header.appendChild(actions);

      // Show summary instead of full diff
      const summary = document.createElement("div");
      summary.className = "file-edit-summary";
      summary.textContent = "File changes ready to apply";

      wrapper.appendChild(header);
      wrapper.appendChild(summary);

      return wrapper;
    } catch (e) {
      console.error("Error creating file edit widget:", e);
      return null;
    }
  }

  // Helper to create a terminal-command widget inside an assistant message
  function createTerminalWidget(toolCall) {
    try {
      // Wrap in a structure like code-widget-wrapper for consistent margins/width
      const outerWrapper = document.createElement("div");
      outerWrapper.className = "code-widget-wrapper"; // Reuse for alignment

      const wrapper = document.createElement("div");
      wrapper.className = "terminal-tool-widget";

      // Header with terminal icon and label
      const header = document.createElement("div");
      header.className = "terminal-lang-label";
      header.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
          <path fill="currentColor" d="M20,19V7H4V19H20M20,3A2,2 0 0,1 22,5V19A2,2 0 0,1 20,21H4A2,2 0 0,1 2,19V5C2,3.89 2.9,3 4,3H20M13,17V15H18V17H13M9.58,13L5.57,9H8.4L11.7,12.3C12.09,12.69 12.09,13.33 11.7,13.72L8.42,17H5.59L9.58,13Z"/>
        </svg>
        Command
      `;

      const command =
        toolCall.args && toolCall.args.command
          ? String(toolCall.args.command)
          : toolCall.args && toolCall.args.cmd
          ? String(toolCall.args.cmd)
          : "";
      const pre = document.createElement("pre");
      pre.className = "terminal-cmd";
      pre.textContent = command;

      const controls = document.createElement("div");
      controls.className = "terminal-controls";

      const runBtn = document.createElement("button");
      runBtn.type = "button";
      runBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
          <path fill="currentColor" d="M8,5.14V19.14L19,12.14L8,5.14Z"/>
        </svg>
      `;
      runBtn.className = "run-btn";
      runBtn.title = "Run Command";

      const skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
          <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
        </svg>
      `;
      skipBtn.className = "skip-btn";
      skipBtn.title = "Skip Command";

      const out = document.createElement("div");
      out.className = "terminal-output";
      out.textContent = "Waiting for user approval..."; // Initial message

      controls.appendChild(runBtn);
      controls.appendChild(skipBtn);
      if (toolCall && toolCall.requestId)
        try {
          wrapper.dataset.requestId = toolCall.requestId;
        } catch {}
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
      wrapper.appendChild(controls);
      wrapper.appendChild(out);
      outerWrapper.appendChild(wrapper);

      // Wire actions
      runBtn.addEventListener("click", () => {
        try {
          out.textContent = "Running command...";
          runBtn.disabled = true;
          skipBtn.disabled = true;
          
          // Clear waiting state and show running state
          isWaitingForUserInput = false;
          setLoading(true, {}, "Executing command...");
          
          if (vscode)
            vscode.postMessage({
              command: "runTerminalCommand",
              toolCall,
              requestId: toolCall.requestId || String(Date.now()),
            });
        } catch (e) {
          console.error("runTerminalCommand post failed", e);
          out.textContent = "Failed to run command.";
          isWaitingForUserInput = false;
          setLoading(false);
        }
      });
      
      skipBtn.addEventListener("click", () => {
        try {
          out.textContent = "Command skipped by user.";
          runBtn.disabled = true;
          skipBtn.disabled = true;
          
          // Clear waiting state and continue
          isWaitingForUserInput = false;
          setLoading(false);
          
          if (vscode)
            vscode.postMessage({
              command: "skipTerminalCommand",
              toolCall,
              requestId: toolCall.requestId || String(Date.now()),
            });
        } catch (e) {
          console.error("skipTerminalCommand post failed", e);
          out.textContent = "Failed to skip command.";
          isWaitingForUserInput = false;
          setLoading(false);
        }
      });

      return { widget: outerWrapper }; // Return outer for consistent styling
    } catch (e) {
      console.error("createTerminalWidget failed", e);
      return null;
    }
  }

  // Helper to create a terminal confirmation widget for legacy mode
  function createTerminalConfirmationWidget(toolCall, todoId) {
    try {
      // Wrap in a structure like code-widget-wrapper for consistent margins/width
      const outerWrapper = document.createElement("div");
      outerWrapper.className = "code-widget-wrapper"; // Reuse for alignment

      const wrapper = document.createElement("div");
      wrapper.className = "terminal-tool-widget";

      // Header with terminal icon and label
      const header = document.createElement("div");
      header.className = "terminal-lang-label";
      header.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
          <path fill="currentColor" d="M20,19V7H4V19H20M20,3A2,2 0 0,1 22,5V19A2,2 0 0,1 20,21H4A2,2 0 0,1 2,19V5C2,3.89 2.9,3 4,3H20M13,17V15H18V17H13M9.58,13L5.57,9H8.4L11.7,12.3C12.09,12.69 12.09,13.33 11.7,13.72L8.42,17H5.59L9.58,13Z"/>
        </svg>
        Command
      `;

      const command =
        toolCall.args && toolCall.args.command
          ? String(toolCall.args.command)
          : toolCall.args && toolCall.args.cmd
          ? String(toolCall.args.cmd)
          : "";
      const pre = document.createElement("pre");
      pre.className = "terminal-cmd";
      pre.textContent = command;

      const controls = document.createElement("div");
      controls.className = "terminal-controls";

      const runBtn = document.createElement("button");
      runBtn.type = "button";
      runBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
          <path fill="currentColor" d="M8,5.14V19.14L19,12.14L8,5.14Z"/>
        </svg>
      `;
      runBtn.className = "run-btn";
      runBtn.title = "Run Command";

      const skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
          <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
        </svg>
      `;
      skipBtn.className = "skip-btn";
      skipBtn.title = "Skip Command";

      const out = document.createElement("div");
      out.className = "terminal-output";
      out.textContent = "Waiting for user approval..."; // Initial message

      controls.appendChild(runBtn);
      controls.appendChild(skipBtn);
      if (todoId)
        try {
          wrapper.dataset.requestId = todoId;
        } catch {}
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
      wrapper.appendChild(controls);
      wrapper.appendChild(out);
      outerWrapper.appendChild(wrapper);

      // Wire actions for confirmation
      runBtn.addEventListener("click", () => {
        try {
          out.textContent = "Executing command...";
          runBtn.disabled = true;
          skipBtn.disabled = true;

          // Send confirmation to extension
          if (vscode) {
            vscode.postMessage({
              command: "legacyModeConfirmationResponse",
              todoId: todoId,
              approved: true,
              feedback: null,
            });
          }
        } catch (e) {
          console.error("terminal confirmation approval failed", e);
          out.textContent = "Failed to approve command.";
        }
      });

      skipBtn.addEventListener("click", () => {
        try {
          out.textContent = "Command skipped by user.";
          runBtn.disabled = true;
          skipBtn.disabled = true;

          // Send confirmation to extension
          if (vscode) {
            vscode.postMessage({
              command: "legacyModeConfirmationResponse",
              todoId: todoId,
              approved: false,
              feedback: null,
            });
          }
        } catch (e) {
          console.error("terminal confirmation skip failed", e);
          out.textContent = "Failed to skip command.";
        }
      });

      return { widget: outerWrapper }; // Return outer for consistent styling
    } catch (e) {
      console.error("createTerminalConfirmationWidget failed", e);
      return null;
    }
  }

  // Create duality mode widget with model names and subtasks
  function createDualityModeWidget(
    subtasks,
    requestId,
    primaryModelId,
    secondaryModelId,
    primaryDecision
  ) {
    try {
      const wrapper = document.createElement("div");
      wrapper.className = "duality-mode-widget";
      wrapper.dataset.requestId = requestId || "";

      // Header with model information
      const header = document.createElement("div");
      header.className = "duality-mode-header";

      const icon = document.createElement("div");
      icon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/>
        </svg>
      `;

      const title = document.createElement("div");
      title.className = "duality-mode-title";
      // Use compact badges for primary and secondary models with small icons
      title.innerHTML = `
        <div class="duality-title">Duality Mode Execution</div>
        <div class="model-info badged">
          <div class="model-badge primary">
            <div class="model-icon"> 
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zm0 6l-8-4 8 4 8-4-8 4zm0 8l-8-4v6l8 4 8-4v-6l-8 4z"/></svg>
            </div>
            <div class="model-label">Primary</div>
            <div class="model-id" title="${primaryModelId}">${String(
        primaryModelId
      )
        .split("/")
        .pop()}</div>
          </div>
          <div class="model-badge secondary">
            <div class="model-icon"> 
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM11 6h2v6h-2zM11 14h2v2h-2z"/></svg>
            </div>
            <div class="model-label">Secondary</div>
            <div class="model-id" title="${secondaryModelId}">${String(
        secondaryModelId
      )
        .split("/")
        .pop()}</div>
          </div>
        </div>
      `;

      header.appendChild(icon);
      header.appendChild(title);

      // Primary decision display
      const decisionSection = document.createElement("div");
      decisionSection.className = "primary-decision-section";
      decisionSection.innerHTML = `
        <div class="decision-header">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
            <path fill="currentColor" d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
          </svg>
          <span>Primary Model Decision</span>
        </div>
        <div class="decision-content">
          <div class="decision-result ${
            primaryDecision.needsSubtasks ? "subdivide" : "direct"
          }">
            ${
              primaryDecision.needsSubtasks
                ? "Task will be subdivided into steps"
                : "Task will be executed directly"
            }
          </div>
          <div class="decision-reasoning">${primaryDecision.reasoning}</div>
        </div>
      `;

      // Progress indicator
      const progressIndicator = document.createElement("div");
      progressIndicator.className = "subtask-progress-indicator";

      const progressBar = document.createElement("div");
      progressBar.className = "subtask-progress-bar";

      const progressFill = document.createElement("div");
      progressFill.className = "subtask-progress-fill";
      progressFill.style.width = "0%";

      const progressText = document.createElement("span");
      progressText.className = "subtask-progress-text";
      progressText.textContent = `0/${subtasks.length}`;

      progressBar.appendChild(progressFill);
      progressIndicator.appendChild(progressBar);
      progressIndicator.appendChild(progressText);

      // Subtask list
      const subtaskList = document.createElement("div");
      subtaskList.className = "subtask-list";

      if (subtasks && Array.isArray(subtasks)) {
        subtasks.forEach((subtask, index) => {
          const item = document.createElement("div");
          item.className = "subtask-item";
          item.dataset.subtaskIndex = index;

          const status = document.createElement("div");
          status.className = "subtask-status pending";
          status.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z" opacity="0.3"/>
            </svg>
          `;

          const text = document.createElement("div");
          text.className = "subtask-text";
          text.textContent = subtask.displayText || `Step ${index + 1}`;

          const stepNumber = document.createElement("div");
          stepNumber.className = "subtask-step-number";
          stepNumber.textContent = `${index + 1}`;

          item.appendChild(stepNumber);
          item.appendChild(status);
          item.appendChild(text);
          subtaskList.appendChild(item);
        });
      }

      wrapper.appendChild(header);
      wrapper.appendChild(decisionSection);
      wrapper.appendChild(progressIndicator);
      wrapper.appendChild(subtaskList);

      return wrapper;
    } catch (e) {
      console.error("Error creating duality mode widget:", e);
      return null;
    }
  }

  // New simplified subtask widget inspired by terminal widget UI
  function createSubtaskWidget(subtasks, requestId) {
    try {
      const wrapper = document.createElement("div");
      wrapper.className = "subtask-widget";
      wrapper.dataset.requestId = requestId || "";

      const header = document.createElement("div");
      header.className = "subtask-header";

      const title = document.createElement("div");
      title.className = "subtask-title";
      title.textContent = `Subtasks (${subtasks.length})`;

      const actions = document.createElement("div");
      actions.className = "subtask-actions";

      header.appendChild(title);
      header.appendChild(actions);

      const list = document.createElement("div");
      list.className = "subtask-list";

      subtasks.forEach((st, idx) => {
        const item = document.createElement("div");
        item.className = "subtask-item pending";
        item.dataset.subtaskIndex = idx;

        const icon = document.createElement("div");
        icon.className = "subtask-status-icon";
        icon.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2A10 10 0 1 0 12 22A10 10 0 0 0 12 2Z" opacity="0.2"/></svg>
        `;

        const text = document.createElement("div");
        text.className = "subtask-text";
        text.textContent = st.displayText || `Step ${idx + 1}`;

        item.appendChild(icon);
        item.appendChild(text);
        list.appendChild(item);
      });

      const progWrap = document.createElement("div");
      progWrap.className = "subtask-progress";
      const progBar = document.createElement("div");
      progBar.className = "subtask-progress-bar";
      const progFill = document.createElement("div");
      progFill.className = "subtask-progress-fill";
      progBar.appendChild(progFill);
      const progText = document.createElement("div");
      progText.className = "subtask-progress-text small";
      progText.textContent = `0/${subtasks.length}`;
      progWrap.appendChild(progBar);
      progWrap.appendChild(progText);

      wrapper.appendChild(header);
      wrapper.appendChild(list);
      wrapper.appendChild(progWrap);

      return wrapper;
    } catch (e) {
      console.error("createSubtaskWidget failed", e);
      return null;
    }
  }

  // Create primary decision widget for simple tasks
  function createPrimaryDecisionWidget(
    requestId,
    primaryModelId,
    secondaryModelId,
    primaryDecision
  ) {
    try {
      const wrapper = document.createElement("div");
      wrapper.className = "primary-decision-widget";
      wrapper.dataset.requestId = requestId || "";

      // Header with model information
      const header = document.createElement("div");
      header.className = "duality-mode-header";

      const icon = document.createElement("div");
      icon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/>
        </svg>
      `;

      const title = document.createElement("div");
      title.className = "duality-mode-title";
      title.innerHTML = `
        <div class="duality-title">Duality Mode Analysis</div>
        <div class="model-info">
          <span class="primary-model">Primary: ${primaryModelId}</span>
          <span class="model-separator">•</span>
          <span class="secondary-model">Secondary: ${secondaryModelId}</span>
        </div>
      `;

      header.appendChild(icon);
      header.appendChild(title);

      // Primary decision display
      const decisionSection = document.createElement("div");
      decisionSection.className = "primary-decision-section";
      decisionSection.innerHTML = `
        <div class="decision-header">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
            <path fill="currentColor" d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
          </svg>
          <span>Primary Model Decision</span>
        </div>
        <div class="decision-content">
          <div class="decision-result ${
            primaryDecision.needsSubtasks ? "subdivide" : "direct"
          }">
            ${
              primaryDecision.needsSubtasks
                ? "Task will be subdivided into steps"
                : "Task will be executed directly"
            }
          </div>
          <div class="decision-reasoning">${primaryDecision.reasoning}</div>
          <div class="execution-note">Executing with primary model...</div>
        </div>
      `;

      wrapper.appendChild(header);
      wrapper.appendChild(decisionSection);

      return wrapper;
    } catch (error) {
      console.error("Error creating primary decision widget:", error);
      return null;
    }
  }

  // Legacy createSubtaskProgressWidget function for compatibility
  function createSubtaskProgressWidget(subtasks, requestId) {
    // This is now a wrapper that calls the new duality mode widget
    return createDualityModeWidget(subtasks, requestId, "Unknown", "Unknown", {
      needsSubtasks: true,
      reasoning: "Legacy widget",
    });
  }

  // Update subtask progress widget
  function updateSubtaskProgress(
    requestId,
    subtaskIndex,
    status,
    progressData
  ) {
    try {
      // Support both the detailed duality widget and the new simplified subtask-widget
      const widget = container.querySelector(
        `.duality-mode-widget[data-request-id="${String(
          requestId
        )}"], .subtask-progress-widget[data-request-id="${String(
          requestId
        )}"], .subtask-widget[data-request-id="${String(requestId)}"]`
      );
      if (!widget) return;

      const subtaskItem = widget.querySelector(
        `.subtask-item[data-subtask-index="${subtaskIndex}"]`
      );
      if (!subtaskItem) return;

      // For the legacy widget, the status element uses .subtask-status. For the new widget, we update the icon container.
      const statusEl =
        subtaskItem.querySelector(".subtask-status") ||
        subtaskItem.querySelector(".subtask-status-icon");
      if (!statusEl) return;

      // Remove old status classes
      statusEl.classList.remove(
        "pending",
        "in-progress",
        "completed",
        "failed"
      );
      subtaskItem.classList.remove(
        "pending",
        "in-progress",
        "completed",
        "failed"
      );

      // Add new status
      statusEl.classList.add(status);
      subtaskItem.classList.add(status);

      // Update status icon
      let iconSvg = "";
      switch (status) {
        case "pending":
          iconSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z" opacity="0.3"/>
            </svg>
          `;
          break;
        case "in-progress":
          iconSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z"/>
            </svg>
          `;
          break;
        case "completed":
          iconSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,16.5L6.5,12L7.91,10.59L11,13.67L16.59,8.09L18,9.5L11,16.5Z"/>
            </svg>
          `;
          break;
        case "failed":
          iconSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z"/>
            </svg>
          `;
          break;
      }
      // Update the inner HTML if applicable
      try {
        statusEl.innerHTML = iconSvg;
      } catch (e) {}

      // Update overall progress
      if (progressData) {
        const progressFill = widget.querySelector(".subtask-progress-fill");
        const progressText = widget.querySelector(".subtask-progress-text");

        if (progressFill && progressData.percentage !== undefined) {
          progressFill.style.width = `${progressData.percentage}%`;
        }

        if (
          progressText &&
          progressData.completed !== undefined &&
          progressData.total !== undefined
        ) {
          progressText.textContent = `${progressData.completed}/${progressData.total}`;
        }
      }

      // Track active duality subtasks so send-button remains disabled until all subtasks complete
      try {
        if (!activeDualitySubtasks[requestId]) {
          // initialize if possible
          activeDualitySubtasks[requestId] = {
            total: progressData.total || null,
            completed: progressData.completed || 0,
          };
        } else {
          if (progressData.total !== undefined)
            activeDualitySubtasks[requestId].total = progressData.total;
          if (progressData.completed !== undefined)
            activeDualitySubtasks[requestId].completed = progressData.completed;
        }

        // When a subtask is in-progress, show a more specific loading message
        if (status === "in-progress") {
          const total =
            activeDualitySubtasks[requestId].total || progressData.total || 0;
          const stepTextEl = widget.querySelector(
            `.subtask-item[data-subtask-index="${subtaskIndex}"] .subtask-text`
          );
          const stepText = stepTextEl
            ? (stepTextEl.textContent || stepTextEl.innerText || "").trim()
            : "";
          const loadingMsg = stepText
            ? `Executing: Step ${subtaskIndex + 1}/${total}: ${stepText}`
            : `Executing: Step ${subtaskIndex + 1}/${total}`;
          showLoadingState(loadingMsg);
          // Also ensure the global loading node shows the same short message
          try {
            setLoading(true, {}, loadingMsg);
          } catch (e) {}
        }

        // If completed equals total, finish this duality run
        if (
          activeDualitySubtasks[requestId] &&
          activeDualitySubtasks[requestId].total &&
          activeDualitySubtasks[requestId].completed >=
            activeDualitySubtasks[requestId].total
        ) {
          // mark completed and cleanup
          try {
            delete activeDualitySubtasks[requestId];
          } catch (e) {}
          // Only clear the loading/send-button state when all subtasks are done
          cleanupCurrentRequest();
          setLoading(false);
          markConversationEnded();
        }
      } catch (e) {
        /* ignore tracking errors */
      }

      // Scroll to keep widget visible
      widget.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {
      console.error("Error updating subtask progress:", e);
    }
  }

  // Test function for subtask widget (can be removed later)
  function testSubtaskWidget() {
    const testSubtasks = [
      { displayText: "Analyze project structure" },
      { displayText: "Generate implementation plan" },
      { displayText: "Create base components" },
    ];

    const widget = createSubtaskProgressWidget(testSubtasks, "test-123");
    if (widget && container) {
      const messageNode = appendMessage(
        "assistant",
        "",
        {},
        "test-widget",
        false
      );
      if (messageNode) {
        const textEl = messageNode.querySelector(".message-text");
        if (textEl) {
          textEl.appendChild(widget);

          // Test progress updates
          setTimeout(
            () =>
              updateSubtaskProgress("test-123", 0, "in-progress", {
                completed: 0,
                total: 3,
                percentage: 0,
              }),
            1000
          );
          setTimeout(
            () =>
              updateSubtaskProgress("test-123", 0, "completed", {
                completed: 1,
                total: 3,
                percentage: 33,
              }),
            2000
          );
          setTimeout(
            () =>
              updateSubtaskProgress("test-123", 1, "in-progress", {
                completed: 1,
                total: 3,
                percentage: 33,
              }),
            3000
          );
          setTimeout(
            () =>
              updateSubtaskProgress("test-123", 1, "completed", {
                completed: 2,
                total: 3,
                percentage: 67,
              }),
            4000
          );
          setTimeout(
            () =>
              updateSubtaskProgress("test-123", 2, "in-progress", {
                completed: 2,
                total: 3,
                percentage: 67,
              }),
            5000
          );
          setTimeout(
            () =>
              updateSubtaskProgress("test-123", 2, "completed", {
                completed: 3,
                total: 3,
                percentage: 100,
              }),
            6000
          );
        }
      }
    }
  }

  // Expose test function globally for debugging (can be removed later)
  window.testSubtaskWidget = testSubtaskWidget;

  // Listen for messages from extension host
  window.addEventListener("message", (ev) => {
    const msg = ev.data || {};
    const cmd = msg.command;
    console.debug("[webview-client] received message", cmd, msg);

    switch (cmd) {
      case "modelsResponse":
        try {
          console.debug("[webview-client] modelsResponse", msg.models);
          updateModelDropdown(msg.models || msg.modelsResponse || []);
        } catch (err) {
          console.error("modelsResponse handler error", err);
        }
        break;

      case "modesResponse":
        try {
          console.debug("[webview-client] modesResponse", msg.modes);
          updateModeList(msg.modes || []);
        } catch (err) {
          console.error("modesResponse handler error", err);
        }
        break;
      case "modesTaglines":
        try {
          modesTaglines = msg.taglines || {};
          updatePlaceholderVisibility();
        } catch (e) {
          console.error(e);
        }
        break;
      case "placeholderResources":
        try {
          placeholderIcon = msg.iconUri || "";
          console.debug(
            "[webview-client] Received placeholder icon URI:",
            placeholderIcon
          );
          updatePlaceholderVisibility();
        } catch (e) {
          console.error("Error handling placeholderResources:", e);
        }
        break;

      case "appendChatMessage":
        appendMessage(
          msg.role || "assistant",
          msg.text || "",
          msg.meta || {},
          msg.requestId
        );
        break;

      case "promptResponse": {
        try {
          const rid = msg.requestId;

          // Handle error responses
          if (msg.error) {
            if (currentRequestId === rid) {
              handleRequestError(rid, msg.error, {
                type: "response_error",
                recoverable: true,
              });
            }
            break;
          }

          // Handle successful responses
          const text =
            (msg.response && (msg.response.plain_text || msg.response.text)) ||
            msg.text ||
            "";
          const meta = (msg.response && msg.response.metadata) ||
            msg.meta || { model: msg.modelId, mode: msg.modeId };

          // Check for error in response data
          if (msg.response && msg.response.hasError) {
            if (currentRequestId === rid) {
              handleRequestError(rid, text || "Request failed", {
                type: msg.response.raw?.type || "execution_error",
                recoverable: msg.response.raw?.recoverable !== false,
              });
            }
            break;
          }

          const updated = rid ? updateAssistantNode(rid, text, meta) : null;
          if (!updated) {
            appendMessage("assistant", text, meta, rid);
          }

          if (msg.final || (msg.response && msg.response.done)) {
            // Clean up current request if this is our active request
            if (currentRequestId === rid) {
              cleanupCurrentRequest();
            }

            setLoading(false, meta);
            // Mark conversation as ended to show footer
            markConversationEnded();

            // Clear any error states on successful completion
            clearErrorWidgets();
          }
        } catch (e) {
          console.error("promptResponse error", e);
          if (msg.requestId && currentRequestId === msg.requestId) {
            handleRequestError(msg.requestId, "Failed to process response", {
              type: "client_error",
              recoverable: true,
            });
          }
        }
        break;
      }
      case "terminalCommandResult": {
        try {
          const req = msg.requestId;
          const output = msg.output || "";
          const success = msg.success !== false;
          
          // Clear waiting state
          isWaitingForUserInput = false;
          setLoading(false);
          
          // Clear any tool retry counters for this command
          clearToolCallRetries(req);
          
          // Find widget by data-request-id
          const widget = container.querySelector(
            `.terminal-tool-widget[data-request-id="${String(req)}"]`
          );
          if (widget) {
            const outEl = widget.querySelector(".terminal-output");
            const statusEl = widget.querySelector(".terminal-status");
            if (outEl) {
              outEl.textContent = output;
              outEl.className = `terminal-output ${success ? 'success' : 'error'}`;
            }
            if (statusEl) {
              statusEl.textContent = success 
                ? (output ? "Command completed." : "Command completed with no output.")
                : "Command failed.";
            }
          } else {
            // Fallback: append a message
            const statusText = success ? "Command result:" : "Command failed:";
            appendMessage("assistant", `${statusText}\n${output}`, {}, req);
          }

          // Notify extension that user input is complete
          if (vscode) {
            vscode.postMessage({
              command: "setWaitingForUserInput",
              waiting: false,
              requestId: req
            });
          }
        } catch (e) {
          console.error("terminalCommandResult handler failed", e);
          isWaitingForUserInput = false;
          setLoading(false);
        }
        break;
      }
      case "terminalCommandSkipped": {
        try {
          const req = msg.requestId;
          
          // Clear waiting state
          isWaitingForUserInput = false;
          setLoading(false);
          
          // Clear any tool retry counters for this command
          clearToolCallRetries(req);
          
          const widget = container.querySelector(
            `.terminal-tool-widget[data-request-id="${String(req)}"]`
          );
          if (widget) {
            const outEl = widget.querySelector(".terminal-output");
            const statusEl = widget.querySelector(".terminal-status");
            if (outEl) {
              outEl.textContent = "Command skipped by user.";
              outEl.className = "terminal-output skipped";
            }
            if (statusEl) statusEl.textContent = "Command skipped by user.";
          } else {
            appendMessage(
              "assistant",
              `User skipped running command.`,
              {},
              req
            );
          }

          // Notify extension that user input is complete
          if (vscode) {
            vscode.postMessage({
              command: "setWaitingForUserInput",
              waiting: false,
              requestId: req
            });
          }
        } catch (e) {
          console.error("terminalCommandSkipped handler failed", e);
          isWaitingForUserInput = false;
          setLoading(false);
        }
        break;
      }

      case "assistantMessage": {
        try {
          const rid = msg.requestId;
          const text = msg.text || "";
          const meta = msg.metadata || {};
          const toolsCalled = msg.tools_called || [];

          // Create assistant message with tools
          const updated = rid ? updateAssistantNode(rid, text, meta) : null;
          if (!updated) {
            const node = appendMessage("assistant", text, meta, rid);

            // Add terminal widgets for commands requiring confirmation
            if (node && toolsCalled.length > 0) {
              const textEl = node.querySelector(".message-text");
              if (textEl) {
                toolsCalled.forEach((tc, index) => {
                  if (
                    tc.requiresConfirmation &&
                    (tc.tool === "terminal_command" ||
                      tc.tool === "terminalcommand" ||
                      tc.tool === "execute_command")
                  ) {
                    const todoId = `terminal_${rid}_${index}`;
                    const tcCopy = Object.assign({}, tc);
                    tcCopy.requestId = todoId;
                    const tw = createTerminalConfirmationWidget(tcCopy, todoId);
                    if (tw && tw.widget) {
                      textEl.appendChild(tw.widget);
                    }
                  }
                });
              }
            }
          }
        } catch (e) {
          console.error("assistantMessage error", e);
        }
        break;
      }

      case "dualityModeError": {
        try {
          const rid = msg.requestId;
          const errorData = msg.errorData || {};

          console.warn("Duality mode error:", errorData);

          // Handle different types of errors
          switch (errorData.type) {
            case "primary_model_retry":
              showRetryIndicator(
                rid,
                errorData.message,
                errorData.retryAttempt,
                errorData.maxRetries
              );
              break;
            case "primary_model_fallback":
            case "fallback_success":
              showValidationMessage(errorData.message, "warning");
              break;
            case "configuration_error":
            case "complete_failure":
              if (currentRequestId === rid) {
                handleRequestError(rid, errorData.message, errorData);
              }
              break;
            default:
              if (currentRequestId === rid && !errorData.recoverable) {
                handleRequestError(rid, errorData.message, errorData);
              } else {
                showValidationMessage(errorData.message, "warning");
              }
              break;
          }
        } catch (e) {
          console.error("dualityModeError handler error", e);
        }
        break;
      }

      case "terminalConfirmationsComplete": {
        try {
          const rid = msg.requestId;
          const toolsCalled = msg.tools_called || [];

          // Update any existing terminal widgets with final results
          toolsCalled.forEach((tc, index) => {
            if (
              tc.tool === "terminal_command" ||
              tc.tool === "terminalcommand" ||
              tc.tool === "execute_command"
            ) {
              const todoId = `terminal_${rid}_${index}`;
              const widget = container.querySelector(
                `.terminal-tool-widget[data-request-id="${todoId}"]`
              );
              if (widget) {
                const outEl = widget.querySelector(".terminal-output");
                if (outEl) {
                  if (tc.skipped) {
                    outEl.textContent = "Command skipped by user.";
                  } else if (tc.success) {
                    outEl.textContent =
                      tc.output || "Command completed successfully.";
                  } else {
                    outEl.textContent = tc.error || "Command failed.";
                  }
                }
              }
            }
          });

          setLoading(false);
          markConversationEnded();
        } catch (e) {
          console.error("terminalConfirmationsComplete error", e);
        }
        break;
      }

      case "setLoading":
        setLoading(Boolean(msg.loading), msg.meta || {});
        break;

      case "clear":
        clearMessages();
        break;

      case "newChat":
        clearMessages();
        setSelectedModel("");
        setSelectedMode("");
        setSelectedPrimaryModel("");
        setSelectedSecondaryModel("");
        break;

      case "showNotification":
        showNotification(msg.text || "");
        break;

      case "clearWorkingStatus":
        setLoading(false);
        break;

      case "apiKeyChanged":
        console.log(
          "[webview-client] API key changed, requesting models refresh"
        );
        requestModelsAndModes(false);
        break;
      case "toolCallNotification": {
        try {
          const tc = msg.toolCall || {};
          const name = (tc.tool || "").toString().toLowerCase();
          const requestId = tc.requestId || msg.requestId || String(Date.now());

          // Handle different tool types
          if (
            name === "terminal_command" ||
            name === "terminalcommand" ||
            name === "execute_command"
          ) {
            // Check for existing widget to prevent duplicates
            const existingWidget = container.querySelector(
              `.terminal-tool-widget[data-request-id="${String(requestId)}"]`
            );
            if (existingWidget) {
              console.debug(
                "[webview-client] Skipping duplicate terminal widget for requestId:",
                requestId
              );
              break;
            }

            // Set waiting state - this prevents further LLM requests
            isWaitingForUserInput = true;
            setLoading(true, {}, "Waiting for user input...");

            // Find the latest assistant message to attach widget
            const assistantMsgs = container
              ? container.querySelectorAll(".assistant-message")
              : [];
            const node =
              assistantMsgs && assistantMsgs.length
                ? assistantMsgs[assistantMsgs.length - 1]
                : null;
            const tcCopy = Object.assign({}, tc);
            try {
              tcCopy.requestId = requestId;
            } catch {}
            const tw = createTerminalWidget(tcCopy);
            if (node && tw && tw.widget) {
              const textEl = node.querySelector(".message-text");
              if (textEl) textEl.appendChild(tw.widget);
              container.scrollTop = container.scrollHeight;
            } else if (tw && tw.widget) {
              const wrapperNode = document.createElement("div");
              wrapperNode.className =
                "assistant-message p-3 m-2 max-w-[70%] text-gray-100 rounded-lg";
              const textWrap = document.createElement("div");
              textWrap.className = "message-text";
              textWrap.appendChild(tw.widget);
              wrapperNode.appendChild(textWrap);
              container.appendChild(wrapperNode);
              container.scrollTop = container.scrollHeight;
            }

            // Notify extension that we're waiting for user input
            if (vscode) {
              vscode.postMessage({
                command: "setWaitingForUserInput",
                waiting: true,
                requestId: requestId
              });
            }
          } else if (name === "searchfile" || name === "searchfiles") {
            // Handle file search tool
            const args = tc.args || {};
            const query = args.q || args.query || args.pattern || "";
            const results = args.results || [];

            const searchWidget = createFileSearchWidget(query, results);
            if (searchWidget) {
              const assistantMsgs = container
                ? container.querySelectorAll(".assistant-message")
                : [];
              const node =
                assistantMsgs && assistantMsgs.length
                  ? assistantMsgs[assistantMsgs.length - 1]
                  : null;
              if (node) {
                const textEl = node.querySelector(".message-text");
                if (textEl) textEl.appendChild(searchWidget);
              }
            }
          } else if (
            name === "writefile" ||
            name === "write_file" ||
            name.includes("write")
          ) {
            // Handle file write tool
            const args = tc.args || {};
            const filePath =
              args.filePath ||
              args.path ||
              args.file ||
              args.target ||
              args.file_path;
            const newContent =
              args.content ||
              args.newContent ||
              args.proposed ||
              args.lines ||
              "";

            if (
              filePath &&
              (typeof newContent === "string" || Array.isArray(newContent))
            ) {
              const contentStr = Array.isArray(newContent)
                ? newContent.join("\n")
                : String(newContent);

              // Create file edit preview widget
              const editWidget = createFileEditWidget(
                filePath,
                contentStr,
                requestId
              );
              if (editWidget) {
                const assistantMsgs = container
                  ? container.querySelectorAll(".assistant-message")
                  : [];
                const node =
                  assistantMsgs && assistantMsgs.length
                    ? assistantMsgs[assistantMsgs.length - 1]
                    : null;
                if (node) {
                  const textEl = node.querySelector(".message-text");
                  if (textEl) textEl.appendChild(editWidget);
                }
              }

              // Forward to extension for processing with retry logic
              try {
                if (vscode) {
                  vscode.postMessage({
                    command: "tool.writeFile",
                    filePath,
                    newContent: contentStr,
                    requestId,
                  });
                }
              } catch (e) {
                console.error("forward tool.writeFile failed", e);
                
                // Check if we should retry this tool call
                if (shouldRetryToolCall(requestId, "writeFile")) {
                  const retryCount = toolCallRetries.get(`${requestId}_writeFile`) || 1;
                  showToolRetryWidget(requestId, "File Write", retryCount, maxRetryAttempts, e.message);
                  
                  // Retry after delay
                  setTimeout(() => {
                    try {
                      if (vscode) {
                        vscode.postMessage({
                          command: "tool.writeFile",
                          filePath,
                          newContent: contentStr,
                          requestId,
                        });
                      }
                    } catch (retryError) {
                      console.error("Retry tool.writeFile failed", retryError);
                      showErrorWidget({
                        title: "File Write Failed",
                        message: `Failed to write file after ${maxRetryAttempts} attempts: ${retryError.message}`,
                        type: "tool_failure",
                        requestId: requestId,
                        actions: [
                          { label: "Retry Manually", action: "retry" },
                          { label: "Cancel", action: "cancel" },
                        ],
                      });
                    }
                  }, TOOL_RETRY_DELAY);
                } else {
                  // Max retries exceeded
                  showErrorWidget({
                    title: "File Write Failed",
                    message: `Failed to write file after ${maxRetryAttempts} attempts: ${e.message}`,
                    type: "tool_failure",
                    requestId: requestId,
                    actions: [
                      { label: "Retry Manually", action: "retry" },
                      { label: "Cancel", action: "cancel" },
                    ],
                  });
                }
              }
            }
          }
        } catch (e) {
          console.error("toolCallNotification handler error", e);
        }
        break;
      }
      case "toolRetryAttempt": {
        try {
          const requestId = msg.requestId;
          const toolType = msg.toolType || "tool";
          const attempt = msg.attempt || 1;
          const maxAttempts = msg.maxAttempts || 3;
          const errorMessage = msg.error || "Tool call failed";

          showToolRetryWidget(requestId, toolType, attempt, maxAttempts, errorMessage);
        } catch (e) {
          console.error("toolRetryAttempt handler failed", e);
        }
        break;
      }

      case "tool.writeFile.response": {
        try {
          const action = msg.action || "";
          const path = msg.filePath || msg.path || "";
          const added = msg.added || 0;
          const removed = msg.removed || 0;
          const success = msg.success !== false;
          const finalFailure = msg.finalFailure || false;
          const maxRetriesExceeded = msg.maxRetriesExceeded || false;

          // Clear any retry widgets for this request
          if (msg.requestId) {
            const retryWidgets = container.querySelectorAll(
              `.tool-retry-widget[data-tool-call-id="${msg.requestId}"]`
            );
            retryWidgets.forEach(widget => widget.remove());
          }

          // Handle failures
          if (!success) {
            if (maxRetriesExceeded) {
              showErrorWidget({
                title: "File Write Failed",
                message: `Failed to write file after ${msg.maxAttempts || 3} attempts: ${msg.error}`,
                type: "tool_failure",
                requestId: msg.requestId,
                actions: [
                  { label: "Retry Manually", action: "retry" },
                  { label: "Cancel", action: "cancel" },
                ],
              });
            } else if (finalFailure) {
              showErrorWidget({
                title: "File Write Error",
                message: `File write failed: ${msg.error}`,
                type: "tool_failure",
                requestId: msg.requestId,
                actions: [
                  { label: "Retry", action: "retry" },
                  { label: "Cancel", action: "cancel" },
                ],
              });
            }
            return;
          }

          // Check if autopilot is enabled
          const autopilotToggle = document.getElementById("autopilot-toggle");
          const isAutopilot = autopilotToggle && autopilotToggle.checked;

          if (action === "autokept") {
            if (isAutopilot) {
              // In autopilot mode, just track the change for summary widget
              addFileChange(path, added, removed);
            } else {
              // Fallback message if not in autopilot mode
              appendMessage(
                "assistant",
                `Auto-applied changes to ${path}: +${added} -${removed}`,
                {},
                msg.requestId || null
              );
            }
          } else if (action === "kept") {
            if (isAutopilot) {
              // In autopilot mode, track for summary
              addFileChange(path, added, removed);
            } else {
              // Manual mode, show individual message
              appendMessage(
                "assistant",
                `Applied changes to ${path}: +${added} -${removed}`,
                {},
                msg.requestId || null
              );
            }
          } else if (action === "rejected") {
            // Always show rejection messages
            appendMessage(
              "assistant",
              `Rejected changes to ${path}`,
              {},
              msg.requestId || null
            );
          }
        } catch (e) {
          console.error("tool.writeFile.response handler failed", e);
        }
        break;
      }

      case "autoPilotChanged": {
        try {
          const enabled = Boolean(msg.enabled);
          const toggle = document.getElementById("autopilot-toggle");
          if (toggle) {
            toggle.checked = enabled;
            const track = document.getElementById("autopilot-track");
            const thumb = document.getElementById("autopilot-thumb");
            if (track && thumb) {
              if (enabled) {
                track.classList.add("bg-blue-600");
                track.classList.remove("bg-gray-600");
                thumb.style.transform = "translateX(20px)";
              } else {
                track.classList.remove("bg-blue-600");
                track.classList.add("bg-gray-600");
                thumb.style.transform = "translateX(0)";
              }
            }
          }
        } catch (e) {
          console.error("autoPilotChanged handler error", e);
        }
        break;
      }
      case "autoPilotTerminalChanged": {
        try {
          const enabled = Boolean(msg.enabled);
          const control = document.getElementById("autopilot-terminal-toggle");
          if (control) control.checked = enabled;
        } catch (e) {
          console.error("autoPilotTerminalChanged handler error", e);
        }
        break;
      }

      case "dualityModeSubtasksCreated": {
        try {
          const rid = msg.requestId;
          const subtasks = msg.subtasks || [];
          const primaryModelId = msg.primaryModelId;
          const secondaryModelId = msg.secondaryModelId;
          const primaryDecision = msg.primaryDecision;

          console.log("Duality Mode: Subtasks created", subtasks);

          // Prefer a simplified subtask widget inspired by the terminal widget
          const subtaskWidget = createSubtaskWidget(subtasks, rid);
          if (subtaskWidget) {
            const assistantMsgs = container
              ? container.querySelectorAll(".assistant-message")
              : [];
            let node =
              assistantMsgs && assistantMsgs.length
                ? assistantMsgs[assistantMsgs.length - 1]
                : null;
            if (!node) node = appendMessage("assistant", "", {}, rid);
            if (node) {
              const textEl = node.querySelector(".message-text");
              if (textEl) {
                textEl.appendChild(subtaskWidget);
                container.scrollTop = container.scrollHeight;
              }
            }
          } else {
            // Fallback to the more detailed duality widget
            const dualityWidget = createDualityModeWidget(
              subtasks,
              rid,
              primaryModelId,
              secondaryModelId,
              primaryDecision
            );
            if (dualityWidget) {
              const assistantMsgs = container
                ? container.querySelectorAll(".assistant-message")
                : [];
              let node =
                assistantMsgs && assistantMsgs.length
                  ? assistantMsgs[assistantMsgs.length - 1]
                  : null;
              if (!node) node = appendMessage("assistant", "", {}, rid);
              if (node) {
                const textEl = node.querySelector(".message-text");
                if (textEl) {
                  textEl.appendChild(dualityWidget);
                  container.scrollTop = container.scrollHeight;
                }
              }
            }
          }

          // Track that subtasks exist for this request and keep send-button/loading active
          try {
            activeDualitySubtasks[rid] = {
              total: subtasks.length || 0,
              completed: 0,
            };
            // Provide an initial loading message
            const initialMsg =
              subtasks.length > 0
                ? ``
                : "";
            showLoadingState(initialMsg);
            setLoading(true, {}, initialMsg);
          } catch (e) {
            /* ignore */
          }
        } catch (e) {
          console.error("dualityModeSubtasksCreated handler error", e);
        }
        break;
      }

      case "dualityModePrimaryDecision": {
        try {
          const rid = msg.requestId;
          const primaryModelId = msg.primaryModelId;
          const secondaryModelId = msg.secondaryModelId;
          const primaryDecision = msg.primaryDecision;

          console.log("Duality Mode: Primary decision", primaryDecision);

          // Create decision widget showing the primary model's analysis
          const decisionWidget = createPrimaryDecisionWidget(
            rid,
            primaryModelId,
            secondaryModelId,
            primaryDecision
          );
          if (decisionWidget) {
            // Find the latest assistant message or create one
            const assistantMsgs = container
              ? container.querySelectorAll(".assistant-message")
              : [];
            let node =
              assistantMsgs && assistantMsgs.length
                ? assistantMsgs[assistantMsgs.length - 1]
                : null;

            if (!node) {
              // Create a new assistant message for the decision
              node = appendMessage("assistant", "", {}, rid);
            }

            if (node) {
              const textEl = node.querySelector(".message-text");
              if (textEl) {
                textEl.appendChild(decisionWidget);
                container.scrollTop = container.scrollHeight;
              }
            }
          }
        } catch (e) {
          console.error("dualityModePrimaryDecision handler error", e);
        }
        break;
      }

      case "dualityModeProgress": {
        try {
          const rid = msg.requestId;
          const progressData = msg.progressData || {};

          console.log("Duality Mode: Progress update", progressData);
          // Update existing subtask progress widget
          if (progressData.type === "subtask_progress") {
            updateSubtaskProgress(
              rid,
              progressData.subtaskIndex,
              progressData.status,
              progressData
            );
          }

          // Keep the widget sticky and update messages inside the widget rather than posting global chat notifications
          if (progressData.type === "subtask_started") {
            // Ensure widget exists and update progress bar
            updateSubtaskProgress(rid, 0, "pending", {
              completed: 0,
              total: progressData.totalSubtasks,
              percentage: 0,
            });
          } else if (progressData.type === "subtask_progress") {
            // Update text/status in widget only
            updateSubtaskProgress(
              rid,
              progressData.subtaskIndex,
              progressData.status,
              progressData
            );
          } else if (progressData.type === "subtask_completed") {
            const completed = progressData.completed || 0;
            const failed = progressData.failed || 0;
            const total = progressData.totalSubtasks || 0;

            // Update final state inside the widget: show completion badge and final progress
            const widget = container.querySelector(
              `.duality-mode-widget[data-request-id="${String(rid)}"]`
            );
            if (widget) {
              const progressFill = widget.querySelector(
                ".subtask-progress-fill"
              );
              const progressText = widget.querySelector(
                ".subtask-progress-text"
              );
              if (progressFill)
                progressFill.style.width = `${progressData.percentage || 100}%`;
              if (progressText)
                progressText.textContent = `${completed}/${total}`;

              // Add a completion badge inside the widget header
              let badge = widget.querySelector(".duality-completion-badge");
              if (!badge) {
                badge = document.createElement("div");
                badge.className = "duality-completion-badge";
                badge.innerHTML = `
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  <span>${
                    failed === 0
                      ? "All subtasks completed"
                      : `${completed}/${total} completed (${failed} failed)`
                  }</span>
                `;
                widget.querySelector(".duality-mode-header") &&
                  widget
                    .querySelector(".duality-mode-header")
                    .appendChild(badge);
              } else {
                badge.querySelector("span") &&
                  (badge.querySelector("span").textContent =
                    failed === 0
                      ? "All subtasks completed"
                      : `${completed}/${total} completed (${failed} failed)`);
              }
            }

            // Clean up current request only if our tracking shows all subtasks done
            try {
              const tracking = activeDualitySubtasks[rid];
              const completed = progressData.completed || 0;
              const total =
                progressData.totalSubtasks || (tracking && tracking.total) || 0;

              if (tracking) {
                // update tracking then decide
                tracking.completed = completed;
                tracking.total = tracking.total || total;
              }

              const allDone =
                (tracking &&
                  tracking.total &&
                  tracking.completed >= tracking.total) ||
                (total && completed >= total);

              if (allDone) {
                try {
                  delete activeDualitySubtasks[rid];
                } catch (e) {}
                if (currentRequestId === rid) {
                  cleanupCurrentRequest();
                }
                setLoading(false);
                markConversationEnded();
              } else {
                // Still running - keep loading state visible but update text to final progress
                const loadingMsg = `Subtasks: ${completed}/${total}`;
                showLoadingState(loadingMsg);
                try {
                  setLoading(true, {}, loadingMsg);
                } catch (e) {}
              }
            } catch (e) {
              console.error("dualityModeProgress finalize error", e);
              // fallback: clear loading
              try {
                delete activeDualitySubtasks[rid];
              } catch (e) {}
              if (currentRequestId === rid) cleanupCurrentRequest();
              setLoading(false);
              markConversationEnded();
            }
          }
        } catch (e) {
          console.error("dualityModeProgress handler error", e);
        }
        break;
      }

      default:
        break;
    }
  });

  // Forward custom DOM events from header to host in case header-side postMessage doesn't work
  try {
    window.addEventListener("vsx-openApiKeySetup", () => {
      try {
        if (vscode) vscode.postMessage({ command: "openApiKeySetup" });
      } catch (e) {
        console.error("forward openApiKeySetup failed", e);
      }
    });
    window.addEventListener("vsx-setCerebrasReasoning", () => {
      try {
        if (vscode) vscode.postMessage({ command: "setCerebrasReasoning" });
      } catch (e) {
        console.error("forward setCerebrasReasoning failed", e);
      }
    });
    window.addEventListener("vsx-setDualitySubtaskMode", () => {
      try {
        if (vscode) vscode.postMessage({ command: "setDualitySubtaskMode" });
      } catch (e) {
        console.error("forward setDualitySubtaskMode failed", e);
      }
    });
  } catch (e) {
    console.error("Failed to attach vsx DOM event forwarders", e);
  }

  // Request initial models and modes lists from host with retry logic
  function requestModelsAndModes(isRetry = false) {
    console.log(
      `[webview-client] Requesting models and modes (attempt ${
        isRetry ? modelsRequestAttempts + 1 : 1
      })`
    );

    try {
      if (vscode) {
        console.debug("[webview-client] requesting models");
        vscode.postMessage({ command: "getModels" });
      }
    } catch (err) {
      console.error("getModels postMessage failed", err);
    }

    try {
      if (vscode) {
        console.debug("[webview-client] requesting modes");
        vscode.postMessage({ command: "getModes" });
      }
    } catch (err) {
      console.error("getModes postMessage failed", err);
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
  setTimeout(() => {
    try {
      updatePlaceholderVisibility();
    } catch (e) {}
  }, 500);

  // Optional: textarea wiring to post prompts to host
  const inputTa = document.getElementById("inputTextArea");
  if (inputTa && vscode) {
    inputTa.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        const text = inputTa.value.trim();
        if (!text) return;

        if (selectedMode === "duality") {
          if (!selectedPrimaryModel || !selectedSecondaryModel) {
            showNotification(
              "Please select both primary and secondary models for Duality mode"
            );
            return;
          }
        } else {
          if (!selectedModel) {
            showNotification(
              "Please select a model first or configure API keys"
            );
            return;
          }
        }

        const requestId =
          String(Date.now()) + Math.random().toString(36).slice(2, 8);

        if (selectedMode === "duality") {
          appendMessage(
            "user",
            text,
            {
              model: `${selectedPrimaryModel} + ${selectedSecondaryModel}`,
              mode: selectedMode,
            },
            requestId
          );
          setLoading(true, {
            model: `${selectedPrimaryModel} + ${selectedSecondaryModel}`,
            mode: selectedMode,
          });
        } else {
          appendMessage(
            "user",
            text,
            { model: selectedModel, mode: selectedMode },
            requestId
          );
          setLoading(true, { model: selectedModel, mode: selectedMode });
        }
        inputTa.value = "";
        // Reset textarea height
        inputTa.style.height = "auto";

        try {
          // Collect visible chat messages (role + text) from the DOM
          const chatNodes = [];
          try {
            const allNodes = [];
            if (container) {
              const children = Array.from(container.children || []);
              for (const c of children) {
                if (
                  c.classList &&
                  (c.classList.contains("user-message") ||
                    c.classList.contains("assistant-message"))
                ) {
                  allNodes.push(c);
                }
              }
            }
            for (const n of allNodes) {
              try {
                const role = n.classList.contains("user-message")
                  ? "user"
                  : "assistant";
                const textEl = n.querySelector(".message-text");
                const txt = textEl
                  ? textEl.innerText || textEl.textContent || ""
                  : "";
                if (txt && String(txt).trim().length)
                  chatNodes.push({ role, text: String(txt).trim() });
              } catch {}
            }
          } catch {}

          const messageData = {
            command: "sendPrompt",
            prompt: text,
            requestId,
            modeId: selectedMode,
            previous_chat_history: chatNodes,
          };

          if (selectedMode === "duality") {
            messageData.primaryModelId = selectedPrimaryModel;
            messageData.secondaryModelId = selectedSecondaryModel;
          } else {
            messageData.modelId = selectedModel;
          }

          vscode.postMessage(messageData);
        } catch (e) {
          console.error("postMessage failed", e);
          setLoading(false);
          showNotification("Failed to send message");
        }
      }
    });
  }

  // Send button integration
  const sendBtn = document.getElementById("send-btn");
  if (sendBtn && vscode) {
    sendBtn.addEventListener("click", () => {
      const inputTa = document.getElementById("inputTextArea");
      if (!inputTa) return;

      const text = inputTa.value.trim();
      if (!text) {
        showValidationMessage("Please enter a message", "warning");
        inputTa.focus();
        return;
      }

      // Clear any existing validation messages
      clearValidationMessage();

      // Comprehensive validation for Duality mode
      if (selectedMode === "duality") {
        if (!selectedPrimaryModel || selectedPrimaryModel.trim() === "") {
          showValidationMessage(
            "Please select a primary model for Duality mode",
            "error"
          );
          return;
        }
        if (!selectedSecondaryModel || selectedSecondaryModel.trim() === "") {
          showValidationMessage(
            "Please select a secondary model for Duality mode",
            "error"
          );
          return;
        }
        if (selectedPrimaryModel === selectedSecondaryModel) {
          showValidationMessage(
            "Primary and secondary models should be different for optimal results",
            "warning"
          );
          // Allow to continue but warn user
        }
      } else {
        if (!selectedModel || selectedModel.trim() === "") {
          showValidationMessage(
            "Please select a model first or configure API keys",
            "error"
          );
          return;
        }
      }

      // Check if already processing a request or waiting for user input
      if (loadingNode || isWaitingForUserInput) {
        showValidationMessage(
          isWaitingForUserInput 
            ? "Please complete the pending user action before sending a new request"
            : "Please wait for the current request to complete",
          "warning"
        );
        return;
      }

      const requestId =
        String(Date.now()) + Math.random().toString(36).slice(2, 8);

      // Show loading state immediately
      showLoadingState("Sending...");

      if (selectedMode === "duality") {
        appendMessage(
          "user",
          text,
          {
            model: `${selectedPrimaryModel} + ${selectedSecondaryModel}`,
            mode: selectedMode,
          },
          requestId
        );
        setLoading(true, {
          model: `${selectedPrimaryModel} + ${selectedSecondaryModel}`,
          mode: selectedMode,
        });
      } else {
        appendMessage(
          "user",
          text,
          { model: selectedModel, mode: selectedMode },
          requestId
        );
        setLoading(true, { model: selectedModel, mode: selectedMode });
      }

      // Clear input and reset height
      inputTa.value = "";
      inputTa.style.height = "auto";

      // Store current request for potential cancellation
      currentRequestId = requestId;
      currentRequestStartTime = Date.now();

      try {
        // Collect visible chat messages (role + text) from the DOM
        const chatNodes = [];
        try {
          const allNodes = [];
          if (container) {
            const children = Array.from(container.children || []);
            for (const c of children) {
              if (
                c.classList &&
                (c.classList.contains("user-message") ||
                  c.classList.contains("assistant-message"))
              ) {
                allNodes.push(c);
              }
            }
          }
          for (const n of allNodes) {
            try {
              const role = n.classList.contains("user-message")
                ? "user"
                : "assistant";
              const textEl = n.querySelector(".message-text");
              const txt = textEl
                ? textEl.innerText || textEl.textContent || ""
                : "";
              if (txt && String(txt).trim().length)
                chatNodes.push({ role, text: String(txt).trim() });
            } catch {}
          }
        } catch {}

        const messageData = {
          command: "sendPrompt",
          prompt: text,
          requestId,
          modeId: selectedMode,
          previous_chat_history: chatNodes,
        };

        if (selectedMode === "duality") {
          messageData.primaryModelId = selectedPrimaryModel;
          messageData.secondaryModelId = selectedSecondaryModel;
        } else {
          messageData.modelId = selectedModel;
        }

        // Set a timeout for the request
        const timeoutDuration = selectedMode === "duality" ? 300000 : REQUEST_TIMEOUT; // 5 min for duality, 2 min for others
        requestTimeout = setTimeout(() => {
          if (currentRequestId === requestId && !isWaitingForUserInput) {
            handleRequestTimeout(requestId);
          }
        }, timeoutDuration);

        vscode.postMessage(messageData);

        // Update loading state
        showLoadingState(
          selectedMode === "duality" ? "Analyzing task..." : "Processing..."
        );
      } catch (e) {
        console.error("postMessage failed", e);
        handleRequestError(requestId, "Failed to send message: " + e.message);
      }
    });
  }
})();
