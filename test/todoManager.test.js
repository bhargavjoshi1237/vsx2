/**
 * Unit tests for TODO Management System
 * Tests CRUD operations, status transitions, and edge cases
 */

const assert = require('assert');
const { LegacyTodo, TodoManager } = require('../legacy/todoManager');

describe('LegacyTodo', () => {
    describe('constructor', () => {
        it('should create a new TODO with correct initial values', () => {
            const description = 'Test task';
            const expectedResult = 'Expected outcome';
            const todo = new LegacyTodo(description, expectedResult);

            assert(todo.id);
            assert(todo.id.match(/^todo_\d+_[a-z0-9]+$/));
            assert.strictEqual(todo.description, description);
            assert.strictEqual(todo.expectedResult, expectedResult);
            assert.strictEqual(todo.status, 'pending');
            assert(todo.createdAt);
            assert(new Date(todo.createdAt) instanceof Date);
            assert.strictEqual(todo.completedAt, null);
            assert.strictEqual(todo.result, null);
            assert.deepStrictEqual(todo.toolCalls, []);
        });

        it('should generate unique IDs for different TODOs', () => {
            const todo1 = new LegacyTodo('Task 1', 'Result 1');
            const todo2 = new LegacyTodo('Task 2', 'Result 2');

            assert.notStrictEqual(todo1.id, todo2.id);
        });
    });

    describe('updateStatus', () => {
        let todo;

        beforeEach(() => {
            todo = new LegacyTodo('Test task', 'Expected result');
        });

        it('should update status to valid values', () => {
            const validStatuses = ['pending', 'in_progress', 'done', 'failed'];
            
            validStatuses.forEach(status => {
                todo.updateStatus(status);
                assert.strictEqual(todo.status, status);
            });
        });

        it('should set completedAt timestamp for terminal states', () => {
            const beforeTime = new Date().toISOString();
            
            todo.updateStatus('done');
            assert(todo.completedAt);
            assert(new Date(todo.completedAt).getTime() >= new Date(beforeTime).getTime());

            todo.updateStatus('pending'); // Reset
            todo.completedAt = null;

            todo.updateStatus('failed');
            assert(todo.completedAt);
            assert(new Date(todo.completedAt).getTime() >= new Date(beforeTime).getTime());
        });

        it('should not set completedAt for non-terminal states', () => {
            todo.updateStatus('in_progress');
            assert.strictEqual(todo.completedAt, null);

            todo.updateStatus('pending');
            assert.strictEqual(todo.completedAt, null);
        });

        it('should throw error for invalid status', () => {
            assert.throws(() => {
                todo.updateStatus('invalid_status');
            }, /Invalid status: invalid_status/);
        });
    });

    describe('complete', () => {
        it('should mark TODO as complete with result', () => {
            const todo = new LegacyTodo('Test task', 'Expected result');
            const result = 'Actual result achieved';

            todo.complete(result);

            assert.strictEqual(todo.status, 'done');
            assert.strictEqual(todo.result, result);
            assert(todo.completedAt);
        });
    });

    describe('fail', () => {
        it('should mark TODO as failed with error info', () => {
            const todo = new LegacyTodo('Test task', 'Expected result');
            const errorInfo = 'Task failed due to error';

            todo.fail(errorInfo);

            assert.strictEqual(todo.status, 'failed');
            assert.strictEqual(todo.result, errorInfo);
            assert(todo.completedAt);
        });
    });

    describe('addToolCall', () => {
        it('should add tool call with timestamp', () => {
            const todo = new LegacyTodo('Test task', 'Expected result');
            const toolCall = {
                toolName: 'readFile',
                params: { path: 'test.js' },
                result: 'file content'
            };

            todo.addToolCall(toolCall);

            assert.strictEqual(todo.toolCalls.length, 1);
            assert.strictEqual(todo.toolCalls[0].toolName, toolCall.toolName);
            assert.deepStrictEqual(todo.toolCalls[0].params, toolCall.params);
            assert.strictEqual(todo.toolCalls[0].result, toolCall.result);
            assert(todo.toolCalls[0].timestamp);
        });
    });
});

