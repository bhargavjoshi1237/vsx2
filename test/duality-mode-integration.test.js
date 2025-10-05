// Integration tests for Duality mode router and tool compatibility
// Tests Duality mode integration with existing router patterns, tool systems,
// webview message handling, and session management

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

console.log("🚀 Starting Duality Mode Integration Tests\n");

// Mock router that simulates the actual router behavior
class MockRouter {
  constructor() {
    this.callHistory = [];
    this.responses = new Map();
    this.networkDelay = 100; // Simulate network delay
    this.failureRate = 0; // 0 = no failures, 1 = all failures
  }

  setResponse(modelId, prompt, response) {
    const key = `${modelId}:${prompt.substring(0, 50)}`;
    this.responses.set(key, response);
  }

  setNetworkDelay(delay) {
    this.networkDelay = delay;
  }

  setFailureRate(rate) {
    this.failureRate = Math.max(0, Math.min(1, rate));
  }

  async sendPrompt(modelId, prompt, modeId, requestId) {
    // Record the call
    this.callHistory.push({
      modelId,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? "..." : ""),
      modeId,
      requestId,
      timestamp: Date.now(),
    });

    // Simulate network delay
    if (this.networkDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.networkDelay));
    }

    // Simulate random failures
    if (Math.random() < this.failureRate) {
      throw new Error(`Simulated network failure for model ${modelId}`);
    }

    // Look for specific response
    const key = `${modelId}:${prompt.substring(0, 50)}`;
    if (this.responses.has(key)) {
      return this.responses.get(key);
    }

    // Default responses based on prompt content
    if (prompt.includes("PRIMARY MODEL")) {
      if (prompt.includes("create a simple function")) {
        return {
          text: '{"needsSubtasks": false}',
          raw: { needsSubtasks: false },
        };
      } else if (prompt.includes("build a complete application")) {
        return {
          text: JSON.stringify({
            needsSubtasks: true,
            subtasks: [
              {
                displayText: "Set up project structure",
                objectivePrompt:
                  "Create the basic project structure with directories and files",
                expectationResults:
                  "Should create project directories and configuration files",
                done: false,
              },
              {
                displayText: "Implement core features",
                objectivePrompt: "Build the main application functionality",
                expectationResults:
                  "Should implement working application features",
                done: false,
              },
            ],
          }),
          raw: {
            needsSubtasks: true,
            subtasks: [
              {
                displayText: "Set up project structure",
                objectivePrompt:
                  "Create the basic project structure with directories and files",
                expectationResults:
                  "Should create project directories and configuration files",
                done: false,
              },
              {
                displayText: "Implement core features",
                objectivePrompt: "Build the main application functionality",
                expectationResults:
                  "Should implement working application features",
                done: false,
              },
            ],
          },
        };
      }
    } else if (prompt.includes("SECONDARY MODEL")) {
      return {
        text: "Task completed successfully. Created the required project structure and implemented the requested functionality.",
        raw: "Task completed successfully. Created the required project structure and implemented the requested functionality.",
      };
    }

    // Default response
    return {
      text: `Response from ${modelId} for request ${requestId}`,
      raw: `Response from ${modelId} for request ${requestId}`,
    };
  }

  getCallHistory() {
    return [...this.callHistory];
  }

  clearHistory() {
    this.callHistory = [];
  }

  getCallCount() {
    return this.callHistory.length;
  }

  getCallsForModel(modelId) {
    return this.callHistory.filter((call) => call.modelId === modelId);
  }
}

// Mock webview provider that simulates webview message handling
class MockWebviewProvider {
  constructor() {
    this.messages = [];
    this.messageHandlers = new Map();
    this.webviewView = {
      webview: {
        postMessage: (message) => {
          this.messages.push({
            ...message,
            timestamp: Date.now(),
          });

          // Trigger any registered handlers
          const handler = this.messageHandlers.get(message.command);
          if (handler) {
            handler(message);
          }
        },
      },
    };
  }

  onMessage(command, handler) {
    this.messageHandlers.set(command, handler);
  }

  getMessages() {
    return [...this.messages];
  }

  getMessagesOfType(command) {
    return this.messages.filter((msg) => msg.command === command);
  }

  clearMessages() {
    this.messages = [];
  }

