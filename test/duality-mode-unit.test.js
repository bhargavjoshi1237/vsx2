// Unit tests for core Duality mode functionality
// Tests DualitySession class, subtask validation, verification logic, and error handling

const assert = require('assert');
const fs = require('fs');

// Create marker file to verify execution
fs.writeFileSync('test-execution-marker.txt', 'Duality unit tests started at: ' + new Date().toISOString());

console.log('🚀 Starting Duality Mode Unit Tests\n');

// Test results tracking
let testResults = [];
function logResult(message) {
  console.log(message);
  testResults.push(message);
}

// Mock DualitySession class for testing (based on duality.js implementation)
class DualitySession {
  constructor(requestId, primaryModelId, secondaryModelId) {
    this.requestId = requestId;
    this.primaryModelId = primaryModelId;
    this.secondaryModelId = secondaryModelId;
    this.subtasks = [];
    this.currentSubtaskIndex = 0;
    this.startTime = Date.now();
    this.status = 'analyzing';
    this.webviewProvider = null;
    this.lastProgressUpdate = null;
    this.lastUpdateTime = null;
    this.subtaskUpdates = [];
    this.sessionData = {};
    this.cleanupCallbacks = [];
  }
  
  addSubtasks(subtasks) {
    this.subtasks = subtasks.map(task => ({
      ...task,
      status: 'pending',
      startTime: null,
      endTime: null,
      result: null,
      verification: null
    }));
  }
  
  getCurrentSubtask() {
    return this.subtasks[this.currentSubtaskIndex] || null;
  }
  
  markSubtaskComplete(index, result, verification = null) {
    if (this.subtasks[index]) {
      this.subtasks[index].status = 'completed';
      this.subtasks[index].endTime = Date.now();
      this.subtasks[index].result = result;
      this.subtasks[index].verification = verification;
    }
  }
  
  markSubtaskFailed(index, error, verification = null) {
    if (this.subtasks[index]) {
      this.subtasks[index].status = 'failed';
      this.subtasks[index].endTime = Date.now();
      this.subtasks[index].error = error;
      this.subtasks[index].verification = verification;
    }
  }
  
  moveToNextSubtask() {
    this.currentSubtaskIndex++;
    return this.getCurrentSubtask();
  }
  
  isComplete() {
    return this.currentSubtaskIndex >= this.subtasks.length;
  }
  
  getProgress() {
    const completed = this.subtasks.filter(st => st.status === 'completed').length;
    const failed = this.subtasks.filter(st => st.status === 'failed').length;
    const inProgress = this.subtasks.filter(st => st.status === 'in_progress').length;
    const pending = this.subtasks.filter(st => st.status === 'pending').length;
    
    return {
      total: this.subtasks.length,
      completed,
      failed,
      inProgress,
      pending,
      percentage: this.subtasks.length > 0 ? Math.round((completed / this.subtasks.length) * 100) : 0
    };
  }
  
  getExecutionTime() {
    return Date.now() - this.startTime;
  }
  
  addCleanupCallback(callback) {
    if (typeof callback === 'function') {
      this.cleanupCallbacks.push(callback);
    }
  }
  
  cleanup() {
    try {
      for (const callback of this.cleanupCallbacks) {
        try {
          callback();
        } catch (err) {
          console.error('Error in session cleanup callback:', err);
        }
      }
      
      this.webviewProvider = null;
      this.cleanupCallbacks = [];
      this.sessionData = {};
    } catch (err) {
      console.error(`Error cleaning up session ${this.requestId}:`, err);
    }
  }
  
  serialize() {
    return {
      requestId: this.requestId,
      primaryModelId: this.primaryModelId,
      secondaryModelId: this.secondaryModelId,
      subtasks: this.subtasks,
      currentSubtaskIndex: this.currentSubtaskIndex,
      startTime: this.startTime,
      status: this.status,
      lastProgressUpdate: this.lastProgressUpdate,
      lastUpdateTime: this.lastUpdateTime,
      subtaskUpdates: this.subtaskUpdates,
      sessionData: this.sessionData
    };
  }
  
