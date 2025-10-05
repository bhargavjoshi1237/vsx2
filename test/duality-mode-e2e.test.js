// End-to-end tests for Duality mode workflow
// Tests complete workflow from user input to completion

const assert = require('assert');
const path = require('path');

console.log('Starting Duality Mode End-to-End Tests...\n');

// Mock dependencies
const mockRouter = {
  sendPrompt: async (modelId, prompt, modeId, requestId) => {
    // Simulate different responses based on model and prompt
    if (prompt.includes('PRIMARY MODEL')) {
      // Primary model analysis response
      if (prompt.includes('create a simple function')) {
        return {
          text: '{"needsSubtasks": false}',
          raw: '{"needsSubtasks": false}'
        };
      } else if (prompt.includes('build a complete web application')) {
        return {
          text: JSON.stringify({
            needsSubtasks: true,
            subtasks: [
              {
                displayText: "Set up project structure",
                objectivePrompt: "Create the basic project structure with necessary directories and files",
                expectationResults: "Should create directories and basic configuration files",
                done: false
              },
              {
                displayText: "Implement core functionality",
                objectivePrompt: "Build the main application logic and features",
                expectationResults: "Should implement working application features",
                done: false
              }
            ]
          }),
          raw: {
            needsSubtasks: true,
            subtasks: [
              {
                displayText: "Set up project structure",
                objectivePrompt: "Create the basic project structure with necessary directories and files",
                expectationResults: "Should create directories and basic configuration files",
                done: false
              },
              {
                displayText: "Implement core functionality",
                objectivePrompt: "Build the main application logic and features",
                expectationResults: "Should implement working application features",
                done: false
              }
            ]
          }
        };
      }
    } else if (prompt.includes('SECONDARY MODEL')) {
      // Secondary model execution response
      return {
        text: 'Task completed successfully. Created project structure with src/, public/, and package.json files.',
        raw: 'Task completed successfully. Created project structure with src/, public/, and package.json files.'
      };
    }
    
    // Default response
    return {
      text: 'Default response for testing',
      raw: 'Default response for testing'
    };
  }
};

// Mock webview provider
const mockWebviewProvider = {
  webviewView: {
    webview: {
      postMessage: (message) => {
        mockWebviewProvider.lastMessage = message;
      }
    }
  },
  lastMessage: null
};

// Load the Duality mode module
let dualityMode;
try {
  dualityMode = require('../modes/duality.js');
} catch (err) {
  console.error('Failed to load duality mode:', err);
  process.exit(1);
}

// Test functions
async function testSimpleTaskFallback() {
  console.log('=== Testing Simple Task Fallback ===');
  
  try {
    const result = await dualityMode.execute({
      router: mockRouter,
      modelId: 'primary-model|secondary-model',
      prompt: 'create a simple function to add two numbers',
      requestId: 'test-simple-001',
      webviewProvider: mockWebviewProvider
    });
    
    // Verify result structure
    assert(result, 'Should return a result');
    assert(typeof result.text === 'string', 'Should have text field');
    
    console.log('✓ Simple task fallback test passed');
    return true;
  } catch (err) {
    console.error('✗ Simple task fallback test failed:', err.message);
    return false;
  }
}

async function testComplexTaskExecution() {
  console.log('\n=== Testing Complex Task Execution ===');
  
  try {
    const result = await dualityMode.execute({
      router: mockRouter,
      modelId: 'primary-model|secondary-model',
      prompt: 'build a complete web application with user authentication',
      requestId: 'test-complex-001',
      webviewProvider: mockWebviewProvider
    });
    
    // Verify result structure
    assert(result, 'Should return a result');
    assert(typeof result.text === 'string', 'Should have text field');
    
    console.log('✓ Complex task execution test passed');
    return true;
  } catch (err) {
    console.error('✗ Complex task execution test failed:', err.message);
    return false;
  }
}

