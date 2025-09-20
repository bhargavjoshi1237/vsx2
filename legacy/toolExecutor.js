// Conditionally require vscode - will be null in test environment
let vscode;
try {
    vscode = require('vscode');
} catch (error) {
    // VSCode not available (likely in test environment)
    vscode = null;
}

const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Tool Executor Framework for Legacy Mode
 * Provides comprehensive tooling support for autonomous execution
 */
class ToolExecutor {
    constructor(vscodeInstance = null) {
        this.vscode = vscodeInstance || vscode;
        this.supportedTools = new Set([
            'readFile', 'writeFile', 'createFile', 'deleteFile',
            'searchFiles', 'findInFiles',
            'executeCommand', 'executeTerminal',
            'showMessage', 'openFile', 'executeVSCodeCommand'
        ]);
        
        // Initialize configuration manager
        const LegacyConfigManager = require('./configManager');
        this.configManager = new LegacyConfigManager();
    }

    /**
     * Execute a tool with given parameters
     * @param {string} toolName - Name of the tool to execute
     * @param {object} params - Parameters for the tool
     * @param {object} context - Execution context
     * @returns {Promise<object>} Tool execution result
     */
    async executeTool(toolName, params, context = {}) {
        const { errorHandler, LegacyModeError, ERROR_CATEGORIES } = require('./errorHandler');
        const { performanceMonitor } = require('./performanceMonitor');
        
        const startTime = Date.now();
        
        try {
            // Validate tool name
            if (!toolName || typeof toolName !== 'string') {
                throw new LegacyModeError('Tool name is required and must be a string', {
                    category: ERROR_CATEGORIES.VALIDATION,
                    code: 'INVALID_TOOL_NAME',
                    context: { toolName, params }
                });
            }

            if (!this.supportedTools.has(toolName)) {
                throw new LegacyModeError(`Unsupported tool: ${toolName}`, {
                    category: ERROR_CATEGORIES.VALIDATION,
                    code: 'UNSUPPORTED_TOOL',
                    context: { 
                        toolName, 
                        supportedTools: Array.from(this.supportedTools),
                        params 
                    },
                    suggestions: [
                        `Use one of the supported tools: ${Array.from(this.supportedTools).join(', ')}`,
                        'Check the tool name spelling',
                        'Verify the tool is available in this context'
                    ]
                });
            }

            // Validate parameters with enhanced error handling
            try {
                this.validateToolParams(toolName, params);
            } catch (validationError) {
                throw new LegacyModeError(`Invalid parameters for tool ${toolName}: ${validationError.message}`, {
                    category: ERROR_CATEGORIES.VALIDATION,
                    code: 'INVALID_TOOL_PARAMS',
                    context: { toolName, params, validationError: validationError.message }
                });
            }

            // Execute tool with retry logic for appropriate operations
            const result = await errorHandler.executeWithRetry(async () => {
                switch (toolName) {
                    case 'readFile':
                        return await this.readFile(params);
                    case 'writeFile':
                        return await this.writeFile(params);
                    case 'createFile':
                        return await this.createFile(params);
                    case 'deleteFile':
                        return await this.deleteFile(params);
                    case 'searchFiles':
                        return await this.searchFiles(params);
                    case 'findInFiles':
                        return await this.findInFiles(params);
                    case 'executeCommand':
                        return await this.executeCommand(params);
                    case 'executeTerminal':
                        return await this.executeTerminal(params);
                    case 'showMessage':
                        return await this.showMessage(params);
                    case 'openFile':
                        return await this.openFile(params);
                    case 'executeVSCodeCommand':
                        return await this.executeVSCodeCommand(params);
                    default:
                        throw new LegacyModeError(`Tool ${toolName} not implemented`, {
                            category: ERROR_CATEGORIES.SYSTEM,
                            code: 'TOOL_NOT_IMPLEMENTED',
                            context: { toolName }
                        });
                }
            }, {
                maxAttempts: this.getRetryAttemptsForTool(toolName),
                retryableErrors: this.getRetryableErrorsForTool(toolName)
            });

            const duration = Date.now() - startTime;
            performanceMonitor.recordToolExecution(toolName, duration, true);
            
            return this.formatToolResult(result, toolName, true);
            
        } catch (error) {
            const duration = Date.now() - startTime;
            performanceMonitor.recordToolExecution(toolName, duration, false);
            
            const handledError = errorHandler.handleError(error, {
                context: 'tool_execution',
                toolName,
                params,
                executionContext: context
            });
            
            return this.formatToolResult(handledError, toolName, false);
        }
    }