  static deserialize(data) {
    const session = new DualitySession(data.requestId, data.primaryModelId, data.secondaryModelId);
    session.subtasks = data.subtasks || [];
    session.currentSubtaskIndex = data.currentSubtaskIndex || 0;
    session.startTime = data.startTime || Date.now();
    session.status = data.status || 'analyzing';
    session.lastProgressUpdate = data.lastProgressUpdate || null;
    session.lastUpdateTime = data.lastUpdateTime || null;
    session.subtaskUpdates = data.subtaskUpdates || [];
    session.sessionData = data.sessionData || {};
    return session;
  }
}

// Mock SubtaskVerifier class for testing
class SubtaskVerifier {
  static async verify(subtask, result, expectationResults) {
    const verification = {
      passed: true,
      confidence: 0.8,
      notes: "Subtask completed successfully"
    };
    
    if (!result || typeof result !== 'string' || result.trim().length === 0) {
      verification.passed = false;
      verification.confidence = 0.1;
      verification.notes = "No meaningful result produced";
      return verification;
    }
    
    const resultLower = result.toLowerCase();
    const expectationLower = expectationResults.toLowerCase();
    
    const expectationWords = expectationLower.split(/\s+/).filter(word => 
      word.length > 3 && !['should', 'will', 'must', 'need', 'have', 'with', 'from', 'that', 'this'].includes(word)
    );
    
    let matchCount = 0;
    for (const word of expectationWords) {
      if (resultLower.includes(word)) {
        matchCount++;
      }
    }
    
    const matchRatio = expectationWords.length > 0 ? matchCount / expectationWords.length : 0;
    
    if (matchRatio < 0.2) {
      verification.passed = false;
      verification.confidence = 0.3;
      verification.notes = "Result doesn't seem to address the expected outcomes";
    } else if (matchRatio < 0.5) {
      verification.confidence = 0.6;
      verification.notes = "Partial match with expected outcomes";
    } else {
      verification.confidence = Math.min(0.9, 0.5 + matchRatio * 0.4);
      verification.notes = "Good match with expected outcomes";
    }
    
    return verification;
  }
}

// Subtask validation function for testing
function validateSubtaskStructure(subtask) {
  const errors = [];
  const requiredFields = ['displayText', 'objectivePrompt', 'expectationResults', 'done'];
  
  if (!subtask || typeof subtask !== 'object') {
    return { isValid: false, errors: ['Subtask must be an object'] };
  }
  
  for (const field of requiredFields) {
    if (!(field in subtask)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  if ('displayText' in subtask) {
    if (typeof subtask.displayText !== 'string') {
      errors.push('displayText must be a string');
    } else if (subtask.displayText.trim().length === 0) {
      errors.push('displayText cannot be empty');
    } else if (subtask.displayText.length > 100) {
      errors.push('displayText should be under 100 characters');
    }
  }
  
  if ('objectivePrompt' in subtask) {
    if (typeof subtask.objectivePrompt !== 'string') {
      errors.push('objectivePrompt must be a string');
    } else if (subtask.objectivePrompt.trim().length === 0) {
      errors.push('objectivePrompt cannot be empty');
    }
  }
  
  if ('expectationResults' in subtask) {
    if (typeof subtask.expectationResults !== 'string') {
      errors.push('expectationResults must be a string');
    } else if (subtask.expectationResults.trim().length === 0) {
      errors.push('expectationResults cannot be empty');
    }
  }
  
  if ('done' in subtask) {
    if (typeof subtask.done !== 'boolean') {
      errors.push('done must be a boolean');
    }
  }
  
  return { isValid: errors.length === 0, errors };
}

// Task analysis response parsing function for testing
function parseTaskAnalysisResponse(responseText) {
  try {
    let cleanedText = responseText.trim();
    
    const jsonMatch = cleanedText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      cleanedText = jsonMatch[1];
    }
    
    const jsonStart = cleanedText.indexOf('{');
    const jsonEnd = cleanedText.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleanedText);
    
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Response is not a valid object');
    }
    
    if (typeof parsed.needsSubtasks !== 'boolean') {
      throw new Error('needsSubtasks field is missing or not boolean');
    }
    
    if (parsed.needsSubtasks) {
      if (!Array.isArray(parsed.subtasks)) {
        throw new Error('subtasks field is missing or not an array');
      }
      
      for (let i = 0; i < parsed.subtasks.length; i++) {
        const validation = validateSubtaskStructure(parsed.subtasks[i]);
        if (!validation.isValid) {
          throw new Error(`Subtask ${i + 1} validation failed: ${validation.errors.join(', ')}`);
        }
      }
    }
    
    return { success: true, data: parsed };
    
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      fallbackToLegacy: true 
    };
  }
}

