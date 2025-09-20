/**
 * Simple test runner for Context Manager
 */

const { ContextManager, LegacySession } = require('../legacy/contextManager');

console.log('Testing Context Manager...');

try {
    // Test 1: Create session
    console.log('Test 1: Creating session...');
    const contextManager = new ContextManager();
    const session = contextManager.createSession('Test task', 'gpt-4', 'req-123');
    
    if (session instanceof LegacySession) {
        console.log('✓ Session created successfully');
        console.log(`  Session ID: ${session.id}`);
        console.log(`  Original Task: ${session.originalTask}`);
        console.log(`  Phase: ${session.phase}`);
    } else {
        throw new Error('Session creation failed');
    }

    // Test 2: Add TODO
    console.log('\nTest 2: Adding TODO...');
    session.addTodo({
        id: 'todo-1',
        description: 'Test todo',
        status: 'pending',
        expectedResult: 'Should work'
    });
    
    if (session.todos.length === 1) {
        console.log('✓ TODO added successfully');
        console.log(`  TODO: ${session.todos[0].description}`);
    } else {
        throw new Error('TODO addition failed');
    }

    // Test 3: Update session
    console.log('\nTest 3: Updating session...');
    const updated = contextManager.updateSession(session.id, { phase: 'execution' });
    
    if (updated && session.phase === 'execution') {
        console.log('✓ Session updated successfully');
        console.log(`  New phase: ${session.phase}`);
    } else {
        throw new Error('Session update failed');
    }

    // Test 4: Get context
    console.log('\nTest 4: Getting context...');
    const context = contextManager.getSessionContext(session.id);
    
    if (context && context.sessionId === session.id) {
        console.log('✓ Context retrieved successfully');
        console.log(`  Context session ID: ${context.sessionId}`);
        console.log(`  Context todos: ${context.todos.length}`);
        console.log(`  Context logs: ${context.executionLog.length}`);
    } else {
        throw new Error('Context retrieval failed');
    }

    // Test 5: Build prompt
    console.log('\nTest 5: Building context prompt...');
    const prompt = contextManager.buildContextPrompt(session.id);
    
    if (prompt && prompt.includes('Legacy Mode Context')) {
        console.log('✓ Context prompt built successfully');
        console.log(`  Prompt length: ${prompt.length} characters`);
        console.log(`  Contains task: ${prompt.includes('Test task')}`);
        console.log(`  Contains TODO: ${prompt.includes('Test todo')}`);
    } else {
        throw new Error('Context prompt building failed');
    }

    // Test 6: Memory stats
    console.log('\nTest 6: Getting memory stats...');
    const stats = contextManager.getMemoryStats();
    
    if (stats && stats.sessionCount === 1) {
        console.log('✓ Memory stats retrieved successfully');
        console.log(`  Sessions: ${stats.sessionCount}`);
        console.log(`  TODOs: ${stats.totalTodos}`);
        console.log(`  Log entries: ${stats.totalLogEntries}`);
    } else {
        throw new Error('Memory stats retrieval failed');
    }

    // Test 7: Cleanup
    console.log('\nTest 7: Cleaning up...');
    const clearedCount = contextManager.clearAllSessions();
    contextManager.stopCleanupTimer();
    
    if (clearedCount === 1) {
        console.log('✓ Cleanup completed successfully');
        console.log(`  Cleared sessions: ${clearedCount}`);
    } else {
        throw new Error('Cleanup failed');
    }

    console.log('\n🎉 All tests passed! Context Manager is working correctly.');

} catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
}