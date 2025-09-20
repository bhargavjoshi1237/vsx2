/**
 * Legacy Mode Configuration Manager
 * Handles all configuration settings for Legacy Mode autonomous execution
 */

// Conditionally require vscode - will be null in test environment
let vscode;
try {
  vscode = require('vscode');
} catch (error) {
  // VSCode not available (likely in test environment)
  vscode = null;
}

class LegacyConfigManager {
  constructor(vscodeInstance = null) {
    this.configSection = 'vsx.legacyMode';
    this.vscode = vscodeInstance || vscode;
  }

  /**
   * Get the VSCode configuration object for Legacy Mode
   * @returns {vscode.WorkspaceConfiguration}
   */
  getConfig() {
    if (!this.vscode) {
      return null;
    }
    return this.vscode.workspace.getConfiguration('vsx.legacyMode');
  }

  /**
   * Check if Legacy Mode is enabled
   * @returns {boolean}
   */
  isEnabled() {
    if (!this.vscode) {
      return true; // Default for tests
    }
    return this.vscode.workspace.getConfiguration('vsx').get('legacyMode.enabled', true);
  }

  /**
   * Get timeout settings
   * @returns {Object}
   */
  getTimeouts() {
    const config = this.getConfig();
    if (!config) {
      return {
        taskExecution: 300000, // 5 minutes
        userVerification: 60000, // 1 minute
        sessionTotal: 1800000 // 30 minutes
      };
    }
    return {
      taskExecution: config.get('timeouts.taskExecution', 300000), // 5 minutes
      userVerification: config.get('timeouts.userVerification', 60000), // 1 minute
      sessionTotal: config.get('timeouts.sessionTotal', 1800000) // 30 minutes
    };
  }

  /**
   * Get auto-approval settings
   * @returns {Object}
   */
  getAutoApprovalSettings() {
    const config = this.getConfig();
    if (!config) {
      return {
        enabled: false,
        fileOperations: false,
        terminalCommands: false
      };
    }
    return {
      enabled: config.get('autoApproval.enabled', false),
      fileOperations: config.get('autoApproval.fileOperations', false),
      terminalCommands: config.get('autoApproval.terminalCommands', false)
    };
  }

  /**
   * Get security settings
   * @returns {Object}
   */
  getSecuritySettings() {
    const config = this.getConfig();
    const defaults = {
      allowedCommands: ['npm', 'node', 'git', 'ls', 'dir', 'cat', 'type', 'echo'],
      restrictToWorkspace: true,
      maxFileSize: 10485760, // 10MB
      blockedPaths: ['.git', 'node_modules', '.env', '*.key', '*.pem']
    };
    
    if (!config) {
      return defaults;
    }
    
    return {
      allowedCommands: config.get('security.allowedCommands', defaults.allowedCommands),
      restrictToWorkspace: config.get('security.restrictToWorkspace', defaults.restrictToWorkspace),
      maxFileSize: config.get('security.maxFileSize', defaults.maxFileSize),
      blockedPaths: config.get('security.blockedPaths', defaults.blockedPaths)
    };
  }

  /**
   * Get UI preferences
   * @returns {Object}
   */
  getUISettings() {
    const config = this.getConfig();
    const defaults = {
      showProgressBar: true,
      showDetailedLogs: false,
      notificationLevel: 'warnings',
      autoScroll: true
    };
    
    if (!config) {
      return defaults;
    }
    
    return {
      showProgressBar: config.get('ui.showProgressBar', defaults.showProgressBar),
      showDetailedLogs: config.get('ui.showDetailedLogs', defaults.showDetailedLogs),
      notificationLevel: config.get('ui.notificationLevel', defaults.notificationLevel),
      autoScroll: config.get('ui.autoScroll', defaults.autoScroll)
    };
  }

  /**
   * Check if a command is allowed for execution
   * @param {string} command - The command to check
   * @returns {boolean}
   */
  isCommandAllowed(command) {
    const allowedCommands = this.getSecuritySettings().allowedCommands;
    const baseCommand = command.split(' ')[0].toLowerCase();
    return allowedCommands.includes(baseCommand);
  }

  /**
   * Check if a file path is blocked
   * @param {string} filePath - The file path to check
   * @returns {boolean}
   */
  isPathBlocked(filePath) {
    const blockedPaths = this.getSecuritySettings().blockedPaths;
    const normalizedPath = filePath.toLowerCase();
    
    return blockedPaths.some(pattern => {
      if (pattern.includes('*')) {
        // Handle wildcard patterns
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(normalizedPath);
      }
      return normalizedPath.includes(pattern.toLowerCase());
    });
  }

  /**
   * Check if file size is within limits
   * @param {number} fileSize - Size in bytes
   * @returns {boolean}
   */
  isFileSizeAllowed(fileSize) {
    const maxSize = this.getSecuritySettings().maxFileSize;
    return fileSize <= maxSize;
  }

  /**
   * Validate workspace restriction for file path
   * @param {string} filePath - The file path to validate
   * @returns {boolean}
   */
  isWorkspacePathValid(filePath) {
    const restrictToWorkspace = this.getSecuritySettings().restrictToWorkspace;
    
    if (!restrictToWorkspace) {
      return true;
    }

    if (!this.vscode) {
      return true; // Allow in test environment
    }

    const workspaceFolders = this.vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return false;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const path = require('path');
    const resolvedPath = path.resolve(filePath);
    const resolvedWorkspace = path.resolve(workspacePath);
    
    return resolvedPath.startsWith(resolvedWorkspace);
  }