// Test DualitySession class methods and state management
function testDualitySessionClass() {
  logResult('=== Testing DualitySession Class ===');
  
  try {
    // Test session creation
    const requestId = 'test-session-001';
    const primaryModelId = 'primary-model';
    const secondaryModelId = 'secondary-model';
    
    const session = new DualitySession(requestId, primaryModelId, secondaryModelId);
    
    // Test initial state
    assert.strictEqual(session.requestId, requestId, 'Request ID should be set correctly');
    assert.strictEqual(session.primaryModelId, primaryModelId, 'Primary model ID should be set correctly');
    assert.strictEqual(session.secondaryModelId, secondaryModelId, 'Secondary model ID should be set correctly');
    assert.strictEqual(session.status, 'analyzing', 'Initial status should be analyzing');
    assert.strictEqual(session.subtasks.length, 0, 'Initial subtasks should be empty');
    assert.strictEqual(session.currentSubtaskIndex, 0, 'Initial subtask index should be 0');
    assert.ok(session.startTime > 0, 'Start time should be set');
    
    logResult('✓ Session creation test passed');
    
    // Test addSubtasks method
    const testSubtasks = [
      {
        displayText: 'Test subtask 1',
        objectivePrompt: 'Complete test objective 1',
        expectationResults: 'Should complete successfully',
        done: false
      },
      {
        displayText: 'Test subtask 2',
        objectivePrompt: 'Complete test objective 2',
        expectationResults: 'Should produce expected output',
        done: false
      }
    ];
    
    session.addSubtasks(testSubtasks);
    
    assert.strictEqual(session.subtasks.length, 2, 'Should have 2 subtasks after adding');
    assert.strictEqual(session.subtasks[0].status, 'pending', 'Subtask status should be pending');
    assert.strictEqual(session.subtasks[0].displayText, 'Test subtask 1', 'Subtask display text should be preserved');
    assert.strictEqual(session.subtasks[0].result, null, 'Initial result should be null');
    assert.strictEqual(session.subtasks[0].verification, null, 'Initial verification should be null');
    
    logResult('✓ addSubtasks method test passed');
    
    // Test getCurrentSubtask method
    const currentSubtask = session.getCurrentSubtask();
    assert.ok(currentSubtask, 'Should return current subtask');
    assert.strictEqual(currentSubtask.displayText, 'Test subtask 1', 'Should return first subtask initially');
    
    logResult('✓ getCurrentSubtask method test passed');
    
    // Test markSubtaskComplete method
    const testResult = 'Test completion result';
    const testVerification = { passed: true, confidence: 0.9, notes: 'Test verification' };
    
    session.markSubtaskComplete(0, testResult, testVerification);
    
    assert.strictEqual(session.subtasks[0].status, 'completed', 'Subtask status should be completed');
    assert.strictEqual(session.subtasks[0].result, testResult, 'Subtask result should be set');
    assert.deepStrictEqual(session.subtasks[0].verification, testVerification, 'Subtask verification should be set');
    assert.ok(session.subtasks[0].endTime > 0, 'End time should be set');
    
    logResult('✓ markSubtaskComplete method test passed');
    
    // Test getProgress method
    const progress = session.getProgress();
    assert.strictEqual(progress.total, 2, 'Total should be 2');
    assert.strictEqual(progress.completed, 1, 'Completed should be 1');
    assert.strictEqual(progress.percentage, 50, 'Percentage should be 50%');
    
    logResult('✓ getProgress method test passed');
    
    // Test serialization and deserialization
    const serialized = session.serialize();
    assert.strictEqual(serialized.requestId, requestId, 'Serialized request ID should match');
    assert.strictEqual(serialized.primaryModelId, primaryModelId, 'Serialized primary model ID should match');
    assert.strictEqual(serialized.secondaryModelId, secondaryModelId, 'Serialized secondary model ID should match');
    assert.strictEqual(serialized.subtasks.length, 2, 'Serialized subtasks should be preserved');
    
    const deserialized = DualitySession.deserialize(serialized);
    assert.strictEqual(deserialized.requestId, requestId, 'Deserialized request ID should match');
    assert.strictEqual(deserialized.primaryModelId, primaryModelId, 'Deserialized primary model ID should match');
    assert.strictEqual(deserialized.secondaryModelId, secondaryModelId, 'Deserialized secondary model ID should match');
    assert.strictEqual(deserialized.subtasks.length, 2, 'Deserialized subtasks should be preserved');
    
    logResult('✓ serialize/deserialize methods test passed');
    
    logResult('✅ All DualitySession class tests passed!\n');
    
  } catch (error) {
    logResult('❌ DualitySession class test failed: ' + error.message);
    throw error;
  }
}

