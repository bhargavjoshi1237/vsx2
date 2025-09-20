/**
 * Centralized Error Handling and Recovery System for Legacy Mode
 * Provides comprehensive error handling, retry logic, and user-friendly error messages
 */

/**
 * Error categories for classification and handling
 */
const ERROR_CATEGORIES = {
    NETWORK: 'network',
    FILE_SYSTEM: 'file_system',
    PERMISSION: 'permission',
    VALIDATION: 'validation',
    TIMEOUT: 'timeout',
    PARSING: 'parsing',
    TOOL_EXECUTION: 'tool_execution',
    VSCODE_API: 'vscode_api',
    SYSTEM: 'system',
    USER_INPUT: 'user_input'
};

/**
 * Error severity levels
 */
const ERROR_SEVERITY = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

/**
 * Retry strategies
 */
const RETRY_STRATEGIES = {
    EXPONENTIAL_BACKOFF: 'exponential_backoff',
    LINEAR_BACKOFF: 'linear_backoff',
    FIXED_DELAY: 'fixed_delay',
    NO_RETRY: 'no_retry'
};

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    strategy: RETRY_STRATEGIES.EXPONENTIAL_BACKOFF,
    retryableErrors: [
        ERROR_CATEGORIES.NETWORK,
        ERROR_CATEGORIES.TIMEOUT,
        ERROR_CATEGORIES.SYSTEM
    ]
};

/**
 * Enhanced error class with additional context and recovery information
 */
class LegacyModeError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'LegacyModeError';
        this.category = options.category || ERROR_CATEGORIES.SYSTEM;
        this.severity = options.severity || ERROR_SEVERITY.MEDIUM;
        this.code = options.code || 'UNKNOWN_ERROR';
        this.context = options.context || {};
        this.recoverable = options.recoverable !== false;
        this.retryable = options.retryable !== false;
        this.userMessage = options.userMessage || this.generateUserMessage();
        this.suggestions = options.suggestions || this.generateSuggestions();
        this.timestamp = new Date().toISOString();
        this.originalError = options.originalError || null;
        
        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, LegacyModeError);
        }
    }

    /**
     * Generate user-friendly error message
     * @returns {string} User-friendly message
     */
    generateUserMessage() {
        const categoryMessages = {
            [ERROR_CATEGORIES.NETWORK]: 'A network connection issue occurred',
            [ERROR_CATEGORIES.FILE_SYSTEM]: 'A file system operation failed',
            [ERROR_CATEGORIES.PERMISSION]: 'Permission denied for the requested operation',
            [ERROR_CATEGORIES.VALIDATION]: 'Invalid input or data provided',
            [ERROR_CATEGORIES.TIMEOUT]: 'The operation timed out',
            [ERROR_CATEGORIES.PARSING]: 'Failed to parse the response',
            [ERROR_CATEGORIES.TOOL_EXECUTION]: 'Tool execution failed',
            [ERROR_CATEGORIES.VSCODE_API]: 'VSCode API operation failed',
            [ERROR_CATEGORIES.SYSTEM]: 'A system error occurred',
            [ERROR_CATEGORIES.USER_INPUT]: 'Invalid user input provided'
        };

        return categoryMessages[this.category] || 'An unexpected error occurred';
    }

    /**
     * Generate recovery suggestions based on error category
     * @returns {Array<string>} Array of suggestion strings
     */
    generateSuggestions() {
        const categorySuggestions = {
            [ERROR_CATEGORIES.NETWORK]: [
                'Check your internet connection',
                'Verify the API endpoint is accessible',
                'Try again in a few moments'
            ],
            [ERROR_CATEGORIES.FILE_SYSTEM]: [
                'Check if the file or directory exists',
                'Verify file permissions',
                'Ensure sufficient disk space'
            ],
            [ERROR_CATEGORIES.PERMISSION]: [
                'Check file and directory permissions',
                'Run VSCode with appropriate privileges',
                'Verify workspace access rights'
            ],
            [ERROR_CATEGORIES.VALIDATION]: [
                'Check the input format and values',
                'Verify required fields are provided',
                'Review the data structure'
            ],
            [ERROR_CATEGORIES.TIMEOUT]: [
                'Try again with a longer timeout',
                'Check system performance',
                'Verify network connectivity'
            ],
            [ERROR_CATEGORIES.PARSING]: [
                'Check the response format',
                'Verify the data structure',
                'Try regenerating the response'
            ],
            [ERROR_CATEGORIES.TOOL_EXECUTION]: [
                'Check tool parameters',
                'Verify tool availability',
                'Review execution environment'
            ],
            [ERROR_CATEGORIES.VSCODE_API]: [
                'Restart VSCode',
                'Check extension permissions',
                'Verify workspace is open'
            ],
            [ERROR_CATEGORIES.SYSTEM]: [
                'Check system resources',
                'Restart the application',
                'Review system logs'
            ],
            [ERROR_CATEGORIES.USER_INPUT]: [
                'Review the input format',
                'Check required parameters',
                'Verify input constraints'
            ]
        };

        return categorySuggestions[this.category] || [
            'Try the operation again',
            'Check the system logs for more details',
            'Contact support if the issue persists'
        ];
    }

    /**
     * Convert error to JSON for logging and transmission
     * @returns {Object} JSON representation of the error
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            category: this.category,
            severity: this.severity,
            code: this.code,
            context: this.context,
            recoverable: this.recoverable,
            retryable: this.retryable,
            userMessage: this.userMessage,
            suggestions: this.suggestions,
            timestamp: this.timestamp,
            stack: this.stack,
            originalError: this.originalError ? {
                name: this.originalError.name,
                message: this.originalError.message,
                stack: this.originalError.stack
            } : null
        };
    }
}

/**
 * Error Handler class for managing errors and recovery
 */
