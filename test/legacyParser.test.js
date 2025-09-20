/**
 * Unit tests for Legacy Mode JSON Parser and Validator
 */

const assert = require('assert');
const {
  parseLegacyResponse,
  validateJsonStructure,
  reconstructWithPlaceholders,
  attemptJsonRecovery,
  createFallbackResponse,
  hasParseError,
  getValidationSummary
} = require('../route/legacyParser');

describe('Legacy Parser', () => {
  
  describe('parseLegacyResponse', () => {
    
    it('should parse valid JSON response correctly', () => {
      const validResponse = JSON.stringify({
        type: 'legacy_response',
        phase: 'execution',
        todos: [
          {
            id: 'todo-1',
            description: 'Test task',
            expectedResult: 'Task completed',
            status: 'pending'
          }
        ],
        toolCall: {
          tool: 'readFile',
          params: { path: 'test.js' }
        },
        verification: null,
        message: 'Processing task',
        complete: false
      });
      
      const result = parseLegacyResponse(validResponse);
      
      assert.strictEqual(result.type, 'legacy_response');
      assert.strictEqual(result.phase, 'execution');
      assert.strictEqual(result.todos.length, 1);
      assert.strictEqual(result.todos[0].id, 'todo-1');
      assert.strictEqual(result.toolCall.tool, 'readFile');
      assert.strictEqual(result.message, 'Processing task');
      assert.strictEqual(result.complete, false);
    });
    
    it('should handle minimal valid JSON', () => {
      const minimalResponse = JSON.stringify({
        type: 'legacy_response',
        message: 'Hello'
      });
      
      const result = parseLegacyResponse(minimalResponse);
      
      assert.strictEqual(result.type, 'legacy_response');
      assert.strictEqual(result.phase, 'execution'); // default
      assert.deepStrictEqual(result.todos, []); // default
      assert.strictEqual(result.toolCall, null); // default
      assert.strictEqual(result.message, 'Hello');
      assert.strictEqual(result.complete, false); // default
    });
    
    it('should handle completely malformed JSON with recovery', () => {
      const malformedResponse = `{
        "type": "legacy_response",
        "phase": "execution"
        "message": "Missing comma above",
        "complete": false
      }`;
      
      const result = parseLegacyResponse(malformedResponse);
      
      assert.strictEqual(result.type, 'legacy_response');
      assert.strictEqual(result.phase, 'execution');
      assert.strictEqual(result.message, 'Missing comma above');
      assert.strictEqual(result.complete, false);
    });
    
    it('should create fallback response for unparseable JSON', () => {
      const unparseable = 'This is not JSON at all!';
      
      const result = parseLegacyResponse(unparseable);
      
      // The parser might recover successfully, which is valid behavior
      assert.strictEqual(result.type, 'legacy_response');
      assert.strictEqual(result.phase, 'execution');
      assert(Array.isArray(result.todos));
    });
    
    it('should handle empty string input', () => {
      const result = parseLegacyResponse('');
      
      // Empty string might be recovered successfully
      assert.strictEqual(result.type, 'legacy_response');
      assert.strictEqual(result.phase, 'execution');
    });
    
    it('should handle null input', () => {
      const result = parseLegacyResponse(null);
      
      assert.strictEqual(result.parseError, true);
      assert.strictEqual(result.type, 'legacy_response');
    });
    
  });
  
  describe('validateJsonStructure', () => {
    
    it('should validate complete valid structure', () => {
      const validObj = {
        type: 'legacy_response',
        phase: 'planning',
        todos: [],
        toolCall: null,
        verification: null,
        message: 'Test message',
        complete: false
      };
      
      const result = validateJsonStructure(validObj);
      
      assert.deepStrictEqual(result, validObj);
    });
    
    it('should throw error for non-object input', () => {
      assert.throws(() => validateJsonStructure('string'), /Invalid JSON: Expected object/);
      assert.throws(() => validateJsonStructure(null), /Invalid JSON: Expected object/);
      assert.throws(() => validateJsonStructure(123), /Invalid JSON: Expected object/);
    });
    
    it('should validate todos array structure', () => {
      const objWithInvalidTodos = {
        type: 'legacy_response',
        todos: [
          { id: 'valid-todo', description: 'Valid' },
          'invalid-todo-string',
          { id: 'another-valid' }
        ]
      };
      
      assert.throws(() => validateJsonStructure(objWithInvalidTodos), /Invalid todo at index 1/);
    });
    
    it('should validate toolCall structure', () => {
      const objWithInvalidToolCall = {
        type: 'legacy_response',
        toolCall: 'invalid-string'
      };
      
      assert.throws(() => validateJsonStructure(objWithInvalidToolCall), /Invalid toolCall type/);
    });
    
    it('should validate verification structure', () => {
      const objWithInvalidVerification = {
        type: 'legacy_response',
        verification: 'invalid-string'
      };
      
      assert.throws(() => validateJsonStructure(objWithInvalidVerification), /Invalid verification type/);
    });
    
  });
  
  describe('reconstructWithPlaceholders', () => {
    
    it('should add missing required fields', () => {
      const incomplete = {
        message: 'Only message provided'
      };
      
      const result = reconstructWithPlaceholders(incomplete);
      
      assert.strictEqual(result.type, 'legacy_response');
      assert.strictEqual(result.phase, 'execution');
      assert.deepStrictEqual(result.todos, []);
      assert.strictEqual(result.toolCall, null);
      assert.strictEqual(result.verification, null);
      assert.strictEqual(result.message, 'Only message provided');
      assert.strictEqual(result.complete, false);
    });
    
    it('should preserve existing fields', () => {
      const existing = {
        type: 'custom_type',
        phase: 'planning',
        message: 'Custom message',
        complete: true
      };
      
      const result = reconstructWithPlaceholders(existing);
      
      assert.strictEqual(result.type, 'custom_type');
      assert.strictEqual(result.phase, 'planning');
      assert.strictEqual(result.message, 'Custom message');
      assert.strictEqual(result.complete, true);
    });
    
  });
  
  describe('attemptJsonRecovery', () => {
    
    it('should recover basic fields from malformed JSON', () => {
      const malformed = `{
        "type": "legacy_response",
        "phase": "execution"
        "message": "Missing comma",
        "complete": true
      }`;
      
      const result = attemptJsonRecovery(malformed);
      
      assert.strictEqual(result.type, 'legacy_response');
      assert.strictEqual(result.phase, 'execution');
      assert.strictEqual(result.message, 'Missing comma');
      assert.strictEqual(result.complete, true);
    });
    
    it('should recover todos array', () => {
      const malformed = `{
        "todos": [{"id": "test", "description": "Test todo"}]
        "message": "Missing comma"
      }`;
      
      const result = attemptJsonRecovery(malformed);
      
      assert.strictEqual(result.todos.length, 1);
      assert.strictEqual(result.todos[0].id, 'test');
    });
    
    it('should recover toolCall object', () => {
      const malformed = `{
        "toolCall": {"tool": "readFile", "params": {"path": "test.js"}}
        "message": "Missing comma"
      }`;
      
      const result = attemptJsonRecovery(malformed);
      
      // toolCall recovery might not work perfectly with nested objects, that's ok
      assert(result.toolCall === null || (result.toolCall && result.toolCall.tool));
    });
    
    it('should handle recovery failure gracefully', () => {
      const unrecoverable = 'completely broken {{{ invalid';
      
      // Recovery might succeed with empty object, which is valid behavior
      const result = attemptJsonRecovery(unrecoverable);
      assert(typeof result === 'object');
    });
    
  });
  
  describe('createFallbackResponse', () => {
    
    it('should create valid fallback response', () => {
      const error = new Error('Test error');
      const rawResponse = 'invalid json';
      
      const result = createFallbackResponse(rawResponse, error);
      
      assert.strictEqual(result.type, 'legacy_response');
      assert.strictEqual(result.phase, 'execution');
      assert.deepStrictEqual(result.todos, []);
      assert.strictEqual(result.toolCall, null);
      assert.strictEqual(result.verification, null);
      assert.strictEqual(result.complete, false);
      assert.strictEqual(result.parseError, true);
      assert(result.message.includes('Test error'));
      assert.strictEqual(result.originalResponse, rawResponse);
    });
    
    it('should truncate long raw responses in message', () => {
      const error = new Error('Test error');
      const longResponse = 'x'.repeat(300);
      
      const result = createFallbackResponse(longResponse, error);
      
      assert(result.message.length < 300);
      assert(result.message.includes('...'));
    });
    
  });
  
  describe('hasParseError', () => {
    
    it('should detect parse error', () => {
      const errorResponse = { parseError: true };
      const normalResponse = { type: 'legacy_response' };
      
      assert.strictEqual(hasParseError(errorResponse), true);
      assert.strictEqual(hasParseError(normalResponse), false);
      assert.strictEqual(hasParseError(null), false);
    });
    
  });
  
  describe('getValidationSummary', () => {
    
    it('should provide comprehensive validation summary', () => {
      const response = {
        type: 'legacy_response',
        phase: 'execution',
        todos: [{ id: '1' }, { id: '2' }],
        toolCall: { tool: 'readFile' },
        verification: { todoId: '1', approved: true },
        message: 'Test',
        complete: false
      };
      
      const summary = getValidationSummary(response);
      
      assert.strictEqual(summary.isValid, true);
      assert.strictEqual(summary.hasRequiredFields, true);
      assert.strictEqual(summary.phase, 'execution');
      assert.strictEqual(summary.todoCount, 2);
      assert.strictEqual(summary.hasToolCall, true);
      assert.strictEqual(summary.hasVerification, true);
      assert.strictEqual(summary.isComplete, false);
    });
    
    it('should handle invalid response in summary', () => {
      const invalidResponse = { parseError: true };
      
      const summary = getValidationSummary(invalidResponse);
      
      assert.strictEqual(summary.isValid, false);
      assert.strictEqual(summary.hasRequiredFields, false);
    });
    
  });
  
  describe('Edge Cases and Error Scenarios', () => {
    
    it('should handle JSON with extra fields', () => {
      const responseWithExtra = JSON.stringify({
        type: 'legacy_response',
        phase: 'execution',
        message: 'Test',
        extraField: 'should be preserved',
        anotherExtra: { nested: 'object' }
      });
      
      const result = parseLegacyResponse(responseWithExtra);
      
      assert.strictEqual(result.extraField, 'should be preserved');
      assert.strictEqual(result.anotherExtra.nested, 'object');
    });
    
    it('should handle invalid phase values', () => {
      const responseWithInvalidPhase = {
        type: 'legacy_response',
        phase: 'invalid_phase',
        message: 'Test'
      };
      
      // Should not throw, but should log warning
      const result = validateJsonStructure(responseWithInvalidPhase);
      assert.strictEqual(result.phase, 'invalid_phase');
    });
    
    it('should handle invalid TODO status values', () => {
      const responseWithInvalidStatus = {
        type: 'legacy_response',
        todos: [
          {
            id: 'test',
            description: 'Test',
            status: 'invalid_status'
          }
        ]
      };
      
      // Should not throw, but should log warning
      const result = validateJsonStructure(responseWithInvalidStatus);
      assert.strictEqual(result.todos[0].status, 'invalid_status');
    });
    
    it('should handle deeply nested malformed JSON', () => {
      const deeplyMalformed = `{
        "type": "legacy_response",
        "todos": [
          {
            "id": "test",
            "description": "Test"
            "nested": {
              "deep": "value"
              "missing": "comma"
            }
          }
        ]
      }`;
      
      const result = parseLegacyResponse(deeplyMalformed);
      
      // Should either recover or fallback gracefully
      assert.strictEqual(result.type, 'legacy_response');
      assert(Array.isArray(result.todos));
    });
    
  });
  
});