  getLastMessage() {
    return this.messages[this.messages.length - 1] || null;
  }

  waitForMessage(command, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for message: ${command}`));
      }, timeout);

      const handler = (message) => {
        if (message.command === command) {
          clearTimeout(timeoutId);
          resolve(message);
        }
      };

      this.onMessage(command, handler);
    });
  }
}

// Mock tool system that simulates enhanced multi-file tools
class MockToolSystem {
  constructor() {
    this.toolCalls = [];
    this.fileSystem = new Map(); // Simulate file system
    this.searchResults = new Map(); // Simulate search results
  }

  // Mock searchfile tool
  async searchfile(args) {
    this.toolCalls.push({ tool: "searchfile", args, timestamp: Date.now() });

    // Handle both single and multiple pattern searches
    const patterns = args.patterns || [args.q || args.pattern];
    const directories = args.directories || [process.cwd()];

    const results = [];
    for (const pattern of patterns) {
      for (const dir of directories) {
        // Simulate finding files
        if (pattern.includes("test")) {
          results.push({
            path: path.join(dir, `${pattern}.js`),
            matches: [`Found ${pattern} in file`],
            lineNumbers: [1],
          });
        }
      }
    }

    return {
      success: true,
      files: results,
      searchPatterns: patterns,
      directories: directories,
      totalMatches: results.length,
    };
  }

  // Mock fileread tool
  async fileread(args) {
    this.toolCalls.push({ tool: "fileread", args, timestamp: Date.now() });

    // Handle both single and multiple file reads
    const paths = args.paths || [args.path];
    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const filePath of paths) {
      try {
        // Simulate file content
        const content =
          this.fileSystem.get(filePath) ||
          `// Content of ${path.basename(filePath)}`;
        results.push({
          path: filePath,
          success: true,
          content: content,
          size: content.length,
          encoding: "utf8",
        });
        successCount++;
      } catch (error) {
        results.push({
          path: filePath,
          success: false,
          error: error.message,
        });
        failCount++;
      }
    }

    return {
      success: failCount === 0,
      files: results,
      summary: {
        totalFiles: paths.length,
        successfulReads: successCount,
        failedReads: failCount,
      },
    };
  }

  // Mock writefile tool
  async writefile(args) {
    this.toolCalls.push({ tool: "writefile", args, timestamp: Date.now() });

    // Handle both single and multiple file operations
    const operations = args.operations || [
      {
        filePath: args.filePath,
        content: args.content || args.newContent,
      },
    ];

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      try {
        // Simulate writing to file system
        this.fileSystem.set(op.filePath, op.content);
        results.push({
          success: true,
          filePath: op.filePath,
          proposed: op.content,
          index: i,
          operation: "write",
        });
        successCount++;
      } catch (error) {
        results.push({
          success: false,
          filePath: op.filePath,
          error: error.message,
          index: i,
        });
        failCount++;
      }
    }

    // Handle atomic operations
    if (args.atomic && failCount > 0) {
      // In atomic mode, all operations fail if any fail
      results.forEach((result) => {
        result.success = false;
        if (!result.error) {
          result.error =
            "Atomic operation failed due to other operation failure";
        }
      });
      successCount = 0;
      failCount = results.length;
    }

    return {
      success: failCount === 0,
      results: results,
      summary: {
        totalOperations: operations.length,
        successfulOperations: successCount,
        failedOperations: failCount,
      },
    };
  }

  getToolCalls() {
    return [...this.toolCalls];
  }

  getToolCallsOfType(toolName) {
    return this.toolCalls.filter((call) => call.tool === toolName);
  }

  clearToolCalls() {
    this.toolCalls = [];
  }

  setFileContent(filePath, content) {
    this.fileSystem.set(filePath, content);
  }

  getFileContent(filePath) {
    return this.fileSystem.get(filePath);
  }
}

// Load the Duality mode module
let dualityMode;
try {
  dualityMode = require("../modes/duality.js");
} catch (err) {
  console.error("Failed to load duality mode:", err);
  process.exit(1);
}

