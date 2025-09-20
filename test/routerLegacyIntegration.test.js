/**
 * Test suite for Legacy Mode Router Integration
 * Tests the integration between the router and Legacy Mode components
 */

const { createRouter } = require('../route/route');
const { contextManager } = require('../legacy/contextManager');

describe('Legacy Mode Router Integration', () => {
  let router;
  
  beforeEach(() => {
    router = createRouter();
    // Clear any existing sessions
    contextManager.clearAllSessions();
  });

  afterEach(() => {
    // Clean up sessions after each test
    contextManager.clearAllSessions();
  });

  describe('Legacy Mode Context Building', () => {
    test('should build Legacy Mode context with session information', () => {
      // Create a session
      const session = contextManager.createSession(
        'Test task for context building',
        'test-model',
        'test-request-123'
      );

      // Add some TODOs to the session
      session.addTodo({
        id: 'todo-1',
        description: 'First test TODO',
        expectedResult: 'Should complete successfully',
        status: 'pending'
      });

      session.addTodo({
        id: 'todo-2', 
        description: 'Second test TODO',
        expectedResult: 'Should also complete',
        status: 'done',
        result: 'Completed successfully'
      });

      // Build context using router function
      const context = router.buildLegacyModeContext(session.id, 'Continue with next step');
      
      expect(context).toBeTruthy();
      expect(context).toContain('Legacy Mode Context');
      expect(context).toContain(session.id);
      expect(context).toContain('Test task for context building');
      expect(context).toContain('First test TODO');
      expect(context).toContain('Second test TODO');
      expect(context).toContain('Continue with next step');
    });

    test('should return null for non-existent session', () => {
      const context = router.buildLegacyModeContext('non-existent-session', 'Test prompt');
      expect(context).toBeNull();
    });
  });

  describe('Legacy Mode Response Processing', () => {
    test('should process valid Legacy Mode JSON response', () => {
      const mockResponse = {
        text: JSON.stringify({
          type: 'legacy_response',
          phase: 'planning',
          message: 'Planning phase completed',
          todos: [
            {
              id: 'todo-1',
              description: 'Test TODO',
              expectedResult: 'Should work',
              status: 'pending'
            }
          ],
          toolCall: null,
          verification: null,
          complete: false
        }),
        raw: { test: 'raw response' }
      };

      const context = { sessionId: 'test-session' };
      const processed = router.processLegacyModeResponse(mockResponse, context);

      expect(processed.parseSuccess).toBe(true);
      expect(processed.legacyData).toBeTruthy();
      expect(processed.legacyData.type).toBe('legacy_response');
      expect(processed.legacyData.phase).toBe('planning');
      expect(processed.todos).toHaveLength(1);
      expect(processed.todos[0].description).toBe('Test TODO');
    });

    test('should handle malformed JSON gracefully', () => {
      const mockResponse = {
        text: '{ "type": "legacy_response", "phase": "execution", "message": "Malformed JSON',
        raw: { test: 'raw response' }
      };

      const context = { sessionId: 'test-session' };
      const processed = router.processLegacyModeResponse(mockResponse, context);

      expect(processed.parseSuccess).toBe(true); // Parser should recover gracefully
      expect(processed.legacyData).toBeTruthy();
      expect(processed.legacyData.type).toBe('legacy_response');
      expect(processed.legacyData.phase).toBe('execution');
    });

    test('should handle completely invalid response', () => {
      const mockResponse = {
        text: 'This is not JSON at all',
        raw: { test: 'raw response' }
      };

      const context = { sessionId: 'test-session' };
      const processed = router.processLegacyModeResponse(mockResponse, context);

      expect(processed.parseSuccess).toBe(true); // Fallback should work
      expect(processed.legacyData).toBeTruthy();
      expect(processed.legacyData.type).toBe('legacy_response');
      expect(processed.legacyData.message).toContain('This is not JSON at all');
    });
  });

  describe('Legacy Mode Session Management', () => {
    test('should create Legacy Mode session successfully', () => {
      const result = router.createLegacySession(
        'Test task for session creation',
        'test-model',
        'test-request-456'
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeTruthy();
      expect(result.session).toBeTruthy();
      expect(result.session.originalTask).toBe('Test task for session creation');
      expect(result.session.phase).toBe('planning');
    });

    test('should get existing Legacy Mode session', () => {
      // Create a session first
      const createResult = router.createLegacySession(
        'Test task for retrieval',
        'test-model',
        'test-request-789'
      );

      expect(createResult.success).toBe(true);

      // Now retrieve it
      const getResult = router.getLegacySession(createResult.sessionId);

      expect(getResult.success).toBe(true);
      expect(getResult.sessionId).toBe(createResult.sessionId);
      expect(getResult.context).toBeTruthy();
      expect(getResult.context.originalTask).toBe('Test task for retrieval');
    });

    test('should handle non-existent session gracefully', () => {
      const result = router.getLegacySession('non-existent-session');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session not found');
    });
  });

  describe('Enhanced runMode Function', () => {
    test('should enhance context for Legacy Mode', async () => {
      const mockContext = {
        modelId: 'test-model',
        prompt: 'Test prompt',
        requestId: 'test-request'
      };

      // Mock the Legacy Mode execute function
      const originalExecute = router.getModeById('legacy')?.execute;
      let enhancedContext = null;

      if (originalExecute) {
        const mockExecute = jest.fn((ctx) => {
          enhancedContext = ctx;
          return Promise.resolve({ text: 'Mock response' });
        });

        // Temporarily replace the execute function
        const legacyMode = router.getModeById('legacy');
        legacyMode.execute = mockExecute;

        try {
          await router.runMode('legacy', mockContext);
          
          expect(mockExecute).toHaveBeenCalled();
          expect(enhancedContext).toBeTruthy();
          expect(enhancedContext.router).toBeTruthy();
          expect(typeof enhancedContext.router.sendPrompt).toBe('function');
          expect(enhancedContext.router.contextManager).toBeTruthy();
        } finally {
          // Restore original execute function
          legacyMode.execute = originalExecute;
        }
      }
    });

    test('should work normally for non-Legacy modes', async () => {
      const mockContext = {
        modelId: 'test-model',
        prompt: 'Test prompt',
        requestId: 'test-request'
      };

      // Test with ask mode (should work normally)
      const askMode = router.getModeById('ask');
      if (askMode) {
        const originalExecute = askMode.execute;
        const mockExecute = jest.fn(() => Promise.resolve({ text: 'Ask mode response' }));
        
        askMode.execute = mockExecute;
        
        try {
          const result = await router.runMode('ask', mockContext);
          expect(mockExecute).toHaveBeenCalledWith(mockContext);
          expect(result.text).toBe('Ask mode response');
        } finally {
          askMode.execute = originalExecute;
        }
      }
    });
  });

  describe('Wrapped Prompt Building', () => {
    test('should build wrapped prompt with Legacy Mode context', () => {
      // Create a session
      const session = contextManager.createSession(
        'Test task for prompt building',
        'test-model',
        'test-request'
      );

      const userPrompt = 'Execute next step';
      const context = { sessionId: session.id };
      
      const wrappedPrompt = router.buildWrappedPrompt(userPrompt, 'legacy', context);
      
      expect(wrappedPrompt).toContain('Legacy Mode Context');
      expect(wrappedPrompt).toContain(session.id);
      expect(wrappedPrompt).toContain('Test task for prompt building');
      expect(wrappedPrompt).toContain('Execute next step');
      expect(wrappedPrompt).toContain('You are operating in Legacy Mode');
    });

    test('should build normal wrapped prompt for non-Legacy modes', () => {
      const userPrompt = 'Regular prompt';
      const wrappedPrompt = router.buildWrappedPrompt(userPrompt, 'ask');
      
      expect(wrappedPrompt).toContain('Regular prompt');
      expect(wrappedPrompt).not.toContain('Legacy Mode Context');
    });
  });
});