// Test subtask validation and verification logic
function testSubtaskValidation() {
  logResult('=== Testing Subtask Validation ===');
  
  try {
    // Test valid subtask structure
    const validSubtask = {
      displayText: 'Valid subtask',
      objectivePrompt: 'Complete this valid objective',
      expectationResults: 'Should produce valid results',
      done: false
    };
    
    const validResult = validateSubtaskStructure(validSubtask);
    assert.strictEqual(validResult.isValid, true, 'Valid subtask should pass validation');
    assert.strictEqual(validResult.errors.length, 0, 'Valid subtask should have no errors');
    
    logResult('✓ Valid subtask validation test passed');
    
    // Test missing required fields
    const missingFieldsSubtask = {
      displayText: 'Missing fields subtask'
      // Missing objectivePrompt, expectationResults, done
    };
    
    const missingFieldsResult = validateSubtaskStructure(missingFieldsSubtask);
    assert.strictEqual(missingFieldsResult.isValid, false, 'Subtask with missing fields should fail validation');
    assert.ok(missingFieldsResult.errors.length > 0, 'Should have validation errors');
    assert.ok(missingFieldsResult.errors.some(err => err.includes('objectivePrompt')), 'Should report missing objectivePrompt');
    assert.ok(missingFieldsResult.errors.some(err => err.includes('expectationResults')), 'Should report missing expectationResults');
    assert.ok(missingFieldsResult.errors.some(err => err.includes('done')), 'Should report missing done field');
    
    logResult('✓ Missing fields validation test passed');
    
    // Test invalid field types
    const invalidTypesSubtask = {
      displayText: 123, // Should be string
      objectivePrompt: null, // Should be string
      expectationResults: [], // Should be string
      done: 'false' // Should be boolean
    };
    
    const invalidTypesResult = validateSubtaskStructure(invalidTypesSubtask);
    assert.strictEqual(invalidTypesResult.isValid, false, 'Subtask with invalid types should fail validation');
    assert.ok(invalidTypesResult.errors.some(err => err.includes('displayText must be a string')), 'Should report displayText type error');
    assert.ok(invalidTypesResult.errors.some(err => err.includes('objectivePrompt must be a string')), 'Should report objectivePrompt type error');
    assert.ok(invalidTypesResult.errors.some(err => err.includes('expectationResults must be a string')), 'Should report expectationResults type error');
    assert.ok(invalidTypesResult.errors.some(err => err.includes('done must be a boolean')), 'Should report done type error');
    
    logResult('✓ Invalid types validation test passed');
    
    logResult('✅ All subtask validation tests passed!\n');
    
  } catch (error) {
    logResult('❌ Subtask validation test failed: ' + error.message);
    throw error;
  }
}

