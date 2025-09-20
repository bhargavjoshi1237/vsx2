/**
 * Global setup for Legacy Mode Integration Tests
 * Runs once before all tests
 */

const fs = require('fs').promises;
const path = require('path');

module.exports = async () => {
  console.log('Setting up Legacy Mode Integration Tests...');

  // Create test directories
  const testDirs = [
    'test-workspace',
    'test-workspace/config',
    'test-workspace/src',
    'test-workspace/temp',
    'coverage',
    'coverage/integration'
  ];

  for (const dir of testDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist
      if (error.code !== 'EEXIST') {
        console.warn(`Warning: Could not create directory ${dir}:`, error.message);
      }
    }
  }

  // Create test configuration files
  const testConfig = {
    legacyMode: {
      enabled: true,
      timeouts: {
        taskExecution: 300000,
        userVerification: 60000,
        sessionTotal: 1800000
      },
      autoApproval: {
        enabled: false,
        fileOperations: false,
        terminalCommands: false
      },
      security: {
        allowedCommands: ['npm', 'node', 'git', 'echo'],
        restrictToWorkspace: true,
        maxFileSize: 10485760,
        blockedPaths: ['.git', 'node_modules', '.env']
      }
    }
  };

  try {
    await fs.writeFile(
      'test-workspace/test-config.json',
      JSON.stringify(testConfig, null, 2)
    );
  } catch (error) {
    console.warn('Warning: Could not create test config file:', error.message);
  }

  // Set environment variables for testing
  process.env.NODE_ENV = 'test';
  process.env.VSX_TEST_MODE = 'integration';
  process.env.VSX_TEST_WORKSPACE = path.resolve('test-workspace');

  console.log('Integration test setup completed');
};