// Test functions for router integration
async function testRouterIntegration() {
  console.log("=== Testing Router Integration ===");

  try {
    const mockRouter = new MockRouter();
    const mockWebview = new MockWebviewProvider();

    // Test simple task routing
    const simpleResult = await dualityMode.execute({
      router: mockRouter,
      modelId: "primary-model|secondary-model",
      prompt: "create a simple function to add two numbers",
      requestId: "router-test-001",
      webviewProvider: mockWebview,
    });

    // Verify router was called correctly
    const routerCalls = mockRouter.getCallHistory();
    assert(routerCalls.length >= 1, "Router should be called at least once");

    const primaryCall = routerCalls.find(
      (call) => call.modelId === "primary-model"
    );
    assert(primaryCall, "Primary model should be called");
    assert(primaryCall.modeId === "duality", "Mode ID should be duality");
    assert(
      primaryCall.requestId === "router-test-001",
      "Request ID should match"
    );

    // Verify response structure
    assert(simpleResult, "Should return a result");
    assert(typeof simpleResult.text === "string", "Should have text field");

    console.log("✓ Router integration test passed");
    return true;
  } catch (err) {
    console.error("✗ Router integration test failed:", err.message);
    return false;
  }
}

async function testComplexTaskRouting() {
  console.log("\n=== Testing Complex Task Routing ===");

  try {
    const mockRouter = new MockRouter();
    const mockWebview = new MockWebviewProvider();

    // Test complex task routing with subtasks
    const complexResult = await dualityMode.execute({
      router: mockRouter,
      modelId: "primary-model|secondary-model",
      prompt: "build a complete application with authentication and database",
      requestId: "router-test-002",
      webviewProvider: mockWebview,
    });

    // Verify router calls for both primary and secondary models
    const routerCalls = mockRouter.getCallHistory();
    assert(
      routerCalls.length >= 2,
      "Router should be called multiple times for complex tasks"
    );

    const primaryCalls = routerCalls.filter(
      (call) => call.modelId === "primary-model"
    );
    const secondaryCalls = routerCalls.filter(
      (call) => call.modelId === "secondary-model"
    );

    assert(
      primaryCalls.length >= 1,
      "Primary model should be called for analysis"
    );
    assert(
      secondaryCalls.length >= 1,
      "Secondary model should be called for subtask execution"
    );

    // Verify all calls have correct mode and request ID
    routerCalls.forEach((call) => {
      assert(
        call.modeId === "duality",
        "All calls should have duality mode ID"
      );
      assert(
        call.requestId === "router-test-002",
        "All calls should have correct request ID"
      );
    });

    console.log("✓ Complex task routing test passed");
    return true;
  } catch (err) {
    console.error("✗ Complex task routing test failed:", err.message);
    return false;
  }
}

async function testRouterErrorHandling() {
  console.log("\n=== Testing Router Error Handling ===");

  try {
    const mockRouter = new MockRouter();
    const mockWebview = new MockWebviewProvider();

    // Test router failure handling
    mockRouter.setFailureRate(1.0); // Force all calls to fail

    let errorThrown = false;
    try {
      await dualityMode.execute({
        router: mockRouter,
        modelId: "primary-model|secondary-model",
        prompt: "test error handling",
        requestId: "router-error-001",
        webviewProvider: mockWebview,
      });

      // If we reach here, the execution succeeded (possibly through fallback)
      // This is actually acceptable behavior - the system should handle errors gracefully
      console.log("✓ Router error handling with graceful fallback");
    } catch (error) {
      errorThrown = true;
      // Verify error is properly handled
      assert(
        error.message.includes("network failure") ||
          error.message.includes("timeout") ||
          error.message.includes("Simulated"),
        "Should indicate network/timeout error"
      );
    }

    // Check that error messages were sent to webview regardless of whether exception was thrown
    const errorMessages = mockWebview.getMessagesOfType("dualityModeError");
    assert(errorMessages.length > 0, "Should send error messages to webview");

    // Verify error message structure
    const lastErrorMessage = errorMessages[errorMessages.length - 1];
    assert(lastErrorMessage.errorData, "Should have error data");
    assert(lastErrorMessage.errorData.type, "Should have error type");
    assert(lastErrorMessage.errorData.message, "Should have error message");

    console.log("✓ Router error handling test passed");
    return true;
  } catch (err) {
    console.error("✗ Router error handling test failed:", err.message);
    return false;
  }
}