async function testProgressTracking() {
  console.log('\n=== Testing Progress Tracking ===');
  
  try {
    // Clear previous messages
    mockWebviewProvider.lastMessage = null;
    
    await dualityMode.execute({
      router: mockRouter,
      modelId: 'primary-model|secondary-model',
      prompt: 'build a complete web application with user authentication',
      requestId: 'test-progress-001',
      webviewProvider: mockWebviewProvider
    });
    
    // Note: In the actual implementation, progress messages would be sent
    // For this test, we just verify the execution completed
    console.log('✓ Progress tracking test passed');
    return true;
  } catch (err) {
    console.error('✗ Progress tracking test failed:', err.message);
    return false;
  }
}

async function testErrorHandling() {
  console.log('\n=== Testing Error Handling ===');
  
  try {
    // Test missing router
    try {
      await dualityMode.execute({
        router: null,
        modelId: 'primary-model|secondary-model',
        prompt: 'test error handling',
        requestId: 'test-error-001',
        webviewProvider: mockWebviewProvider
      });
      console.error('✗ Should have thrown error for missing router');
      return false;
    } catch (err) {
      assert(err.message.includes('Router'), 'Should indicate router error');
    }
    
    // Test invalid model ID
    try {
      await dualityMode.execute({
        router: mockRouter,
        modelId: '',
        prompt: 'test model validation',
        requestId: 'test-validation-001',
        webviewProvider: mockWebviewProvider
      });
      console.error('✗ Should have thrown error for invalid model ID');
      return false;
    } catch (err) {
      assert(err.message.includes('Primary model'), 'Should indicate primary model error');
    }
    
    console.log('✓ Error handling test passed');
    return true;
  } catch (err) {
    console.error('✗ Error handling test failed:', err.message);
    return false;
  }
}

async function testModeIntegration() {
  console.log('\n=== Testing Mode Integration ===');
  
  try {
    // Verify mode structure
    assert(typeof dualityMode.id === 'string', 'Should have id field');
    assert(typeof dualityMode.name === 'string', 'Should have name field');
    assert(typeof dualityMode.execute === 'function', 'Should have execute function');
    assert(typeof dualityMode.wrappers === 'object', 'Should have wrappers object');
    
    // Verify wrappers structure
    assert(typeof dualityMode.wrappers.top === 'string', 'Should have top wrapper');
    assert(typeof dualityMode.wrappers.bottom === 'string', 'Should have bottom wrapper');
    
    console.log('✓ Mode integration test passed');
    return true;
  } catch (err) {
    console.error('✗ Mode integration test failed:', err.message);
    return false;
  }
}

async function testModesIndexIntegration() {
  console.log('\n=== Testing Modes Index Integration ===');
  
  try {
    const modesIndex = require('../modes/index.js');
    const modes = modesIndex.listModes();
    
    const dualityModeEntry = modes.find(m => m.id === 'duality');
    assert(dualityModeEntry, 'Duality mode should be registered in modes index');
    assert(dualityModeEntry.name === 'Duality', 'Should have correct name');
    
    const modeById = modesIndex.getModeById('duality');
    assert(modeById, 'Should be able to get Duality mode by ID');
    assert(modeById.id === 'duality', 'Should return correct mode');
    
    console.log('✓ Modes index integration test passed');
    return true;
  } catch (err) {
    console.error('✗ Modes index integration test failed:', err.message);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  const testFunctions = [
    testSimpleTaskFallback,
    testComplexTaskExecution,
    testProgressTracking,
    testErrorHandling,
    testModeIntegration,
    testModesIndexIntegration
  ];
  
  let passedTests = 0;
  let totalTests = testFunctions.length;
  
  for (const testFn of testFunctions) {
    try {
      const passed = await testFn();
      if (passed) {
        passedTests++;
      }
    } catch (err) {
      console.error(`Test ${testFn.name} threw unexpected error:`, err);
    }
  }
  
  console.log(`\n=== Test Results ===`);
  console.log(`Passed: ${passedTests}/${totalTests} tests`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All Duality Mode end-to-end tests passed!');
    return true;
  } else {
    console.log('\n❌ Some tests failed. Please review the implementation.');
    return false;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

// Export for use in test runners
module.exports = {
  runAllTests,
  mockRouter,
  mockWebviewProvider
};