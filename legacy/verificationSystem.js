/**
 * Verification System for Legacy Mode Autonomous Execution
 * Handles TODO completion verification, user confirmation workflows, and auto-approval logic
 */

/**
 * Verification Request Data Model
 * @typedef {Object} VerificationRequest
 * @property {string} id - Unique identifier for the verification request
 * @property {string} todoId - ID of the TODO being verified
 * @property {string} result - The result to be verified
 * @property {string} createdAt - ISO timestamp when verification was requested
 * @property {'pending'|'approved'|'rejected'|'timeout'} status - Verification status
 * @property {string|null} feedback - User feedback if rejected
 * @property {number} timeoutMs - Timeout duration in milliseconds
 * @property {NodeJS.Timeout|null} timeoutHandle - Timeout handle for cleanup
 */

/**
 * Auto-approval rules for simple tasks
 */
const AUTO_APPROVAL_RULES = {
    // File operations that are typically safe to auto-approve
    FILE_CREATED: /^(File|Directory) .+ (created|written) successfully/i,
    FILE_READ: /^(File|Content) .+ (read|retrieved) successfully/i,
    FILE_DELETED: /^(File|Directory) .+ (deleted|removed) successfully/i,
    
    // Simple search operations
    SEARCH_COMPLETED: /^Search (completed|found \d+ results)/i,
    
    // Basic terminal commands with successful output
    COMMAND_SUCCESS: /^Command executed successfully/i,
    
    // TODO management operations
    TODO_CREATED: /^TODO .+ created successfully/i,
    TODO_UPDATED: /^TODO .+ updated successfully/i
};

/**
 * Default configuration for verification system
 */
const DEFAULT_CONFIG = {
    defaultTimeoutMs: 30000, // 30 seconds
    autoApprovalEnabled: true,
    maxPendingVerifications: 10,
    retryDelayMs: 1000
};

class VerificationSystem {
    constructor(config = {}) {
        // Initialize configuration manager
        const LegacyConfigManager = require('./configManager');
        this.configManager = new LegacyConfigManager();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.pendingVerifications = new Map();
        this.verificationHistory = [];
        this.eventHandlers = new Map();
    }

