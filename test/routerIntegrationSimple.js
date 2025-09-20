/**
 * Simple integration test for Legacy Mode Router Integration
 */

const { createRouter } = require('../route/route');
const { contextManager } = require('../legacy/contextManager');

console.log('Starting Legacy Mode Router Integration Test...');

// Test 1: Create router
console.log('\n1. Creating router...');
const router = createRouter();
console.log('✓ Router created successfully');

// Test 2: Test Legacy Mode session creation
console.log('\n2. Testing Legacy Mode session creation...');
const sessionResult = router.createLegacySession(
  'Test task for integration',
  'test-model',
  'test-request-123'
);

if (sessionResult.success) {
  console.log('✓ Legacy Mode session created:', sessionResult.sessionId);
} else {
  console.log('✗ Failed to create session:', sessionResult.error);
  process.exit(1);
}

// Test 3: Test session retrieval
console.log('\n3. Testing session retrieval...');
const getResult = router.getLegacySession(sessionResult.sessionId);

if (getResult.success) {
  console.log('✓ Session retrieved successfully');
  console.log('  - Original task:', getResult.context.originalTask);
  console.log('  - Phase:', getResult.context.phase);
} else {
  console.log('✗ Failed to retrieve session:', getResult.error);
  process.exit(1);
}

// Test 4: Test context building
console.log('\n4. Testing Legacy Mode context building...');
const context = router.buildLegacyModeContext(sessionResult.sessionId, 'Continue with next step');

if (context && context.includes('Legacy Mode Context')) {
  console.log('✓ Context built successfully');
  console.log('  - Contains session ID:', context.includes(sessionResult.sessionId));
  console.log('  - Contains original task:', context.includes('Test task for integration'));
} else {
  console.log('✗ Failed to build context');
  process.exit(1);
}

// Test 5: Test response processing
console.log('\n5. Testing Legacy Mode response processing...');
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

const processed = router.processLegacyModeResponse(mockResponse, { sessionId: sessionResult.sessionId });

if (processed.parseSuccess && processed.legacyData) {
  console.log('✓ Response processed successfully');
  console.log('  - Phase:', processed.legacyData.phase);
  console.log('  - TODO count:', processed.todos ? processed.todos.length : 0);
  console.log('  - Parse success:', processed.parseSuccess);
} else {
  console.log('✗ Failed to process response');
  console.log('  - Parse success:', processed.parseSuccess);
  console.log('  - Error:', processed.error);
  process.exit(1);
}

// Test 6: Test wrapped prompt building
console.log('\n6. Testing wrapped prompt building...');
const wrappedPrompt = router.buildWrappedPrompt(
  'Execute next step', 
  'legacy', 
  { sessionId: sessionResult.sessionId }
);

if (wrappedPrompt && wrappedPrompt.includes('Legacy Mode Context')) {
  console.log('✓ Wrapped prompt built successfully');
  console.log('  - Contains Legacy Mode context:', wrappedPrompt.includes('Legacy Mode Context'));
  console.log('  - Contains user prompt:', wrappedPrompt.includes('Execute next step'));
} else {
  console.log('✗ Failed to build wrapped prompt');
  process.exit(1);
}

// Cleanup
console.log('\n7. Cleaning up...');
contextManager.clearAllSessions();
console.log('✓ Sessions cleared');

console.log('\n🎉 All Legacy Mode Router Integration tests passed!');
console.log('\nIntegration Summary:');
console.log('- Router enhanced with Legacy Mode support');
console.log('- Context injection working correctly');
console.log('- Response processing with JSON parsing');
console.log('- Session management integrated');
console.log('- Wrapped prompt building with context');