class ErrorHandler {
    constructor(config = {}) {
        this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
        this.errorLog = [];
        this.retryAttempts = new Map();
        
        // Use enhanced logger if available, fallback to console
        if (config.logger) {
            this.logger = config.logger;
        } else {
            try {
                const { logger } = require('./logger');
                this.logger = logger.createChildLogger({ component: 'ErrorHandler' });
            } catch (error) {
                this.logger = console;
            }
        }
    }

    /**
     * Handle an error with automatic classification and recovery
     * @param {Error|string} error - The error to handle
     * @param {Object} context - Additional context information
     * @returns {LegacyModeError} Enhanced error object
     */
    handleError(error, context = {}) {
        let legacyError;

        if (error instanceof LegacyModeError) {
            legacyError = error;
        } else if (error instanceof Error) {
            legacyError = this.classifyError(error, context);
        } else {
            legacyError = new LegacyModeError(String(error), {
                category: ERROR_CATEGORIES.SYSTEM,
                context
            });
        }

        // Add to error log
        this.logError(legacyError);

        return legacyError;
    }

    /**
     * Classify an error into appropriate category and severity
     * @param {Error} error - The original error
     * @param {Object} context - Additional context
     * @returns {LegacyModeError} Classified error
     */
    classifyError(error, context = {}) {
        const message = error.message.toLowerCase();
        let category = ERROR_CATEGORIES.SYSTEM;
        let severity = ERROR_SEVERITY.MEDIUM;
        let code = 'UNKNOWN_ERROR';
        let retryable = true;

        // Network-related errors
        if (message.includes('network') || message.includes('connection') || 
            message.includes('timeout') || message.includes('econnrefused') ||
            message.includes('enotfound') || message.includes('etimedout')) {
            category = ERROR_CATEGORIES.NETWORK;
            code = 'NETWORK_ERROR';
        }
        // File system errors
        else if (message.includes('enoent') || message.includes('file not found') ||
                 message.includes('directory not found') || message.includes('eexist') ||
                 message.includes('enospc') || message.includes('emfile')) {
            category = ERROR_CATEGORIES.FILE_SYSTEM;
            code = 'FILE_SYSTEM_ERROR';
        }
        // Permission errors
        else if (message.includes('eacces') || message.includes('eperm') ||
                 message.includes('permission denied') || message.includes('access denied')) {
            category = ERROR_CATEGORIES.PERMISSION;
            severity = ERROR_SEVERITY.HIGH;
            code = 'PERMISSION_ERROR';
            retryable = false;
        }
        // Validation errors
        else if (message.includes('invalid') || message.includes('validation') ||
                 message.includes('required') || message.includes('missing')) {
            category = ERROR_CATEGORIES.VALIDATION;
            code = 'VALIDATION_ERROR';
            retryable = false;
        }
        // Timeout errors
        else if (message.includes('timeout') || message.includes('timed out')) {
            category = ERROR_CATEGORIES.TIMEOUT;
            code = 'TIMEOUT_ERROR';
        }
        // Parsing errors
        else if (message.includes('parse') || message.includes('json') ||
                 message.includes('syntax') || message.includes('unexpected token')) {
            category = ERROR_CATEGORIES.PARSING;
            code = 'PARSING_ERROR';
        }
        // VSCode API errors
        else if (message.includes('vscode') || message.includes('workspace') ||
                 message.includes('editor') || message.includes('command')) {
            category = ERROR_CATEGORIES.VSCODE_API;
            code = 'VSCODE_API_ERROR';
        }

        return new LegacyModeError(error.message, {
            category,
            severity,
            code,
            context,
            retryable,
            originalError: error
        });
    }