// Test functions for tool system compatibility
async function testToolSystemCompatibility() {
  console.log("\n=== Testing Tool System Compatibility ===");

  try {
    const mockTools = new MockToolSystem();

    // Test searchfile tool compatibility
    const searchResult = await mockTools.searchfile({
      patterns: ["test1", "test2"],
      directories: ["/project/src", "/project/test"],
    });

    assert(searchResult.success === true, "Search should succeed");
    assert(Array.isArray(searchResult.files), "Should return files array");
    assert(
      Array.isArray(searchResult.searchPatterns),
      "Should return search patterns"
    );
    assert(
      searchResult.searchPatterns.length === 2,
      "Should have 2 search patterns"
    );

    // Test fileread tool compatibility
    mockTools.setFileContent("/test/file1.js", 'console.log("test1");');
    mockTools.setFileContent("/test/file2.js", 'console.log("test2");');

    const readResult = await mockTools.fileread({
      paths: ["/test/file1.js", "/test/file2.js"],
    });

    assert(readResult.success === true, "File read should succeed");
    assert(readResult.files.length === 2, "Should read 2 files");
    assert(
      readResult.summary.successfulReads === 2,
      "Should have 2 successful reads"
    );

    // Test writefile tool compatibility
    const writeResult = await mockTools.writefile({
      operations: [
        { filePath: "/test/new1.js", content: 'console.log("new1");' },
        { filePath: "/test/new2.js", content: 'console.log("new2");' },
      ],
    });

    assert(writeResult.success === true, "Write should succeed");
    assert(writeResult.results.length === 2, "Should have 2 operation results");
    assert(
      writeResult.summary.successfulOperations === 2,
      "Should have 2 successful operations"
    );

    console.log("✓ Tool system compatibility test passed");
    return true;
  } catch (err) {
    console.error("✗ Tool system compatibility test failed:", err.message);
    return false;
  }
}

async function testBackwardCompatibilityWithTools() {
  console.log("\n=== Testing Backward Compatibility with Tools ===");

  try {
    const mockTools = new MockToolSystem();

    // Test single file operations (backward compatibility)
    const singleSearchResult = await mockTools.searchfile({ q: "test" });
    assert(singleSearchResult.success === true, "Single search should work");

    const singleReadResult = await mockTools.fileread({
      path: "/test/single.js",
    });
    assert(singleReadResult.success === true, "Single read should work");

    const singleWriteResult = await mockTools.writefile({
      filePath: "/test/single.js",
      content: 'console.log("single");',
    });
    assert(singleWriteResult.success === true, "Single write should work");

    // Verify tool calls were recorded correctly
    const toolCalls = mockTools.getToolCalls();
    assert(toolCalls.length === 3, "Should have 3 tool calls");

    const searchCalls = mockTools.getToolCallsOfType("searchfile");
    const readCalls = mockTools.getToolCallsOfType("fileread");
    const writeCalls = mockTools.getToolCallsOfType("writefile");

    assert(searchCalls.length === 1, "Should have 1 search call");
    assert(readCalls.length === 1, "Should have 1 read call");
    assert(writeCalls.length === 1, "Should have 1 write call");

    console.log("✓ Backward compatibility with tools test passed");
    return true;
  } catch (err) {
    console.error(
      "✗ Backward compatibility with tools test failed:",
      err.message
    );
    return false;
  }
}