describe('TodoManager', () => {
    let manager;

    beforeEach(() => {
        manager = new TodoManager();
    });

    describe('createTodo', () => {
        it('should create and store a new TODO', () => {
            const description = 'Test task';
            const expectedResult = 'Expected outcome';

            const todo = manager.createTodo(description, expectedResult);

            assert(todo instanceof LegacyTodo);
            assert.strictEqual(todo.description, description);
            assert.strictEqual(todo.expectedResult, expectedResult);
            assert.strictEqual(manager.getTodoById(todo.id), todo);
        });

        it('should throw error for invalid description', () => {
            assert.throws(() => {
                manager.createTodo('', 'Expected result');
            }, /Description is required and must be a string/);

            assert.throws(() => {
                manager.createTodo(null, 'Expected result');
            }, /Description is required and must be a string/);

            assert.throws(() => {
                manager.createTodo(123, 'Expected result');
            }, /Description is required and must be a string/);
        });

        it('should throw error for invalid expected result', () => {
            assert.throws(() => {
                manager.createTodo('Description', '');
            }, /Expected result is required and must be a string/);

            assert.throws(() => {
                manager.createTodo('Description', null);
            }, /Expected result is required and must be a string/);

            assert.throws(() => {
                manager.createTodo('Description', 123);
            }, /Expected result is required and must be a string/);
        });
    });

    describe('getTodoById', () => {
        it('should return TODO by ID', () => {
            const todo = manager.createTodo('Test task', 'Expected result');
            const retrieved = manager.getTodoById(todo.id);

            assert.strictEqual(retrieved, todo);
        });

        it('should return null for non-existent ID', () => {
            const retrieved = manager.getTodoById('non-existent-id');
            assert.strictEqual(retrieved, null);
        });
    });

    describe('getAllTodos', () => {
        it('should return empty array when no TODOs exist', () => {
            const todos = manager.getAllTodos();
            assert.deepStrictEqual(todos, []);
        });

        it('should return all TODOs', () => {
            const todo1 = manager.createTodo('Task 1', 'Result 1');
            const todo2 = manager.createTodo('Task 2', 'Result 2');

            const todos = manager.getAllTodos();
            assert.strictEqual(todos.length, 2);
            assert(todos.includes(todo1));
            assert(todos.includes(todo2));
        });
    });

    describe('getTodosByStatus', () => {
        it('should return TODOs filtered by status', () => {
            const todo1 = manager.createTodo('Task 1', 'Result 1');
            const todo2 = manager.createTodo('Task 2', 'Result 2');
            const todo3 = manager.createTodo('Task 3', 'Result 3');

            todo2.updateStatus('in_progress');
            todo3.updateStatus('done');

            const pendingTodos = manager.getTodosByStatus('pending');
            const inProgressTodos = manager.getTodosByStatus('in_progress');
            const doneTodos = manager.getTodosByStatus('done');

            assert.deepStrictEqual(pendingTodos, [todo1]);
            assert.deepStrictEqual(inProgressTodos, [todo2]);
            assert.deepStrictEqual(doneTodos, [todo3]);
        });
    });

    describe('updateTodoStatus', () => {
        it('should update TODO status and return true', () => {
            const todo = manager.createTodo('Test task', 'Expected result');
            const result = manager.updateTodoStatus(todo.id, 'in_progress');

            assert.strictEqual(result, true);
            assert.strictEqual(todo.status, 'in_progress');
        });

        it('should return false for non-existent TODO', () => {
            const result = manager.updateTodoStatus('non-existent-id', 'done');
            assert.strictEqual(result, false);
        });
    });

    describe('markTodoComplete', () => {
        it('should mark TODO as complete and return true', () => {
            const todo = manager.createTodo('Test task', 'Expected result');
            const result = manager.markTodoComplete(todo.id, 'Task completed successfully');

            assert.strictEqual(result, true);
            assert.strictEqual(todo.status, 'done');
            assert.strictEqual(todo.result, 'Task completed successfully');
            assert(todo.completedAt);
        });

        it('should return false for non-existent TODO', () => {
            const result = manager.markTodoComplete('non-existent-id', 'Result');
            assert.strictEqual(result, false);
        });
    });

    describe('markTodoFailed', () => {
        it('should mark TODO as failed and return true', () => {
            const todo = manager.createTodo('Test task', 'Expected result');
            const result = manager.markTodoFailed(todo.id, 'Task failed due to error');

            assert.strictEqual(result, true);
            assert.strictEqual(todo.status, 'failed');
            assert.strictEqual(todo.result, 'Task failed due to error');
            assert(todo.completedAt);
        });

        it('should return false for non-existent TODO', () => {
            const result = manager.markTodoFailed('non-existent-id', 'Error info');
            assert.strictEqual(result, false);
        });
    });

    describe('deleteTodo', () => {
        it('should delete TODO and return true', () => {
            const todo = manager.createTodo('Test task', 'Expected result');
            const result = manager.deleteTodo(todo.id);

            assert.strictEqual(result, true);
            assert.strictEqual(manager.getTodoById(todo.id), null);
        });

        it('should return false for non-existent TODO', () => {
            const result = manager.deleteTodo('non-existent-id');
            assert.strictEqual(result, false);
        });
    });

    describe('getNextPendingTodo', () => {
        it('should return first pending TODO', () => {
            const todo1 = manager.createTodo('Task 1', 'Result 1');
            const todo2 = manager.createTodo('Task 2', 'Result 2');
            manager.createTodo('Task 3', 'Result 3');

            todo2.updateStatus('done');

            const nextTodo = manager.getNextPendingTodo();
            assert.strictEqual(nextTodo, todo1);
        });

        it('should return null when no pending TODOs exist', () => {
            const todo = manager.createTodo('Task 1', 'Result 1');
            todo.updateStatus('done');

            const nextTodo = manager.getNextPendingTodo();
            assert.strictEqual(nextTodo, null);
        });

        it('should return null when no TODOs exist', () => {
            const nextTodo = manager.getNextPendingTodo();
            assert.strictEqual(nextTodo, null);
        });
    });

    describe('getStats', () => {
        it('should return correct statistics', () => {
            manager.createTodo('Task 1', 'Result 1');
            const todo2 = manager.createTodo('Task 2', 'Result 2');
            const todo3 = manager.createTodo('Task 3', 'Result 3');
            const todo4 = manager.createTodo('Task 4', 'Result 4');

            todo2.updateStatus('in_progress');
            todo3.updateStatus('done');
            todo4.updateStatus('failed');

            const stats = manager.getStats();

            assert.deepStrictEqual(stats, {
                total: 4,
                pending: 1,
                in_progress: 1,
                done: 1,
                failed: 1,
                completionRate: 25
            });
        });

        it('should return zero stats for empty manager', () => {
            const stats = manager.getStats();

            assert.deepStrictEqual(stats, {
                total: 0,
                pending: 0,
                in_progress: 0,
                done: 0,
                failed: 0,
                completionRate: 0
            });
        });
    });

    describe('clearAll', () => {
        it('should remove all TODOs', () => {
            manager.createTodo('Task 1', 'Result 1');
            manager.createTodo('Task 2', 'Result 2');

            assert.strictEqual(manager.getAllTodos().length, 2);

            manager.clearAll();

            assert.strictEqual(manager.getAllTodos().length, 0);
        });
    });

    describe('exportTodos', () => {
        it('should export all TODOs as JSON-serializable objects', () => {
            const todo1 = manager.createTodo('Task 1', 'Result 1');
            const todo2 = manager.createTodo('Task 2', 'Result 2');
            
            todo2.updateStatus('done');
            todo2.result = 'Completed successfully';

            const exported = manager.exportTodos();

            assert.strictEqual(exported.length, 2);
            assert.strictEqual(exported[0].id, todo1.id);
            assert.strictEqual(exported[0].description, 'Task 1');
            assert.strictEqual(exported[0].expectedResult, 'Result 1');
            assert.strictEqual(exported[0].status, 'pending');
            assert.strictEqual(exported[0].createdAt, todo1.createdAt);
            assert.strictEqual(exported[0].completedAt, null);
            assert.strictEqual(exported[0].result, null);
            assert.deepStrictEqual(exported[0].toolCalls, []);
            
            assert.strictEqual(exported[1].id, todo2.id);
            assert.strictEqual(exported[1].description, 'Task 2');
            assert.strictEqual(exported[1].expectedResult, 'Result 2');
            assert.strictEqual(exported[1].status, 'done');
            assert.strictEqual(exported[1].createdAt, todo2.createdAt);
            assert.strictEqual(exported[1].completedAt, todo2.completedAt);
            assert.strictEqual(exported[1].result, 'Completed successfully');
            assert.deepStrictEqual(exported[1].toolCalls, []);
        });
    });

    describe('importTodos', () => {
        it('should import TODOs from JSON data', () => {
            const todosData = [
                {
                    id: 'todo_123_abc',
                    description: 'Imported task 1',
                    expectedResult: 'Imported result 1',
                    status: 'pending',
                    createdAt: '2023-01-01T00:00:00.000Z',
                    completedAt: null,
                    result: null,
                    toolCalls: []
                },
                {
                    id: 'todo_456_def',
                    description: 'Imported task 2',
                    expectedResult: 'Imported result 2',
                    status: 'done',
                    createdAt: '2023-01-01T00:00:00.000Z',
                    completedAt: '2023-01-01T01:00:00.000Z',
                    result: 'Task completed',
                    toolCalls: [{ toolName: 'test', timestamp: '2023-01-01T00:30:00.000Z' }]
                }
            ];

            manager.importTodos(todosData);

            const todos = manager.getAllTodos();
            assert.strictEqual(todos.length, 2);

            const todo1 = manager.getTodoById('todo_123_abc');
            const todo2 = manager.getTodoById('todo_456_def');

            assert.strictEqual(todo1.description, 'Imported task 1');
            assert.strictEqual(todo1.status, 'pending');
            assert.strictEqual(todo2.description, 'Imported task 2');
            assert.strictEqual(todo2.status, 'done');
            assert.strictEqual(todo2.toolCalls.length, 1);
        });

        it('should throw error for invalid input', () => {
            assert.throws(() => {
                manager.importTodos('not an array');
            }, /TODOs data must be an array/);
        });

        it('should clear existing TODOs before importing', () => {
            manager.createTodo('Existing task', 'Existing result');
            assert.strictEqual(manager.getAllTodos().length, 1);

            const todosData = [{
                id: 'todo_123_abc',
                description: 'Imported task',
                expectedResult: 'Imported result',
                status: 'pending',
                createdAt: '2023-01-01T00:00:00.000Z',
                completedAt: null,
                result: null,
                toolCalls: []
            }];

            manager.importTodos(todosData);

            const todos = manager.getAllTodos();
            assert.strictEqual(todos.length, 1);
            assert.strictEqual(todos[0].description, 'Imported task');
        });
    });
});