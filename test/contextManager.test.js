/**
 * Unit tests for Context Manager
 * Tests session creation, updates, context building, and memory management
 */

const assert = require('assert');
const { ContextManager, LegacySession } = require('../legacy/contextManager');

describe('LegacySession', () => {
    let session;

    beforeEach(() => {
        session = new LegacySession('Test task', 'gpt-4', 'req-123');
    });

    describe('constructor', () => {
        it('should create session with correct initial values', () => {
            assert.strictEqual(session.originalTask, 'Test task');
            assert.strictEqual(session.modelId, 'gpt-4');
            assert.strictEqual(session.requestId, 'req-123');
            assert.strictEqual(session.phase, 'planning');
            assert.deepStrictEqual(session.todos, []);
            assert.deepStrictEqual(session.executionLog, []);
            assert(session.id.match(/^legacy_\d+_[a-z0-9]+$/));
            assert(session.startTime);
            assert(session.lastActivity);
        });

        it('should generate unique session IDs', () => {
            const session2 = new LegacySession('Another task', 'gpt-4', 'req-456');
            assert.notStrictEqual(session.id, session2.id);
        });
    });

    describe('addExecutionLogEntry', () => {
        it('should add execution log entries with timestamp', () => {
            const entry = { type: 'test', details: 'Test entry' };
            session.addExecutionLogEntry(entry);

            assert.strictEqual(session.executionLog.length, 1);
            assert.strictEqual(session.executionLog[0].type, entry.type);
            assert.strictEqual(session.executionLog[0].details, entry.details);
            assert(session.executionLog[0].timestamp);
        });
    });

    describe('updatePhase', () => {
        it('should update phase', () => {
            session.updatePhase('execution');
            assert.strictEqual(session.phase, 'execution');
        });
    });

    describe('addTodo', () => {
        it('should add todos', () => {
            const todo = { id: 'todo-1', description: 'Test todo' };
            session.addTodo(todo);

            assert.strictEqual(session.todos.length, 1);
            assert.strictEqual(session.todos[0], todo);
        });
    });

    describe('updateTodo', () => {
        it('should update existing todos', () => {
            const todo = { id: 'todo-1', description: 'Test todo', status: 'pending' };
            session.addTodo(todo);

            const updated = session.updateTodo('todo-1', { status: 'done', result: 'Completed' });
            
            assert.strictEqual(updated, true);
            assert.strictEqual(session.todos[0].status, 'done');
            assert.strictEqual(session.todos[0].result, 'Completed');
        });

        it('should return false when updating non-existent todo', () => {
            const updated = session.updateTodo('non-existent', { status: 'done' });
            assert.strictEqual(updated, false);
        });
    });
});