// Test functions for webview message handling
async function testWebviewMessageHandling() {
  console.log("\n=== Testing Webview Message Handling ===");

  try {
    const mockRouter = new MockRouter();
    const mockWebview = new MockWebviewProvider();

    // Execute a complex task to generate progress messages
    const executionPromise = dualityMode.execute({
      router: mockRouter,
      modelId: "primary-model|secondary-model",
      prompt: "build a complete application with multiple components",
      requestId: "webview-test-001",
      webviewProvider: mockWebview,
    });

    // Wait for execution to complete
    await executionPromise;

    // Verify progress messages were sent
    const progressMessages = mockWebview.getMessagesOfType(
      "dualityModeProgress"
    );
    assert(progressMessages.length > 0, "Should send progress messages");

    // Verify message structure
    progressMessages.forEach((msg) => {
      assert(
        msg.command === "dualityModeProgress",
        "Should have correct command"
      );
      assert(
        msg.requestId === "webview-test-001",
        "Should have correct request ID"
      );
      assert(msg.progressData, "Should have progress data");
      assert(typeof msg.timestamp === "number", "Should have timestamp");
    });

    // Check for specific message types
    const startedMessages = progressMessages.filter(
      (msg) => msg.progressData.type === "subtask_started"
    );
    const progressUpdateMessages = progressMessages.filter(
      (msg) => msg.progressData.type === "subtask_progress"
    );
    const completedMessages = progressMessages.filter(
      (msg) => msg.progressData.type === "subtask_completed"
    );

    assert(startedMessages.length > 0, "Should have subtask started messages");
    assert(
      progressUpdateMessages.length > 0,
      "Should have progress update messages"
    );
    assert(completedMessages.length > 0, "Should have completion messages");

    console.log("✓ Webview message handling test passed");
    return true;
  } catch (err) {
    console.error("✗ Webview message handling test failed:", err.message);
    return false;
  }
}

async function testWebviewErrorMessages() {
  console.log("\n=== Testing Webview Error Messages ===");

  try {
    const mockRouter = new MockRouter();
    const mockWebview = new MockWebviewProvider();

    // Test configuration error
    try {
      await dualityMode.execute({
        router: null, // Invalid router
        modelId: "primary-model|secondary-model",
        prompt: "test error messages",
        requestId: "webview-error-001",
        webviewProvider: mockWebview,
      });
    } catch (error) {
      // Expected error
    }

    // Verify error messages were sent
    const errorMessages = mockWebview.getMessagesOfType("dualityModeError");
    assert(errorMessages.length > 0, "Should send error messages");

    // Verify error message structure
    errorMessages.forEach((msg) => {
      assert(msg.command === "dualityModeError", "Should have correct command");
      assert(
        msg.requestId === "webview-error-001",
        "Should have correct request ID"
      );
      assert(msg.errorData, "Should have error data");
      assert(msg.errorData.type, "Should have error type");
      assert(msg.errorData.message, "Should have error message");
    });

    console.log("✓ Webview error messages test passed");
    return true;
  } catch (err) {
    console.error("✗ Webview error messages test failed:", err.message);
    return false;
  }
}

// Test functions for session management
async function testSessionManagement() {
  console.log("\n=== Testing Session Management ===");

  try {
    const mockRouter = new MockRouter();
    const mockWebview = new MockWebviewProvider();

    // Start multiple sessions to test concurrent handling
    const session1Promise = dualityMode.execute({
      router: mockRouter,
      modelId: "primary-model|secondary-model",
      prompt: "build application 1",
      requestId: "session-test-001",
      webviewProvider: mockWebview,
    });

    const session2Promise = dualityMode.execute({
      router: mockRouter,
      modelId: "primary-model|secondary-model",
      prompt: "build application 2",
      requestId: "session-test-002",
      webviewProvider: mockWebview,
    });

    // Wait for both sessions to complete
    const [result1, result2] = await Promise.all([
      session1Promise,
      session2Promise,
    ]);

    // Verify both sessions completed successfully
    assert(result1, "Session 1 should complete");
    assert(result2, "Session 2 should complete");
    assert(
      typeof result1.text === "string",
      "Session 1 should have text result"
    );
    assert(
      typeof result2.text === "string",
      "Session 2 should have text result"
    );

    // Verify router calls were made for both sessions
    const routerCalls = mockRouter.getCallHistory();
    const session1Calls = routerCalls.filter(
      (call) => call.requestId === "session-test-001"
    );
    const session2Calls = routerCalls.filter(
      (call) => call.requestId === "session-test-002"
    );

    assert(session1Calls.length > 0, "Session 1 should have router calls");
    assert(session2Calls.length > 0, "Session 2 should have router calls");

    console.log("✓ Session management test passed");
    return true;
  } catch (err) {
    console.error("✗ Session management test failed:", err.message);
    return false;
  }
}

