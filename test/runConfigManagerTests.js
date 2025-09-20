/**
 * Simple test runner for Legacy Mode Configuration Manager
 */

const assert = require('assert');
const LegacyConfigManager = require('../legacy/configManager');

// Mock VSCode API
const mockConfig = {
  'legacyMode.enabled': true,
  'legacyMode.timeouts.taskExecution': 300000,
  'legacyMode.timeouts.userVerification': 60000,
  'legacyMode.timeouts.sessionTotal': 1800000,
  'legacyMode.autoApproval.enabled': false,
  'legacyMode.autoApproval.fileOperations': false,
  'legacyMode.autoApproval.terminalCommands': false,
  'legacyMode.security.allowedCommands': ['npm', 'node', 'git', 'ls', 'dir', 'cat', 'type', 'echo'],
  'legacyMode.security.restrictToWorkspace': true,
  'legacyMode.security.maxFileSize': 10485760,
  'legacyMode.security.blockedPaths': ['.git', 'node_modules', '.env'],
  'legacyMode.ui.showProgressBar': true,
  'legacyMode.ui.showDetailedLogs': false,
  'legacyMode.ui.notificationLevel': 'warnings',
  'legacyMode.ui.autoScroll': true
};

const vscode = {
  workspace: {
    getConfiguration: (section) => ({
      get: (key, defaultValue) => {
        let fullKey;
        if (section === 'vsx') {
          fullKey = key; // For vsx.legacyMode.enabled etc.
        } else if (section === 'vsx.legacyMode') {
          fullKey = `legacyMode.${key}`; // For timeouts.taskExecution etc.
        } else {
          fullKey = section ? `${section}.${key}` : key;
        }
        return mockConfig[fullKey] !== undefined ? mockConfig[fullKey] : defaultValue;
      },
      update: async (key, value, global) => {
        let fullKey;
        if (section === 'vsx') {
          fullKey = key;
        } else if (section === 'vsx.legacyMode') {
          fullKey = `legacyMode.${key}`;
        } else {
          fullKey = section ? `${section}.${key}` : key;
        }
        mockConfig[fullKey] = value;
      }
    }),
    workspaceFolders: [{
      uri: { fsPath: '/test/workspace' }
    }]
  }
};

