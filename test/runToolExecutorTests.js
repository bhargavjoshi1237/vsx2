/**
 * Simple test runner for ToolExecutor
 * This runs basic validation tests without requiring VSCode test environment
 */

const assert = require('assert');

// Mock VSCode API for testing
const mockVscode = {
    workspace: {
        workspaceFolders: [{
            uri: {
                fsPath: process.cwd() // Use current working directory as mock workspace
            }
        }],
        findFiles: () => Promise.resolve([
            { toString: () => 'file:///mock/workspace/test1.js' },
            { toString: () => 'file:///mock/workspace/test2.js' }
        ]),
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

// Mock fs promises
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

// Mock child_process
const mockChildProcess = {
    exec: () => Promise.resolve({
        stdout: 'command output',
        stderr: ''
    })
};

// Override require for mocking
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
    switch(id) {
        case 'fs':
            return { promises: mockFs };
        case 'child_process':
            return mockChildProcess;
        case 'util':
            return { promisify: (fn) => fn };
        default:
            return originalRequire.apply(this, arguments);
    }
};

// Import ToolExecutor after setting up mocks
const { ToolExecutor } = require('../legacy/toolExecutor');

async function runTests() {
    console.log('Running ToolExecutor tests...\n');
    
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
    
    async function asyncTest(name, testFn) {
        try {
            await testFn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (error) {
            console.log(`✗ ${name}: ${error.message}`);
            failed++;
        }
    }
    
    const toolExecutor = new ToolExecutor(mockVscode);
    
    // Basic functionality tests
    test('should initialize with supported tools', () => {
        const supportedTools = toolExecutor.getSupportedTools();
        assert(supportedTools.includes('readFile'));
        assert(supportedTools.includes('writeFile'));
        assert(supportedTools.includes('executeCommand'));
        assert(supportedTools.includes('showMessage'));
    });
    
    test('should validate tool parameters correctly', () => {
        // Should not throw for valid parameters
        toolExecutor.validateToolParams('readFile', { filePath: 'test.js' });
        
        // Should throw for missing parameters
        try {
            toolExecutor.validateToolParams('readFile', {});
            assert.fail('Should have thrown error for missing parameters');
        } catch (error) {
            assert(error.message.includes('Missing required parameter'));
        }
    });
    
    test('should format tool results correctly', () => {
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
    
    // File operations tests
    await asyncTest('should read file successfully', async () => {
        const result = await toolExecutor.executeTool('readFile', {
            filePath: 'test.js'
        });
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.result.content, 'mock file content');
        assert.strictEqual(result.result.size, 100);
    });
    
    await asyncTest('should write file successfully', async () => {
        const result = await toolExecutor.executeTool('writeFile', {
            filePath: 'test.js',
            content: 'console.log("test");'
        });
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.result.operation, 'write');
    });
    
    await asyncTest('should create file successfully', async () => {
        const result = await toolExecutor.executeTool('createFile', {
            filePath: 'newfile.js',
            content: 'new content'
        });
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.result.created, true);
    });
    
    await asyncTest('should delete file successfully', async () => {
        const result = await toolExecutor.executeTool('deleteFile', {
            filePath: 'test.js'
        });
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.result.deleted, true);
    });
    
    // Search operations tests
    await asyncTest('should search files by pattern', async () => {
        const result = await toolExecutor.executeTool('searchFiles', {
            pattern: '**/*.js'
        });
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.result.results.length, 2);
        assert.strictEqual(result.result.pattern, '**/*.js');
    });
    
    // Terminal operations tests
    await asyncTest('should execute command successfully', async () => {
        const result = await toolExecutor.executeTool('executeCommand', {
            command: 'echo "test"'
        });
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.result.stdout, 'command output');
        assert.strictEqual(result.result.exitCode, 0);
    });
    
    await asyncTest('should execute terminal command', async () => {
        const result = await toolExecutor.executeTool('executeTerminal', {
            command: 'npm test'
        });
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.result.executed, true);
    });
    
    // VSCode integration tests
    await asyncTest('should show message', async () => {
        const result = await toolExecutor.executeTool('showMessage', {
            message: 'Test message'
        });
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.result.displayed, true);
    });
    
    await asyncTest('should open file in editor', async () => {
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
    
    await asyncTest('should execute VSCode command', async () => {
        const result = await toolExecutor.executeTool('executeVSCodeCommand', {
            command: 'workbench.action.files.save',
            args: ['arg1', 'arg2']
        });
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.result.executed, true);
        assert.strictEqual(result.result.result, 'command result');
    });
    
    // Error handling tests
    await asyncTest('should handle unsupported tool', async () => {
        const result = await toolExecutor.executeTool('unsupportedTool', {});
        
        assert.strictEqual(result.success, false);
        assert(result.error.message.includes('Unsupported tool'));
    });
    
    await asyncTest('should reject file access outside workspace', async () => {
        const result = await toolExecutor.executeTool('readFile', {
            filePath: '../../../etc/passwd'
        });
        
        assert.strictEqual(result.success, false);
        assert(result.error.message.includes('outside workspace'));
    });
    
    test('should include timestamp in all results', async () => {
        const result = await toolExecutor.executeTool('unsupportedTool', {});
        
        assert(result.timestamp);
        assert(new Date(result.timestamp) instanceof Date);
    });
    
    // Summary
    console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
        process.exit(1);
    } else {
        console.log('All tests passed! ✓');
    }
}

// Restore original require
Module.prototype.require = originalRequire;

// Run tests
runTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
});