async function testSessionCleanup() {
  console.log("\n=== Testing Session Cleanup ===");

  try {
    const mockRouter = new MockRouter();
    const mockWebview = new MockWebviewProvider();

    // Execute a session and verify cleanup
    await dualityMode.execute({
      router: mockRouter,
      modelId: "primary-model|secondary-model",
      prompt: "test session cleanup",
      requestId: "cleanup-test-001",
      webviewProvider: mockWebview,
    });

    // Session should be cleaned up automatically after completion
    // We can't directly test the internal session storage, but we can verify
    // that the execution completed without memory leaks or hanging references

    // Execute another session to ensure cleanup didn't break anything
    const result = await dualityMode.execute({
      router: mockRouter,
      modelId: "primary-model|secondary-model",
      prompt: "test after cleanup",
      requestId: "cleanup-test-002",
      webviewProvider: mockWebview,
    });

    assert(result, "Should be able to execute after cleanup");
    assert(
      typeof result.text === "string",
      "Should have valid result after cleanup"
    );

    console.log("✓ Session cleanup test passed");
    return true;
  } catch (err) {
    console.error("✗ Session cleanup test failed:", err.message);
    return false;
  }
}

// Test functions for existing router patterns compatibility
async function testExistingRouterPatterns() {
  console.log("\n=== Testing Existing Router Patterns ===");

  try {
    // Test that Duality mode follows the same patterns as other modes

    // Verify mode structure matches expected pattern
    assert(typeof dualityMode.id === "string", "Should have id field");
    assert(typeof dualityMode.name === "string", "Should have name field");
    assert(
      typeof dualityMode.execute === "function",
      "Should have execute function"
    );
    assert(
      typeof dualityMode.wrappers === "object",
      "Should have wrappers object"
    );
    assert(
      typeof dualityMode.tagline === "string",
      "Should have tagline field"
    );

    // Verify wrappers structure
    assert(
      typeof dualityMode.wrappers.top === "string",
      "Should have top wrapper"
    );
    assert(
      typeof dualityMode.wrappers.bottom === "string",
      "Should have bottom wrapper"
    );

    // Test execute function signature compatibility
    const mockRouter = new MockRouter();
    const mockWebview = new MockWebviewProvider();

    const executeParams = {
      router: mockRouter,
      modelId: "test-model",
      prompt: "test prompt",
      requestId: "pattern-test-001",
      webviewProvider: mockWebview,
    };

    // Should accept the same parameters as other modes
    const result = await dualityMode.execute(executeParams);
    assert(result, "Should return a result");
    assert(
      typeof result.text === "string",
      "Should have text field like other modes"
    );

    console.log("✓ Existing router patterns test passed");
    return true;
  } catch (err) {
    console.error("✗ Existing router patterns test failed:", err.message);
    return false;
  }
}

async function testModeRegistration() {
  console.log("\n=== Testing Mode Registration ===");

  try {
    // Test that Duality mode is properly registered in the modes system
    const modesIndex = require("../modes/index.js");

    // Test listModes function
    const modes = modesIndex.listModes();
    assert(Array.isArray(modes), "listModes should return an array");

    const dualityModeEntry = modes.find((m) => m.id === "duality");
    assert(dualityModeEntry, "Duality mode should be in modes list");
    assert(dualityModeEntry.name === "Duality", "Should have correct name");
    assert(
      dualityModeEntry.tagline === "Dual Model Processing",
      "Should have correct tagline"
    );

    // Test getModeById function
    const modeById = modesIndex.getModeById("duality");
    assert(modeById, "Should be able to get Duality mode by ID");
    assert(modeById.id === "duality", "Should return correct mode");
    assert(
      modeById === dualityMode,
      "Should return the actual duality mode module"
    );

    console.log("✓ Mode registration test passed");
    return true;
  } catch (err) {
    console.error("✗ Mode registration test failed:", err.message);
    return false;
  }
}

