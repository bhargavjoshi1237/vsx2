/**
 * Integration tests for Legacy Mode Error Handling and Recovery
 */

const { 
    ErrorHandler, 
    LegacyModeError, 
    ERROR_CATEGORIES, 
    ERROR_SEVERITY 
} = require('../legacy/errorHandler');
const { LegacyLogger, LOG_LEVELS } = require('../legacy/logger');
const { TodoManager } = require('../legacy/todoManager');
const { ToolExecutor } = require('../legacy/toolExecutor');
const { ContextManager } = require('../legacy/contextManager');

describe('Error Handling Integration Tests', () => {
    let errorHandler;
    let logger;
    let todoManager;
    let toolExecutor;
    let contextManager;

    beforeEach(() => {
        logger = new LegacyLogger({ level: LOG_LEVELS.DEBUG });
        errorHandler = new ErrorHandler({ logger });
        todoManager = new TodoManager();
        toolExecutor = new ToolExecutor();
        contextManager = new ContextManager();
    });

    afterEach(() => {
        errorHandler.clearErrorLog();
        logger.clearLogs();
        contextManager.clearAllSessions();
    });

    describe('TodoManager Error Handling', () => {
        test('should handle invalid TODO creation gracefully', () => {
            expect(() => {
                todoManager.createTodo('', 'Expected result');
            }).toThrow(LegacyModeError);

            expect(() => {
                todoManager.createTodo('Valid description', '');
            }).toThrow(LegacyModeError);

            expect(() => {
                todoManager.createTodo(null, 'Expected result');
            }).toThrow(LegacyModeError);

            expect(() => {
                todoManager.createTodo('Valid description', null);
            }).toThrow(LegacyModeError);
        });

        test('should provide helpful error messages for TODO validation', () => {
            try {
                todoManager.createTodo('', 'Expected result');
            } catch (error) {
                expect(error).toBeInstanceOf(LegacyModeError);
                expect(error.code).toBe('EMPTY_DESCRIPTION');
                expect(error.suggestions).toBeInstanceOf(Array);
                expect(error.suggestions.length).toBeGreaterThan(0);
            }
        });

        test('should handle duplicate custom IDs', () => {
            todoManager.createTodo('First TODO', 'Result 1', 'custom-id');
            
            expect(() => {
                todoManager.createTodo('Second TODO', 'Result 2', 'custom-id');
            }).toThrow(LegacyModeError);
        });

        test('should handle very long descriptions', () => {
            const longDescription = 'x'.repeat(1001);
            
            expect(() => {
                todoManager.createTodo(longDescription, 'Expected result');
            }).toThrow(LegacyModeError);
        });
    });

    describe('ContextManager Error Handling', () => {
        test('should validate session creation parameters', () => {
            expect(() => {
                contextManager.createSession('', 'model-id', 'request-id');
            }).toThrow(LegacyModeError);

            expect(() => {
                contextManager.createSession('Valid task', '', 'request-id');
            }).toThrow(LegacyModeError);

            expect(() => {
                contextManager.createSession('Valid task', 'model-id', '');
            }).toThrow(LegacyModeError);
        });

        test('should provide helpful error messages for session validation', () => {
            try {
                contextManager.createSession(null, 'model-id', 'request-id');
            } catch (error) {
                expect(error).toBeInstanceOf(LegacyModeError);
                expect(error.code).toBe('INVALID_TASK');
                expect(error.suggestions).toContain('Provide a clear task description');
            }
        });

        test('should handle session limit gracefully', () => {
            // Create many sessions to test limit
            const sessions = [];
            for (let i = 0; i < 100; i++) {
                sessions.push(contextManager.createSession(`Task ${i}`, 'model-id', `request-${i}`));
            }

            // This should trigger the session limit
            expect(() => {
                contextManager.createSession('Overflow task', 'model-id', 'overflow-request');
            }).toThrow(LegacyModeError);
        });
    });

    describe('ToolExecutor Error Handling', () => {
        test('should validate tool names and parameters', async () => {
            await expect(toolExecutor.executeTool('', {})).rejects.toThrow(LegacyModeError);
            await expect(toolExecutor.executeTool('invalidTool', {})).rejects.toThrow(LegacyModeError);
            await expect(toolExecutor.executeTool('readFile', {})).rejects.toThrow(LegacyModeError);
        });

        test('should provide helpful error messages for tool validation', async () => {
            try {
                await toolExecutor.executeTool('invalidTool', {});
            } catch (error) {
                expect(error.error.code).toBe('UNSUPPORTED_TOOL');
                expect(error.error.suggestions).toContain('Use one of the supported tools: readFile, writeFile, createFile, deleteFile, searchFiles, findInFiles, executeCommand, executeTerminal, showMessage, openFile, executeVSCodeCommand');
            }
        });

        test('should handle VSCode API unavailability gracefully', async () => {
            const result = await toolExecutor.executeTool('readFile', { filePath: 'test.txt' });
            
            expect(result.success).toBe(false);
            expect(result.error.code).toBe('VSCODE_API_UNAVAILABLE');
            expect(result.error.suggestions).toContain('Ensure VSCode extension is properly loaded');
        });

        test('should format tool errors consistently', async () => {
            const result = await toolExecutor.executeTool('readFile', { filePath: 'test.txt' });
            
            expect(result).toHaveProperty('toolName', 'readFile');
            expect(result).toHaveProperty('success', false);
            expect(result).toHaveProperty('timestamp');
            expect(result).toHaveProperty('error');
            expect(result.error).toHaveProperty('message');
            expect(result.error).toHaveProperty('code');
            expect(result.error).toHaveProperty('suggestions');
        });
    });

    describe('Retry Logic Integration', () => {
        test('should retry retryable operations', async () => {
            let attempts = 0;
            const operation = jest.fn().mockImplementation(() => {
                attempts++;
                if (attempts < 3) {
                    throw new LegacyModeError('Network timeout', {
                        category: ERROR_CATEGORIES.NETWORK
                    });
                }
                return 'success';
            });

            const result = await errorHandler.executeWithRetry(operation, {
                maxAttempts: 3,
                baseDelayMs: 10
            });

            expect(result).toBe('success');
            expect(attempts).toBe(3);
        });

        test('should not retry non-retryable operations', async () => {
            const operation = jest.fn().mockImplementation(() => {
                throw new LegacyModeError('Validation failed', {
                    category: ERROR_CATEGORIES.VALIDATION,
                    retryable: false
                });
            });

            await expect(errorHandler.executeWithRetry(operation)).rejects.toThrow('Validation failed');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        test('should respect maximum attempts', async () => {
            const operation = jest.fn().mockImplementation(() => {
                throw new LegacyModeError('Always fails', {
                    category: ERROR_CATEGORIES.NETWORK
                });
            });

            await expect(errorHandler.executeWithRetry(operation, {
                maxAttempts: 2,
                baseDelayMs: 10
            })).rejects.toThrow('Always fails');
            
            expect(operation).toHaveBeenCalledTimes(2);
        });
    });

    describe('Logging Integration', () => {
        test('should log errors with appropriate levels', () => {
            const criticalError = new LegacyModeError('Critical failure', {
                severity: ERROR_SEVERITY.CRITICAL
            });
            const lowError = new LegacyModeError('Minor issue', {
                severity: ERROR_SEVERITY.LOW
            });

            errorHandler.handleError(criticalError);
            errorHandler.handleError(lowError);

            const logs = logger.getLogs();
            const criticalLogs = logs.filter(log => log.levelName === 'CRITICAL');
            const infoLogs = logs.filter(log => log.levelName === 'INFO');

            expect(criticalLogs.length).toBeGreaterThan(0);
            expect(infoLogs.length).toBeGreaterThan(0);
        });

        test('should include structured context in logs', () => {
            const error = new LegacyModeError('Test error', {
                category: ERROR_CATEGORIES.NETWORK,
                code: 'TEST_ERROR',
                context: { sessionId: 'test-session' }
            });

            errorHandler.handleError(error);

            const logs = logger.getLogs();
            const errorLog = logs.find(log => log.message.includes('Test error'));

            expect(errorLog).toBeDefined();
            expect(errorLog.fullContext).toHaveProperty('errorCode', 'TEST_ERROR');
            expect(errorLog.fullContext).toHaveProperty('errorCategory', ERROR_CATEGORIES.NETWORK);
        });
    });

    describe('Recovery Plan Generation', () => {
        test('should generate appropriate recovery plans for different error types', () => {
            const networkError = new LegacyModeError('Connection failed', {
                category: ERROR_CATEGORIES.NETWORK
            });
            const fileError = new LegacyModeError('File not found', {
                category: ERROR_CATEGORIES.FILE_SYSTEM
            });
            const permissionError = new LegacyModeError('Access denied', {
                category: ERROR_CATEGORIES.PERMISSION
            });

            const networkPlan = errorHandler.createRecoveryPlan(networkError);
            const filePlan = errorHandler.createRecoveryPlan(fileError);
            const permissionPlan = errorHandler.createRecoveryPlan(permissionError);

            expect(networkPlan.automaticActions).toContain('Retry with exponential backoff');
            expect(filePlan.automaticActions).toContain('Verify file path exists');
            expect(permissionPlan.manualActions).toContain('Check file permissions and disk space');
        });

        test('should include error details in recovery plans', () => {
            const error = new LegacyModeError('Test error', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'TEST_ERROR',
                context: { field: 'testField' }
            });

            const plan = errorHandler.createRecoveryPlan(error);

            expect(plan.error).toBeDefined();
            expect(plan.error.code).toBe('TEST_ERROR');
            expect(plan.error.context).toEqual({ field: 'testField' });
            expect(plan.recoverable).toBe(true);
            expect(plan.suggestions).toBeInstanceOf(Array);
        });
    });

    describe('Error Statistics and Monitoring', () => {
        test('should track error statistics correctly', () => {
            errorHandler.handleError(new Error('Network timeout'));
            errorHandler.handleError(new Error('ENOENT: file not found'));
            errorHandler.handleError(new Error('EACCES: permission denied'));

            const stats = errorHandler.getErrorStats();

            expect(stats.total).toBe(3);
            expect(stats.byCategory[ERROR_CATEGORIES.NETWORK]).toBe(1);
            expect(stats.byCategory[ERROR_CATEGORIES.FILE_SYSTEM]).toBe(1);
            expect(stats.byCategory[ERROR_CATEGORIES.PERMISSION]).toBe(1);
        });

        test('should provide recent error information', () => {
            for (let i = 0; i < 15; i++) {
                errorHandler.handleError(new Error(`Error ${i}`));
            }

            const stats = errorHandler.getErrorStats();
            expect(stats.recentErrors).toHaveLength(10); // Should limit to 10 recent errors
        });
    });

    describe('End-to-End Error Scenarios', () => {
        test('should handle complete workflow failure gracefully', async () => {
            // Simulate a complete workflow with multiple failure points
            const session = contextManager.createSession('Test task', 'model-id', 'request-id');
            
            // Try to create an invalid TODO
            try {
                todoManager.createTodo('', 'Expected result');
            } catch (error) {
                expect(error).toBeInstanceOf(LegacyModeError);
            }

            // Try to execute an invalid tool
            const toolResult = await toolExecutor.executeTool('invalidTool', {});
            expect(toolResult.success).toBe(false);

            // Check that all errors were logged
            const logs = logger.getLogs();
            expect(logs.length).toBeGreaterThan(0);
        });

        test('should maintain system stability under error conditions', async () => {
            // Generate many errors to test system stability
            const errors = [];
            for (let i = 0; i < 100; i++) {
                try {
                    todoManager.createTodo('', 'Expected result');
                } catch (error) {
                    errors.push(error);
                }
            }

            expect(errors.length).toBe(100);
            expect(errors.every(e => e instanceof LegacyModeError)).toBe(true);

            // System should still be functional
            const validTodo = todoManager.createTodo('Valid description', 'Expected result');
            expect(validTodo).toBeDefined();
            expect(validTodo.id).toBeDefined();
        });
    });
});