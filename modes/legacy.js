/**
 * @fileoverview Legacy Mode Autonomous Execution System
 * 
 * This module implements the core Legacy Mode functionality for autonomous task execution.
 * It provides structured JSON communication, TODO management, and comprehensive tooling
 * integration for complex development tasks.
 * 
 * @author Legacy Mode Development Team
 * @version 1.0.0
 * @since 2024-01-01
 */

const id = "legacy";
const name = "Legacy Mode";
const LegacyConfigManager = require('../legacy/configManager');

// JSON response schema for validation
const LEGACY_RESPONSE_SCHEMA = {
  type: "string",
  phase: "string", // planning|execution|verification|complete
  todos: "array",
  toolCall: "object",
  verification: "object", 
  message: "string",
  complete: "boolean"
};

// Wrapper configuration for Legacy Mode
const wrappers = {
  top: `You are operating in Legacy Mode - an autonomous execution system that breaks down complex tasks into manageable TODOs.

Your responses MUST be in valid JSON format following this schema:
{
  "type": "legacy_response",
  "phase": "planning|execution|verification|complete", 
  "todos": [
    {
      "id": "string",
      "description": "string",
      "expectedResult": "string", 
      "status": "pending|in_progress|done|failed",
      "toolCalls": []
    }
  ],
  "toolCall": {
    "tool": "string",
    "params": {}
  },
  "verification": {
    "todoId": "string", 
    "approved": "boolean",
    "feedback": "string"
  },
  "message": "string",
  "complete": "boolean"
}

Always respond with valid JSON. Break complex tasks into smaller TODOs during planning phase.`,
  
  bottom: "Remember: Your response must be valid JSON following the legacy_response schema. Focus on one phase at a time: planning, execution, verification, or completion.",
  
  fileHeader: "The following files are provided for context. Use them as reference when planning and executing tasks.\n\nFile contents are provided as a JSON array with {path, label, content} objects."
};

/**
 * Validates a JSON response against the Legacy Mode schema
 * @param {Object} jsonObj - The parsed JSON object to validate
 * @returns {Object} - Validation result with isValid flag and errors array
 */
function validateJsonStructure(jsonObj) {
  const errors = [];
  
  if (!jsonObj || typeof jsonObj !== 'object') {
    return { isValid: false, errors: ['Response must be a valid JSON object'] };
  }
  
  // Check required fields
  if (jsonObj.type !== 'legacy_response') {
    errors.push('Missing or invalid "type" field - must be "legacy_response"');
  }
  
  if (!jsonObj.phase || !['planning', 'execution', 'verification', 'complete'].includes(jsonObj.phase)) {
    errors.push('Missing or invalid "phase" field - must be one of: planning, execution, verification, complete');
  }
  
  // Validate todos array if present
  if (jsonObj.todos && !Array.isArray(jsonObj.todos)) {
    errors.push('"todos" must be an array');
  }
  
  // Validate toolCall if present
  if (jsonObj.toolCall && (typeof jsonObj.toolCall !== 'object' || !jsonObj.toolCall.tool)) {
    errors.push('"toolCall" must be an object with a "tool" property');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Parses and validates Legacy Mode JSON responses
 * @param {string} rawResponse - Raw response from LLM
 * @returns {Object} - Parsed and validated response object
 */
function parseLegacyResponse(rawResponse) {
  try {
    // Try to parse as JSON
    const jsonObj = JSON.parse(rawResponse);
    
    // Validate structure
    const validation = validateJsonStructure(jsonObj);
    
    if (!validation.isValid) {
      console.warn('Legacy Mode JSON validation failed:', validation.errors);
      // Return a fallback structure with placeholders
      return {
        type: "legacy_response",
        phase: jsonObj.phase || "execution",
        message: jsonObj.message || rawResponse,
        complete: jsonObj.complete || false,
        todos: jsonObj.todos || [],
        toolCall: jsonObj.toolCall || null,
        verification: jsonObj.verification || null,
        _validationErrors: validation.errors
      };
    }
    
    return jsonObj;
    
  } catch (parseError) {
    console.warn('Legacy Mode JSON parsing failed:', parseError.message);
    
    // Attempt to extract JSON from response using regex
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const extractedJson = JSON.parse(jsonMatch[0]);
        const validation = validateJsonStructure(extractedJson);
        
        if (validation.isValid) {
          return extractedJson;
        }
      } catch (extractError) {
        // Fall through to fallback
      }
    }
    
    // Return fallback structure
    return {
      type: "legacy_response", 
      phase: "execution",
      message: rawResponse,
      complete: false,
      todos: [],
      toolCall: null,
      verification: null,
      _parseError: parseError.message
    };
  }
}