    /**
     * Execute an operation with retry logic
     * @param {Function} operation - The operation to execute
     * @param {Object} options - Retry options
     * @returns {Promise<any>} Operation result
     */
    async executeWithRetry(operation, options = {}) {
        const config = { ...this.config, ...options };
        const operationId = this.generateOperationId();
        let lastError = null;

        for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
            try {
                if (this.logger.debug) {
                    this.logger.debug(`Executing operation ${operationId}, attempt ${attempt}/${config.maxAttempts}`, {
                        operationId,
                        attempt,
                        maxAttempts: config.maxAttempts
                    });
                }
                
                const result = await operation();
                
                // Success - clear retry tracking
                this.retryAttempts.delete(operationId);
                
                if (attempt > 1) {
                    if (this.logger.info) {
                        this.logger.info(`Operation ${operationId} succeeded on attempt ${attempt}`, {
                            operationId,
                            successfulAttempt: attempt,
                            totalAttempts: attempt
                        });
                    }
                }
                
                return result;
                
            } catch (error) {
                lastError = this.handleError(error, { 
                    operationId, 
                    attempt, 
                    maxAttempts: config.maxAttempts 
                });

                // Check if error is retryable
                if (!this.isRetryable(lastError, config)) {
                    if (this.logger.warn) {
                        this.logger.warn(`Operation ${operationId} failed with non-retryable error`, {
                            operationId,
                            error: lastError.message,
                            errorCode: lastError.code,
                            errorCategory: lastError.category,
                            attempt
                        });
                    }
                    throw lastError;
                }

                // Don't retry on last attempt
                if (attempt === config.maxAttempts) {
                    if (this.logger.error) {
                        this.logger.error(`Operation ${operationId} failed after ${config.maxAttempts} attempts`, {
                            operationId,
                            error: lastError.message,
                            errorCode: lastError.code,
                            errorCategory: lastError.category,
                            totalAttempts: config.maxAttempts
                        });
                    }
                    throw lastError;
                }

                // Calculate delay for next attempt
                const delay = this.calculateDelay(attempt, config);
                if (this.logger.warn) {
                    this.logger.warn(`Operation ${operationId} failed on attempt ${attempt}, retrying in ${delay}ms`, {
                        operationId,
                        error: lastError.message,
                        errorCode: lastError.code,
                        attempt,
                        nextRetryDelay: delay
                    });
                }

                // Track retry attempt
                this.retryAttempts.set(operationId, {
                    attempt,
                    lastError: lastError,
                    nextRetryAt: new Date(Date.now() + delay)
                });

                // Wait before retry
                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    /**
     * Check if an error is retryable based on configuration
     * @param {LegacyModeError} error - The error to check
     * @param {Object} config - Retry configuration
     * @returns {boolean} True if retryable
     */
    isRetryable(error, config) {
        if (!error.retryable) {
            return false;
        }

        return config.retryableErrors.includes(error.category);
    }

    /**
     * Calculate delay for retry attempt
     * @param {number} attempt - Current attempt number
     * @param {Object} config - Retry configuration
     * @returns {number} Delay in milliseconds
     */
    calculateDelay(attempt, config) {
        let delay;

        switch (config.strategy) {
            case RETRY_STRATEGIES.EXPONENTIAL_BACKOFF:
                delay = config.baseDelayMs * Math.pow(2, attempt - 1);
                break;
            case RETRY_STRATEGIES.LINEAR_BACKOFF:
                delay = config.baseDelayMs * attempt;
                break;
            case RETRY_STRATEGIES.FIXED_DELAY:
                delay = config.baseDelayMs;
                break;
            default:
                delay = config.baseDelayMs;
        }

        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.1 * delay;
        delay += jitter;

        // Cap at maximum delay
        return Math.min(delay, config.maxDelayMs);
    }

    /**
     * Generate unique operation ID for tracking
     * @returns {string} Unique operation ID
     */
    generateOperationId() {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Sleep for specified duration
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>} Promise that resolves after delay
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log error to internal log and external logger
     * @param {LegacyModeError} error - Error to log
     */
    logError(error) {
        // Add to internal log
        this.errorLog.push({
            timestamp: error.timestamp,
            error: error.toJSON()
        });

        // Keep log size manageable
        if (this.errorLog.length > 1000) {
            this.errorLog = this.errorLog.slice(-500);
        }

        // Enhanced logging with structured context
        const logContext = {
            errorCode: error.code,
            errorCategory: error.category,
            severity: error.severity,
            recoverable: error.recoverable,
            retryable: error.retryable,
            context: error.context,
            error: error.originalError || error
        };

        // Log to external logger based on severity
        switch (error.severity) {
            case ERROR_SEVERITY.CRITICAL:
                if (this.logger.critical) {
                    this.logger.critical(`CRITICAL ERROR: ${error.message}`, logContext);
                } else {
                    this.logger.error('CRITICAL ERROR:', error.message, logContext);
                }
                break;
            case ERROR_SEVERITY.HIGH:
                if (this.logger.error) {
                    this.logger.error(`HIGH SEVERITY ERROR: ${error.message}`, logContext);
                } else {
                    this.logger.error('HIGH SEVERITY ERROR:', error.message, logContext);
                }
                break;
            case ERROR_SEVERITY.MEDIUM:
                if (this.logger.warn) {
                    this.logger.warn(`ERROR: ${error.message}`, logContext);
                } else {
                    this.logger.warn('ERROR:', error.message, logContext);
                }
                break;
            case ERROR_SEVERITY.LOW:
                if (this.logger.info) {
                    this.logger.info(`LOW SEVERITY ERROR: ${error.message}`, logContext);
                } else {
                    this.logger.info('LOW SEVERITY ERROR:', error.message, logContext);
                }
                break;
        }
    }

    /**
     * Get error statistics
     * @returns {Object} Error statistics
     */
    getErrorStats() {
        const stats = {
            total: this.errorLog.length,
            byCategory: {},
            bySeverity: {},
            byCode: {},
            recentErrors: this.errorLog.slice(-10)
        };

        this.errorLog.forEach(entry => {
            const error = entry.error;
            
            // Count by category
            stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
            
            // Count by severity
            stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
            
            // Count by code
            stats.byCode[error.code] = (stats.byCode[error.code] || 0) + 1;
        });

        return stats;
    }

    /**
     * Clear error log
     */
    clearErrorLog() {
        this.errorLog = [];
        this.retryAttempts.clear();
    }

    /**
     * Get current retry attempts
     * @returns {Array<Object>} Array of current retry attempts
     */
    getCurrentRetryAttempts() {
        return Array.from(this.retryAttempts.entries()).map(([id, data]) => ({
            operationId: id,
            ...data
        }));
    }

    /**
     * Create a recovery plan for an error
     * @param {LegacyModeError} error - The error to create recovery plan for
     * @returns {Object} Recovery plan
     */
    createRecoveryPlan(error) {
        const plan = {
            error: error.toJSON(),
            recoverable: error.recoverable,
            suggestions: error.suggestions,
            automaticActions: [],
            manualActions: []
        };

        // Add automatic recovery actions based on error category
        switch (error.category) {
            case ERROR_CATEGORIES.NETWORK:
                plan.automaticActions.push('Retry with exponential backoff');
                plan.manualActions.push('Check network connectivity');
                break;
            case ERROR_CATEGORIES.FILE_SYSTEM:
                plan.automaticActions.push('Verify file path exists');
                plan.manualActions.push('Check file permissions and disk space');
                break;
            case ERROR_CATEGORIES.TIMEOUT:
                plan.automaticActions.push('Retry with increased timeout');
                plan.manualActions.push('Check system performance');
                break;
            case ERROR_CATEGORIES.PARSING:
                plan.automaticActions.push('Attempt graceful parsing recovery');
                plan.manualActions.push('Review response format');
                break;
        }

        return plan;
    }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

module.exports = {
    ErrorHandler,
    LegacyModeError,
    ERROR_CATEGORIES,
    ERROR_SEVERITY,
    RETRY_STRATEGIES,
    DEFAULT_RETRY_CONFIG,
    errorHandler
};