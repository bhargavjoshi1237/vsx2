/**
 * Test suite for Legacy Mode Error Handler
 */

const { 
    ErrorHandler, 
    LegacyModeError, 
    ERROR_CATEGORIES, 
    ERROR_SEVERITY,
    RETRY_STRATEGIES,
    errorHandler 
} = require('../legacy/errorHandler');

describe('LegacyModeError', () => {
    test('should create error with default values', () => {
        const error = new LegacyModeError('Test error');
        
        expect(error.message).toBe('Test error');
        expect(error.name).toBe('LegacyModeError');
        expect(error.category).toBe(ERROR_CATEGORIES.SYSTEM);
        expect(error.severity).toBe(ERROR_SEVERITY.MEDIUM);
        expect(error.recoverable).toBe(true);
        expect(error.retryable).toBe(true);
        expect(error.timestamp).toBeDefined();
        expect(error.suggestions).toBeInstanceOf(Array);
        expect(error.suggestions.length).toBeGreaterThan(0);
    });

    test('should create error with custom options', () => {
        const options = {
            category: ERROR_CATEGORIES.NETWORK,
            severity: ERROR_SEVERITY.HIGH,
            code: 'NETWORK_TIMEOUT',
            context: { url: 'https://api.example.com' },
            recoverable: false,
            retryable: true,
            userMessage: 'Connection failed',
            suggestions: ['Check internet connection']
        };

        const error = new LegacyModeError('Network error', options);
        
        expect(error.category).toBe(ERROR_CATEGORIES.NETWORK);
        expect(error.severity).toBe(ERROR_SEVERITY.HIGH);
        expect(error.code).toBe('NETWORK_TIMEOUT');
        expect(error.context).toEqual(options.context);
        expect(error.recoverable).toBe(false);
        expect(error.retryable).toBe(true);
        expect(error.userMessage).toBe('Connection failed');
        expect(error.suggestions).toEqual(['Check internet connection']);
    });

    test('should generate appropriate user messages for different categories', () => {
        const networkError = new LegacyModeError('Test', { category: ERROR_CATEGORIES.NETWORK });
        const fileError = new LegacyModeError('Test', { category: ERROR_CATEGORIES.FILE_SYSTEM });
        const permissionError = new LegacyModeError('Test', { category: ERROR_CATEGORIES.PERMISSION });
        
        expect(networkError.userMessage).toContain('network');
        expect(fileError.userMessage).toContain('file system');
        expect(permissionError.userMessage).toContain('Permission denied');
    });

    test('should convert to JSON correctly', () => {
        const error = new LegacyModeError('Test error', {
            category: ERROR_CATEGORIES.VALIDATION,
            code: 'TEST_ERROR',
            context: { field: 'test' }
        });

        const json = error.toJSON();
        
        expect(json.name).toBe('LegacyModeError');
        expect(json.message).toBe('Test error');
        expect(json.category).toBe(ERROR_CATEGORIES.VALIDATION);
        expect(json.code).toBe('TEST_ERROR');
        expect(json.context).toEqual({ field: 'test' });
        expect(json.timestamp).toBeDefined();
    });
});