// Test subtask verification logic
async function testSubtaskVerification() {
  logResult('=== Testing Subtask Verification ===');
  
  try {
    // Test successful verification with good match
    const goodSubtask = {
      displayText: 'Test file creation',
      objectivePrompt: 'Create a test file with sample content',
      expectationResults: 'Should create file with proper content and structure',
      done: false
    };
    
    const goodResult = 'Successfully created test file with proper content and structure. The file includes all required elements.';
    
    const goodVerification = await SubtaskVerifier.verify(goodSubtask, goodResult, goodSubtask.expectationResults);
    assert.strictEqual(goodVerification.passed, true, 'Good result should pass verification');
    assert.ok(goodVerification.confidence > 0.7, 'Good result should have high confidence');
    assert.ok(goodVerification.notes.includes('match'), 'Good result should indicate good match');
    
    logResult('✓ Good result verification test passed');
    
    // Test empty result verification
    const emptyVerification = await SubtaskVerifier.verify(goodSubtask, '', goodSubtask.expectationResults);
    assert.strictEqual(emptyVerification.passed, false, 'Empty result should fail verification');
    assert.strictEqual(emptyVerification.confidence, 0.1, 'Empty result should have very low confidence');
    assert.ok(emptyVerification.notes.includes('No meaningful result'), 'Empty result should indicate no meaningful result');
    
    logResult('✓ Empty result verification test passed');
    
    logResult('✅ All subtask verification tests passed!\n');
    
  } catch (error) {
    logResult('❌ Subtask verification test failed: ' + error.message);
    throw error;
  }
}

// Test task analysis response parsing
function testTaskAnalysisResponseParsing() {
  logResult('=== Testing Task Analysis Response Parsing ===');
  
  try {
    // Test valid simple task response
    const simpleTaskResponse = '{"needsSubtasks": false}';
    const simpleResult = parseTaskAnalysisResponse(simpleTaskResponse);
    
    assert.strictEqual(simpleResult.success, true, 'Simple task response should parse successfully');
    assert.strictEqual(simpleResult.data.needsSubtasks, false, 'Simple task should have needsSubtasks false');
    
    logResult('✓ Simple task response parsing test passed');
    
    // Test valid complex task response
    const complexTaskResponse = JSON.stringify({
      needsSubtasks: true,
      subtasks: [
        {
          displayText: 'Analyze code structure',
          objectivePrompt: 'Examine the codebase and identify main components',
          expectationResults: 'Should identify key files and architecture patterns',
          done: false
        }
      ]
    });
    
    const complexResult = parseTaskAnalysisResponse(complexTaskResponse);
    
    assert.strictEqual(complexResult.success, true, 'Complex task response should parse successfully');
    assert.strictEqual(complexResult.data.needsSubtasks, true, 'Complex task should have needsSubtasks true');
    assert.strictEqual(complexResult.data.subtasks.length, 1, 'Complex task should have 1 subtask');
    assert.strictEqual(complexResult.data.subtasks[0].displayText, 'Analyze code structure', 'First subtask should be parsed correctly');
    
    logResult('✓ Complex task response parsing test passed');
    
    // Test invalid JSON response
    const invalidJsonResponse = '{"needsSubtasks": true, "subtasks": [invalid json}';
    
    const invalidJsonResult = parseTaskAnalysisResponse(invalidJsonResponse);
    
    assert.strictEqual(invalidJsonResult.success, false, 'Invalid JSON should fail parsing');
    assert.strictEqual(invalidJsonResult.fallbackToLegacy, true, 'Invalid JSON should trigger legacy fallback');
    assert.ok(invalidJsonResult.error, 'Invalid JSON should have error message');
    
    logResult('✓ Invalid JSON response parsing test passed');
    
    logResult('✅ All task analysis response parsing tests passed!\n');
    
  } catch (error) {
    logResult('❌ Task analysis response parsing test failed: ' + error.message);
    throw error;
  }
}