function runTests() {
  console.log('Running Legacy Mode Configuration Manager Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  function test(name, testFn) {
    try {
      testFn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${name}: ${error.message}`);
      failed++;
    }
  }
  
  // Reset config before each test
  function resetConfig() {
    Object.assign(mockConfig, {
      'legacyMode.enabled': true,
      'legacyMode.timeouts.taskExecution': 300000,
      'legacyMode.timeouts.userVerification': 60000,
      'legacyMode.timeouts.sessionTotal': 1800000,
      'legacyMode.autoApproval.enabled': false,
      'legacyMode.autoApproval.fileOperations': false,
      'legacyMode.autoApproval.terminalCommands': false,
      'legacyMode.security.allowedCommands': ['npm', 'node', 'git', 'ls', 'dir', 'cat', 'type', 'echo'],
      'legacyMode.security.restrictToWorkspace': true,
      'legacyMode.security.maxFileSize': 10485760,
      'legacyMode.security.blockedPaths': ['.git', 'node_modules', '.env'],
      'legacyMode.ui.showProgressBar': true,
      'legacyMode.ui.showDetailedLogs': false,
      'legacyMode.ui.notificationLevel': 'warnings',
      'legacyMode.ui.autoScroll': true
    });
  }

  // Basic Configuration Access Tests
  console.log('Basic Configuration Access Tests:');
  
  test('should check if Legacy Mode is enabled', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    assert.strictEqual(configManager.isEnabled(), true);
    
    mockConfig['legacyMode.enabled'] = false;
    assert.strictEqual(configManager.isEnabled(), false);
  });

  test('should get timeout settings', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    const timeouts = configManager.getTimeouts();
    assert.strictEqual(timeouts.taskExecution, 300000);
    assert.strictEqual(timeouts.userVerification, 60000);
    assert.strictEqual(timeouts.sessionTotal, 1800000);
  });

  test('should get auto-approval settings', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    const autoApproval = configManager.getAutoApprovalSettings();
    assert.strictEqual(autoApproval.enabled, false);
    assert.strictEqual(autoApproval.fileOperations, false);
    assert.strictEqual(autoApproval.terminalCommands, false);
  });

  test('should get security settings', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    const security = configManager.getSecuritySettings();
    assert.deepStrictEqual(security.allowedCommands, ['npm', 'node', 'git', 'ls', 'dir', 'cat', 'type', 'echo']);
    assert.strictEqual(security.restrictToWorkspace, true);
    assert.strictEqual(security.maxFileSize, 10485760);
    assert.deepStrictEqual(security.blockedPaths, ['.git', 'node_modules', '.env']);
  });

  test('should get UI settings', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    const ui = configManager.getUISettings();
    assert.strictEqual(ui.showProgressBar, true);
    assert.strictEqual(ui.showDetailedLogs, false);
    assert.strictEqual(ui.notificationLevel, 'warnings');
    assert.strictEqual(ui.autoScroll, true);
  });

  // Security Validation Tests
  console.log('\nSecurity Validation Tests:');
  
  test('should check if commands are allowed', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    assert.strictEqual(configManager.isCommandAllowed('npm install'), true);
    assert.strictEqual(configManager.isCommandAllowed('ls -la'), true);
    assert.strictEqual(configManager.isCommandAllowed('rm -rf /'), false);
    assert.strictEqual(configManager.isCommandAllowed('sudo something'), false);
  });

  test('should check if paths are blocked', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    assert.strictEqual(configManager.isPathBlocked('.git/config'), true);
    assert.strictEqual(configManager.isPathBlocked('node_modules/package'), true);
    assert.strictEqual(configManager.isPathBlocked('.env'), true);
    assert.strictEqual(configManager.isPathBlocked('src/main.js'), false);
  });

  test('should check file size limits', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    assert.strictEqual(configManager.isFileSizeAllowed(1024), true);
    assert.strictEqual(configManager.isFileSizeAllowed(10485760), true);
    assert.strictEqual(configManager.isFileSizeAllowed(20971520), false);
  });

  test('should validate workspace paths', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    
    // Test with workspace restriction disabled (should always pass)
    mockConfig['legacyMode.security.restrictToWorkspace'] = false;
    assert.strictEqual(configManager.isWorkspacePathValid('/any/path/file.js'), true);
    assert.strictEqual(configManager.isWorkspacePathValid('src/file.js'), true);
    
    // Test basic functionality - the complex path resolution is tested in integration
    // For unit tests, we just verify the configuration logic works
    mockConfig['legacyMode.security.restrictToWorkspace'] = true;
    
    // When workspace folders are not available, should return false
    const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    vscode.workspace.workspaceFolders = null;
    assert.strictEqual(configManager.isWorkspacePathValid('src/file.js'), false);
    
    // Restore workspace folders
    vscode.workspace.workspaceFolders = originalWorkspaceFolders;
  });

  // Auto-Approval Logic Tests
  console.log('\nAuto-Approval Logic Tests:');
  
  test('should auto-approve safe file operations', () => {
    resetConfig();
    
    // Mock path module for testing
    const originalRequire = require;
    require = function(id) {
      if (id === 'path') {
        return {
          resolve: (p) => {
            if (p.startsWith('/')) return p;
            return `/test/workspace/${p}`;
          }
        };
      }
      return originalRequire(id);
    };
    
    const configManager = new LegacyConfigManager(vscode);
    
    // Enable auto-approval
    mockConfig['legacyMode.autoApproval.enabled'] = true;
    mockConfig['legacyMode.autoApproval.fileOperations'] = true;
    
    // Test read operation (should pass)
    const readOp = { operation: 'read', filePath: 'src/file.js' };
    assert.strictEqual(configManager.shouldAutoApprove('file', readOp), true);
    
    // Test blocked path (should fail)
    const blockedOp = { operation: 'read', filePath: '.env' };
    assert.strictEqual(configManager.shouldAutoApprove('file', blockedOp), false);
    
    // Test write operation with workspace restriction disabled
    mockConfig['legacyMode.security.restrictToWorkspace'] = false;
    const writeOp = { operation: 'write', filePath: 'src/file.js', size: 1024 };
    assert.strictEqual(configManager.shouldAutoApprove('file', writeOp), true);
    
    // Restore require
    require = originalRequire;
  });

  test('should auto-approve safe terminal commands', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    
    // Enable auto-approval
    mockConfig['legacyMode.autoApproval.enabled'] = true;
    mockConfig['legacyMode.autoApproval.terminalCommands'] = true;
    
    assert.strictEqual(configManager.shouldAutoApprove('terminal', { command: 'ls -la' }), true);
    assert.strictEqual(configManager.shouldAutoApprove('terminal', { command: 'cat file.txt' }), true);
    assert.strictEqual(configManager.shouldAutoApprove('terminal', { command: 'npm install' }), false);
    assert.strictEqual(configManager.shouldAutoApprove('terminal', { command: 'rm file.txt' }), false);
  });

  // Notification Settings Tests
  console.log('\nNotification Settings Tests:');
  
  test('should determine notification visibility based on level', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    
    // Default is 'warnings'
    assert.strictEqual(configManager.shouldShowNotification('error'), true);
    assert.strictEqual(configManager.shouldShowNotification('warning'), true);
    assert.strictEqual(configManager.shouldShowNotification('info'), false);
    
    // Test 'all' level
    mockConfig['legacyMode.ui.notificationLevel'] = 'all';
    assert.strictEqual(configManager.shouldShowNotification('info'), true);
    
    // Test 'errors' level
    mockConfig['legacyMode.ui.notificationLevel'] = 'errors';
    assert.strictEqual(configManager.shouldShowNotification('warning'), false);
    assert.strictEqual(configManager.shouldShowNotification('error'), true);
    
    // Test 'none' level
    mockConfig['legacyMode.ui.notificationLevel'] = 'none';
    assert.strictEqual(configManager.shouldShowNotification('error'), false);
  });

  // Configuration Validation Tests
  console.log('\nConfiguration Validation Tests:');
  
  test('should validate correct settings', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    const validation = configManager.validateSettings();
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.errors.length, 0);
  });

  test('should detect invalid timeout settings', () => {
    resetConfig();
    mockConfig['legacyMode.timeouts.taskExecution'] = 500; // Too low
    mockConfig['legacyMode.timeouts.userVerification'] = 1000; // Too low
    
    const configManager = new LegacyConfigManager(vscode);
    const validation = configManager.validateSettings();
    assert.strictEqual(validation.valid, false);
    assert.strictEqual(validation.errors.length, 2);
  });

  // Settings Management Tests
  console.log('\nSettings Management Tests:');
  
  test('should get all settings as object', () => {
    resetConfig();
    const configManager = new LegacyConfigManager(vscode);
    const allSettings = configManager.getAllSettings();
    assert.ok(allSettings.enabled !== undefined);
    assert.ok(allSettings.timeouts !== undefined);
    assert.ok(allSettings.autoApproval !== undefined);
    assert.ok(allSettings.security !== undefined);
    assert.ok(allSettings.ui !== undefined);
  });

  // Test without VSCode (null instance)
  console.log('\nNull VSCode Instance Tests:');
  
  test('should work without VSCode instance', () => {
    const configManager = new LegacyConfigManager(null);
    assert.strictEqual(configManager.isEnabled(), true);
    
    const timeouts = configManager.getTimeouts();
    assert.strictEqual(timeouts.taskExecution, 300000);
    
    const security = configManager.getSecuritySettings();
    assert.ok(Array.isArray(security.allowedCommands));
    
    // Should allow workspace paths when VSCode is not available
    assert.strictEqual(configManager.isWorkspacePathValid('/any/path'), true);
  });

  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All tests passed! ✓');
  }
}

runTests();