describe('ErrorHandler', () => {
    let handler;

    beforeEach(() => {
        handler = new ErrorHandler();
    });

    afterEach(() => {
        handler.clearErrorLog();
    });

    test('should handle LegacyModeError correctly', () => {
        const originalError = new LegacyModeError('Test error', {
            category: ERROR_CATEGORIES.NETWORK,
            code: 'TEST_ERROR'
        });

        const handledError = handler.handleError(originalError);
        
        expect(handledError).toBe(originalError);
        expect(handler.getErrorStats().total).toBe(1);
    });

    test('should classify standard errors correctly', () => {
        const networkError = new Error('Connection timeout');
        const fileError = new Error('ENOENT: file not found');
        const permissionError = new Error('EACCES: permission denied');

        const handledNetwork = handler.handleError(networkError);
        const handledFile = handler.handleError(fileError);
        const handledPermission = handler.handleError(permissionError);

        expect(handledNetwork.category).toBe(ERROR_CATEGORIES.NETWORK);
        expect(handledFile.category).toBe(ERROR_CATEGORIES.FILE_SYSTEM);
        expect(handledPermission.category).toBe(ERROR_CATEGORIES.PERMISSION);
    });

    test('should execute operation with retry on retryable errors', async () => {
        let attempts = 0;
        const operation = jest.fn().mockImplementation(() => {
            attempts++;
            if (attempts < 3) {
                throw new LegacyModeError('Network error', {
                    category: ERROR_CATEGORIES.NETWORK
                });
            }
            return 'success';
        });

        const result = await handler.executeWithRetry(operation, {
            maxAttempts: 3,
            baseDelayMs: 10 // Fast for testing
        });

        expect(result).toBe('success');
        expect(attempts).toBe(3);
        expect(operation).toHaveBeenCalledTimes(3);
    });

    test('should not retry non-retryable errors', async () => {
        const operation = jest.fn().mockImplementation(() => {
            throw new LegacyModeError('Validation error', {
                category: ERROR_CATEGORIES.VALIDATION,
                retryable: false
            });
        });

        await expect(handler.executeWithRetry(operation)).rejects.toThrow('Validation error');
        expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should calculate exponential backoff delay correctly', () => {
        const config = {
            strategy: RETRY_STRATEGIES.EXPONENTIAL_BACKOFF,
            baseDelayMs: 1000,
            maxDelayMs: 10000
        };

        const delay1 = handler.calculateDelay(1, config);
        const delay2 = handler.calculateDelay(2, config);
        const delay3 = handler.calculateDelay(3, config);

        expect(delay1).toBeGreaterThanOrEqual(1000);
        expect(delay1).toBeLessThan(1200); // With jitter
        expect(delay2).toBeGreaterThanOrEqual(2000);
        expect(delay2).toBeLessThan(2400);
        expect(delay3).toBeGreaterThanOrEqual(4000);
        expect(delay3).toBeLessThan(4800);
    });

    test('should respect maximum delay', () => {
        const config = {
            strategy: RETRY_STRATEGIES.EXPONENTIAL_BACKOFF,
            baseDelayMs: 1000,
            maxDelayMs: 5000
        };

        const delay = handler.calculateDelay(10, config); // Would be very large without cap
        expect(delay).toBeLessThanOrEqual(5000);
    });

    test('should track error statistics correctly', () => {
        handler.handleError(new Error('Network timeout'));
        handler.handleError(new Error('ENOENT: file not found'));
        handler.handleError(new Error('EACCES: permission denied'));

        const stats = handler.getErrorStats();
        
        expect(stats.total).toBe(3);
        expect(stats.byCategory[ERROR_CATEGORIES.NETWORK]).toBe(1);
        expect(stats.byCategory[ERROR_CATEGORIES.FILE_SYSTEM]).toBe(1);
        expect(stats.byCategory[ERROR_CATEGORIES.PERMISSION]).toBe(1);
    });

    test('should create recovery plan for errors', () => {
        const error = new LegacyModeError('Network error', {
            category: ERROR_CATEGORIES.NETWORK,
            code: 'CONNECTION_FAILED'
        });

        const plan = handler.createRecoveryPlan(error);
        
        expect(plan.error).toBeDefined();
        expect(plan.recoverable).toBe(true);
        expect(plan.suggestions).toBeInstanceOf(Array);
        expect(plan.automaticActions).toBeInstanceOf(Array);
        expect(plan.manualActions).toBeInstanceOf(Array);
        expect(plan.automaticActions.length).toBeGreaterThan(0);
        expect(plan.manualActions.length).toBeGreaterThan(0);
    });

    test('should limit error log size', () => {
        // Create more errors than the limit
        for (let i = 0; i < 1100; i++) {
            handler.handleError(new Error(`Error ${i}`));
        }

        const stats = handler.getErrorStats();
        expect(stats.total).toBeLessThanOrEqual(500); // Should be trimmed to 500
    });
});

