/**
 * Comprehensive Integration Tests for Legacy Mode Autonomous Execution
 * Tests end-to-end execution cycles, WebView integration, LLM integration, and error scenarios
 */

const { createRouter } = require('../route/route');
const { contextManager } = require('../legacy/contextManager');
const { TodoManager } = require('../legacy/todoManager');
const { ToolExecutor } = require('../legacy/toolExecutor');
const { VerificationSystem } = require('../legacy/verificationSystem');
const { parseLegacyResponse } = require('../route/legacyParser');

describe('Legacy Mode Integration Tests', () => {
  let router;
  let todoManager;
  let toolExecutor;
  let verificationSystem;
  
  beforeEach(() => {
    router = createRouter();
    todoManager = new TodoManager();
    toolExecutor = new ToolExecutor();
    verificationSystem = new VerificationSystem({ defaultTimeoutMs: 1000 });
    
    // Clear any existing sessions
    contextManager.clearAllSessions();
  });

  afterEach(() => {
    // Clean up sessions and resources
    contextManager.clearAllSessions();
    todoManager.clearAll();
    verificationSystem.cleanup();
  });

  describe('End-to-End Legacy Mode Execution Cycles', () => {
    test('should complete full planning-execution-verification cycle', async () => {
      // Step 1: Create session and initial planning
      const session = contextManager.createSession(
        'Create a simple configuration file with default settings',
        'test-model',
        'test-request-e2e-1'
      );

      expect(session).toBeTruthy();
      expect(session.phase).toBe('planning');

      // Step 2: Simulate LLM planning response
      const planningResponse = {
        type: 'legacy_response',
        phase: 'planning',
        message: 'I will break this task into manageable steps',
        todos: [
          {
            id: 'todo-1',
            description: 'Create config directory structure',
            expectedResult: 'Directory ./config should exist',
            status: 'pending'
          },
          {
            id: 'todo-2', 
            description: 'Create config.json with default values',
            expectedResult: 'File config.json should contain valid JSON with defaults',
            status: 'pending'
          }
        ],
        toolCall: null,
        verification: null,
        complete: false
      };

      // Process planning response
      const parsedPlanning = parseLegacyResponse(JSON.stringify(planningResponse));
      expect(parsedPlanning.parseSuccess).toBe(true);
      
      // Add TODOs to session
      planningResponse.todos.forEach(todo => {
        session.addTodo(todo);
      });
      
      session.updatePhase('execution');
      expect(session.todos).toHaveLength(2);

      // Step 3: Execute first TODO
      const firstTodo = session.todos[0];
      session.updateTodoStatus(firstTodo.id, 'in_progress');

      // Simulate tool execution for directory creation
      const dirResult = await toolExecutor.executeTool('createDirectory', { path: './config' });
      expect(dirResult.success).toBe(true);

      // Verify first TODO completion
      const firstVerification = await verificationSystem.requestVerification(
        firstTodo.id, 
        'Directory ./config created successfully'
      );
      expect(firstVerification.status).toBe('approved');
      
      session.updateTodoStatus(firstTodo.id, 'done');

      // Step 4: Execute second TODO
      const secondTodo = session.todos[1];
      session.updateTodoStatus(secondTodo.id, 'in_progress');

      // Simulate file creation
      const configData = JSON.stringify({ 
        environment: 'development',
        debug: true,
        port: 3000 
      }, null, 2);
      
      const fileResult = await toolExecutor.executeTool('writeFile', {
        path: './config/config.json',
        content: configData
      });
      expect(fileResult.success).toBe(true);

      // Verify second TODO completion
      const secondVerification = await verificationSystem.requestVerification(
        secondTodo.id,
        'Configuration file created with default settings'
      );
      expect(secondVerification.status).toBe('approved');
      
      session.updateTodoStatus(secondTodo.id, 'done');

      // Step 5: Complete the session
      session.updatePhase('complete');
      
      // Verify final state
      expect(session.phase).toBe('complete');
      expect(session.todos.every(todo => todo.status === 'done')).toBe(true);
      
      const stats = session.getStats();
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(0);
    });

    test('should handle complex multi-phase execution with tool calls', async () => {
      const session = contextManager.createSession(
        'Set up a Node.js project with package.json and basic structure',
        'test-model',
        'test-request-e2e-2'
      );

      // Planning phase
      const planningTodos = [
        {
          id: 'setup-1',
          description: 'Initialize package.json',
          expectedResult: 'Valid package.json file created',
          status: 'pending'
        },
        {
          id: 'setup-2',
          description: 'Create src directory and index.js',
          expectedResult: 'Basic project structure established',
          status: 'pending'
        },
        {
          id: 'setup-3',
          description: 'Install basic dependencies',
          expectedResult: 'Dependencies installed and node_modules created',
          status: 'pending'
        }
      ];

      planningTodos.forEach(todo => session.addTodo(todo));
      session.updatePhase('execution');

      // Execute each TODO with different tool types
      for (const todo of planningTodos) {
        session.updateTodoStatus(todo.id, 'in_progress');
        
        let toolResult;
        switch (todo.id) {
          case 'setup-1':
            // File creation tool
            toolResult = await toolExecutor.executeTool('writeFile', {
              path: './package.json',
              content: JSON.stringify({
                name: 'test-project',
                version: '1.0.0',
                main: 'src/index.js'
              }, null, 2)
            });
            break;
            
          case 'setup-2':
            // Multiple file operations
            await toolExecutor.executeTool('createDirectory', { path: './src' });
            toolResult = await toolExecutor.executeTool('writeFile', {
              path: './src/index.js',
              content: 'console.log("Hello, World!");'
            });
            break;
            
          case 'setup-3':
            // Terminal command execution
            toolResult = await toolExecutor.executeTool('executeCommand', {
              command: 'npm init -y',
              cwd: './'
            });
            break;
        }

        expect(toolResult.success).toBe(true);
        
        // Verify completion
        const verification = await verificationSystem.requestVerification(
          todo.id,
          `${todo.description} completed successfully`
        );
        expect(verification.status).toBe('approved');
        
        session.updateTodoStatus(todo.id, 'done');
      }

      session.updatePhase('complete');
      expect(session.todos.every(todo => todo.status === 'done')).toBe(true);
    });

    test('should handle iterative refinement and TODO updates', async () => {
      const session = contextManager.createSession(
        'Create and refine a configuration system',
        'test-model', 
        'test-request-e2e-3'
      );

      // Initial planning
      session.addTodo({
        id: 'config-1',
        description: 'Create basic config loader',
        expectedResult: 'Config loader function implemented',
        status: 'pending'
      });

      session.updatePhase('execution');

      // First iteration - basic implementation
      session.updateTodoStatus('config-1', 'in_progress');
      
      const basicConfig = `
function loadConfig() {
  return { debug: true };
}
module.exports = { loadConfig };
      `;

      await toolExecutor.executeTool('writeFile', {
        path: './configLoader.js',
        content: basicConfig
      });

      // Simulate LLM feedback requiring refinement
      const refinementVerification = await verificationSystem.requestVerification(
        'config-1',
        'Basic config loader created but needs environment variable support'
      );

      // Simulate manual rejection for refinement
      const pendingVerifications = verificationSystem.getAllPendingVerifications();
      if (pendingVerifications.length > 0) {
        verificationSystem.handleVerificationResponse(
          pendingVerifications[0].id,
          false,
          'Please add environment variable support and error handling'
        );
      }

      // Add refinement TODO
      session.addTodo({
        id: 'config-1-refined',
        description: 'Enhance config loader with environment variables',
        expectedResult: 'Config loader supports env vars and has error handling',
        status: 'pending'
      });

      // Execute refinement
      session.updateTodoStatus('config-1-refined', 'in_progress');
      
      const enhancedConfig = `
function loadConfig() {
  try {
    const config = {
      debug: process.env.DEBUG === 'true',
      port: process.env.PORT || 3000,
      environment: process.env.NODE_ENV || 'development'
    };
    return config;
  } catch (error) {
    console.error('Failed to load config:', error);
    return null;
  }
}
module.exports = { loadConfig };
      `;

      await toolExecutor.executeTool('writeFile', {
        path: './configLoader.js',
        content: enhancedConfig
      });

      const finalVerification = await verificationSystem.requestVerification(
        'config-1-refined',
        'Enhanced config loader with environment variables and error handling'
      );
      expect(finalVerification.status).toBe('approved');

      session.updateTodoStatus('config-1-refined', 'done');
      session.updateTodoStatus('config-1', 'done'); // Mark original as done too
      session.updatePhase('complete');

      expect(session.todos.filter(todo => todo.status === 'done')).toHaveLength(2);
    });
  });

  describe('WebView Integration with Mock User Interactions', () => {
    test('should handle WebView session management', () => {
      // Mock WebView provider methods
      const mockWebViewProvider = {
        sessions: new Map(),
        
        createLegacySession(task, modelId, requestId) {
          const session = contextManager.createSession(task, modelId, requestId);
          this.sessions.set(session.id, session);
          return { success: true, sessionId: session.id };
        },
        
        getLegacySession(sessionId) {
          const session = this.sessions.get(sessionId);
          return session ? { success: true, session } : { success: false };
        },
        
        updateSessionDisplay(sessionId, data) {
          const session = this.sessions.get(sessionId);
          if (session) {
            session.lastUpdate = data;
            return { success: true };
          }
          return { success: false };
        }
      };

      // Test session creation through WebView
      const createResult = mockWebViewProvider.createLegacySession(
        'WebView integration test task',
        'test-model',
        'webview-test-1'
      );

      expect(createResult.success).toBe(true);
      expect(createResult.sessionId).toBeTruthy();

      // Test session retrieval
      const getResult = mockWebViewProvider.getLegacySession(createResult.sessionId);
      expect(getResult.success).toBe(true);
      expect(getResult.session.originalTask).toBe('WebView integration test task');

      // Test session updates
      const updateResult = mockWebViewProvider.updateSessionDisplay(createResult.sessionId, {
        phase: 'execution',
        progress: 50,
        currentTodo: 'Processing files'
      });

      expect(updateResult.success).toBe(true);
      
      const updatedSession = mockWebViewProvider.getLegacySession(createResult.sessionId);
      expect(updatedSession.session.lastUpdate.phase).toBe('execution');
      expect(updatedSession.session.lastUpdate.progress).toBe(50);
    });

    test('should handle user confirmation workflows', async () => {
      // Mock user interaction handler
      const mockUserInteraction = {
        pendingConfirmations: new Map(),
        
        requestConfirmation(todoId, message, timeoutMs = 5000) {
          return new Promise((resolve) => {
            const confirmationId = `confirm-${Date.now()}`;
            this.pendingConfirmations.set(confirmationId, {
              todoId,
              message,
              resolve,
              timestamp: Date.now()
            });
            
            // Auto-approve after short delay for testing
            setTimeout(() => {
              this.handleUserResponse(confirmationId, true, 'Auto-approved for testing');
            }, 100);
          });
        },
        
        handleUserResponse(confirmationId, approved, feedback) {
          const confirmation = this.pendingConfirmations.get(confirmationId);
          if (confirmation) {
            confirmation.resolve({
              approved,
              feedback,
              confirmationId
            });
            this.pendingConfirmations.delete(confirmationId);
          }
        }
      };

      // Test confirmation workflow
      const todo = todoManager.createTodo(
        'User confirmation test',
        'Should handle user interaction properly'
      );

      const confirmationResult = await mockUserInteraction.requestConfirmation(
        todo.id,
        'Please confirm this TODO completion'
      );

      expect(confirmationResult.approved).toBe(true);
      expect(confirmationResult.feedback).toBe('Auto-approved for testing');
      expect(confirmationResult.confirmationId).toBeTruthy();
    });

    test('should handle WebView message passing', () => {
      // Mock WebView message system
      const mockMessageSystem = {
        messages: [],
        
        postMessage(type, data) {
          this.messages.push({
            type,
            data,
            timestamp: Date.now()
          });
        },
        
        handleMessage(message) {
          switch (message.type) {
            case 'legacy_session_create':
              return this.handleSessionCreate(message.data);
            case 'legacy_todo_confirm':
              return this.handleTodoConfirm(message.data);
            case 'legacy_session_status':
              return this.handleSessionStatus(message.data);
            default:
              return { success: false, error: 'Unknown message type' };
          }
        },
        
        handleSessionCreate(data) {
          const session = contextManager.createSession(data.task, data.modelId, data.requestId);
          this.postMessage('session_created', { sessionId: session.id });
          return { success: true, sessionId: session.id };
        },
        
        handleTodoConfirm(data) {
          this.postMessage('todo_confirmed', { 
            todoId: data.todoId, 
            approved: data.approved 
          });
          return { success: true };
        },
        
        handleSessionStatus(data) {
          const session = contextManager.getSession(data.sessionId);
          if (session) {
            this.postMessage('session_status', {
              sessionId: data.sessionId,
              phase: session.phase,
              todoCount: session.todos.length
            });
            return { success: true };
          }
          return { success: false, error: 'Session not found' };
        }
      };

      // Test message handling
      const createMessage = {
        type: 'legacy_session_create',
        data: {
          task: 'Message system test',
          modelId: 'test-model',
          requestId: 'msg-test-1'
        }
      };

      const createResult = mockMessageSystem.handleMessage(createMessage);
      expect(createResult.success).toBe(true);
      expect(createResult.sessionId).toBeTruthy();

      // Verify message was posted
      expect(mockMessageSystem.messages).toHaveLength(1);
      expect(mockMessageSystem.messages[0].type).toBe('session_created');

      // Test status request
      const statusMessage = {
        type: 'legacy_session_status',
        data: { sessionId: createResult.sessionId }
      };

      const statusResult = mockMessageSystem.handleMessage(statusMessage);
      expect(statusResult.success).toBe(true);
      expect(mockMessageSystem.messages).toHaveLength(2);
      expect(mockMessageSystem.messages[1].type).toBe('session_status');
    });
  });

  describe('LLM Integration with Mock Responses', () => {
    test('should handle various LLM response formats', () => {
      const testResponses = [
        // Valid complete response
        {
          input: JSON.stringify({
            type: 'legacy_response',
            phase: 'planning',
            message: 'Task analysis complete',
            todos: [
              {
                id: 'test-1',
                description: 'First task',
                expectedResult: 'Should work',
                status: 'pending'
              }
            ],
            toolCall: null,
            verification: null,
            complete: false
          }),
          expectedValid: true,
          expectedPhase: 'planning'
        },
        
        // Response with tool call
        {
          input: JSON.stringify({
            type: 'legacy_response',
            phase: 'execution',
            message: 'Executing file operation',
            todos: [],
            toolCall: {
              tool: 'writeFile',
              params: {
                path: './test.txt',
                content: 'Hello World'
              }
            },
            verification: null,
            complete: false
          }),
          expectedValid: true,
          expectedPhase: 'execution'
        },
        
        // Verification response
        {
          input: JSON.stringify({
            type: 'legacy_response',
            phase: 'verification',
            message: 'Verifying completion',
            todos: [],
            toolCall: null,
            verification: {
              todoId: 'test-1',
              approved: true,
              feedback: 'Looks good'
            },
            complete: false
          }),
          expectedValid: true,
          expectedPhase: 'verification'
        },
        
        // Completion response
        {
          input: JSON.stringify({
            type: 'legacy_response',
            phase: 'complete',
            message: 'All tasks completed successfully',
            todos: [],
            toolCall: null,
            verification: null,
            complete: true
          }),
          expectedValid: true,
          expectedPhase: 'complete'
        }
      ];

      testResponses.forEach((testCase, index) => {
        const parsed = parseLegacyResponse(testCase.input);
        
        expect(parsed.parseSuccess).toBe(testCase.expectedValid);
        if (testCase.expectedValid) {
          expect(parsed.legacyData.phase).toBe(testCase.expectedPhase);
          expect(parsed.legacyData.type).toBe('legacy_response');
        }
      });
    });

    test('should handle malformed LLM responses gracefully', () => {
      const malformedResponses = [
        // Incomplete JSON
        '{ "type": "legacy_response", "phase": "planning"',
        
        // Invalid JSON structure
        '{ type: legacy_response, phase: planning }',
        
        // Missing required fields
        '{ "type": "legacy_response" }',
        
        // Non-JSON response
        'This is just a regular text response from the LLM',
        
        // Empty response
        '',
        
        // Null response
        null
      ];

      malformedResponses.forEach((response, index) => {
        const parsed = parseLegacyResponse(response);
        
        // Parser should handle gracefully and provide fallback
        expect(parsed.parseSuccess).toBe(true);
        expect(parsed.legacyData).toBeTruthy();
        expect(parsed.legacyData.type).toBe('legacy_response');
        
        // Should have fallback message
        if (response && typeof response === 'string' && response.trim()) {
          expect(parsed.legacyData.message).toContain(response);
        }
      });
    });

    test('should integrate with router for LLM communication', async () => {
      // Mock LLM client
      const mockLLMClient = {
        responses: [
          // Planning response
          JSON.stringify({
            type: 'legacy_response',
            phase: 'planning',
            message: 'Breaking down the task',
            todos: [
              {
                id: 'llm-test-1',
                description: 'Create test file',
                expectedResult: 'File should exist',
                status: 'pending'
              }
            ],
            complete: false
          }),
          
          // Execution response
          JSON.stringify({
            type: 'legacy_response',
            phase: 'execution',
            message: 'Creating file',
            toolCall: {
              tool: 'writeFile',
              params: {
                path: './llm-test.txt',
                content: 'LLM integration test'
              }
            },
            complete: false
          }),
          
          // Completion response
          JSON.stringify({
            type: 'legacy_response',
            phase: 'complete',
            message: 'Task completed successfully',
            complete: true
          })
        ],
        
        currentResponse: 0,
        
        async sendPrompt(prompt, modelId) {
          const response = this.responses[this.currentResponse] || this.responses[this.responses.length - 1];
          this.currentResponse = Math.min(this.currentResponse + 1, this.responses.length - 1);
          
          return {
            text: response,
            raw: { model: modelId, prompt }
          };
        }
      };

      // Mock router with LLM integration
      const mockRouter = {
        ...router,
        
        async sendPrompt(prompt, modelId, context) {
          return await mockLLMClient.sendPrompt(prompt, modelId);
        }
      };

      // Test LLM integration flow
      const session = contextManager.createSession(
        'LLM integration test task',
        'test-model',
        'llm-test-1'
      );

      // Step 1: Planning
      const planningPrompt = router.buildLegacyModeContext(session.id, 'Plan this task');
      const planningResponse = await mockRouter.sendPrompt(planningPrompt, 'test-model');
      
      expect(planningResponse.text).toBeTruthy();
      
      const parsedPlanning = parseLegacyResponse(planningResponse.text);
      expect(parsedPlanning.parseSuccess).toBe(true);
      expect(parsedPlanning.legacyData.phase).toBe('planning');
      expect(parsedPlanning.todos).toHaveLength(1);

      // Step 2: Execution
      const executionPrompt = router.buildLegacyModeContext(session.id, 'Execute first TODO');
      const executionResponse = await mockRouter.sendPrompt(executionPrompt, 'test-model');
      
      const parsedExecution = parseLegacyResponse(executionResponse.text);
      expect(parsedExecution.parseSuccess).toBe(true);
      expect(parsedExecution.legacyData.phase).toBe('execution');
      expect(parsedExecution.legacyData.toolCall).toBeTruthy();

      // Step 3: Completion
      const completionPrompt = router.buildLegacyModeContext(session.id, 'Complete the task');
      const completionResponse = await mockRouter.sendPrompt(completionPrompt, 'test-model');
      
      const parsedCompletion = parseLegacyResponse(completionResponse.text);
      expect(parsedCompletion.parseSuccess).toBe(true);
      expect(parsedCompletion.legacyData.phase).toBe('complete');
      expect(parsedCompletion.legacyData.complete).toBe(true);
    });
  });  de
scribe('Error Scenario Tests for Graceful Degradation and Recovery', () => {
    test('should handle tool execution failures gracefully', async () => {
      const session = contextManager.createSession(
        'Error handling test task',
        'test-model',
        'error-test-1'
      );

      // Add TODO that will fail
      const failingTodo = {
        id: 'failing-todo',
        description: 'Write to protected file',
        expectedResult: 'File should be written',
        status: 'pending'
      };

      session.addTodo(failingTodo);
      session.updateTodoStatus(failingTodo.id, 'in_progress');

      // Mock tool executor with failure
      const mockFailingToolExecutor = {
        async executeTool(toolName, params) {
          if (toolName === 'writeFile' && params.path.includes('protected')) {
            return {
              success: false,
              error: 'Permission denied: Cannot write to protected file',
              errorCode: 'EACCES'
            };
          }
          return { success: true, result: 'Operation completed' };
        }
      };

      // Execute failing tool
      const result = await mockFailingToolExecutor.executeTool('writeFile', {
        path: '/protected/system.conf',
        content: 'test content'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');

      // Verify error handling
      session.updateTodoStatus(failingTodo.id, 'failed');
      session.addExecutionLog({
        type: 'error',
        todoId: failingTodo.id,
        error: result.error,
        timestamp: new Date().toISOString()
      });

      const failedTodo = session.getTodoById(failingTodo.id);
      expect(failedTodo.status).toBe('failed');

      // Test recovery - retry with corrected path
      const retryTodo = {
        id: 'retry-todo',
        description: 'Write to accessible file',
        expectedResult: 'File should be written successfully',
        status: 'pending'
      };

      session.addTodo(retryTodo);
      session.updateTodoStatus(retryTodo.id, 'in_progress');

      const retryResult = await mockFailingToolExecutor.executeTool('writeFile', {
        path: './accessible-file.txt',
        content: 'test content'
      });

      expect(retryResult.success).toBe(true);
      session.updateTodoStatus(retryTodo.id, 'done');

      // Verify recovery
      const stats = session.getStats();
      expect(stats.failed).toBe(1);
      expect(stats.completed).toBe(1);
    });

    test('should handle session timeout and cleanup', async () => {
      // Create session with short timeout
      const session = contextManager.createSession(
        'Timeout test task',
        'test-model',
        'timeout-test-1'
      );

      // Mock timeout configuration
      const originalTimeout = session.timeoutMs;
      session.timeoutMs = 100; // Very short timeout for testing

      // Add long-running TODO
      session.addTodo({
        id: 'long-todo',
        description: 'Long running operation',
        expectedResult: 'Should complete or timeout',
        status: 'pending'
      });

      session.updateTodoStatus('long-todo', 'in_progress');

      // Simulate timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Check if session should be considered timed out
      const isTimedOut = (Date.now() - new Date(session.startTime).getTime()) > session.timeoutMs;
      expect(isTimedOut).toBe(true);

      // Test cleanup
      const cleanupResult = contextManager.cleanupTimedOutSessions();
      expect(cleanupResult.cleaned).toBeGreaterThan(0);

      // Restore original timeout
      session.timeoutMs = originalTimeout;
    });

    test('should handle context corruption and recovery', () => {
      // Create session with valid context
      const session = contextManager.createSession(
        'Context corruption test',
        'test-model',
        'context-test-1'
      );

      // Add some TODOs and execution history
      session.addTodo({
        id: 'context-todo-1',
        description: 'First task',
        expectedResult: 'Should work',
        status: 'done'
      });

      session.addExecutionLog({
        type: 'tool_call',
        tool: 'writeFile',
        result: 'File created',
        timestamp: new Date().toISOString()
      });

      // Simulate context corruption
      const originalTodos = [...session.todos];
      session.todos = null; // Corrupt the todos

      // Test context recovery
      const contextBuilder = {
        buildSafeContext(session) {
          const safeContext = {
            sessionId: session.id,
            originalTask: session.originalTask || 'Unknown task',
            phase: session.phase || 'planning',
            todos: Array.isArray(session.todos) ? session.todos : [],
            executionLog: Array.isArray(session.executionLog) ? session.executionLog : [],
            startTime: session.startTime || new Date().toISOString()
          };
          return safeContext;
        }
      };

      const safeContext = contextBuilder.buildSafeContext(session);
      
      expect(safeContext.sessionId).toBe(session.id);
      expect(safeContext.todos).toEqual([]); // Should fallback to empty array
      expect(safeContext.phase).toBe(session.phase);

      // Restore from backup if available
      if (originalTodos) {
        session.todos = originalTodos;
        const restoredContext = contextBuilder.buildSafeContext(session);
        expect(restoredContext.todos).toHaveLength(1);
      }
    });

    test('should handle network failures and retry logic', async () => {
      let attemptCount = 0;
      const maxRetries = 3;

      // Mock network client with failures
      const mockNetworkClient = {
        async sendRequest(prompt, modelId) {
          attemptCount++;
          
          if (attemptCount <= 2) {
            throw new Error('Network timeout');
          }
          
          // Succeed on third attempt
          return {
            text: JSON.stringify({
              type: 'legacy_response',
              phase: 'planning',
              message: 'Request succeeded after retries',
              complete: false
            })
          };
        }
      };

      // Retry logic implementation
      const retryLogic = {
        async executeWithRetry(operation, maxRetries = 3, delayMs = 100) {
          let lastError;
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              return await operation();
            } catch (error) {
              lastError = error;
              
              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
              }
            }
          }
          
          throw lastError;
        }
      };

      // Test retry logic
      const result = await retryLogic.executeWithRetry(
        () => mockNetworkClient.sendRequest('test prompt', 'test-model'),
        maxRetries,
        10 // Short delay for testing
      );

      expect(result).toBeTruthy();
      expect(attemptCount).toBe(3); // Should have retried twice before succeeding
      
      const parsed = parseLegacyResponse(result.text);
      expect(parsed.parseSuccess).toBe(true);
      expect(parsed.legacyData.message).toContain('succeeded after retries');
    });

    test('should handle verification system failures', async () => {
      // Mock verification system with intermittent failures
      const mockVerificationSystem = {
        failureCount: 0,
        
        async requestVerification(todoId, result) {
          this.failureCount++;
          
          if (this.failureCount <= 2) {
            throw new Error('Verification service temporarily unavailable');
          }
          
          // Auto-approve after failures
          return {
            status: 'approved',
            autoApproved: true,
            message: 'Auto-approved due to verification service issues'
          };
        }
      };

      const todo = todoManager.createTodo(
        'Verification failure test',
        'Should handle verification failures'
      );

      // Test verification with fallback
      let verificationResult;
      try {
        verificationResult = await mockVerificationSystem.requestVerification(
          todo.id,
          'Task completed successfully'
        );
      } catch (error) {
        // First attempts should fail
        expect(error.message).toContain('temporarily unavailable');
        
        // Retry should succeed
        verificationResult = await mockVerificationSystem.requestVerification(
          todo.id,
          'Task completed successfully'
        );
      }

      expect(verificationResult.status).toBe('approved');
      expect(verificationResult.autoApproved).toBe(true);
    });

    test('should handle memory pressure and resource cleanup', () => {
      // Create multiple sessions to simulate memory pressure
      const sessions = [];
      const sessionCount = 100;

      for (let i = 0; i < sessionCount; i++) {
        const session = contextManager.createSession(
          `Memory test task ${i}`,
          'test-model',
          `memory-test-${i}`
        );
        
        // Add multiple TODOs to each session
        for (let j = 0; j < 10; j++) {
          session.addTodo({
            id: `todo-${i}-${j}`,
            description: `Task ${j} for session ${i}`,
            expectedResult: 'Should complete',
            status: 'pending'
          });
        }
        
        sessions.push(session);
      }

      // Check memory usage (simplified)
      const totalTodos = sessions.reduce((sum, session) => sum + session.todos.length, 0);
      expect(totalTodos).toBe(sessionCount * 10);

      // Test cleanup of old sessions
      const cutoffTime = Date.now() - (60 * 1000); // 1 minute ago
      
      const cleanupResult = contextManager.cleanupOldSessions(cutoffTime);
      expect(cleanupResult.cleaned).toBeGreaterThan(0);

      // Verify memory is freed
      const remainingSessions = contextManager.getAllSessions();
      expect(remainingSessions.length).toBeLessThan(sessionCount);
    });

    test('should handle concurrent session operations', async () => {
      const concurrentOperations = [];
      const operationCount = 10;

      // Create multiple concurrent sessions
      for (let i = 0; i < operationCount; i++) {
        const operation = async () => {
          const session = contextManager.createSession(
            `Concurrent task ${i}`,
            'test-model',
            `concurrent-${i}`
          );

          // Add TODOs concurrently
          session.addTodo({
            id: `concurrent-todo-${i}`,
            description: `Concurrent task ${i}`,
            expectedResult: 'Should handle concurrency',
            status: 'pending'
          });

          // Update status
          session.updateTodoStatus(`concurrent-todo-${i}`, 'in_progress');
          
          // Simulate some work
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
          
          session.updateTodoStatus(`concurrent-todo-${i}`, 'done');
          
          return session.id;
        };

        concurrentOperations.push(operation());
      }

      // Wait for all operations to complete
      const sessionIds = await Promise.all(concurrentOperations);
      
      expect(sessionIds).toHaveLength(operationCount);
      expect(sessionIds.every(id => typeof id === 'string')).toBe(true);

      // Verify all sessions were created successfully
      sessionIds.forEach(sessionId => {
        const session = contextManager.getSession(sessionId);
        expect(session).toBeTruthy();
        expect(session.todos).toHaveLength(1);
        expect(session.todos[0].status).toBe('done');
      });
    });

    test('should handle parser edge cases and malformed data', () => {
      const edgeCases = [
        // Deeply nested malformed JSON
        '{"type":"legacy_response","todos":[{"nested":{"deep":{"incomplete":',
        
        // Very large response
        JSON.stringify({
          type: 'legacy_response',
          message: 'x'.repeat(10000), // Very long message
          todos: Array(1000).fill(0).map((_, i) => ({
            id: `large-todo-${i}`,
            description: 'Large dataset test',
            status: 'pending'
          }))
        }),
        
        // Unicode and special characters
        JSON.stringify({
          type: 'legacy_response',
          message: '🚀 Task with emojis and unicode: ñáéíóú 中文 العربية',
          todos: [{
            id: 'unicode-todo',
            description: 'Handle unicode properly: 🔧⚡️💻',
            expectedResult: 'Should work with all characters',
            status: 'pending'
          }]
        }),
        
        // Circular reference (should be handled by JSON.stringify)
        (() => {
          const obj = { type: 'legacy_response', message: 'Circular test' };
          obj.circular = obj;
          try {
            return JSON.stringify(obj);
          } catch {
            return '{"type":"legacy_response","message":"Circular reference handled"}';
          }
        })(),
        
        // Mixed data types
        JSON.stringify({
          type: 'legacy_response',
          message: 123, // Number instead of string
          todos: 'not an array', // String instead of array
          complete: 'yes' // String instead of boolean
        })
      ];

      edgeCases.forEach((testCase, index) => {
        const parsed = parseLegacyResponse(testCase);
        
        // Should always parse successfully with fallbacks
        expect(parsed.parseSuccess).toBe(true);
        expect(parsed.legacyData).toBeTruthy();
        expect(parsed.legacyData.type).toBe('legacy_response');
        
        // Should handle data type mismatches gracefully
        expect(typeof parsed.legacyData.message).toBe('string');
        expect(Array.isArray(parsed.todos)).toBe(true);
      });
    });
  });

  describe('Performance and Stress Tests', () => {
    test('should handle large TODO lists efficiently', () => {
      const session = contextManager.createSession(
        'Large TODO list test',
        'test-model',
        'perf-test-1'
      );

      const startTime = Date.now();
      const todoCount = 1000;

      // Add many TODOs
      for (let i = 0; i < todoCount; i++) {
        session.addTodo({
          id: `perf-todo-${i}`,
          description: `Performance test TODO ${i}`,
          expectedResult: `Should complete efficiently ${i}`,
          status: 'pending'
        });
      }

      const addTime = Date.now() - startTime;
      expect(addTime).toBeLessThan(1000); // Should complete within 1 second

      // Test bulk status updates
      const updateStartTime = Date.now();
      
      for (let i = 0; i < todoCount; i++) {
        session.updateTodoStatus(`perf-todo-${i}`, 'done');
      }

      const updateTime = Date.now() - updateStartTime;
      expect(updateTime).toBeLessThan(2000); // Should complete within 2 seconds

      // Verify all TODOs were processed
      const stats = session.getStats();
      expect(stats.total).toBe(todoCount);
      expect(stats.completed).toBe(todoCount);
    });

    test('should handle rapid context building', () => {
      const session = contextManager.createSession(
        'Context building performance test',
        'test-model',
        'context-perf-1'
      );

      // Add substantial context
      for (let i = 0; i < 100; i++) {
        session.addTodo({
          id: `context-todo-${i}`,
          description: `Context building test TODO ${i}`,
          expectedResult: 'Should build context efficiently',
          status: i % 3 === 0 ? 'done' : 'pending'
        });

        session.addExecutionLog({
          type: 'tool_call',
          tool: 'testTool',
          params: { test: `param-${i}` },
          result: `Result ${i}`,
          timestamp: new Date().toISOString()
        });
      }

      // Test context building performance
      const buildStartTime = Date.now();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const context = router.buildLegacyModeContext(session.id, `Test prompt ${i}`);
        expect(context).toBeTruthy();
      }

      const buildTime = Date.now() - buildStartTime;
      expect(buildTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});