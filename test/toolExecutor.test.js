const assert = require('assert');
const { ToolExecutor } = require('../legacy/toolExecutor');

// Mock VSCode API
const mockVscode = {
    workspace: {
        workspaceFolders: [{
            uri: {
                fsPath: '/mock/workspace'
            }
        }],
        findFiles: () => Promise.resolve([]),
        openTextDocument: () => Promise.resolve({}),
        asRelativePath: (uri) => uri.toString().replace('file:///mock/workspace/', '')
    },
    window: {
        terminals: [],
        createTerminal: () => ({
            show: () => {},
            sendText: () => {}
        }),
        showInformationMessage: () => Promise.resolve('OK'),
        showWarningMessage: () => Promise.resolve(),
        showErrorMessage: () => Promise.resolve(),
        showTextDocument: () => Promise.resolve({
            selection: null,
            revealRange: () => {}
        })
    },
    commands: {
        executeCommand: () => Promise.resolve('command result')
    },
    Uri: {
        file: (path) => ({ toString: () => `file://${path}` })
    },
    Position: function(line, col) { return { line, character: col }; },
    Selection: function(pos1, pos2) { return { start: pos1, end: pos2 }; },
    Range: function(pos1, pos2) { return { start: pos1, end: pos2 }; }
};

// Mock Node.js modules
const mockFs = {
    readFile: () => Promise.resolve('mock file content'),
    writeFile: () => Promise.resolve(),
    appendFile: () => Promise.resolve(),
    mkdir: () => Promise.resolve(),
    stat: () => Promise.resolve({
        size: 100,
        mtime: new Date('2023-01-01')
    }),
    access: () => Promise.reject({ code: 'ENOENT' }),
    unlink: () => Promise.resolve()
};

const mockChildProcess = {
    exec: () => Promise.resolve({
        stdout: 'command output',
        stderr: ''
    })
};

// Override require to return mocks
const originalRequire = require;
require = function(id) {
    switch(id) {
        case 'vscode':
            return mockVscode;
        case 'fs':
            return { promises: mockFs };
        case 'child_process':
            return mockChildProcess;
        case 'util':
            return { promisify: (fn) => fn };
        default:
            return originalRequire(id);
    }
};