/**
 * Main execute function for Legacy Mode
 * @param {Object} params - Execution parameters
 * @param {Object} params.router - Router instance for LLM communication
 * @param {string} params.modelId - Model ID to use
 * @param {string} params.prompt - User prompt/task
 * @param {string} params.requestId - Request ID for tracking
 * @param {Object} params.context - Additional context (optional)
 * @returns {Object} - Execution result
 */
async function execute({ router, modelId, prompt, requestId, context = {} }) {
  const { errorHandler, LegacyModeError, ERROR_CATEGORIES } = require('../legacy/errorHandler');
  const { performanceMonitor } = require('../legacy/performanceMonitor');
  const configManager = new LegacyConfigManager();
  
  const startTime = Date.now();
  
  // Check if Legacy Mode is enabled
  if (!configManager.isEnabled()) {
    throw new LegacyModeError("Legacy Mode is disabled in settings", {
      category: ERROR_CATEGORIES.VALIDATION,
      code: 'MODE_DISABLED',
      context: { modelId, requestId }
    });
  }
  
  // Validate configuration
  const configValidation = configManager.validateSettings();
  if (!configValidation.valid) {
    throw new LegacyModeError(`Invalid Legacy Mode configuration: ${configValidation.errors.join(', ')}`, {
      category: ERROR_CATEGORIES.VALIDATION,
      code: 'INVALID_CONFIG',
      context: { errors: configValidation.errors, modelId, requestId }
    });
  }
  
  if (!router) {
    throw new LegacyModeError("Router is required for Legacy Mode", {
      category: ERROR_CATEGORIES.VALIDATION,
      code: 'MISSING_ROUTER',
      context: { modelId, requestId }
    });
  }
  
  // Initialize sessionId outside the retry block
  let sessionId = context.sessionId;
  
  return await errorHandler.executeWithRetry(async () => {
    try {
      // Import required components
      const { contextManager } = require('../legacy/contextManager');
      const { TodoManager } = require('../legacy/todoManager');
      const { ToolExecutor } = require('../legacy/toolExecutor');
      const { parseLegacyResponse } = require('../route/legacyParser');
      
      // Initialize components with error handling
      const todoManager = new TodoManager();
      const toolExecutor = new ToolExecutor();
    
    // Check if this is a continuation of an existing session
    let session = null;
    
    if (sessionId) {
      session = contextManager.getSession(sessionId);
    }
    
    // If no existing session, create a new one
    if (!session) {
      // Extract text from prompt (handle both string and array formats)
      const promptText = Array.isArray(prompt) ? prompt[0] : prompt;
      session = contextManager.createSession(promptText, modelId, requestId);
      sessionId = session.id;
      
      // Import existing todos if provided in context
      if (context.todos && Array.isArray(context.todos)) {
        todoManager.importTodos(context.todos);
        session.todos = context.todos;
      }
    } else {
      // Restore todos from session
      if (session.todos && session.todos.length > 0) {
        todoManager.importTodos(session.todos);
      }
    }
    
    // Build context prompt for LLM
    const contextPrompt = contextManager.buildContextPrompt(sessionId);
    // Extract text from prompt (handle both string and array formats)
    const promptText = Array.isArray(prompt) ? prompt[0] : prompt;
    
    // If prompt is an array with files, include file information in context
    let fileContext = '';
    if (Array.isArray(prompt) && prompt[1] && prompt[1].__files && prompt[1].files) {
      const files = prompt[1].files;
      fileContext = `\n\nAttached Files:\n${files.map(f => `- ${f.label || f.path}: ${f.content ? f.content.substring(0, 500) + (f.content.length > 500 ? '...' : '') : 'No content'}`).join('\n')}\n`;
    }
    
    const fullPrompt = contextPrompt ? `${contextPrompt}${fileContext}\n\n${promptText}` : `${fileContext}${promptText}`;
    
    // Send prompt to LLM with Legacy Mode context
    const resp = await errorHandler.executeWithRetry(async () => {
      const response = await router.sendPrompt(modelId, fullPrompt, id, { sessionId });
      if (!response) {
        throw new LegacyModeError("No response received from LLM", {
          category: ERROR_CATEGORIES.NETWORK,
          code: 'NO_LLM_RESPONSE',
          context: { modelId, sessionId }
        });
      }
      return response;
    }, { maxAttempts: 3 });
    
    // Extract raw response with error handling
    let rawResponse = '';
    try {
      if (resp && typeof resp.text === 'string' && resp.text.length) {
        rawResponse = resp.text;
      } else if (resp && resp.raw !== undefined) {
        rawResponse = typeof resp.raw === 'string' ? resp.raw : JSON.stringify(resp.raw);
      } else if (resp && typeof resp === 'string') {
        rawResponse = resp;
      } else {
        throw new LegacyModeError("Invalid response format from LLM", {
          category: ERROR_CATEGORIES.PARSING,
          code: 'INVALID_RESPONSE_FORMAT',
          context: { response: resp }
        });
      }
    } catch (error) {
      if (error instanceof LegacyModeError) {
        throw error;
      }
      throw errorHandler.handleError(error, { context: 'response_extraction' });
    }
    
    // Parse and validate the Legacy Mode response with error handling
    const parsedResponse = await errorHandler.executeWithRetry(async () => {
      return parseLegacyResponse(rawResponse);
    }, { maxAttempts: 2, retryableErrors: [ERROR_CATEGORIES.PARSING] });
    
    // Process the response based on phase with error handling
    const result = await errorHandler.executeWithRetry(async () => {
      return await processLegacyResponse(parsedResponse, session, todoManager, toolExecutor, contextManager);
    }, { maxAttempts: 2 });
    
    // Update session with latest state
    try {
      session.todos = todoManager.exportTodos();
      contextManager.updateSession(sessionId, {
        phase: parsedResponse.phase,
        todos: session.todos
      });
    } catch (error) {
      const handledError = errorHandler.handleError(error, { context: 'session_update' });
      console.warn('Failed to update session state:', handledError.message);
      // Continue execution despite session update failure
    }
    
    // Record performance metrics
    const duration = Date.now() - startTime;
    performanceMonitor.recordRequest(duration, true);
    
    // Return structured response for the UI
    return {
      text: result.message || parsedResponse.message || 'Legacy Mode response processed',
      raw: resp && resp.raw !== undefined ? resp.raw : resp,
      legacyData: parsedResponse,
      phase: parsedResponse.phase,
      todos: parsedResponse.todos,
      toolCall: parsedResponse.toolCall,
      verification: parsedResponse.verification,
      complete: parsedResponse.complete,
      sessionId: sessionId,
      executionResult: result,
      performanceMetrics: {
        duration,
        timestamp: new Date().toISOString()
      }
    };
    
    } catch (error) {
      const handledError = errorHandler.handleError(error, { 
        context: 'legacy_mode_execution',
        modelId,
        requestId,
        sessionId
      });
      
      console.error('Legacy Mode execution error:', handledError.toJSON());
      
      // Record failed request
      const duration = Date.now() - startTime;
      performanceMonitor.recordRequest(duration, false);
      
      // Create recovery plan
      const recoveryPlan = errorHandler.createRecoveryPlan(handledError);
      
      return {
        text: `Legacy Mode error: ${handledError.userMessage}`,
        raw: null,
        legacyData: {
          type: "legacy_response",
          phase: "execution", 
          message: `Error: ${handledError.userMessage}`,
          complete: false,
          todos: [],
          toolCall: null,
          verification: null,
          _error: handledError.message,
          _errorCode: handledError.code,
          _errorCategory: handledError.category,
          _suggestions: handledError.suggestions
        },
        error: handledError.message,
        errorDetails: handledError.toJSON(),
        recoveryPlan: recoveryPlan
      };
    }
  }, {
    maxAttempts: 2,
    retryableErrors: [ERROR_CATEGORIES.NETWORK, ERROR_CATEGORIES.TIMEOUT]
  });
}

