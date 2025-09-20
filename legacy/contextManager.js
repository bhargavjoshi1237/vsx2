/**
 * Context Manager for Legacy Mode Autonomous Execution
 * Handles session state across stateless API calls
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Session data structure for Legacy Mode execution
 */
class LegacySession {
    constructor(task, modelId, requestId) {
        this.id = this.generateSessionId();
        this.originalTask = task;
        this.modelId = modelId;
        this.requestId = requestId;
        this.todos = [];
        this.executionLog = [];
        this.phase = 'planning';
        this.startTime = new Date().toISOString();
        this.context = {};
        this.lastActivity = new Date().toISOString();
    }

    generateSessionId() {
        return `legacy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    updateActivity() {
        this.lastActivity = new Date().toISOString();
    }

    addExecutionLogEntry(entry) {
        // Add entry with timestamp
        this.executionLog.push({
            timestamp: new Date().toISOString(),
            ...entry
        });
        
        // Trim log entries if exceeding limit (keep most recent)
        const maxEntries = 50;
        if (this.executionLog.length > maxEntries) {
            this.executionLog = this.executionLog.slice(-maxEntries);
        }
        
        this.updateActivity();
    }

    updatePhase(newPhase) {
        this.phase = newPhase;
        this.updateActivity();
    }

    addTodo(todo) {
        // Check TODO limit to prevent memory bloat
        const maxTodos = 200;
        if (this.todos.length >= maxTodos) {
            // Remove oldest completed TODOs to make room
            const completedTodos = this.todos.filter(t => t.status === 'done' || t.status === 'failed');
            if (completedTodos.length > 0) {
                // Remove oldest completed TODO
                const oldestCompleted = completedTodos[0];
                const index = this.todos.indexOf(oldestCompleted);
                if (index > -1) {
                    this.todos.splice(index, 1);
                }
            } else {
                // If no completed TODOs, don't add new one
                console.warn(`Session ${this.id} has reached maximum TODO limit (${maxTodos})`);
                return false;
            }
        }
        
        this.todos.push(todo);
        this.updateActivity();
        return true;
    }

    updateTodo(todoId, updates) {
        const todoIndex = this.todos.findIndex(t => t.id === todoId);
        if (todoIndex !== -1) {
            this.todos[todoIndex] = { ...this.todos[todoIndex], ...updates };
            this.updateActivity();
            return true;
        }
        return false;
    }
}

/**
 * Context Manager class for handling Legacy Mode sessions
 */
class ContextManager {
    constructor() {
        this.sessions = new Map();
        this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
        this.cleanupInterval = 5 * 60 * 1000; // 5 minutes
        this.maxSessions = 100;
        this.maxExecutionLogEntries = 50; // Limit log entries per session
        this.maxTodosPerSession = 200; // Limit TODOs per session
        
        // Performance monitoring
        this.metrics = {
            sessionsCreated: 0,
            sessionsExpired: 0,
            memoryCleanups: 0,
            lastCleanupTime: null,
            peakSessionCount: 0,
            averageSessionDuration: 0
        };
        
        // Request batching
        this.pendingUpdates = new Map();
        this.batchUpdateTimer = null;
        this.batchUpdateInterval = 100; // 100ms batching window
        
        this.startCleanupTimer();
        this.startMemoryMonitoring();
    }

    /**
     * Create a new Legacy Mode session
     * @param {string} task - The original task description
     * @param {string} modelId - The model ID being used
     * @param {string} requestId - The request ID
     * @returns {LegacySession} The created session
     */
    createSession(task, modelId, requestId) {
        const { LegacyModeError, ERROR_CATEGORIES } = require('./errorHandler');
        
        // Validate input parameters
        if (!task || typeof task !== 'string') {
            throw new LegacyModeError('Task description is required and must be a string', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'INVALID_TASK',
                context: { task, modelId, requestId },
                suggestions: [
                    'Provide a clear task description',
                    'Ensure the task is a non-empty string',
                    'Check the task parameter is properly passed'
                ]
            });
        }
        
        if (task.trim().length === 0) {
            throw new LegacyModeError('Task description cannot be empty', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'EMPTY_TASK',
                context: { task, modelId, requestId },
                retryable: false
            });
        }
        
        if (!modelId || typeof modelId !== 'string') {
            throw new LegacyModeError('Model ID is required and must be a string', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'INVALID_MODEL_ID',
                context: { task, modelId, requestId },
                suggestions: [
                    'Provide a valid model ID',
                    'Check the model ID parameter',
                    'Ensure the model is available'
                ]
            });
        }
        
        if (!requestId || typeof requestId !== 'string') {
            throw new LegacyModeError('Request ID is required and must be a string', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'INVALID_REQUEST_ID',
                context: { task, modelId, requestId },
                suggestions: [
                    'Provide a valid request ID',
                    'Check the request ID parameter',
                    'Ensure the request ID is properly generated'
                ]
            });
        }

        try {
            // Check session limits
            if (this.sessions.size >= this.maxSessions) {
                // Clean up expired sessions first
                const cleanedCount = this.cleanupExpiredSessions();
                
                if (this.sessions.size >= this.maxSessions) {
                    throw new LegacyModeError('Maximum number of active sessions reached', {
                        category: ERROR_CATEGORIES.SYSTEM,
                        code: 'SESSION_LIMIT_EXCEEDED',
                        context: { 
                            currentSessions: this.sessions.size,
                            maxSessions: this.maxSessions,
                            cleanedSessions: cleanedCount
                        },
                        suggestions: [
                            'Wait for existing sessions to complete or expire',
                            'Clean up unused sessions manually',
                            'Reduce session timeout if appropriate'
                        ]
                    });
                }
            }

            const session = new LegacySession(task.trim(), modelId.trim(), requestId.trim());
            
            // Ensure unique session ID (very unlikely to conflict but be safe)
            let attempts = 0;
            while (this.sessions.has(session.id) && attempts < 5) {
                session.id = session.generateSessionId();
                attempts++;
            }
            
            if (this.sessions.has(session.id)) {
                throw new LegacyModeError('Failed to generate unique session ID', {
                    category: ERROR_CATEGORIES.SYSTEM,
                    code: 'SESSION_ID_CONFLICT',
                    context: { task, modelId, requestId, attempts }
                });
            }
            
            this.sessions.set(session.id, session);
            
            // Update metrics
            this.metrics.sessionsCreated++;
            this.metrics.peakSessionCount = Math.max(this.metrics.peakSessionCount, this.sessions.size);
            
            session.addExecutionLogEntry({
                type: 'session_created',
                task: task.trim(),
                modelId: modelId.trim(),
                requestId: requestId.trim(),
                sessionId: session.id
            });

            return session;
            
        } catch (error) {
            if (error instanceof LegacyModeError) {
                throw error;
            }
            
            // Handle unexpected errors during session creation
            const { errorHandler } = require('./errorHandler');
            throw errorHandler.handleError(error, {
                context: 'session_creation',
                task,
                modelId,
                requestId
            });
        }
    }

    /**
     * Update an existing session with new data
     * @param {string} sessionId - The session ID
     * @param {Object} updates - Updates to apply to the session
     * @returns {boolean} True if session was updated, false if not found
     */
    updateSession(sessionId, updates) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }

        // Batch updates for performance
        this.batchSessionUpdate(sessionId, updates);
        return true;
    }

    /**
     * Batch session updates for improved performance
     * @param {string} sessionId - The session ID
     * @param {Object} updates - Updates to apply
     */
    batchSessionUpdate(sessionId, updates) {
        // Add to pending updates
        if (!this.pendingUpdates.has(sessionId)) {
            this.pendingUpdates.set(sessionId, {});
        }
        
        const existingUpdates = this.pendingUpdates.get(sessionId);
        Object.assign(existingUpdates, updates);
        
        // Schedule batch processing if not already scheduled
        if (!this.batchUpdateTimer) {
            this.batchUpdateTimer = setTimeout(() => {
                this.processBatchedUpdates();
            }, this.batchUpdateInterval);
        }
    }

    /**
     * Process all batched session updates
     */
    processBatchedUpdates() {
        const updateCount = this.pendingUpdates.size;
        
        for (const [sessionId, updates] of this.pendingUpdates) {
            const session = this.sessions.get(sessionId);
            if (session) {
                // Apply batched updates
                Object.keys(updates).forEach(key => {
                    if (key !== 'id') { // Prevent ID changes
                        session[key] = updates[key];
                    }
                });

                session.updateActivity();
                
                session.addExecutionLogEntry({
                    type: 'session_updated',
                    updates: Object.keys(updates),
                    batched: true
                });
            }
        }
        
        // Clear pending updates
        this.pendingUpdates.clear();
        this.batchUpdateTimer = null;
        
        if (updateCount > 1) {
            console.log(`Processed ${updateCount} batched session updates`);
        }
    }

    /**
     * Get session context for building LLM prompts
     * @param {string} sessionId - The session ID
     * @returns {Object|null} Session context or null if not found
     */
    getSessionContext(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        session.updateActivity();
        
        return {
            sessionId: session.id,
            originalTask: session.originalTask,
            phase: session.phase,
            todos: session.todos,
            executionLog: session.executionLog.slice(-10), // Last 10 entries
            startTime: session.startTime,
            lastActivity: session.lastActivity,
            context: session.context
        };
    }

    /**
     * Build context prompt for LLM with session information
     * @param {string} sessionId - The session ID
     * @returns {string|null} Context prompt or null if session not found
     */
    buildContextPrompt(sessionId) {
        const context = this.getSessionContext(sessionId);
        if (!context) {
            return null;
        }

        let prompt = `# Legacy Mode Context\n\n`;
        prompt += `**Session ID:** ${context.sessionId}\n`;
        prompt += `**Original Task:** ${context.originalTask}\n`;
        prompt += `**Current Phase:** ${context.phase}\n`;
        prompt += `**Session Started:** ${context.startTime}\n\n`;

        if (context.todos.length > 0) {
            prompt += `## Current TODOs\n\n`;
            context.todos.forEach((todo, index) => {
                prompt += `${index + 1}. **${todo.description}** (${todo.status})\n`;
                if (todo.expectedResult) {
                    prompt += `   Expected: ${todo.expectedResult}\n`;
                }
                if (todo.result) {
                    prompt += `   Result: ${todo.result}\n`;
                }
                prompt += `\n`;
            });
        }

        if (context.executionLog.length > 0) {
            prompt += `## Recent Execution Log\n\n`;
            context.executionLog.forEach(entry => {
                prompt += `- **${entry.type}** (${entry.timestamp})\n`;
                if (entry.details) {
                    prompt += `  ${entry.details}\n`;
                }
            });
            prompt += `\n`;
        }

        prompt += `## Instructions\n`;
        prompt += `Continue with the Legacy Mode execution based on the current context above. `;
        prompt += `Respond with the appropriate JSON format for the current phase.\n`;

        return prompt;
    }