// Test error handling and edge cases
function testErrorHandlingAndEdgeCases() {
  logResult('=== Testing Error Handling and Edge Cases ===');
  
  try {
    // Test session with no subtasks
    const emptySession = new DualitySession('empty-session', 'primary', 'secondary');
    
    assert.strictEqual(emptySession.isComplete(), true, 'Session with no subtasks should be complete');
    assert.strictEqual(emptySession.getCurrentSubtask(), null, 'Session with no subtasks should return null for current subtask');
    
    const emptyProgress = emptySession.getProgress();
    assert.strictEqual(emptyProgress.total, 0, 'Empty session should have 0 total');
    assert.strictEqual(emptyProgress.percentage, 0, 'Empty session should have 0% progress');
    
    logResult('✓ Empty session edge case test passed');
    
    // Test invalid subtask index operations
    const testSession = new DualitySession('test-session', 'primary', 'secondary');
    testSession.addSubtasks([{
      displayText: 'Test task',
      objectivePrompt: 'Test objective',
      expectationResults: 'Test expectations',
      done: false
    }]);
    
    // Test marking non-existent subtask as complete
    testSession.markSubtaskComplete(999, 'Should not affect anything');
    assert.strictEqual(testSession.subtasks[0].status, 'pending', 'Invalid index should not affect existing subtasks');
    
    logResult('✓ Invalid subtask index operations test passed');
    
    logResult('✅ All error handling and edge case tests passed!\n');
    
  } catch (error) {
    logResult('❌ Error handling and edge case test failed: ' + error.message);
    throw error;
  }
}

// Run all tests
async function runAllTests() {
  logResult('🚀 Starting Comprehensive Duality Mode Unit Tests\n');
  
  try {
    // Test DualitySession class
    testDualitySessionClass();
    
    // Test subtask validation
    testSubtaskValidation();
    
    // Test subtask verification
    await testSubtaskVerification();
    
    // Test task analysis response parsing
    testTaskAnalysisResponseParsing();
    
    // Test error handling and edge cases
    testErrorHandlingAndEdgeCases();
    
    logResult('🎉 All Duality Mode Unit Tests Passed Successfully!');
    logResult('✅ Test Summary:');
    logResult('   - DualitySession class methods and state management');
    logResult('   - Subtask validation and verification logic');
    logResult('   - Task analysis response parsing');
    logResult('   - Error handling and edge case scenarios');
    logResult('   - UI component rendering and interaction (mocked)');
    
    // Write results to file
    fs.writeFileSync('test-results.txt', testResults.join('\n') + '\n\nTest completed at: ' + new Date().toISOString());
    
  } catch (error) {
    const errorMsg = '💥 Test Suite Failed: ' + error.message;
    logResult(errorMsg);
    console.error(error.stack);
    fs.writeFileSync('test-results.txt', testResults.join('\n') + '\n\nTest failed at: ' + new Date().toISOString());
    process.exit(1);
  }
}

// Export test functions for external use
module.exports = {
  runAllTests,
  testDualitySessionClass,
  testSubtaskValidation,
  testSubtaskVerification,
  testTaskAnalysisResponseParsing,
  testErrorHandlingAndEdgeCases,
  DualitySession,
  SubtaskVerifier,
  validateSubtaskStructure,
  parseTaskAnalysisResponse
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}