  /**
   * Should auto-approve a specific operation
   * @param {string} operationType - Type of operation (file, terminal, etc.)
   * @param {Object} operationDetails - Details about the operation
   * @returns {boolean}
   */
  shouldAutoApprove(operationType, operationDetails = {}) {
    const autoApproval = this.getAutoApprovalSettings();
    
    if (!autoApproval.enabled) {
      return false;
    }

    switch (operationType) {
      case 'file':
        return autoApproval.fileOperations && 
               this.isFileSafeForAutoApproval(operationDetails);
      
      case 'terminal':
        return autoApproval.terminalCommands && 
               this.isCommandSafeForAutoApproval(operationDetails.command);
      
      default:
        return false;
    }
  }

  /**
   * Check if a file operation is safe for auto-approval
   * @param {Object} fileDetails - File operation details
   * @returns {boolean}
   */
  isFileSafeForAutoApproval(fileDetails) {
    const { operation, filePath, size } = fileDetails;
    
    // Only auto-approve read operations and small writes
    if (operation === 'read') {
      return !this.isPathBlocked(filePath);
    }
    
    if (operation === 'write' || operation === 'create') {
      return !this.isPathBlocked(filePath) && 
             this.isFileSizeAllowed(size || 0) &&
             this.isWorkspacePathValid(filePath);
    }
    
    return false;
  }

  /**
   * Check if a command is safe for auto-approval
   * @param {string} command - The command to check
   * @returns {boolean}
   */
  isCommandSafeForAutoApproval(command) {
    if (!this.isCommandAllowed(command)) {
      return false;
    }

    const safeCommands = ['ls', 'dir', 'cat', 'type', 'echo', 'pwd'];
    const baseCommand = command.split(' ')[0].toLowerCase();
    
    return safeCommands.includes(baseCommand);
  }

  /**
   * Get notification level for displaying messages
   * @returns {string}
   */
  getNotificationLevel() {
    return this.getUISettings().notificationLevel;
  }

  /**
   * Should show notification based on level
   * @param {string} messageLevel - Level of the message (error, warning, info)
   * @returns {boolean}
   */
  shouldShowNotification(messageLevel) {
    const configLevel = this.getNotificationLevel();
    
    const levels = {
      'none': 0,
      'errors': 1,
      'warnings': 2,
      'all': 3
    };
    
    const messageLevels = {
      'error': 1,
      'warning': 2,
      'info': 3
    };
    
    return messageLevels[messageLevel] <= levels[configLevel];
  }

  /**
   * Update a configuration setting
   * @param {string} key - Configuration key (dot notation)
   * @param {any} value - New value
   * @param {boolean} global - Whether to update globally or for workspace
   * @returns {Promise<void>}
   */
  async updateSetting(key, value, global = false) {
    if (!this.vscode) {
      return; // Skip in test environment
    }
    const fullKey = `legacyMode.${key}`;
    await this.vscode.workspace.getConfiguration('vsx').update(fullKey, value, global);
  }

  /**
   * Reset all Legacy Mode settings to defaults
   * @param {boolean} global - Whether to reset globally or for workspace
   * @returns {Promise<void>}
   */
  async resetToDefaults(global = false) {
    if (!this.vscode) {
      return; // Skip in test environment
    }
    
    const config = this.vscode.workspace.getConfiguration('vsx');
    const keys = [
      'legacyMode.enabled',
      'legacyMode.timeouts.taskExecution',
      'legacyMode.timeouts.userVerification', 
      'legacyMode.timeouts.sessionTotal',
      'legacyMode.autoApproval.enabled',
      'legacyMode.autoApproval.fileOperations',
      'legacyMode.autoApproval.terminalCommands',
      'legacyMode.security.allowedCommands',
      'legacyMode.security.restrictToWorkspace',
      'legacyMode.security.maxFileSize',
      'legacyMode.security.blockedPaths',
      'legacyMode.ui.showProgressBar',
      'legacyMode.ui.showDetailedLogs',
      'legacyMode.ui.notificationLevel',
      'legacyMode.ui.autoScroll'
    ];

    for (const key of keys) {
      await config.update(key, undefined, global);
    }
  }

  /**
   * Get all Legacy Mode settings as an object
   * @returns {Object}
   */
  getAllSettings() {
    return {
      enabled: this.isEnabled(),
      timeouts: this.getTimeouts(),
      autoApproval: this.getAutoApprovalSettings(),
      security: this.getSecuritySettings(),
      ui: this.getUISettings()
    };
  }

  /**
   * Validate configuration settings
   * @returns {Object} Validation result with errors if any
   */
  validateSettings() {
    const errors = [];
    const timeouts = this.getTimeouts();
    const security = this.getSecuritySettings();

    // Validate timeouts
    if (timeouts.taskExecution < 1000) {
      errors.push('Task execution timeout must be at least 1 second');
    }
    if (timeouts.userVerification < 5000) {
      errors.push('User verification timeout must be at least 5 seconds');
    }
    if (timeouts.sessionTotal < timeouts.taskExecution) {
      errors.push('Session total timeout must be greater than task execution timeout');
    }

    // Validate security settings
    if (security.maxFileSize < 1024) {
      errors.push('Maximum file size must be at least 1KB');
    }
    if (!Array.isArray(security.allowedCommands)) {
      errors.push('Allowed commands must be an array');
    }
    if (!Array.isArray(security.blockedPaths)) {
      errors.push('Blocked paths must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = LegacyConfigManager;