describe('Error Classification', () => {
    let handler;

    beforeEach(() => {
        handler = new ErrorHandler();
    });

    test('should classify network errors correctly', () => {
        const errors = [
            new Error('ECONNREFUSED'),
            new Error('ENOTFOUND'),
            new Error('ETIMEDOUT'),
            new Error('network timeout'),
            new Error('connection failed')
        ];

        errors.forEach(error => {
            const classified = handler.classifyError(error);
            expect(classified.category).toBe(ERROR_CATEGORIES.NETWORK);
        });
    });

    test('should classify file system errors correctly', () => {
        const errors = [
            new Error('ENOENT: no such file or directory'),
            new Error('EEXIST: file already exists'),
            new Error('ENOSPC: no space left on device'),
            new Error('EMFILE: too many open files')
        ];

        errors.forEach(error => {
            const classified = handler.classifyError(error);
            expect(classified.category).toBe(ERROR_CATEGORIES.FILE_SYSTEM);
        });
    });

    test('should classify permission errors correctly', () => {
        const errors = [
            new Error('EACCES: permission denied'),
            new Error('EPERM: operation not permitted'),
            new Error('access denied')
        ];

        errors.forEach(error => {
            const classified = handler.classifyError(error);
            expect(classified.category).toBe(ERROR_CATEGORIES.PERMISSION);
            expect(classified.retryable).toBe(false);
        });
    });

    test('should classify validation errors correctly', () => {
        const errors = [
            new Error('Invalid input provided'),
            new Error('Validation failed'),
            new Error('Required field missing')
        ];

        errors.forEach(error => {
            const classified = handler.classifyError(error);
            expect(classified.category).toBe(ERROR_CATEGORIES.VALIDATION);
            expect(classified.retryable).toBe(false);
        });
    });

    test('should classify parsing errors correctly', () => {
        const errors = [
            new Error('Unexpected token in JSON'),
            new Error('JSON parse error'),
            new Error('Syntax error')
        ];

        errors.forEach(error => {
            const classified = handler.classifyError(error);
            expect(classified.category).toBe(ERROR_CATEGORIES.PARSING);
        });
    });
});

describe('Retry Logic', () => {
    let handler;

    beforeEach(() => {
        handler = new ErrorHandler();
    });

    test('should determine retryability correctly', () => {
        const retryableError = new LegacyModeError('Network error', {
            category: ERROR_CATEGORIES.NETWORK,
            retryable: true
        });

        const nonRetryableError = new LegacyModeError('Validation error', {
            category: ERROR_CATEGORIES.VALIDATION,
            retryable: false
        });

        const config = {
            retryableErrors: [ERROR_CATEGORIES.NETWORK, ERROR_CATEGORIES.TIMEOUT]
        };

        expect(handler.isRetryable(retryableError, config)).toBe(true);
        expect(handler.isRetryable(nonRetryableError, config)).toBe(false);
    });

    test('should handle different retry strategies', () => {
        const exponentialConfig = {
            strategy: RETRY_STRATEGIES.EXPONENTIAL_BACKOFF,
            baseDelayMs: 100,
            maxDelayMs: 1000
        };

        const linearConfig = {
            strategy: RETRY_STRATEGIES.LINEAR_BACKOFF,
            baseDelayMs: 100,
            maxDelayMs: 1000
        };

        const fixedConfig = {
            strategy: RETRY_STRATEGIES.FIXED_DELAY,
            baseDelayMs: 100,
            maxDelayMs: 1000
        };

        const expDelay1 = handler.calculateDelay(1, exponentialConfig);
        const expDelay2 = handler.calculateDelay(2, exponentialConfig);
        
        const linDelay1 = handler.calculateDelay(1, linearConfig);
        const linDelay2 = handler.calculateDelay(2, linearConfig);
        
        const fixDelay1 = handler.calculateDelay(1, fixedConfig);
        const fixDelay2 = handler.calculateDelay(2, fixedConfig);

        // Exponential should grow faster than linear
        expect(expDelay2 / expDelay1).toBeGreaterThan(linDelay2 / linDelay1);
        
        // Fixed should be roughly the same
        expect(Math.abs(fixDelay1 - fixDelay2)).toBeLessThan(50); // Allow for jitter
    });
});

describe('Singleton Error Handler', () => {
    test('should provide singleton instance', () => {
        expect(errorHandler).toBeInstanceOf(ErrorHandler);
        
        // Should be the same instance
        const { errorHandler: errorHandler2 } = require('../legacy/errorHandler');
        expect(errorHandler).toBe(errorHandler2);
    });

    test('should maintain state across imports', () => {
        errorHandler.handleError(new Error('Test error'));
        
        const { errorHandler: errorHandler2 } = require('../legacy/errorHandler');
        const stats = errorHandler2.getErrorStats();
        
        expect(stats.total).toBeGreaterThan(0);
    });
});