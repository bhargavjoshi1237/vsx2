/**
 * TODO Management System for Legacy Mode Autonomous Execution
 * Handles TODO lifecycle management with status tracking and CRUD operations
 */

/**
 * TODO Data Model
 * @typedef {Object} LegacyTodo
 * @property {string} id - Unique identifier for the TODO
 * @property {string} description - Task description
 * @property {string} expectedResult - Expected outcome
 * @property {'pending'|'in_progress'|'done'|'failed'} status - Current status
 * @property {string} createdAt - ISO timestamp when created
 * @property {string|null} completedAt - ISO timestamp when completed
 * @property {string|null} result - Actual result when completed
 * @property {Array} toolCalls - Array of tool calls made for this TODO
 */

class LegacyTodo {
    /**
     * Create a new TODO
     * @param {string} description - Task description
     * @param {string} expectedResult - Expected outcome
     */
    constructor(description, expectedResult) {
        this.id = this.generateTodoId();
        this.description = description;
        this.expectedResult = expectedResult;
        this.status = 'pending';
        this.createdAt = new Date().toISOString();
        this.completedAt = null;
        this.result = null;
        this.toolCalls = [];
    }

    /**
     * Generate a unique TODO ID
     * @returns {string} Unique identifier
     */
    generateTodoId() {
        return `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update the status of this TODO
     * @param {'pending'|'in_progress'|'done'|'failed'} newStatus - New status
     */
    updateStatus(newStatus) {
        const validStatuses = ['pending', 'in_progress', 'done', 'failed'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`);
        }
        
        this.status = newStatus;
        
        // Set completion timestamp for terminal states
        if (newStatus === 'done' || newStatus === 'failed') {
            this.completedAt = new Date().toISOString();
        }
    }

    /**
     * Mark this TODO as complete with a result
     * @param {string} result - The actual result achieved
     */
    complete(result) {
        this.result = result;
        this.updateStatus('done');
    }

    /**
     * Mark this TODO as failed with optional error info
     * @param {string} errorInfo - Information about the failure
     */
    fail(errorInfo) {
        this.result = errorInfo;
        this.updateStatus('failed');
    }

    /**
     * Add a tool call to this TODO's history
     * @param {Object} toolCall - Tool call information
     */
    addToolCall(toolCall) {
        this.toolCalls.push({
            ...toolCall,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * TODO Manager - Handles collection of TODOs and their lifecycle
 */
class TodoManager {
    constructor() {
        this.todos = new Map();
    }

    /**
     * Create a new TODO
     * @param {string} description - Task description
     * @param {string} expectedResult - Expected outcome
     * @param {string} customId - Optional custom ID to use instead of generated one
     * @returns {LegacyTodo} The created TODO
     */
    createTodo(description, expectedResult, customId = null) {
        const { LegacyModeError, ERROR_CATEGORIES } = require('./errorHandler');
        
        // Enhanced validation with better error messages
        if (!description) {
            throw new LegacyModeError('TODO description is required', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'MISSING_DESCRIPTION',
                context: { description, expectedResult, customId },
                suggestions: [
                    'Provide a clear description of the task',
                    'Ensure the description is not empty or null',
                    'Use a descriptive string for the TODO'
                ]
            });
        }
        
        if (typeof description !== 'string') {
            throw new LegacyModeError('TODO description must be a string', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'INVALID_DESCRIPTION_TYPE',
                context: { description: typeof description, expectedResult, customId },
                retryable: false
            });
        }
        
        if (description.trim().length === 0) {
            throw new LegacyModeError('TODO description cannot be empty', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'EMPTY_DESCRIPTION',
                context: { description, expectedResult, customId },
                retryable: false
            });
        }
        
        if (description.length > 1000) {
            throw new LegacyModeError('TODO description is too long (max 1000 characters)', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'DESCRIPTION_TOO_LONG',
                context: { descriptionLength: description.length, maxLength: 1000 },
                retryable: false,
                suggestions: [
                    'Shorten the description to under 1000 characters',
                    'Break down complex tasks into smaller TODOs',
                    'Use concise language to describe the task'
                ]
            });
        }

        if (!expectedResult) {
            throw new LegacyModeError('TODO expected result is required', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'MISSING_EXPECTED_RESULT',
                context: { description, expectedResult, customId },
                suggestions: [
                    'Provide a clear expected outcome for the task',
                    'Describe what success looks like for this TODO',
                    'Ensure the expected result is not empty or null'
                ]
            });
        }
        
        if (typeof expectedResult !== 'string') {
            throw new LegacyModeError('TODO expected result must be a string', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'INVALID_EXPECTED_RESULT_TYPE',
                context: { description, expectedResult: typeof expectedResult, customId },
                retryable: false
            });
        }
        
        if (expectedResult.trim().length === 0) {
            throw new LegacyModeError('TODO expected result cannot be empty', {
                category: ERROR_CATEGORIES.VALIDATION,
                code: 'EMPTY_EXPECTED_RESULT',
                context: { description, expectedResult, customId },
                retryable: false
            });
        }

        try {
            const todo = new LegacyTodo(description.trim(), expectedResult.trim());
            
            // Use custom ID if provided and validate it
            if (customId) {
                if (typeof customId !== 'string' || customId.trim().length === 0) {
                    throw new LegacyModeError('Custom ID must be a non-empty string', {
                        category: ERROR_CATEGORIES.VALIDATION,
                        code: 'INVALID_CUSTOM_ID',
                        context: { customId, description },
                        retryable: false
                    });
                }
                
                // Check for ID conflicts
                if (this.todos.has(customId)) {
                    throw new LegacyModeError(`TODO with ID '${customId}' already exists`, {
                        category: ERROR_CATEGORIES.VALIDATION,
                        code: 'DUPLICATE_TODO_ID',
                        context: { customId, description, existingTodo: this.todos.get(customId) },
                        retryable: false,
                        suggestions: [
                            'Use a different custom ID',
                            'Let the system generate a unique ID automatically',
                            'Check existing TODOs to avoid conflicts'
                        ]
                    });
                }
                
                todo.id = customId;
            }
            
            // Final check for ID conflicts (even with generated IDs)
            if (this.todos.has(todo.id)) {
                // This is very unlikely but handle it gracefully
                todo.id = todo.generateTodoId(); // Generate a new ID
                
                // If still conflicts (extremely unlikely), throw error
                if (this.todos.has(todo.id)) {
                    throw new LegacyModeError('Failed to generate unique TODO ID', {
                        category: ERROR_CATEGORIES.SYSTEM,
                        code: 'ID_GENERATION_FAILED',
                        context: { description, expectedResult, attempts: 2 }
                    });
                }
            }
            
            this.todos.set(todo.id, todo);
            return todo;
            
        } catch (error) {
            if (error instanceof LegacyModeError) {
                throw error;
            }
            
            // Handle unexpected errors during TODO creation
            const { errorHandler } = require('./errorHandler');
            throw errorHandler.handleError(error, {
                context: 'todo_creation',
                description,
                expectedResult,
                customId
            });
        }
    }

    /**
     * Get a TODO by its ID
     * @param {string} todoId - The TODO ID
     * @returns {LegacyTodo|null} The TODO or null if not found
     */
    getTodoById(todoId) {
        return this.todos.get(todoId) || null;
    }

    /**
     * Get all TODOs
     * @returns {Array<LegacyTodo>} Array of all TODOs
     */
    getAllTodos() {
        return Array.from(this.todos.values());
    }

    /**
     * Get TODOs by status
     * @param {'pending'|'in_progress'|'done'|'failed'} status - Status to filter by
     * @returns {Array<LegacyTodo>} Array of TODOs with the specified status
     */
    getTodosByStatus(status) {
        return this.getAllTodos().filter(todo => todo.status === status);
    }

    /**
     * Update a TODO's status
     * @param {string} todoId - The TODO ID
     * @param {'pending'|'in_progress'|'done'|'failed'} status - New status
     * @returns {boolean} True if updated successfully, false if TODO not found
     */
    updateTodoStatus(todoId, status) {
        const todo = this.getTodoById(todoId);
        if (!todo) {
            return false;
        }
        
        todo.updateStatus(status);
        return true;
    }

    /**
     * Mark a TODO as complete
     * @param {string} todoId - The TODO ID
     * @param {string} result - The actual result achieved
     * @returns {boolean} True if completed successfully, false if TODO not found
     */
    markTodoComplete(todoId, result) {
        const todo = this.getTodoById(todoId);
        if (!todo) {
            return false;
        }
        
        todo.complete(result);
        return true;
    }

    /**
     * Mark a TODO as failed
     * @param {string} todoId - The TODO ID
     * @param {string} errorInfo - Information about the failure
     * @returns {boolean} True if marked as failed successfully, false if TODO not found
     */
    markTodoFailed(todoId, errorInfo) {
        const todo = this.getTodoById(todoId);
        if (!todo) {
            return false;
        }
        
        todo.fail(errorInfo);
        return true;
    }

    /**
     * Delete a TODO
     * @param {string} todoId - The TODO ID
     * @returns {boolean} True if deleted successfully, false if TODO not found
     */
    deleteTodo(todoId) {
        return this.todos.delete(todoId);
    }

    /**
     * Get the next pending TODO
     * @returns {LegacyTodo|null} The next pending TODO or null if none
     */
    getNextPendingTodo() {
        const pendingTodos = this.getTodosByStatus('pending');
        return pendingTodos.length > 0 ? pendingTodos[0] : null;
    }

    /**
     * Get completion statistics
     * @returns {Object} Statistics about TODO completion
     */
    getStats() {
        const all = this.getAllTodos();
        const stats = {
            total: all.length,
            pending: 0,
            in_progress: 0,
            done: 0,
            failed: 0
        };

        all.forEach(todo => {
            stats[todo.status]++;
        });

        stats.completionRate = stats.total > 0 ? (stats.done / stats.total) * 100 : 0;
        
        return stats;
    }

    /**
     * Clear all TODOs
     */
    clearAll() {
        this.todos.clear();
    }

    /**
     * Export all TODOs to JSON
     * @returns {Array} Array of TODO objects
     */
    exportTodos() {
        return this.getAllTodos().map(todo => ({
            id: todo.id,
            description: todo.description,
            expectedResult: todo.expectedResult,
            status: todo.status,
            createdAt: todo.createdAt,
            completedAt: todo.completedAt,
            result: todo.result,
            toolCalls: todo.toolCalls
        }));
    }

    /**
     * Import TODOs from JSON
     * @param {Array} todosData - Array of TODO data objects
     */
    importTodos(todosData) {
        if (!Array.isArray(todosData)) {
            throw new Error('TODOs data must be an array');
        }

        this.clearAll();
        
        todosData.forEach(todoData => {
            const todo = new LegacyTodo(todoData.description, todoData.expectedResult);
            
            // Restore the original data
            todo.id = todoData.id;
            todo.status = todoData.status;
            todo.createdAt = todoData.createdAt;
            todo.completedAt = todoData.completedAt;
            todo.result = todoData.result;
            todo.toolCalls = todoData.toolCalls || [];
            
            this.todos.set(todo.id, todo);
        });
    }
}

module.exports = {
    LegacyTodo,
    TodoManager
};