    /**
     * Get a session by ID
     * @param {string} sessionId - The session ID
     * @returns {LegacySession|null} The session or null if not found
     */
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.updateActivity();
        }
        return session || null;
    }

    /**
     * Delete a session
     * @param {string} sessionId - The session ID
     * @returns {boolean} True if session was deleted, false if not found
     */
    deleteSession(sessionId) {
        return this.sessions.delete(sessionId);
    }

    /**
     * Get all active sessions
     * @returns {Array} Array of session objects
     */
    getAllSessions() {
        return Array.from(this.sessions.values());
    }

    /**
     * Clean up expired sessions based on timeout
     */
    cleanupExpiredSessions() {
        const now = new Date();
        const expiredSessions = [];
        const sessionDurations = [];

        for (const [sessionId, session] of this.sessions) {
            const lastActivity = new Date(session.lastActivity);
            const timeSinceActivity = now - lastActivity;

            if (timeSinceActivity > this.sessionTimeout) {
                expiredSessions.push(sessionId);
                
                // Calculate session duration for metrics
                const startTime = new Date(session.startTime);
                const duration = lastActivity - startTime;
                sessionDurations.push(duration);
            }
        }

        // Update metrics
        this.metrics.sessionsExpired += expiredSessions.length;
        this.metrics.lastCleanupTime = now.toISOString();
        
        if (sessionDurations.length > 0) {
            const avgDuration = sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length;
            this.metrics.averageSessionDuration = avgDuration;
        }

        expiredSessions.forEach(sessionId => {
            this.sessions.delete(sessionId);
        });

        if (expiredSessions.length > 0) {
            console.log(`Cleaned up ${expiredSessions.length} expired Legacy Mode sessions`);
        }

        return expiredSessions.length;
    }

    /**
     * Aggressive memory cleanup for long-running sessions
     */
    performMemoryCleanup() {
        const now = new Date();
        let cleanedSessions = 0;
        
        for (const [sessionId, session] of this.sessions) {
            let sessionModified = false;
            
            // Trim execution logs if too large
            if (session.executionLog.length > this.maxExecutionLogEntries) {
                const originalLength = session.executionLog.length;
                session.executionLog = session.executionLog.slice(-this.maxExecutionLogEntries);
                sessionModified = true;
                console.log(`Trimmed execution log for session ${sessionId}: ${originalLength} -> ${session.executionLog.length}`);
            }
            
            // Clean up completed TODOs older than 1 hour
            const oneHourAgo = now - (60 * 60 * 1000);
            const originalTodoCount = session.todos.length;
            session.todos = session.todos.filter(todo => {
                if (todo.status === 'done' || todo.status === 'failed') {
                    const completedAt = new Date(todo.completedAt || todo.createdAt);
                    return completedAt > oneHourAgo;
                }
                return true; // Keep pending and in_progress TODOs
            });
            
            if (session.todos.length < originalTodoCount) {
                sessionModified = true;
                console.log(`Cleaned up old TODOs for session ${sessionId}: ${originalTodoCount} -> ${session.todos.length}`);
            }
            
            if (sessionModified) {
                cleanedSessions++;
                session.updateActivity();
            }
        }
        
        this.metrics.memoryCleanups++;
        
        if (cleanedSessions > 0) {
            console.log(`Performed memory cleanup on ${cleanedSessions} sessions`);
        }
        
        return cleanedSessions;
    }

    /**
     * Start memory monitoring and periodic cleanup
     */
    startMemoryMonitoring() {
        // Perform aggressive cleanup every 15 minutes
        this.memoryCleanupTimer = setInterval(() => {
            this.performMemoryCleanup();
            
            // Force garbage collection if available (Node.js with --expose-gc)
            if (global.gc) {
                global.gc();
            }
        }, 15 * 60 * 1000);
    }

    /**
     * Stop memory monitoring
     */
    stopMemoryMonitoring() {
        if (this.memoryCleanupTimer) {
            clearInterval(this.memoryCleanupTimer);
            this.memoryCleanupTimer = null;
        }
    }

    /**
     * Start automatic cleanup timer
     */
    startCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(() => {
            this.cleanupExpiredSessions();
        }, this.cleanupInterval);
    }

    /**
     * Stop automatic cleanup timer
     */
    stopCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /**
     * Shutdown cleanup - stop all timers and process pending updates
     */
    shutdown() {
        // Process any pending batched updates
        if (this.batchUpdateTimer) {
            clearTimeout(this.batchUpdateTimer);
            this.processBatchedUpdates();
        }
        
        // Stop cleanup timers
        this.stopCleanupTimer();
        this.stopMemoryMonitoring();
        
        console.log('Context Manager shutdown completed');
    }

    /**
     * Get comprehensive memory and performance statistics
     * @returns {Object} Memory usage and performance statistics
     */
    getMemoryStats() {
        const sessionCount = this.sessions.size;
        let totalTodos = 0;
        let totalLogEntries = 0;
        let activeSessions = 0;
        let oldestSessionAge = 0;
        let largestSessionSize = 0;

        const now = new Date();

        for (const session of this.sessions.values()) {
            totalTodos += session.todos.length;
            totalLogEntries += session.executionLog.length;
            
            // Check if session is active (activity within last 5 minutes)
            const lastActivity = new Date(session.lastActivity);
            const timeSinceActivity = now - lastActivity;
            if (timeSinceActivity < 5 * 60 * 1000) {
                activeSessions++;
            }
            
            // Track oldest session
            const sessionAge = now - new Date(session.startTime);
            oldestSessionAge = Math.max(oldestSessionAge, sessionAge);
            
            // Estimate session memory size
            const sessionSize = JSON.stringify(session).length;
            largestSessionSize = Math.max(largestSessionSize, sessionSize);
        }

        const memoryUsage = process.memoryUsage();
        
        return {
            // Session statistics
            sessionCount,
            activeSessions,
            totalTodos,
            totalLogEntries,
            oldestSessionAge: Math.round(oldestSessionAge / 1000), // in seconds
            largestSessionSize: Math.round(largestSessionSize / 1024), // in KB
            
            // Performance metrics
            metrics: { ...this.metrics },
            
            // Memory usage
            memoryUsage: {
                rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
                external: Math.round(memoryUsage.external / 1024 / 1024) // MB
            },
            
            // Configuration
            limits: {
                maxSessions: this.maxSessions,
                maxExecutionLogEntries: this.maxExecutionLogEntries,
                maxTodosPerSession: this.maxTodosPerSession,
                sessionTimeout: Math.round(this.sessionTimeout / 1000), // in seconds
                cleanupInterval: Math.round(this.cleanupInterval / 1000) // in seconds
            }
        };
    }

    /**
     * Get performance metrics for monitoring
     * @returns {Object} Performance metrics
     */
    getPerformanceMetrics() {
        const stats = this.getMemoryStats();
        
        return {
            timestamp: new Date().toISOString(),
            sessions: {
                total: stats.sessionCount,
                active: stats.activeSessions,
                created: this.metrics.sessionsCreated,
                expired: this.metrics.sessionsExpired,
                peakCount: this.metrics.peakSessionCount
            },
            memory: {
                heapUsed: stats.memoryUsage.heapUsed,
                rss: stats.memoryUsage.rss,
                todosCount: stats.totalTodos,
                logEntriesCount: stats.totalLogEntries
            },
            performance: {
                averageSessionDuration: Math.round(this.metrics.averageSessionDuration / 1000), // seconds
                memoryCleanups: this.metrics.memoryCleanups,
                lastCleanupTime: this.metrics.lastCleanupTime
            }
        };
    }

    /**
     * Force cleanup of all sessions (for testing or shutdown)
     */
    clearAllSessions() {
        const count = this.sessions.size;
        this.sessions.clear();
        return count;
    }
}

// Create singleton instance
const contextManager = new ContextManager();

module.exports = {
    ContextManager,
    LegacySession,
    contextManager
};