describe('ContextManager', () => {
    let contextManager;

    beforeEach(() => {
        contextManager = new ContextManager();
        contextManager.clearAllSessions();
    });

    afterEach(() => {
        contextManager.stopCleanupTimer();
    });

    describe('createSession', () => {
        it('should create new session', () => {
            const session = contextManager.createSession('Test task', 'gpt-4', 'req-123');

            assert(session instanceof LegacySession);
            assert.strictEqual(session.originalTask, 'Test task');
            assert.strictEqual(contextManager.getSession(session.id), session);
        });
    });

    describe('updateSession', () => {
        it('should update existing session', () => {
            const session = contextManager.createSession('Test task', 'gpt-4', 'req-123');
            const updates = { phase: 'execution', context: { key: 'value' } };

            const updated = contextManager.updateSession(session.id, updates);

            assert.strictEqual(updated, true);
            assert.strictEqual(session.phase, 'execution');
            assert.strictEqual(session.context.key, 'value');
        });

        it('should not update non-existent session', () => {
            const updated = contextManager.updateSession('non-existent', { phase: 'execution' });
            assert.strictEqual(updated, false);
        });

        it('should prevent session ID changes during update', () => {
            const session = contextManager.createSession('Test task', 'gpt-4', 'req-123');
            const originalId = session.id;

            contextManager.updateSession(session.id, { id: 'new-id', phase: 'execution' });

            assert.strictEqual(session.id, originalId);
            assert.strictEqual(session.phase, 'execution');
        });
    });

    describe('getSessionContext', () => {
        it('should get session context', () => {
            const session = contextManager.createSession('Test task', 'gpt-4', 'req-123');
            session.addTodo({ id: 'todo-1', description: 'Test todo' });
            session.addExecutionLogEntry({ type: 'test', details: 'Test log' });

            const context = contextManager.getSessionContext(session.id);

            assert.strictEqual(context.sessionId, session.id);
            assert.strictEqual(context.originalTask, 'Test task');
            assert.strictEqual(context.phase, 'planning');
            assert.strictEqual(context.todos.length, 1);
            assert.strictEqual(context.todos[0].id, 'todo-1');
            assert.strictEqual(context.executionLog.length, 2); // Creation log + test log
        });

        it('should return null for non-existent session context', () => {
            const context = contextManager.getSessionContext('non-existent');
            assert.strictEqual(context, null);
        });

        it('should limit execution log to last 10 entries', () => {
            const session = contextManager.createSession('Test task', 'gpt-4', 'req-123');
            
            // Add 15 log entries (plus 1 creation log = 16 total)
            for (let i = 0; i < 15; i++) {
                session.addExecutionLogEntry({ type: 'test', details: `Entry ${i}` });
            }

            const context = contextManager.getSessionContext(session.id);

            assert.strictEqual(context.executionLog.length, 10);
            // Should contain the most recent entries
            assert.strictEqual(context.executionLog[9].details, 'Entry 14');
        });
    });

    describe('buildContextPrompt', () => {
        it('should build context prompt', () => {
            const session = contextManager.createSession('Test task', 'gpt-4', 'req-123');
            session.addTodo({ 
                id: 'todo-1', 
                description: 'Test todo', 
                status: 'pending',
                expectedResult: 'Should work'
            });

            const prompt = contextManager.buildContextPrompt(session.id);

            assert(prompt.includes('# Legacy Mode Context'));
            assert(prompt.includes('Test task'));
            assert(prompt.includes('Test todo'));
            assert(prompt.includes('Should work'));
            assert(prompt.includes('planning'));
        });

        it('should return null prompt for non-existent session', () => {
            const prompt = contextManager.buildContextPrompt('non-existent');
            assert.strictEqual(prompt, null);
        });
    });

    describe('session management', () => {
        it('should delete session', () => {
            const session = contextManager.createSession('Test task', 'gpt-4', 'req-123');
            
            const deleted = contextManager.deleteSession(session.id);
            
            assert.strictEqual(deleted, true);
            assert.strictEqual(contextManager.getSession(session.id), null);
        });

        it('should return false when deleting non-existent session', () => {
            const deleted = contextManager.deleteSession('non-existent');
            assert.strictEqual(deleted, false);
        });

        it('should get all sessions', () => {
            const session1 = contextManager.createSession('Task 1', 'gpt-4', 'req-1');
            const session2 = contextManager.createSession('Task 2', 'gpt-4', 'req-2');

            const allSessions = contextManager.getAllSessions();

            assert.strictEqual(allSessions.length, 2);
            assert(allSessions.includes(session1));
            assert(allSessions.includes(session2));
        });

        it('should clear all sessions', () => {
            contextManager.createSession('Task 1', 'gpt-4', 'req-1');
            contextManager.createSession('Task 2', 'gpt-4', 'req-2');

            const clearedCount = contextManager.clearAllSessions();

            assert.strictEqual(clearedCount, 2);
            assert.strictEqual(contextManager.getAllSessions().length, 0);
        });
    });

    describe('memory management', () => {
        it('should get memory statistics', () => {
            const session = contextManager.createSession('Test task', 'gpt-4', 'req-123');
            session.addTodo({ id: 'todo-1', description: 'Test todo' });
            session.addExecutionLogEntry({ type: 'test', details: 'Test log' });

            const stats = contextManager.getMemoryStats();

            assert.strictEqual(stats.sessionCount, 1);
            assert.strictEqual(stats.totalTodos, 1);
            assert.strictEqual(stats.totalLogEntries, 2); // Creation log + test log
            assert(stats.memoryUsage);
        });

        it('should cleanup expired sessions', () => {
            // Create a session and manually set old activity time
            const session = contextManager.createSession('Test task', 'gpt-4', 'req-123');
            const oldTime = new Date(Date.now() - 35 * 60 * 1000).toISOString(); // 35 minutes ago
            session.lastActivity = oldTime;

            const cleanedCount = contextManager.cleanupExpiredSessions();

            assert.strictEqual(cleanedCount, 1);
            assert.strictEqual(contextManager.getSession(session.id), null);
        });

        it('should not cleanup active sessions', () => {
            const session = contextManager.createSession('Test task', 'gpt-4', 'req-123');
            
            const cleanedCount = contextManager.cleanupExpiredSessions();

            assert.strictEqual(cleanedCount, 0);
            assert.strictEqual(contextManager.getSession(session.id), session);
        });
    });

    describe('cleanup timer', () => {
        it('should start and stop cleanup timer', () => {
            assert(contextManager.cleanupTimer);
            
            contextManager.stopCleanupTimer();
            assert.strictEqual(contextManager.cleanupTimer, null);
            
            contextManager.startCleanupTimer();
            assert(contextManager.cleanupTimer);
        });
    });
});

