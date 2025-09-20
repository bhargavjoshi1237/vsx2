/**
 * Unit tests for Legacy Mode Configuration Manager
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
  'legacyMode.security.allowedCommands': ['npm', 'node', 'git', 'ls', 'dir'],
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
        const fullKey = section ? `${section}.${key}` : key;
        return mockConfig[fullKey] !== undefined ? mockConfig[fullKey] : defaultValue;
      },
      update: async (key, value, global) => {
        const fullKey = section ? `${section}.${key}` : key;
        mockConfig[fullKey] = value;
      }
    }),
    workspaceFolders: [{
      uri: { fsPath: '/test/workspace' }
    }]
  }
};

// Mock require for vscode
const originalRequire = require;
require = function(id) {
  if (id === 'vscode') {
    return vscode;
  }
  if (id === 'path') {
    return {
      resolve: (p) => p.startsWith('/') ? p : `/test/workspace/${p}`,
      join: (...parts) => parts.join('/')
    };
  }
  return originalRequire(id);
};

describe('LegacyConfigManager', () => {
  let configManager;

  beforeEach(() => {
    configManager = new LegacyConfigManager(vscode);
    // Reset mock config to defaults
    Object.assign(mockConfig, {
      'legacyMode.enabled': true,
      'legacyMode.timeouts.taskExecution': 300000,
      'legacyMode.timeouts.userVerification': 60000,
      'legacyMode.timeouts.sessionTotal': 1800000,
      'legacyMode.autoApproval.enabled': false,
      'legacyMode.autoApproval.fileOperations': false,
      'legacyMode.autoApproval.terminalCommands': false,
      'legacyMode.security.allowedCommands': ['npm', 'node', 'git', 'ls', 'dir'],
      'legacyMode.security.restrictToWorkspace': true,
      'legacyMode.security.maxFileSize': 10485760,
      'legacyMode.security.blockedPaths': ['.git', 'node_modules', '.env'],
      'legacyMode.ui.showProgressBar': true,
      'legacyMode.ui.showDetailedLogs': false,
      'legacyMode.ui.notificationLevel': 'warnings',
      'legacyMode.ui.autoScroll': true
    });
  });

  describe('Basic Configuration Access', () => {
    it('should check if Legacy Mode is enabled', () => {
      assert.strictEqual(configManager.isEnabled(), true);
      
      mockConfig['legacyMode.enabled'] = false;
      assert.strictEqual(configManager.isEnabled(), false);
    });

    it('should get timeout settings', () => {
      const timeouts = configManager.getTimeouts();
      assert.strictEqual(timeouts.taskExecution, 300000);
      assert.strictEqual(timeouts.userVerification, 60000);
      assert.strictEqual(timeouts.sessionTotal, 1800000);
    });

    it('should get auto-approval settings', () => {
      const autoApproval = configManager.getAutoApprovalSettings();
      assert.strictEqual(autoApproval.enabled, false);
      assert.strictEqual(autoApproval.fileOperations, false);
      assert.strictEqual(autoApproval.terminalCommands, false);
    });

    it('should get security settings', () => {
      const security = configManager.getSecuritySettings();
      assert.deepStrictEqual(security.allowedCommands, ['npm', 'node', 'git', 'ls', 'dir']);
      assert.strictEqual(security.restrictToWorkspace, true);
      assert.strictEqual(security.maxFileSize, 10485760);
      assert.deepStrictEqual(security.blockedPaths, ['.git', 'node_modules', '.env']);
    });

    it('should get UI settings', () => {
      const ui = configManager.getUISettings();
      assert.strictEqual(ui.showProgressBar, true);
      assert.strictEqual(ui.showDetailedLogs, false);
      assert.strictEqual(ui.notificationLevel, 'warnings');
      assert.strictEqual(ui.autoScroll, true);
    });
  });

  describe('Security Validation', () => {
    it('should check if commands are allowed', () => {
      assert.strictEqual(configManager.isCommandAllowed('npm install'), true);
      assert.strictEqual(configManager.isCommandAllowed('ls -la'), true);
      assert.strictEqual(configManager.isCommandAllowed('rm -rf /'), false);
      assert.strictEqual(configManager.isCommandAllowed('sudo something'), false);
    });

    it('should check if paths are blocked', () => {
      assert.strictEqual(configManager.isPathBlocked('.git/config'), true);
      assert.strictEqual(configManager.isPathBlocked('node_modules/package'), true);
      assert.strictEqual(configManager.isPathBlocked('.env'), true);
      assert.strictEqual(configManager.isPathBlocked('src/main.js'), false);
      
      // Test wildcard patterns
      mockConfig['legacyMode.security.blockedPaths'] = ['*.key', '*.pem'];
      assert.strictEqual(configManager.isPathBlocked('private.key'), true);
      assert.strictEqual(configManager.isPathBlocked('cert.pem'), true);
      assert.strictEqual(configManager.isPathBlocked('config.json'), false);
    });

    it('should check file size limits', () => {
      assert.strictEqual(configManager.isFileSizeAllowed(1024), true);
      assert.strictEqual(configManager.isFileSizeAllowed(10485760), true);
      assert.strictEqual(configManager.isFileSizeAllowed(20971520), false);
    });

    it('should validate workspace paths', () => {
      assert.strictEqual(configManager.isWorkspacePathValid('/test/workspace/src/file.js'), true);
      assert.strictEqual(configManager.isWorkspacePathValid('src/file.js'), true);
      assert.strictEqual(configManager.isWorkspacePathValid('/other/path/file.js'), false);
      
      // Test with workspace restriction disabled
      mockConfig['legacyMode.security.restrictToWorkspace'] = false;
      assert.strictEqual(configManager.isWorkspacePathValid('/other/path/file.js'), true);
    });
  });

  describe('Auto-Approval Logic', () => {
    beforeEach(() => {
      mockConfig['legacyMode.autoApproval.enabled'] = true;
      mockConfig['legacyMode.autoApproval.fileOperations'] = true;
      mockConfig['legacyMode.autoApproval.terminalCommands'] = true;
    });

    it('should auto-approve safe file operations', () => {
      const readOp = { operation: 'read', filePath: 'src/file.js' };
      assert.strictEqual(configManager.shouldAutoApprove('file', readOp), true);
      
      const writeOp = { operation: 'write', filePath: 'src/file.js', size: 1024 };
      assert.strictEqual(configManager.shouldAutoApprove('file', writeOp), true);
      
      const blockedOp = { operation: 'read', filePath: '.env' };
      assert.strictEqual(configManager.shouldAutoApprove('file', blockedOp), false);
    });

    it('should auto-approve safe terminal commands', () => {
      assert.strictEqual(configManager.shouldAutoApprove('terminal', { command: 'ls -la' }), true);
      assert.strictEqual(configManager.shouldAutoApprove('terminal', { command: 'cat file.txt' }), true);
      assert.strictEqual(configManager.shouldAutoApprove('terminal', { command: 'npm install' }), false);
      assert.strictEqual(configManager.shouldAutoApprove('terminal', { command: 'rm file.txt' }), false);
    });

    it('should not auto-approve when disabled', () => {
      mockConfig['legacyMode.autoApproval.enabled'] = false;
      
      const readOp = { operation: 'read', filePath: 'src/file.js' };
      assert.strictEqual(configManager.shouldAutoApprove('file', readOp), false);
      
      assert.strictEqual(configManager.shouldAutoApprove('terminal', { command: 'ls' }), false);
    });
  });

  describe('Notification Settings', () => {
    it('should determine notification visibility based on level', () => {
      // Default is 'warnings'
      assert.strictEqual(configManager.shouldShowNotification('error'), true);
      assert.strictEqual(configManager.shouldShowNotification('warning'), true);
      assert.strictEqual(configManager.shouldShowNotification('info'), false);
      
      mockConfig['legacyMode.ui.notificationLevel'] = 'all';
      assert.strictEqual(configManager.shouldShowNotification('info'), true);
      
      mockConfig['legacyMode.ui.notificationLevel'] = 'errors';
      assert.strictEqual(configManager.shouldShowNotification('warning'), false);
      assert.strictEqual(configManager.shouldShowNotification('error'), true);
      
      mockConfig['legacyMode.ui.notificationLevel'] = 'none';
      assert.strictEqual(configManager.shouldShowNotification('error'), false);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate correct settings', () => {
      const validation = configManager.validateSettings();
      assert.strictEqual(validation.valid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    it('should detect invalid timeout settings', () => {
      mockConfig['legacyMode.timeouts.taskExecution'] = 500; // Too low
      mockConfig['legacyMode.timeouts.userVerification'] = 1000; // Too low
      
      const validation = configManager.validateSettings();
      assert.strictEqual(validation.valid, false);
      assert.strictEqual(validation.errors.length, 2);
    });

    it('should detect invalid session timeout', () => {
      mockConfig['legacyMode.timeouts.sessionTotal'] = 60000; // Less than task timeout
      
      const validation = configManager.validateSettings();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('Session total timeout')));
    });

    it('should detect invalid file size', () => {
      mockConfig['legacyMode.security.maxFileSize'] = 512; // Too small
      
      const validation = configManager.validateSettings();
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('Maximum file size')));
    });
  });

  describe('Settings Management', () => {
    it('should get all settings as object', () => {
      const allSettings = configManager.getAllSettings();
      assert.ok(allSettings.enabled !== undefined);
      assert.ok(allSettings.timeouts !== undefined);
      assert.ok(allSettings.autoApproval !== undefined);
      assert.ok(allSettings.security !== undefined);
      assert.ok(allSettings.ui !== undefined);
    });

    it('should update individual settings', async () => {
      await configManager.updateSetting('timeouts.taskExecution', 600000);
      assert.strictEqual(mockConfig['legacyMode.timeouts.taskExecution'], 600000);
    });
  });
});

// Restore original require
require = originalRequire;

module.exports = { mockConfig };