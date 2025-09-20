/**
 * Enhanced Logging System for Legacy Mode
 * Provides structured logging with different levels and debugging capabilities
 */

/**
 * Log levels in order of severity
 */
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    CRITICAL: 4
};

/**
 * Log level names for display
 */
const LOG_LEVEL_NAMES = {
    [LOG_LEVELS.DEBUG]: 'DEBUG',
    [LOG_LEVELS.INFO]: 'INFO',
    [LOG_LEVELS.WARN]: 'WARN',
    [LOG_LEVELS.ERROR]: 'ERROR',
    [LOG_LEVELS.CRITICAL]: 'CRITICAL'
};

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG = {
    level: LOG_LEVELS.INFO,
    maxLogEntries: 1000,
    enableConsole: true,
    enableFile: false,
    timestampFormat: 'ISO',
    includeStackTrace: true,
    contextFields: ['sessionId', 'requestId', 'toolName', 'phase']
};

/**
 * Enhanced Logger class for Legacy Mode
 */
class LegacyLogger {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logEntries = [];
        this.sessionLogs = new Map(); // Per-session log storage
        this.startTime = new Date();
    }

    /**
     * Log a debug message
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    debug(message, context = {}) {
        this.log(LOG_LEVELS.DEBUG, message, context);
    }

    /**
     * Log an info message
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    info(message, context = {}) {
        this.log(LOG_LEVELS.INFO, message, context);
    }

    /**
     * Log a warning message
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    warn(message, context = {}) {
        this.log(LOG_LEVELS.WARN, message, context);
    }

    /**
     * Log an error message
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    error(message, context = {}) {
        this.log(LOG_LEVELS.ERROR, message, context);
    }

    /**
     * Log a critical message
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    critical(message, context = {}) {
        this.log(LOG_LEVELS.CRITICAL, message, context);
    }

    /**
     * Core logging method
     * @param {number} level - Log level
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    log(level, message, context = {}) {
        // Check if this level should be logged
        if (level < this.config.level) {
            return;
        }

        const logEntry = this.createLogEntry(level, message, context);
        
        // Add to main log
        this.addToMainLog(logEntry);
        
        // Add to session-specific log if sessionId is provided
        if (context.sessionId) {
            this.addToSessionLog(context.sessionId, logEntry);
        }
        
        // Output to console if enabled
        if (this.config.enableConsole) {
            this.outputToConsole(logEntry);
        }
        
        // Output to file if enabled (placeholder for future implementation)
        if (this.config.enableFile) {
            this.outputToFile(logEntry);
        }
    }

    /**
     * Create a structured log entry
     * @param {number} level - Log level
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     * @returns {Object} Structured log entry
     */
    createLogEntry(level, message, context) {
        const timestamp = this.formatTimestamp(new Date());
        const levelName = LOG_LEVEL_NAMES[level];
        
        // Extract relevant context fields
        const relevantContext = {};
        this.config.contextFields.forEach(field => {
            if (context[field] !== undefined) {
                relevantContext[field] = context[field];
            }
        });

        const entry = {
            timestamp,
            level,
            levelName,
            message,
            context: relevantContext,
            fullContext: context, // Keep full context for debugging
            id: this.generateLogId()
        };

        // Add stack trace for errors if enabled
        if (level >= LOG_LEVELS.ERROR && this.config.includeStackTrace) {
            if (context.error && context.error.stack) {
                entry.stack = context.error.stack;
            } else if (context.stack) {
                entry.stack = context.stack;
            } else {
                // Capture current stack trace
                const error = new Error();
                Error.captureStackTrace(error, this.log);
                entry.stack = error.stack;
            }
        }

        return entry;
    }

    /**
     * Add entry to main log with size management
     * @param {Object} logEntry - Log entry to add
     */
    addToMainLog(logEntry) {
        this.logEntries.push(logEntry);
        
        // Manage log size
        if (this.logEntries.length > this.config.maxLogEntries) {
            // Keep the most recent entries
            this.logEntries = this.logEntries.slice(-Math.floor(this.config.maxLogEntries * 0.8));
        }
    }

    /**
     * Add entry to session-specific log
     * @param {string} sessionId - Session ID
     * @param {Object} logEntry - Log entry to add
     */
    addToSessionLog(sessionId, logEntry) {
        if (!this.sessionLogs.has(sessionId)) {
            this.sessionLogs.set(sessionId, []);
        }
        
        const sessionLog = this.sessionLogs.get(sessionId);
        sessionLog.push(logEntry);
        
        // Limit session log size
        const maxSessionEntries = Math.floor(this.config.maxLogEntries / 10);
        if (sessionLog.length > maxSessionEntries) {
            sessionLog.splice(0, sessionLog.length - maxSessionEntries);
        }
    }

    /**
     * Output log entry to console
     * @param {Object} logEntry - Log entry to output
     */
    outputToConsole(logEntry) {
        const { timestamp, levelName, message, context } = logEntry;
        const contextStr = Object.keys(context).length > 0 ? 
            ` [${JSON.stringify(context)}]` : '';
        
        const logMessage = `${timestamp} [${levelName}] ${message}${contextStr}`;
        
        switch (logEntry.level) {
            case LOG_LEVELS.DEBUG:
                console.debug(logMessage);
                break;
            case LOG_LEVELS.INFO:
                console.info(logMessage);
                break;
            case LOG_LEVELS.WARN:
                console.warn(logMessage);
                break;
            case LOG_LEVELS.ERROR:
            case LOG_LEVELS.CRITICAL:
                console.error(logMessage);
                if (logEntry.stack) {
                    console.error('Stack trace:', logEntry.stack);
                }
                break;
        }
    }

    /**
     * Output log entry to file (placeholder for future implementation)
     * @param {Object} logEntry - Log entry to output
     */
    outputToFile(logEntry) {
        // TODO: Implement file logging if needed
        // This could write to a log file in the workspace or extension directory
    }

    /**
     * Format timestamp according to configuration
     * @param {Date} date - Date to format
     * @returns {string} Formatted timestamp
     */
    formatTimestamp(date) {
        switch (this.config.timestampFormat) {
            case 'ISO':
                return date.toISOString();
            case 'LOCAL':
                return date.toLocaleString();
            case 'UNIX':
                return date.getTime().toString();
            default:
                return date.toISOString();
        }
    }

    /**
     * Generate unique log entry ID
     * @returns {string} Unique log ID
     */
    generateLogId() {
        return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get all log entries with optional filtering
     * @param {Object} filters - Filter options
     * @returns {Array<Object>} Filtered log entries
     */
    getLogs(filters = {}) {
        let logs = [...this.logEntries];
        
        // Filter by level
        if (filters.level !== undefined) {
            logs = logs.filter(entry => entry.level >= filters.level);
        }
        
        // Filter by session ID
        if (filters.sessionId) {
            logs = logs.filter(entry => 
                entry.context.sessionId === filters.sessionId
            );
        }
        
        // Filter by time range
        if (filters.since) {
            const sinceTime = new Date(filters.since);
            logs = logs.filter(entry => 
                new Date(entry.timestamp) >= sinceTime
            );
        }
        
        if (filters.until) {
            const untilTime = new Date(filters.until);
            logs = logs.filter(entry => 
                new Date(entry.timestamp) <= untilTime
            );
        }
        
        // Filter by message content
        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            logs = logs.filter(entry => 
                entry.message.toLowerCase().includes(searchTerm)
            );
        }
        
        // Limit results
        if (filters.limit && filters.limit > 0) {
            logs = logs.slice(-filters.limit);
        }
        
        return logs;
    }

    /**
     * Get session-specific logs
     * @param {string} sessionId - Session ID
     * @returns {Array<Object>} Session log entries
     */
    getSessionLogs(sessionId) {
        return this.sessionLogs.get(sessionId) || [];
    }

    /**
     * Get logging statistics
     * @returns {Object} Logging statistics
     */
    getStats() {
        const stats = {
            totalEntries: this.logEntries.length,
            activeSessions: this.sessionLogs.size,
            byLevel: {},
            oldestEntry: null,
            newestEntry: null,
            uptime: Date.now() - this.startTime.getTime()
        };

        // Count entries by level
        Object.values(LOG_LEVELS).forEach(level => {
            stats.byLevel[LOG_LEVEL_NAMES[level]] = 0;
        });

        this.logEntries.forEach(entry => {
            stats.byLevel[entry.levelName]++;
        });

        // Find oldest and newest entries
        if (this.logEntries.length > 0) {
            stats.oldestEntry = this.logEntries[0].timestamp;
            stats.newestEntry = this.logEntries[this.logEntries.length - 1].timestamp;
        }

        return stats;
    }

    /**
     * Clear all logs
     * @param {Object} options - Clear options
     */
    clearLogs(options = {}) {
        if (options.sessionId) {
            // Clear specific session logs
            this.sessionLogs.delete(options.sessionId);
        } else if (options.level !== undefined) {
            // Clear logs of specific level or higher
            this.logEntries = this.logEntries.filter(entry => entry.level < options.level);
        } else {
            // Clear all logs
            this.logEntries = [];
            this.sessionLogs.clear();
        }
    }

    /**
     * Set log level
     * @param {number} level - New log level
     */
    setLevel(level) {
        if (Object.values(LOG_LEVELS).includes(level)) {
            this.config.level = level;
        } else {
            throw new Error(`Invalid log level: ${level}`);
        }
    }

    /**
     * Enable or disable console output
     * @param {boolean} enabled - Whether to enable console output
     */
    setConsoleOutput(enabled) {
        this.config.enableConsole = enabled;
    }

    /**
     * Create a child logger with additional context
     * @param {Object} additionalContext - Context to add to all log entries
     * @returns {Object} Child logger with bound context
     */
    createChildLogger(additionalContext) {
        const parentLogger = this;
        
        return {
            debug: (message, context = {}) => 
                parentLogger.debug(message, { ...additionalContext, ...context }),
            info: (message, context = {}) => 
                parentLogger.info(message, { ...additionalContext, ...context }),
            warn: (message, context = {}) => 
                parentLogger.warn(message, { ...additionalContext, ...context }),
            error: (message, context = {}) => 
                parentLogger.error(message, { ...additionalContext, ...context }),
            critical: (message, context = {}) => 
                parentLogger.critical(message, { ...additionalContext, ...context })
        };
    }

    /**
     * Export logs for external analysis
     * @param {Object} options - Export options
     * @returns {Object} Exported log data
     */
    exportLogs(options = {}) {
        const logs = this.getLogs(options.filters || {});
        
        return {
            metadata: {
                exportTime: new Date().toISOString(),
                totalEntries: logs.length,
                loggerConfig: this.config,
                stats: this.getStats()
            },
            logs: logs
        };
    }
}

// Create singleton logger instance
const logger = new LegacyLogger();

module.exports = {
    LegacyLogger,
    LOG_LEVELS,
    LOG_LEVEL_NAMES,
    DEFAULT_CONFIG,
    logger
};