/**
 * Process Legacy Mode response based on phase and execute appropriate actions
 * @param {Object} parsedResponse - Parsed LLM response
 * @param {Object} session - Current session
 * @param {Object} todoManager - TODO manager instance
 * @param {Object} toolExecutor - Tool executor instance
 * @param {Object} contextManager - Context manager instance
 * @returns {Object} Processing result
 */
async function processLegacyResponse(parsedResponse, session, todoManager, toolExecutor, contextManager) {
  const { errorHandler, LegacyModeError, ERROR_CATEGORIES } = require('../legacy/errorHandler');
  const { phase } = parsedResponse;
  
  if (!phase || !['planning', 'execution', 'verification', 'complete'].includes(phase)) {
    throw new LegacyModeError(`Invalid or missing phase: ${phase}`, {
      category: ERROR_CATEGORIES.VALIDATION,
      code: 'INVALID_PHASE',
      context: { parsedResponse }
    });
  }
  
  session.addExecutionLogEntry({
    type: 'response_processed',
    phase,
    details: `Processing ${phase} phase response`
  });
  
  try {
    let result;
    
    switch (phase) {
      case 'planning':
        result = await errorHandler.executeWithRetry(async () => {
          return await processPlanningPhase(parsedResponse, session, todoManager, contextManager);
        });
        break;
      
      case 'execution':
        result = await errorHandler.executeWithRetry(async () => {
          return await processExecutionPhase(parsedResponse, session, todoManager, toolExecutor, contextManager);
        });
        break;
      
      case 'verification':
        result = await errorHandler.executeWithRetry(async () => {
          return await processVerificationPhase(parsedResponse, session, todoManager, contextManager);
        });
        break;
      
      case 'complete':
        result = await errorHandler.executeWithRetry(async () => {
          return await processCompletionPhase(parsedResponse, session, contextManager);
        });
        break;
      
      default:
        throw new LegacyModeError(`Unknown phase: ${phase}`, {
          category: ERROR_CATEGORIES.VALIDATION,
          code: 'UNKNOWN_PHASE',
          context: { phase, parsedResponse }
        });
    }
    
    return result;
    
  } catch (error) {
    const handledError = errorHandler.handleError(error, {
      context: 'phase_processing',
      phase,
      sessionId: session.id
    });
    
    session.addExecutionLogEntry({
      type: 'processing_error',
      phase,
      error: handledError.message,
      errorCode: handledError.code,
      errorCategory: handledError.category
    });
    
    return {
      success: false,
      message: `Error processing ${phase} phase: ${handledError.userMessage}`,
      error: handledError.message,
      errorDetails: handledError.toJSON(),
      suggestions: handledError.suggestions,
      recoverable: handledError.recoverable
    };
  }
}