    /**
     * Get retry attempts for specific tool types
     * @param {string} toolName - Name of the tool
     * @returns {number} Number of retry attempts
     */
    getRetryAttemptsForTool(toolName) {
        const retryConfig = {
            'readFile': 3,
            'writeFile': 2,
            'createFile': 2,
            'deleteFile': 2,
            'searchFiles': 3,
            'findInFiles': 3,
            'executeCommand': 2,
            'executeTerminal': 1, // Terminal operations shouldn't be retried
            'showMessage': 2,
            'openFile': 3,
            'executeVSCodeCommand': 2
        };
        
        return retryConfig[toolName] || 2;
    }

    /**
     * Get retryable error categories for specific tool types
     * @param {string} toolName - Name of the tool
     * @returns {Array<string>} Array of retryable error categories
     */
    getRetryableErrorsForTool(toolName) {
        const { ERROR_CATEGORIES } = require('./errorHandler');
        
        const baseRetryable = [ERROR_CATEGORIES.NETWORK, ERROR_CATEGORIES.TIMEOUT];
        
        const toolSpecificRetryable = {
            'readFile': [...baseRetryable, ERROR_CATEGORIES.FILE_SYSTEM],
            'writeFile': [...baseRetryable, ERROR_CATEGORIES.FILE_SYSTEM],
            'createFile': [...baseRetryable, ERROR_CATEGORIES.FILE_SYSTEM],
            'deleteFile': [...baseRetryable, ERROR_CATEGORIES.FILE_SYSTEM],
            'searchFiles': [...baseRetryable, ERROR_CATEGORIES.VSCODE_API],
            'findInFiles': [...baseRetryable, ERROR_CATEGORIES.VSCODE_API],
            'executeCommand': [...baseRetryable, ERROR_CATEGORIES.SYSTEM],
            'executeTerminal': [], // Don't retry terminal operations
            'showMessage': [...baseRetryable, ERROR_CATEGORIES.VSCODE_API],
            'openFile': [...baseRetryable, ERROR_CATEGORIES.VSCODE_API, ERROR_CATEGORIES.FILE_SYSTEM],
            'executeVSCodeCommand': [...baseRetryable, ERROR_CATEGORIES.VSCODE_API]
        };
        
        return toolSpecificRetryable[toolName] || baseRetryable;
    }

    /**
     * Validate tool parameters
     * @param {string} toolName - Name of the tool
     * @param {object} params - Parameters to validate
     */
    validateToolParams(toolName, params) {
        const validations = {
            readFile: ['filePath'],
            writeFile: ['filePath', 'content'],
            createFile: ['filePath'],
            deleteFile: ['filePath'],
            searchFiles: ['pattern'],
            findInFiles: ['searchTerm'],
            executeCommand: ['command'],
            executeTerminal: ['command'],
            showMessage: ['message'],
            openFile: ['filePath'],
            executeVSCodeCommand: ['command']
        };

        const required = validations[toolName] || [];
        for (const param of required) {
            if (!(param in params)) {
                throw new Error(`Missing required parameter '${param}' for tool '${toolName}'`);
            }
        }
    }