    /**
     * Generate a unique verification ID
     * @returns {string} Unique identifier
     */
    generateVerificationId() {
        return `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Request verification for a TODO completion
     * @param {string} todoId - ID of the TODO to verify
     * @param {string} result - The result to be verified
     * @param {Object} options - Verification options
     * @param {number} options.timeoutMs - Custom timeout in milliseconds
     * @param {boolean} options.allowAutoApproval - Whether to allow auto-approval
     * @returns {Promise<Object>} Verification result
     */
    async requestVerification(todoId, result, options = {}) {
        if (!todoId || typeof todoId !== 'string') {
            throw new Error('TODO ID is required and must be a string');
        }
        if (!result || typeof result !== 'string') {
            throw new Error('Result is required and must be a string');
        }

        // Check if we're at the limit of pending verifications
        if (this.pendingVerifications.size >= this.config.maxPendingVerifications) {
            throw new Error('Maximum number of pending verifications reached');
        }

        const verificationId = this.generateVerificationId();
        // Use configuration manager for timeout settings
        const configTimeouts = this.configManager.getTimeouts();
        const timeoutMs = options.timeoutMs || configTimeouts.userVerification;
        const allowAutoApproval = options.allowAutoApproval !== false && this.config.autoApprovalEnabled;

        // Check for auto-approval first
        if (allowAutoApproval && this.shouldAutoApprove(result)) {
            const autoApprovalResult = {
                id: verificationId,
                todoId,
                result,
                status: 'approved',
                feedback: 'Auto-approved based on result pattern',
                autoApproved: true,
                timestamp: new Date().toISOString()
            };

            this.verificationHistory.push(autoApprovalResult);
            this.emitEvent('verification_completed', autoApprovalResult);
            
            return autoApprovalResult;
        }

        // Create verification request
        const verification = {
            id: verificationId,
            todoId,
            result,
            createdAt: new Date().toISOString(),
            status: 'pending',
            feedback: null,
            timeoutMs,
            timeoutHandle: null
        };

        // Set up timeout
        verification.timeoutHandle = setTimeout(() => {
            this.handleVerificationTimeout(verificationId);
        }, timeoutMs);

        this.pendingVerifications.set(verificationId, verification);

        // Emit event for UI to show verification request
        this.emitEvent('verification_requested', {
            id: verificationId,
            todoId,
            result,
            timeoutMs
        });

        // Return a promise that resolves when verification is complete
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                this.removeEventHandler('verification_completed', completionHandler);
                this.removeEventHandler('verification_timeout', timeoutHandler);
            };

            const completionHandler = (data) => {
                if (data.id === verificationId) {
                    cleanup();
                    resolve(data);
                }
            };

            const timeoutHandler = (data) => {
                if (data.id === verificationId) {
                    cleanup();
                    // Don't reject on timeout, resolve with timeout status
                    resolve({
                        id: verificationId,
                        todoId,
                        result,
                        status: 'approved', // Auto-approve on timeout
                        feedback: 'Verification timed out - auto-approved',
                        autoApproved: true,
                        timedOut: true,
                        timestamp: new Date().toISOString()
                    });
                }
            };

            this.addEventListener('verification_completed', completionHandler);
            this.addEventListener('verification_timeout', timeoutHandler);
        });
    }

    /**
     * Handle user verification response
     * @param {string} verificationId - ID of the verification request
     * @param {boolean} approved - Whether the user approved the result
     * @param {string} feedback - Optional feedback from the user
     * @returns {boolean} True if handled successfully, false if verification not found
     */
    handleVerificationResponse(verificationId, approved, feedback = null) {
        const verification = this.pendingVerifications.get(verificationId);
        if (!verification) {
            return false;
        }

        // Clear timeout
        if (verification.timeoutHandle) {
            clearTimeout(verification.timeoutHandle);
        }

        // Update verification
        verification.status = approved ? 'approved' : 'rejected';
        verification.feedback = feedback;
        verification.completedAt = new Date().toISOString();

        // Move to history and remove from pending
        this.verificationHistory.push({ ...verification });
        this.pendingVerifications.delete(verificationId);

        // Emit completion event
        this.emitEvent('verification_completed', {
            id: verificationId,
            todoId: verification.todoId,
            result: verification.result,
            status: verification.status,
            feedback: verification.feedback,
            autoApproved: false,
            timestamp: verification.completedAt
        });

        return true;
    }

    /**
     * Handle verification timeout
     * @param {string} verificationId - ID of the verification request
     */
    handleVerificationTimeout(verificationId) {
        const verification = this.pendingVerifications.get(verificationId);
        if (!verification) {
            return;
        }

        // Update verification status
        verification.status = 'timeout';
        verification.completedAt = new Date().toISOString();
        verification.feedback = 'Verification timed out - auto-approved';

        // Move to history and remove from pending
        this.verificationHistory.push({ ...verification });
        this.pendingVerifications.delete(verificationId);

        // Emit timeout event
        this.emitEvent('verification_timeout', {
            id: verificationId,
            todoId: verification.todoId,
            result: verification.result,
            timestamp: verification.completedAt
        });

        // Also emit as completed with timeout status
        this.emitEvent('verification_completed', {
            id: verificationId,
            todoId: verification.todoId,
            result: verification.result,
            status: 'approved', // Auto-approve on timeout
            feedback: verification.feedback,
            autoApproved: true,
            timedOut: true,
            timestamp: verification.completedAt
        });
    }

    /**
     * Check if a result should be auto-approved
     * @param {string} result - The result to check
     * @returns {boolean} True if should be auto-approved
     */
    shouldAutoApprove(result) {
        // Use configuration manager for auto-approval settings
        const autoApprovalSettings = this.configManager.getAutoApprovalSettings();
        if (!autoApprovalSettings.enabled) {
            return false;
        }

        // Check against auto-approval rules
        for (const [, pattern] of Object.entries(AUTO_APPROVAL_RULES)) {
            if (pattern.test(result)) {
                return true;
            }
        }

        // Additional heuristics for auto-approval
        const lowerResult = result.toLowerCase();
        
        // Simple success indicators
        const successIndicators = [
            'success', 'successful', 'completed', 'done', 'created', 'updated', 
            'saved', 'written', 'deleted', 'removed', 'found', 'retrieved'
        ];
        
        const hasSuccessIndicator = successIndicators.some(indicator => 
            lowerResult.includes(indicator)
        );

        // No error indicators
        const errorIndicators = [
            'error', 'failed', 'failure', 'exception', 'crash', 'timeout',
            'not found', 'permission denied', 'access denied', 'invalid'
        ];
        
        const hasErrorIndicator = errorIndicators.some(indicator => 
            lowerResult.includes(indicator)
        );

        // Auto-approve if has success indicators and no error indicators
        return hasSuccessIndicator && !hasErrorIndicator;
    }

    /**
     * Get pending verification by ID
     * @param {string} verificationId - ID of the verification
     * @returns {Object|null} Verification object or null if not found
     */
    getPendingVerification(verificationId) {
        return this.pendingVerifications.get(verificationId) || null;
    }

    /**
     * Get all pending verifications
     * @returns {Array<Object>} Array of pending verification objects
     */
    getAllPendingVerifications() {
        return Array.from(this.pendingVerifications.values());
    }

    /**
     * Get verification history
     * @param {Object} options - Filter options
     * @param {string} options.todoId - Filter by TODO ID
     * @param {'approved'|'rejected'|'timeout'} options.status - Filter by status
     * @param {number} options.limit - Limit number of results
     * @returns {Array<Object>} Array of verification history objects
     */
    getVerificationHistory(options = {}) {
        let history = [...this.verificationHistory];

        // Apply filters
        if (options.todoId) {
            history = history.filter(v => v.todoId === options.todoId);
        }
        if (options.status) {
            history = history.filter(v => v.status === options.status);
        }

        // Sort by timestamp (newest first)
        history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Apply limit
        if (options.limit && options.limit > 0) {
            history = history.slice(0, options.limit);
        }

        return history;
    }

    /**
     * Cancel a pending verification
     * @param {string} verificationId - ID of the verification to cancel
     * @returns {boolean} True if cancelled successfully, false if not found
     */
    cancelVerification(verificationId) {
        const verification = this.pendingVerifications.get(verificationId);
        if (!verification) {
            return false;
        }

        // Clear timeout
        if (verification.timeoutHandle) {
            clearTimeout(verification.timeoutHandle);
        }

        // Remove from pending
        this.pendingVerifications.delete(verificationId);

        // Emit cancellation event
        this.emitEvent('verification_cancelled', {
            id: verificationId,
            todoId: verification.todoId,
            timestamp: new Date().toISOString()
        });

        return true;
    }

    /**
     * Clear all pending verifications
     */
    clearPendingVerifications() {
        // Clear all timeouts
        for (const verification of this.pendingVerifications.values()) {
            if (verification.timeoutHandle) {
                clearTimeout(verification.timeoutHandle);
            }
        }

        this.pendingVerifications.clear();
        this.emitEvent('all_verifications_cleared', {
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get verification statistics
     * @returns {Object} Statistics about verifications
     */
    getStats() {
        const history = this.verificationHistory;
        const pending = this.getAllPendingVerifications();

        const stats = {
            total: history.length,
            pending: pending.length,
            approved: 0,
            rejected: 0,
            timeout: 0,
            autoApproved: 0,
            averageResponseTime: 0
        };

        let totalResponseTime = 0;
        let responseTimeCount = 0;

        history.forEach(verification => {
            stats[verification.status]++;
            
            if (verification.autoApproved) {
                stats.autoApproved++;
            }

            // Calculate response time for completed verifications
            if (verification.completedAt && verification.createdAt) {
                const responseTime = new Date(verification.completedAt) - new Date(verification.createdAt);
                totalResponseTime += responseTime;
                responseTimeCount++;
            }
        });

        if (responseTimeCount > 0) {
            stats.averageResponseTime = Math.round(totalResponseTime / responseTimeCount);
        }

        stats.approvalRate = stats.total > 0 ? (stats.approved / stats.total) * 100 : 0;
        stats.autoApprovalRate = stats.total > 0 ? (stats.autoApproved / stats.total) * 100 : 0;

        return stats;
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     */
    addEventListener(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function to remove
     */
    removeEventHandler(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Emit event to all registered handlers
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    emitEvent(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Update configuration
     * @param {Object} newConfig - New configuration options
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Export verification data for persistence
     * @returns {Object} Exportable verification data
     */
    exportData() {
        return {
            config: this.config,
            pendingVerifications: Array.from(this.pendingVerifications.entries()),
            verificationHistory: this.verificationHistory
        };
    }

    /**
     * Import verification data from persistence
     * @param {Object} data - Verification data to import
     */
    importData(data) {
        if (data.config) {
            this.config = { ...DEFAULT_CONFIG, ...data.config };
        }
        
        if (data.verificationHistory) {
            this.verificationHistory = data.verificationHistory;
        }

        // Note: We don't restore pending verifications as they should timeout
        // and be handled fresh on system restart
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.clearPendingVerifications();
        this.eventHandlers.clear();
        this.verificationHistory = [];
    }
}

module.exports = {
    VerificationSystem,
    AUTO_APPROVAL_RULES,
    DEFAULT_CONFIG
};