describe('ToolExecutor', () => {
    let toolExecutor;

    beforeEach(() => {
        toolExecutor = new ToolExecutor(mockVscode);
    });

    describe('Constructor and Basic Methods', () => {
        it('should initialize with supported tools', () => {
            const supportedTools = toolExecutor.getSupportedTools();
            assert(supportedTools.includes('readFile'));
            assert(supportedTools.includes('writeFile'));
            assert(supportedTools.includes('executeCommand'));
            assert(supportedTools.includes('showMessage'));
        });

        it('should validate tool parameters correctly', () => {
            // Should not throw for valid parameters
            toolExecutor.validateToolParams('readFile', { filePath: 'test.js' });

            // Should throw for missing parameters
            assert.throws(() => {
                toolExecutor.validateToolParams('readFile', {});
            }, /Missing required parameter 'filePath' for tool 'readFile'/);
        });

        it('should format tool results correctly', () => {
            const successResult = toolExecutor.formatToolResult('test result', 'readFile', true);
            assert.strictEqual(successResult.toolName, 'readFile');
            assert.strictEqual(successResult.success, true);
            assert.strictEqual(successResult.result, 'test result');
            assert.strictEqual(successResult.error, null);

            const errorResult = toolExecutor.formatToolResult(new Error('test error'), 'readFile', false);
            assert.strictEqual(errorResult.toolName, 'readFile');
            assert.strictEqual(errorResult.success, false);
            assert.strictEqual(errorResult.result, null);
            assert.strictEqual(errorResult.error.message, 'test error');
        });
    });

    describe('File Operations', () => {
        describe('readFile', () => {
            it('should read file successfully', async () => {
                const result = await toolExecutor.executeTool('readFile', {
                    filePath: 'test.js'
                });

                assert.strictEqual(result.success, true);
                assert.strictEqual(result.result.content, 'mock file content');
                assert.strictEqual(result.result.size, 100);
            });

            it('should reject file access outside workspace', async () => {
                const result = await toolExecutor.executeTool('readFile', {
                    filePath: '../../../etc/passwd'
                });

                assert.strictEqual(result.success, false);
                assert(result.error.message.includes('outside workspace'));
            });

            it('should handle file not found error', async () => {
                // Override mock to simulate error
                const originalReadFile = mockFs.readFile;
                mockFs.readFile = () => Promise.reject(new Error('ENOENT: no such file'));

                const result = await toolExecutor.executeTool('readFile', {
                    filePath: 'nonexistent.js'
                });

                assert.strictEqual(result.success, false);
                assert(result.error.message.includes('ENOENT'));

                // Restore mock
                mockFs.readFile = originalReadFile;
            });
        });

        describe('writeFile', () => {
            it('should write file successfully', async () => {
                const result = await toolExecutor.executeTool('writeFile', {
                    filePath: 'test.js',
                    content: 'console.log("test");'
                });

                assert.strictEqual(result.success, true);
                assert.strictEqual(result.result.operation, 'write');
            });

            it('should append to file when specified', async () => {
                const result = await toolExecutor.executeTool('writeFile', {
                    filePath: 'test.js',
                    content: 'new line',
                    append: true
                });

                assert.strictEqual(result.success, true);
                assert.strictEqual(result.result.operation, 'append');
            });
        });

        describe('createFile', () => {
            it('should create new file successfully', async () => {
                const result = await toolExecutor.executeTool('createFile', {
                    filePath: 'newfile.js',
                    content: 'new content'
                });

                assert.strictEqual(result.success, true);
                assert.strictEqual(result.result.created, true);
            });

            it('should fail if file already exists', async () => {
                // Override mock to simulate file exists
                const originalAccess = mockFs.access;
                mockFs.access = () => Promise.resolve();

                const result = await toolExecutor.executeTool('createFile', {
                    filePath: 'existing.js'
                });

                assert.strictEqual(result.success, false);
                assert(result.error.message.includes('already exists'));

                // Restore mock
                mockFs.access = originalAccess;
            });
        });

        describe('deleteFile', () => {
            it('should delete file successfully', async () => {
                const result = await toolExecutor.executeTool('deleteFile', {
                    filePath: 'test.js'
                });

                assert.strictEqual(result.success, true);
                assert.strictEqual(result.result.deleted, true);
            });
        });
    });

    describe('Search Operations', () => {
        describe('searchFiles', () => {
            it('should search files by pattern', async () => {
                // Override mock to return test files
                const originalFindFiles = mockVscode.workspace.findFiles;
                mockVscode.workspace.findFiles = () => Promise.resolve([
                    { toString: () => 'file:///mock/workspace/test1.js' },
                    { toString: () => 'file:///mock/workspace/test2.js' }
                ]);

                const result = await toolExecutor.executeTool('searchFiles', {
                    pattern: '**/*.js'
                });

                assert.strictEqual(result.success, true);
                assert.strictEqual(result.result.results.length, 2);
                assert.strictEqual(result.result.pattern, '**/*.js');

                // Restore mock
                mockVscode.workspace.findFiles = originalFindFiles;
            });
        });

        describe('findInFiles', () => {
            it('should find text in files', async () => {
                // Override mocks for this test
                const originalFindFiles = mockVscode.workspace.findFiles;
                const originalReadFile = mockFs.readFile;
                
                mockVscode.workspace.findFiles = () => Promise.resolve([
                    { fsPath: '/mock/workspace/test.js' }
                ]);
                mockFs.readFile = () => Promise.resolve('line 1\ntest content\nline 3');

                const result = await toolExecutor.executeTool('findInFiles', {
                    searchTerm: 'test content'
                });

                assert.strictEqual(result.success, true);
                assert.strictEqual(result.result.results.length, 1);
                assert.strictEqual(result.result.results[0].matches.length, 1);
                assert.strictEqual(result.result.results[0].matches[0].line, 2);

                // Restore mocks
                mockVscode.workspace.findFiles = originalFindFiles;
                mockFs.readFile = originalReadFile;
            });
        });
    });

    describe('Terminal Operations', () => {
        describe('executeCommand', () => {
            it('should execute command successfully', async () => {
                const result = await toolExecutor.executeTool('executeCommand', {
                    command: 'echo "test"'
                });

                assert.strictEqual(result.success, true);
                assert.strictEqual(result.result.stdout, 'command output');
                assert.strictEqual(result.result.exitCode, 0);
            });

            it('should handle command failure', async () => {
                // Override mock to simulate command failure
                const originalExec = mockChildProcess.exec;
                mockChildProcess.exec = () => {
                    const error = new Error('Command failed');
                    error.code = 1;
                    error.stdout = 'partial output';
                    error.stderr = 'error message';
                    return Promise.reject(error);
                };

                const result = await toolExecutor.executeTool('executeCommand', {
                    command: 'invalid-command'
                });

                assert.strictEqual(result.success, true); // Tool execution succeeded, command failed
                assert.strictEqual(result.result.success, false);
                assert.strictEqual(result.result.exitCode, 1);

                // Restore mock
                mockChildProcess.exec = originalExec;
            });
        });

        describe('executeTerminal', () => {
            it('should execute command in terminal', async () => {
                const mockTerminal = {
                    name: 'Legacy Mode',
                    show: () => {},
                    sendText: () => {}
                };

                mockVscode.window.terminals = [mockTerminal];

                const result = await toolExecutor.executeTool('executeTerminal', {
                    command: 'npm test'
                });

                assert.strictEqual(result.success, true);
                assert.strictEqual(result.result.executed, true);
            });

            it('should create new terminal if not found', async () => {
                mockVscode.window.terminals = [];

                const result = await toolExecutor.executeTool('executeTerminal', {
                    command: 'npm test'
                });

                assert.strictEqual(result.success, true);
            });
        });
    });

    describe('VSCode Integration', () => {
        describe('showMessage', () => {
            it('should show info message', async () => {
                const result = await toolExecutor.executeTool('showMessage', {
                    message: 'Test message'
                });

                assert.strictEqual(result.success, true);
                assert.strictEqual(result.result.displayed, true);
            });

            it('should show warning message', async () => {
                const result = await toolExecutor.executeTool('showMessage', {
                    message: 'Warning message',
                    type: 'warning'
                });

                assert.strictEqual(result.success, true);
            });

            it('should show error message', async () => {
                const result = await toolExecutor.executeTool('showMessage', {
                    message: 'Error message',
                    type: 'error'
                });

                assert.strictEqual(result.success, true);
            });
        });

        describe('openFile', () => {
            it('should open file in editor', async () => {
                const result = await toolExecutor.executeTool('openFile', {
                    filePath: 'test.js',
                    line: 5,
                    column: 10
                });

                assert.strictEqual(result.success, true);
                assert.strictEqual(result.result.opened, true);
                assert.strictEqual(result.result.line, 5);
                assert.strictEqual(result.result.column, 10);
            });
        });

        describe('executeVSCodeCommand', () => {
            it('should execute VSCode command', async () => {
                const result = await toolExecutor.executeTool('executeVSCodeCommand', {
                    command: 'workbench.action.files.save',
                    args: ['arg1', 'arg2']
                });

                assert.strictEqual(result.success, true);
                assert.strictEqual(result.result.executed, true);
                assert.strictEqual(result.result.result, 'command result');
            });

            it('should handle command execution failure', async () => {
                // Override mock to simulate command failure
                const originalExecuteCommand = mockVscode.commands.executeCommand;
                mockVscode.commands.executeCommand = () => Promise.reject(new Error('Command not found'));

                const result = await toolExecutor.executeTool('executeVSCodeCommand', {
                    command: 'invalid.command'
                });

                assert.strictEqual(result.success, false);
                assert(result.error.message.includes('Command not found'));

                // Restore mock
                mockVscode.commands.executeCommand = originalExecuteCommand;
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle unsupported tool', async () => {
            const result = await toolExecutor.executeTool('unsupportedTool', {});

            assert.strictEqual(result.success, false);
            assert(result.error.message.includes('Unsupported tool'));
        });

        it('should handle missing workspace folder', async () => {
            // Override mock to simulate no workspace
            const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
            mockVscode.workspace.workspaceFolders = null;

            const result = await toolExecutor.executeTool('readFile', {
                filePath: 'test.js'
            });

            assert.strictEqual(result.success, false);
            assert(result.error.message.includes('No workspace folder'));

            // Restore mock
            mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
        });

        it('should include timestamp in all results', async () => {
            const result = await toolExecutor.executeTool('unsupportedTool', {});

            assert(result.timestamp);
            assert(new Date(result.timestamp) instanceof Date);
        });
    });
});

// Restore original require
require = originalRequire;