    /**
     * Format tool execution result
     * @param {any} result - Raw result or error
     * @param {string} toolName - Name of the tool
     * @param {boolean} success - Whether execution was successful
     * @returns {object} Formatted result
     */
    formatToolResult(result, toolName, success) {
        const { LegacyModeError } = require('./errorHandler');
        
        const baseResult = {
            toolName,
            success,
            timestamp: new Date().toISOString()
        };

        if (success) {
            return {
                ...baseResult,
                result: result,
                error: null
            };
        } else {
            // Handle error formatting
            let errorInfo = {
                message: 'Unknown error occurred',
                stack: null,
                code: null,
                category: null,
                suggestions: []
            };

            if (result instanceof LegacyModeError) {
                errorInfo = {
                    message: result.userMessage || result.message,
                    stack: result.stack,
                    code: result.code,
                    category: result.category,
                    suggestions: result.suggestions,
                    recoverable: result.recoverable,
                    retryable: result.retryable,
                    context: result.context
                };
            } else if (result instanceof Error) {
                errorInfo = {
                    message: result.message,
                    stack: result.stack,
                    code: result.code || null,
                    category: null,
                    suggestions: this.generateErrorSuggestions(toolName, result)
                };
            } else if (typeof result === 'string') {
                errorInfo.message = result;
            } else if (result && typeof result === 'object') {
                errorInfo = {
                    ...errorInfo,
                    ...result,
                    message: result.message || result.userMessage || errorInfo.message
                };
            }

            return {
                ...baseResult,
                result: null,
                error: errorInfo
            };
        }
    }

    /**
     * Generate error suggestions for specific tools
     * @param {string} toolName - Name of the tool that failed
     * @param {Error} error - The error that occurred
     * @returns {Array<string>} Array of suggestion strings
     */
    generateErrorSuggestions(toolName, error) {
        const message = error.message.toLowerCase();
        const suggestions = [];

        // Tool-specific suggestions
        switch (toolName) {
            case 'readFile':
                if (message.includes('enoent') || message.includes('not found')) {
                    suggestions.push('Check if the file path is correct');
                    suggestions.push('Verify the file exists in the workspace');
                }
                if (message.includes('eacces') || message.includes('permission')) {
                    suggestions.push('Check file read permissions');
                    suggestions.push('Ensure the file is not locked by another process');
                }
                break;

            case 'writeFile':
            case 'createFile':
                if (message.includes('enospc')) {
                    suggestions.push('Check available disk space');
                }
                if (message.includes('eacces') || message.includes('permission')) {
                    suggestions.push('Check file write permissions');
                    suggestions.push('Ensure the directory is writable');
                }
                break;

            case 'executeCommand':
                if (message.includes('command not found') || message.includes('not recognized')) {
                    suggestions.push('Check if the command is installed and available in PATH');
                    suggestions.push('Verify the command syntax');
                }
                if (message.includes('timeout')) {
                    suggestions.push('Try increasing the timeout duration');
                    suggestions.push('Check if the command is hanging');
                }
                break;

            case 'searchFiles':
            case 'findInFiles':
                if (message.includes('workspace')) {
                    suggestions.push('Ensure a workspace folder is open in VSCode');
                    suggestions.push('Check workspace permissions');
                }
                break;

            case 'openFile':
                if (message.includes('not found')) {
                    suggestions.push('Verify the file path is correct');
                    suggestions.push('Check if the file exists in the workspace');
                }
                break;
        }

        // General suggestions if no specific ones were added
        if (suggestions.length === 0) {
            suggestions.push('Check the tool parameters');
            suggestions.push('Verify the operation is supported in the current context');
            suggestions.push('Try the operation again');
        }

        return suggestions;
    }

    // File Operations

    /**
     * Read file content
     * @param {object} params - {filePath: string}
     * @returns {Promise<object>} File content and metadata
     */
    async readFile(params) {
        const { LegacyModeError, ERROR_CATEGORIES } = require('./errorHandler');
        const { filePath } = params;
        
        if (!this.vscode) {
            throw new LegacyModeError('VSCode API not available', {
                category: ERROR_CATEGORIES.VSCODE_API,
                code: 'VSCODE_API_UNAVAILABLE',
                context: { operation: 'readFile' },
                suggestions: [
                    'Ensure VSCode extension is properly loaded',
                    'Check if running in correct environment',
                    'Restart VSCode if necessary'
                ]
            });
        }
        
        const workspaceFolder = this.vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            throw new LegacyModeError('No workspace folder open', {
                category: ERROR_CATEGORIES.VSCODE_API,
                code: 'NO_WORKSPACE_FOLDER',
                context: { operation: 'readFile', filePath },
                suggestions: [
                    'Open a folder or workspace in VSCode',
                    'Ensure the workspace is properly initialized',
                    'Check workspace permissions'
                ]
            });
        }

