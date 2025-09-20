/**
 * Setup file for Legacy Mode Integration Tests
 * Configures test environment and provides common utilities
 */

// Global test utilities
global.testUtils = {
  // Create mock VSCode API
  createMockVSCodeAPI() {
    return {
      workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
        getConfiguration: jest.fn(() => ({
          get: jest.fn((key) => {
            const config = {
              'vsx.legacyMode.enabled': true,
              'vsx.legacyMode.timeouts.taskExecution': 300000,
              'vsx.legacyMode.timeouts.userVerification': 60000,
              'vsx.legacyMode.autoApproval.enabled': false,
              'vsx.legacyMode.security.restrictToWorkspace': true
            };
            return config[key];
          })
        }))
      },
      window: {
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        createOutputChannel: jest.fn(() => ({
          appendLine: jest.fn(),
          show: jest.fn(),
          dispose: jest.fn()
        }))
      },
      commands: {
        executeCommand: jest.fn()
      },
      Uri: {
        file: jest.fn((path) => ({ fsPath: path }))
      }
    };
  },

  // Create mock file system
  createMockFileSystem() {
    const files = new Map();
    
    return {
      files,
      
      readFile: jest.fn((path) => {
        if (files.has(path)) {
          return Promise.resolve(files.get(path));
        }
        return Promise.reject(new Error(`File not found: ${path}`));
      }),
      
      writeFile: jest.fn((path, content) => {
        files.set(path, content);
        return Promise.resolve();
      }),
      
      exists: jest.fn((path) => {
        return Promise.resolve(files.has(path));
      }),
      
      mkdir: jest.fn((path) => {
        files.set(path + '/.directory', '');
        return Promise.resolve();
      }),
      
      unlink: jest.fn((path) => {
        files.delete(path);
        return Promise.resolve();
      })
    };
  },

  // Create mock terminal
  createMockTerminal() {
    return {
      executeCommand: jest.fn((command, options = {}) => {
        // Simulate common commands
        if (command.includes('npm init')) {
          return Promise.resolve({
            success: true,
            stdout: 'package.json created',
            stderr: '',
            exitCode: 0
          });
        }
        
        if (command.includes('git init')) {
          return Promise.resolve({
            success: true,
            stdout: 'Initialized empty Git repository',
            stderr: '',
            exitCode: 0
          });
        }
        
        return Promise.resolve({
          success: true,
          stdout: `Command executed: ${command}`,
          stderr: '',
          exitCode: 0
        });
      })
    };
  },

  // Create test session data
  createTestSession(overrides = {}) {
    return {
      id: 'test-session-' + Date.now(),
      originalTask: 'Test task for integration testing',
      modelId: 'test-model',
      requestId: 'test-request-' + Date.now(),
      phase: 'planning',
      todos: [],
      executionLog: [],
      startTime: new Date().toISOString(),
      ...overrides
    };
  },

  // Create test TODO
  createTestTodo(overrides = {}) {
    return {
      id: 'test-todo-' + Date.now(),
      description: 'Test TODO for integration testing',
      expectedResult: 'Should complete successfully',
      status: 'pending',
      createdAt: new Date().toISOString(),
      ...overrides
    };
  },

  // Wait for async operations
  async waitFor(condition, timeout = 5000, interval = 100) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  },

  // Generate test data
  generateLargeTestData(size = 1000) {
    const data = [];
    for (let i = 0; i < size; i++) {
      data.push({
        id: `item-${i}`,
        name: `Test Item ${i}`,
        value: Math.random() * 1000,
        timestamp: new Date().toISOString()
      });
    }
    return data;
  }
};

// Mock console methods for cleaner test output
const originalConsole = { ...console };

beforeEach(() => {
  // Reset console mocks
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
});

afterEach(() => {
  // Restore console methods
  Object.assign(console, originalConsole);
  
  // Clear all timers
  jest.clearAllTimers();
  
  // Clear all mocks
  jest.clearAllMocks();
});

// Global error handler for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Increase timeout for integration tests
jest.setTimeout(30000);