/**
 * Process planning phase - handle TODO breakdown
 * @param {Object} parsedResponse - Parsed response
 * @param {Object} session - Current session
 * @param {Object} todoManager - TODO manager instance
 * @param {Object} contextManager - Context manager instance
 * @returns {Object} Processing result
 */
async function processPlanningPhase(parsedResponse, session, todoManager, contextManager) {
  const { todos, message } = parsedResponse;
  
  session.updatePhase('planning');
  
  // Process new TODOs if provided
  if (todos && Array.isArray(todos) && todos.length > 0) {
    // Clear existing TODOs and add new ones
    todoManager.clearAll();
    
    for (const todoData of todos) {
      if (todoData.description && todoData.expectedResult) {
        const todo = todoManager.createTodo(
          todoData.description, 
          todoData.expectedResult,
          todoData.id // Use custom ID from LLM response
        );
        
        // Update status if provided
        if (todoData.status && todoData.status !== 'pending') {
          todoManager.updateTodoStatus(todo.id, todoData.status);
        }
        
        session.addTodo(todo);
      }
    }
    
    session.addExecutionLogEntry({
      type: 'todos_created',
      count: todos.length,
      details: 'TODOs created from planning phase'
    });
  }
  
  return {
    success: true,
    message: message || 'Planning phase completed - TODOs have been created',
    phase: 'planning',
    todoCount: todoManager.getAllTodos().length
  };
}

/**
 * Process execution phase - handle tool calls and TODO execution
 * @param {Object} parsedResponse - Parsed response
 * @param {Object} session - Current session
 * @param {Object} todoManager - TODO manager instance
 * @param {Object} toolExecutor - Tool executor instance
 * @param {Object} contextManager - Context manager instance
 * @returns {Object} Processing result
 */