describe('ContextManager Integration', () => {
    let contextManager;

    beforeEach(() => {
        contextManager = new ContextManager();
        contextManager.clearAllSessions();
    });

    afterEach(() => {
        contextManager.stopCleanupTimer();
    });

    describe('complete session lifecycle', () => {
        it('should handle complete session lifecycle', () => {
            // Create session
            const session = contextManager.createSession('Complex task', 'gpt-4', 'req-123');
            assert.strictEqual(session.phase, 'planning');

            // Add todos during planning
            session.addTodo({
                id: 'todo-1',
                description: 'Setup project structure',
                status: 'pending',
                expectedResult: 'Project folders created'
            });

            // Move to execution phase
            contextManager.updateSession(session.id, { phase: 'execution' });
            
            // Execute todo
            session.updateTodo('todo-1', { status: 'in_progress' });
            session.addExecutionLogEntry({
                type: 'tool_call',
                tool: 'createFile',
                details: 'Created project structure'
            });

            // Complete todo
            session.updateTodo('todo-1', { 
                status: 'done', 
                result: 'Successfully created all project folders' 
            });

            // Verify context
            const context = contextManager.getSessionContext(session.id);
            assert.strictEqual(context.phase, 'execution');
            assert.strictEqual(context.todos[0].status, 'done');
            assert.strictEqual(context.executionLog.length, 3); // create + update + tool_call

            // Build prompt
            const prompt = contextManager.buildContextPrompt(session.id);
            assert(prompt.includes('Complex task'));
            assert(prompt.includes('Setup project structure'));
            assert(prompt.includes('Successfully created all project folders'));
            assert(prompt.includes('execution'));
        });

        it('should handle multiple concurrent sessions', () => {
            const session1 = contextManager.createSession('Task 1', 'gpt-4', 'req-1');
            const session2 = contextManager.createSession('Task 2', 'claude', 'req-2');

            session1.addTodo({ id: 'todo-1-1', description: 'Task 1 Todo 1' });
            session2.addTodo({ id: 'todo-2-1', description: 'Task 2 Todo 1' });

            const context1 = contextManager.getSessionContext(session1.id);
            const context2 = contextManager.getSessionContext(session2.id);

            assert.strictEqual(context1.originalTask, 'Task 1');
            assert.strictEqual(context2.originalTask, 'Task 2');
            assert.strictEqual(context1.todos[0].description, 'Task 1 Todo 1');
            assert.strictEqual(context2.todos[0].description, 'Task 2 Todo 1');
        });
    });
});