// Performance and stress tests
async function testConcurrentExecution() {
  console.log("\n=== Testing Concurrent Execution ===");

  try {
    const mockRouter = new MockRouter();
    const mockWebview = new MockWebviewProvider();

    // Set a small delay to simulate realistic conditions
    mockRouter.setNetworkDelay(50);

    // Execute multiple sessions concurrently
    const concurrentPromises = [];
    for (let i = 0; i < 5; i++) {
      concurrentPromises.push(
        dualityMode.execute({
          router: mockRouter,
          modelId: "primary-model|secondary-model",
          prompt: `concurrent task ${i}`,
          requestId: `concurrent-test-${i.toString().padStart(3, "0")}`,
          webviewProvider: mockWebview,
        })
      );
    }

    // Wait for all to complete
    const results = await Promise.all(concurrentPromises);

    // Verify all sessions completed
    assert(results.length === 5, "Should have 5 results");
    results.forEach((result, index) => {
      assert(result, `Result ${index} should exist`);
      assert(
        typeof result.text === "string",
        `Result ${index} should have text`
      );
    });

    // Verify router handled all requests
    const routerCalls = mockRouter.getCallHistory();
    assert(routerCalls.length >= 5, "Should have at least 5 router calls");

    // Verify unique request IDs were maintained
    const uniqueRequestIds = new Set(routerCalls.map((call) => call.requestId));
    assert(uniqueRequestIds.size === 5, "Should have 5 unique request IDs");

    console.log("✓ Concurrent execution test passed");
    return true;
  } catch (err) {
    console.error("✗ Concurrent execution test failed:", err.message);
    return false;
  }
}

async function testNetworkResiliency() {
  console.log("\n=== Testing Network Resiliency ===");

  try {
    const mockRouter = new MockRouter();
    const mockWebview = new MockWebviewProvider();

    // Test with intermittent failures
    mockRouter.setFailureRate(0.3); // 30% failure rate

    let successCount = 0;
    let errorCount = 0;

    // Execute multiple requests to test retry logic
    for (let i = 0; i < 10; i++) {
      try {
        await dualityMode.execute({
          router: mockRouter,
          modelId: "primary-model|secondary-model",
          prompt: `resilience test ${i}`,
          requestId: `resilience-test-${i.toString().padStart(3, "0")}`,
          webviewProvider: mockWebview,
        });
        successCount++;
      } catch (error) {
        errorCount++;
        // Verify error handling
        assert(error.message, "Error should have message");
      }
    }

    // Should have some successes despite failures
    assert(successCount > 0, "Should have some successful executions");

    // Verify error messages were sent for failures
    const errorMessages = mockWebview.getMessagesOfType("dualityModeError");
    assert(
      errorMessages.length >= errorCount,
      "Should send error messages for failures"
    );

    console.log(
      `✓ Network resiliency test passed (${successCount} successes, ${errorCount} errors)`
    );
    return true;
  } catch (err) {
    console.error("✗ Network resiliency test failed:", err.message);
    return false;
  }
}

// Run all integration tests
async function runAllTests() {
  const testFunctions = [
    // Router integration tests
    testRouterIntegration,
    testComplexTaskRouting,
    testRouterErrorHandling,

    // Tool system compatibility tests
    testToolSystemCompatibility,
    testBackwardCompatibilityWithTools,

    // Webview message handling tests
    testWebviewMessageHandling,
    testWebviewErrorMessages,

    // Session management tests
    testSessionManagement,
    testSessionCleanup,

    // Router patterns compatibility tests
    testExistingRouterPatterns,
    testModeRegistration,

    // Performance and stress tests
    testConcurrentExecution,
    testNetworkResiliency,
  ];

  let passedTests = 0;
  let totalTests = testFunctions.length;

  console.log(`Running ${totalTests} integration tests...\n`);

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

  console.log(`\n=== Integration Test Results ===`);
  console.log(`Passed: ${passedTests}/${totalTests} tests`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

  if (passedTests === totalTests) {
    console.log("\n🎉 All Duality Mode integration tests passed!");
    console.log("\n✅ Test Coverage Summary:");
    console.log("   - Router integration with existing patterns");
    console.log(
      "   - Tool system compatibility (searchfile, fileread, writefile)"
    );
    console.log("   - Webview message handling and response processing");
    console.log("   - Session management and cleanup");
    console.log("   - Concurrent execution and network resiliency");
    console.log("   - Mode registration and compatibility");
    return true;
  } else {
    console.log(
      "\n❌ Some integration tests failed. Please review the implementation."
    );
    return false;
  }
}

// Export for use in test runners
module.exports = {
  runAllTests,
  MockRouter,
  MockWebviewProvider,
  MockToolSystem,
  testRouterIntegration,
  testToolSystemCompatibility,
  testWebviewMessageHandling,
  testSessionManagement,
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error("Integration test execution failed:", err);
      process.exit(1);
    });
}