async function processExecutionPhase(parsedResponse, session, todoManager, toolExecutor, contextManager) {
  const { toolCall, message, todos } = parsedResponse;
  
  session.updatePhase('execution');
  
  let executionResult = {
    success: true,
    message: message || 'Execution phase in progress',
    phase: 'execution'
  };
  
  // Update TODOs if provided
  if (todos && Array.isArray(todos)) {
    for (const todoData of todos) {
      if (todoData.id) {
        const existingTodo = todoManager.getTodoById(todoData.id);
        if (existingTodo) {
          // Update existing TODO
          if (todoData.status) {
            todoManager.updateTodoStatus(todoData.id, todoData.status);
          }
          if (todoData.result && todoData.status === 'done') {
            todoManager.markTodoComplete(todoData.id, todoData.result);
          }
        }
      } else if (todoData.description && todoData.expectedResult) {
        // Create new TODO
        const todo = todoManager.createTodo(todoData.description, todoData.expectedResult);
        session.addTodo(todo);
      }
    }
  }
  
  // Execute tool call if provided
  if (toolCall && toolCall.tool) {
    const { errorHandler, LegacyModeError, ERROR_CATEGORIES } = require('../legacy/errorHandler');
    
    try {
      // Validate tool call structure
      if (!toolCall.tool || typeof toolCall.tool !== 'string') {
        throw new LegacyModeError("Invalid tool call: missing or invalid tool name", {
          category: ERROR_CATEGORIES.VALIDATION,
          code: 'INVALID_TOOL_CALL',
          context: { toolCall }
        });
      }
      
      // Execute tool with retry logic
      const toolResult = await errorHandler.executeWithRetry(async () => {
        return await toolExecutor.executeTool(
          toolCall.tool,
          toolCall.params || {},
          { sessionId: session.id }
        );
      }, {
        maxAttempts: 3,
        retryableErrors: [ERROR_CATEGORIES.NETWORK, ERROR_CATEGORIES.TIMEOUT, ERROR_CATEGORIES.SYSTEM]
      });
      
      session.addExecutionLogEntry({
        type: 'tool_executed',
        tool: toolCall.tool,
        success: toolResult.success,
        result: toolResult.success ? toolResult.result : toolResult.error,
        attempts: toolResult.attempts || 1
      });
      
      // Find current TODO and add tool call to it
      const currentTodo = todoManager.getNextPendingTodo() || 
                         todoManager.getTodosByStatus('in_progress')[0];
      
      if (currentTodo) {
        currentTodo.addToolCall(toolResult);
      }
      
      executionResult.toolResult = toolResult;
      
      if (toolResult.success) {
        executionResult.message = `Tool ${toolCall.tool} executed successfully`;
      } else {
        executionResult.success = false;
        executionResult.message = `Tool ${toolCall.tool} failed: ${toolResult.error?.message || 'Unknown error'}`;
        
        // Add recovery suggestions for tool failures
        if (toolResult.error && toolResult.error.suggestions) {
          executionResult.suggestions = toolResult.error.suggestions;
        }
      }
      
    } catch (error) {
      const handledError = errorHandler.handleError(error, {
        context: 'tool_execution',
        tool: toolCall.tool,
        params: toolCall.params,
        sessionId: session.id
      });
      
      session.addExecutionLogEntry({
        type: 'tool_error',
        tool: toolCall.tool,
        error: handledError.message,
        errorCode: handledError.code,
        errorCategory: handledError.category
      });
      
      executionResult.success = false;
      executionResult.message = `Tool execution failed: ${handledError.userMessage}`;
      executionResult.error = handledError.message;
      executionResult.errorDetails = handledError.toJSON();
      executionResult.suggestions = handledError.suggestions;
      executionResult.recoverable = handledError.recoverable;
    }
  }
  
  return executionResult;
}

/**
 * Process verification phase - handle TODO completion verification
 * @param {Object} parsedResponse - Parsed response
 * @param {Object} session - Current session
 * @param {Object} todoManager - TODO manager instance
 * @param {Object} contextManager - Context manager instance
 * @returns {Object} Processing result
 */
async function processVerificationPhase(parsedResponse, session, todoManager, contextManager) {
  const { verification, message } = parsedResponse;
  
  session.updatePhase('verification');
  
  let verificationResult = {
    success: true,
    message: message || 'Verification phase in progress',
    phase: 'verification'
  };
  
  // Process verification if provided
  if (verification && verification.todoId) {
    const todo = todoManager.getTodoById(verification.todoId);
    
    if (todo) {
      if (verification.approved === true) {
        // Mark TODO as complete
        const result = verification.feedback || 'Verification approved';
        todoManager.markTodoComplete(verification.todoId, result);
        
        session.addExecutionLogEntry({
          type: 'todo_verified',
          todoId: verification.todoId,
          approved: true,
          feedback: verification.feedback
        });
        
        verificationResult.message = `TODO ${verification.todoId} verified and completed`;
        
      } else if (verification.approved === false) {
        // Mark TODO as failed or reset to pending for retry
        const feedback = verification.feedback || 'Verification failed';
        
        if (verification.retry !== false) {
          // Reset to pending for retry
          todoManager.updateTodoStatus(verification.todoId, 'pending');
          verificationResult.message = `TODO ${verification.todoId} needs retry: ${feedback}`;
        } else {
          // Mark as failed
          todoManager.markTodoFailed(verification.todoId, feedback);
          verificationResult.message = `TODO ${verification.todoId} marked as failed: ${feedback}`;
        }
        
        session.addExecutionLogEntry({
          type: 'todo_verification_failed',
          todoId: verification.todoId,
          approved: false,
          feedback: verification.feedback,
          retry: verification.retry !== false
        });
      }
    } else {
      verificationResult.success = false;
      verificationResult.message = `TODO ${verification.todoId} not found for verification`;
    }
  }
  
  return verificationResult;
}