        try {
            // Security checks using configuration
            if (!this.configManager.isWorkspacePathValid(filePath)) {
                throw new LegacyModeError('File access outside workspace is not allowed', {
                    category: ERROR_CATEGORIES.PERMISSION,
                    code: 'PATH_TRAVERSAL_DENIED',
                    context: { filePath, workspacePath: workspaceFolder.uri.fsPath },
                    suggestions: [
                        'Ensure file path is within the workspace',
                        'Check workspace restriction settings',
                        'Use relative paths from workspace root'
                    ]
                });
            }
            
            if (this.configManager.isPathBlocked(filePath)) {
                throw new LegacyModeError('File path is blocked by security settings', {
                    category: ERROR_CATEGORIES.PERMISSION,
                    code: 'PATH_BLOCKED',
                    context: { filePath, blockedPaths: this.configManager.getSecuritySettings().blockedPaths },
                    suggestions: [
                        'Check blocked paths in Legacy Mode settings',
                        'Use a different file path',
                        'Update security settings if appropriate'
                    ]
                });
            }
            
            const fullPath = path.resolve(workspaceFolder.uri.fsPath, filePath);
            
            // Additional security check - ensure file is within workspace
            if (!fullPath.startsWith(workspaceFolder.uri.fsPath)) {
                throw new LegacyModeError('File access outside workspace is not allowed', {
                    category: ERROR_CATEGORIES.PERMISSION,
                    code: 'PATH_TRAVERSAL_DENIED',
                    context: { filePath, fullPath, workspacePath: workspaceFolder.uri.fsPath },
                    retryable: false,
                    suggestions: [
                        'Use relative paths within the workspace',
                        'Check the file path for directory traversal attempts',
                        'Ensure the file is within the workspace boundaries'
                    ]
                });
            }

            // Check if file exists before reading
            try {
                await fs.access(fullPath, fs.constants.F_OK);
            } catch (accessError) {
                throw new LegacyModeError(`File not found: ${filePath}`, {
                    category: ERROR_CATEGORIES.FILE_SYSTEM,
                    code: 'FILE_NOT_FOUND',
                    context: { filePath, fullPath },
                    retryable: false,
                    suggestions: [
                        'Check if the file path is correct',
                        'Verify the file exists in the workspace',
                        'Ensure the file has not been moved or deleted'
                    ]
                });
            }

            // Read file content and get stats
            const [content, stats] = await Promise.all([
                fs.readFile(fullPath, 'utf8').catch(error => {
                    if (error.code === 'EISDIR') {
                        throw new LegacyModeError(`Path is a directory, not a file: ${filePath}`, {
                            category: ERROR_CATEGORIES.FILE_SYSTEM,
                            code: 'PATH_IS_DIRECTORY',
                            context: { filePath, fullPath },
                            retryable: false
                        });
                    }
                    throw error;
                }),
                fs.stat(fullPath)
            ]);

            // Validate file size (prevent reading extremely large files)
            const maxFileSize = 10 * 1024 * 1024; // 10MB limit
            if (stats.size > maxFileSize) {
                throw new LegacyModeError(`File too large to read: ${stats.size} bytes (max: ${maxFileSize} bytes)`, {
                    category: ERROR_CATEGORIES.VALIDATION,
                    code: 'FILE_TOO_LARGE',
                    context: { filePath, fileSize: stats.size, maxSize: maxFileSize },
                    retryable: false,
                    suggestions: [
                        'Use a smaller file',
                        'Read the file in chunks if necessary',
                        'Consider using a different approach for large files'
                    ]
                });
            }

            return {
                filePath,
                content,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                encoding: 'utf8'
            };

        } catch (error) {
            if (error instanceof LegacyModeError) {
                throw error;
            }

            // Handle specific file system errors
            if (error.code === 'ENOENT') {
                throw new LegacyModeError(`File not found: ${filePath}`, {
                    category: ERROR_CATEGORIES.FILE_SYSTEM,
                    code: 'FILE_NOT_FOUND',
                    context: { filePath, systemError: error.code },
                    originalError: error
                });
            } else if (error.code === 'EACCES') {
                throw new LegacyModeError(`Permission denied reading file: ${filePath}`, {
                    category: ERROR_CATEGORIES.PERMISSION,
                    code: 'READ_PERMISSION_DENIED',
                    context: { filePath, systemError: error.code },
                    originalError: error,
                    retryable: false
                });
            } else if (error.code === 'EMFILE' || error.code === 'ENFILE') {
                throw new LegacyModeError('Too many open files', {
                    category: ERROR_CATEGORIES.SYSTEM,
                    code: 'TOO_MANY_OPEN_FILES',
                    context: { filePath, systemError: error.code },
                    originalError: error
                });
            }

            // Generic file system error
            throw new LegacyModeError(`Failed to read file: ${error.message}`, {
                category: ERROR_CATEGORIES.FILE_SYSTEM,
                code: 'FILE_READ_ERROR',
                context: { filePath, systemError: error.code },
                originalError: error
            });
        }
    }

    /**
     * Write content to file
     * @param {object} params - {filePath: string, content: string, append?: boolean}
     * @returns {Promise<object>} Write operation result
     */
    async writeFile(params) {
        const { LegacyModeError, ERROR_CATEGORIES } = require('./errorHandler');
        const { filePath, content, append = false } = params;
        
        if (!this.vscode) {
            throw new LegacyModeError('VSCode API not available', {
                category: ERROR_CATEGORIES.VSCODE_API,
                code: 'VSCODE_API_UNAVAILABLE',
                context: { operation: 'writeFile' }
            });
        }
        
        const workspaceFolder = this.vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            throw new LegacyModeError('No workspace folder open', {
                category: ERROR_CATEGORIES.VSCODE_API,
                code: 'NO_WORKSPACE_FOLDER',
                context: { operation: 'writeFile', filePath }
            });
        }

        // Security checks using configuration
        if (!this.configManager.isWorkspacePathValid(filePath)) {
            throw new LegacyModeError('File write outside workspace is not allowed', {
                category: ERROR_CATEGORIES.PERMISSION,
                code: 'PATH_TRAVERSAL_DENIED',
                context: { filePath, workspacePath: workspaceFolder.uri.fsPath }
            });
        }
        
        if (this.configManager.isPathBlocked(filePath)) {
            throw new LegacyModeError('File path is blocked by security settings', {
                category: ERROR_CATEGORIES.PERMISSION,
                code: 'PATH_BLOCKED',
                context: { filePath, blockedPaths: this.configManager.getSecuritySettings().blockedPaths }
            });
        }
        
        // Check file size limits
        const contentSize = Buffer.byteLength(content, 'utf8');
        if (!this.configManager.isFileSizeAllowed(contentSize)) {
            throw new LegacyModeError('File content exceeds maximum allowed size', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'FILE_SIZE_EXCEEDED',
                context: { 
                    filePath, 
                    contentSize, 
                    maxSize: this.configManager.getSecuritySettings().maxFileSize 
                }
            });
        }

        const fullPath = path.resolve(workspaceFolder.uri.fsPath, filePath);
        
        // Security check
        if (!fullPath.startsWith(workspaceFolder.uri.fsPath)) {
            throw new Error('File access outside workspace is not allowed');
        }

        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        if (append) {
            await fs.appendFile(fullPath, content, 'utf8');
        } else {
            await fs.writeFile(fullPath, content, 'utf8');
        }

        const stats = await fs.stat(fullPath);

        return {
            filePath,
            operation: append ? 'append' : 'write',
            bytesWritten: Buffer.byteLength(content, 'utf8'),
            modified: stats.mtime.toISOString()
        };
    }

    /**
     * Create new file
     * @param {object} params - {filePath: string, content?: string}
     * @returns {Promise<object>} Creation result
     */
    async createFile(params) {
        const { filePath, content = '' } = params;
        
        if (!this.vscode) {
            throw new Error('VSCode API not available');
        }
        
        const workspaceFolder = this.vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const fullPath = path.resolve(workspaceFolder.uri.fsPath, filePath);
        
        // Security check
        if (!fullPath.startsWith(workspaceFolder.uri.fsPath)) {
            throw new Error('File access outside workspace is not allowed');
        }

        // Check if file already exists
        try {
            await fs.access(fullPath);
            throw new Error(`File already exists: ${filePath}`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf8');

        return {
            filePath,
            created: true,
            size: Buffer.byteLength(content, 'utf8')
        };
    }

    /**
     * Delete file
     * @param {object} params - {filePath: string}
     * @returns {Promise<object>} Deletion result
     */
    async deleteFile(params) {
        const { filePath } = params;
        
        if (!this.vscode) {
            throw new Error('VSCode API not available');
        }
        
        const workspaceFolder = this.vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const fullPath = path.resolve(workspaceFolder.uri.fsPath, filePath);
        
        // Security check
        if (!fullPath.startsWith(workspaceFolder.uri.fsPath)) {
            throw new Error('File access outside workspace is not allowed');
        }

        await fs.unlink(fullPath);

        return {
            filePath,
            deleted: true
        };
    }

    // Search Operations

    /**
     * Search for files by pattern
     * @param {object} params - {pattern: string, maxResults?: number}
     * @returns {Promise<object>} Search results
     */
    async searchFiles(params) {
        const { pattern, maxResults = 50 } = params;
        
        if (!this.vscode) {
            throw new Error('VSCode API not available');
        }
        
        const files = await this.vscode.workspace.findFiles(
            pattern,
            '**/node_modules/**',
            maxResults
        );

        return {
            pattern,
            results: files.map(uri => ({
                path: this.vscode.workspace.asRelativePath(uri),
                uri: uri.toString()
            })),
            count: files.length,
            truncated: files.length >= maxResults
        };
    }

    /**
     * Find text in files
     * @param {object} params - {searchTerm: string, filePattern?: string, maxResults?: number}
     * @returns {Promise<object>} Search results with matches
     */
    async findInFiles(params) {
        const { searchTerm, filePattern = '**/*', maxResults = 100 } = params;
        
        if (!this.vscode) {
            throw new Error('VSCode API not available');
        }
        
        const files = await this.vscode.workspace.findFiles(
            filePattern,
            '**/node_modules/**',
            1000
        );

        const results = [];
        let totalMatches = 0;

        for (const file of files) {
            if (totalMatches >= maxResults) break;

            try {
                const content = await fs.readFile(file.fsPath, 'utf8');
                const lines = content.split('\n');
                const matches = [];

                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(searchTerm)) {
                        matches.push({
                            line: i + 1,
                            content: lines[i].trim(),
                            context: {
                                before: lines[i - 1]?.trim() || '',
                                after: lines[i + 1]?.trim() || ''
                            }
                        });
                        totalMatches++;
                        
                        if (totalMatches >= maxResults) break;
                    }
                }

                if (matches.length > 0) {
                    results.push({
                        file: this.vscode.workspace.asRelativePath(file),
                        matches
                    });
                }
            } catch (error) {
                // Skip files that can't be read (binary, permissions, etc.)
                continue;
            }
        }

        return {
            searchTerm,
            filePattern,
            results,
            totalMatches,
            truncated: totalMatches >= maxResults
        };
    }

    // Terminal Operations

    /**
     * Execute command and capture output
     * @param {object} params - {command: string, cwd?: string, timeout?: number}
     * @returns {Promise<object>} Command execution result
     */
    async executeCommand(params) {
        const { LegacyModeError, ERROR_CATEGORIES } = require('./errorHandler');
        const { command, cwd, timeout = 30000 } = params;
        
        // Security check - validate command is allowed
        if (!this.configManager.isCommandAllowed(command)) {
            throw new LegacyModeError('Command is not allowed by security settings', {
                category: ERROR_CATEGORIES.PERMISSION,
                code: 'COMMAND_BLOCKED',
                context: { 
                    command, 
                    allowedCommands: this.configManager.getSecuritySettings().allowedCommands 
                },
                suggestions: [
                    'Check allowed commands in Legacy Mode settings',
                    'Use a different command',
                    'Update security settings if appropriate'
                ]
            });
        }
        
        const workspaceFolder = this.vscode?.workspace.workspaceFolders?.[0];
        
        const workingDir = cwd ? 
            path.resolve(workspaceFolder?.uri.fsPath || process.cwd(), cwd) :
            workspaceFolder?.uri.fsPath || process.cwd();

        // Apply timeout from configuration
        const configTimeouts = this.configManager.getTimeouts();
        const effectiveTimeout = Math.min(timeout, configTimeouts.taskExecution);

        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: workingDir,
                timeout: effectiveTimeout,
                maxBuffer: 1024 * 1024 // 1MB buffer
            });

            return {
                command,
                cwd: workingDir,
                exitCode: 0,
                stdout: stdout.toString(),
                stderr: stderr.toString(),
                success: true
            };
        } catch (error) {
            return {
                command,
                cwd: workingDir,
                exitCode: error.code || 1,
                stdout: error.stdout?.toString() || '',
                stderr: error.stderr?.toString() || error.message,
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute command in VSCode terminal
     * @param {object} params - {command: string, terminalName?: string}
     * @returns {Promise<object>} Terminal execution result
     */
    async executeTerminal(params) {
        const { command, terminalName = 'Legacy Mode' } = params;
        
        if (!this.vscode) {
            throw new Error('VSCode API not available');
        }
        
        let terminal = this.vscode.window.terminals.find(t => t.name === terminalName);
        
        if (!terminal) {
            terminal = this.vscode.window.createTerminal(terminalName);
        }

        terminal.show();
        terminal.sendText(command);

        return {
            command,
            terminalName,
            executed: true,
            note: 'Command sent to terminal. Check terminal output for results.'
        };
    }

    // VSCode Integration

    /**
     * Show message to user
     * @param {object} params - {message: string, type?: 'info'|'warning'|'error'}
     * @returns {Promise<object>} Message display result
     */
    async showMessage(params) {
        const { message, type = 'info' } = params;
        
        if (!this.vscode) {
            throw new Error('VSCode API not available');
        }
        
        let result;
        switch (type) {
            case 'warning':
                result = await this.vscode.window.showWarningMessage(message);
                break;
            case 'error':
                result = await this.vscode.window.showErrorMessage(message);
                break;
            default:
                result = await this.vscode.window.showInformationMessage(message);
        }

        return {
            message,
            type,
            displayed: true,
            userResponse: result || null
        };
    }

    /**
     * Open file in editor
     * @param {object} params - {filePath: string, line?: number, column?: number}
     * @returns {Promise<object>} File open result
     */
    async openFile(params) {
        const { filePath, line, column } = params;
        
        if (!this.vscode) {
            throw new Error('VSCode API not available');
        }
        
        const workspaceFolder = this.vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const fullPath = path.resolve(workspaceFolder.uri.fsPath, filePath);
        const uri = this.vscode.Uri.file(fullPath);
        
        const document = await this.vscode.workspace.openTextDocument(uri);
        const editor = await this.vscode.window.showTextDocument(document);

        if (line !== undefined) {
            const position = new this.vscode.Position(
                Math.max(0, line - 1), 
                Math.max(0, column - 1 || 0)
            );
            editor.selection = new this.vscode.Selection(position, position);
            editor.revealRange(new this.vscode.Range(position, position));
        }

        return {
            filePath,
            opened: true,
            line: line || null,
            column: column || null
        };
    }

    /**
     * Execute VSCode command
     * @param {object} params - {command: string, args?: any[]}
     * @returns {Promise<object>} Command execution result
     */
    async executeVSCodeCommand(params) {
        const { command, args = [] } = params;
        
        if (!this.vscode) {
            throw new Error('VSCode API not available');
        }
        
        try {
            const result = await this.vscode.commands.executeCommand(command, ...args);
            
            return {
                command,
                args,
                executed: true,
                result: result !== undefined ? result : null
            };
        } catch (error) {
            throw new Error(`Failed to execute VSCode command '${command}': ${error.message}`);
        }
    }

    /**
     * Get list of supported tools
     * @returns {Array<string>} List of supported tool names
     */
    getSupportedTools() {
        return Array.from(this.supportedTools);
    }
}

module.exports = { ToolExecutor };