/**
 * Process completion phase - finalize execution
 * @param {Object} parsedResponse - Parsed response
 * @param {Object} session - Current session
 * @param {Object} contextManager - Context manager instance
 * @returns {Object} Processing result
 */
async function processCompletionPhase(parsedResponse, session, contextManager) {
  const { message, complete } = parsedResponse;
  
  session.updatePhase('complete');
  
  session.addExecutionLogEntry({
    type: 'execution_completed',
    complete: complete === true,
    details: 'Legacy Mode execution completed'
  });
  
  return {
    success: true,
    message: message || 'Legacy Mode execution completed successfully',
    phase: 'complete',
    complete: complete === true,
    sessionId: session.id
  };
}

/**
 * Create TODO breakdown from task description
 * @param {string} task - Task description
 * @param {Object} context - Execution context
 * @returns {Promise<Array>} Array of TODO objects
 */
async function createTodoList(task, context) {
  // This function would typically call the LLM to break down the task
  // For now, return a basic structure that can be enhanced
  return [
    {
      id: `todo_${Date.now()}_1`,
      description: `Analyze and break down: ${task}`,
      expectedResult: 'Task broken down into actionable steps',
      status: 'pending'
    }
  ];
}

/**
 * Execute TODO loop - main autonomous execution logic
 * @param {Array} todos - Array of TODOs to execute
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Execution result
 */
async function executeTodoLoop(todos, context) {
  const results = [];
  
  for (const todo of todos) {
    if (todo.status === 'pending') {
      try {
        // Mark as in progress
        todo.status = 'in_progress';
        
        // Execute TODO (this would involve LLM calls and tool execution)
        const result = await executeSingleTodo(todo, context);
        
        // Mark as done if successful
        if (result.success) {
          todo.status = 'done';
          todo.result = result.message;
        } else {
          todo.status = 'failed';
          todo.result = result.error;
        }
        
        results.push(result);
        
      } catch (error) {
        todo.status = 'failed';
        todo.result = error.message;
        results.push({
          success: false,
          error: error.message,
          todoId: todo.id
        });
      }
    }
  }
  
  return {
    success: results.every(r => r.success),
    results,
    completedCount: results.filter(r => r.success).length,
    totalCount: results.length
  };
}

/**
 * Execute a single TODO
 * @param {Object} todo - TODO to execute
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Execution result
 */
async function executeSingleTodo(todo, context) {
  // Placeholder implementation - would involve LLM calls and tool execution
  return {
    success: true,
    message: `TODO ${todo.id} executed successfully`,
    todoId: todo.id
  };
}

/**
 * Verify completion of TODOs
 * @param {Array} todos - Array of TODOs to verify
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Verification result
 */
async function verifyCompletion(todos) {
  const completedTodos = todos.filter(t => t.status === 'done');
  const failedTodos = todos.filter(t => t.status === 'failed');
  const pendingTodos = todos.filter(t => t.status === 'pending' || t.status === 'in_progress');
  
  return {
    allComplete: pendingTodos.length === 0 && failedTodos.length === 0,
    completedCount: completedTodos.length,
    failedCount: failedTodos.length,
    pendingCount: pendingTodos.length,
    totalCount: todos.length,
    completionRate: todos.length > 0 ? (completedTodos.length / todos.length) * 100 : 0
  };
}

module.exports = { 
  id, 
  name, 
  execute, 
  wrappers,
  parseLegacyResponse,
  validateJsonStructure,
  LEGACY_RESPONSE_SCHEMA,
  processLegacyResponse,
  processPlanningPhase,
  processExecutionPhase,
  processVerificationPhase,
  processCompletionPhase,
  createTodoList,
  executeTodoLoop,
  verifyCompletion
};