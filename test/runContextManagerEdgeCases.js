/**
 * Edge case tests for Context Manager
 */

const { ContextManager, LegacySession } = require('../legacy/contextManager');

console.log('Testing Context Manager edge cases...');

try {
    const contextManager = new ContextManager();
    contextManager.clearAllSessions();

    // Test 1: Non-existent session operations
    console.log('Test 1: Non-existent session operations...');
    
    const nonExistentContext = contextManager.getSessionContext('non-existent');
    const nonExistentPrompt = contextManager.buildContextPrompt('non-existent');
    const nonExistentUpdate = contextManager.updateSession('non-existent', { phase: 'test' });
    const nonExistentDelete = contextManager.deleteSession('non-existent');
    
    if (nonExistentContext === null && 
        nonExistentPrompt === null && 
        nonExistentUpdate === false && 
        nonExistentDelete === false) {
        console.log('✓ Non-existent session operations handled correctly');
    } else {
        throw new Error('Non-existent session operations not handled correctly');
    }

    // Test 2: Session ID uniqueness
    console.log('\nTest 2: Session ID uniqueness...');
    const session1 = contextManager.createSession('Task 1', 'gpt-4', 'req-1');
    const session2 = contextManager.createSession('Task 2', 'gpt-4', 'req-2');
    const session3 = contextManager.createSession('Task 3', 'gpt-4', 'req-3');
    
    const ids = [session1.id, session2.id, session3.id];
    const uniqueIds = [...new Set(ids)];
    
    if (uniqueIds.length === 3) {
        console.log('✓ Session IDs are unique');
        console.log(`  IDs: ${ids.join(', ')}`);
    } else {
        throw new Error('Session IDs are not unique');
    }

    // Test 3: TODO update edge cases
    console.log('\nTest 3: TODO update edge cases...');
    const session = contextManager.createSession('Test task', 'gpt-4', 'req-123');
    
    // Try to update non-existent TODO
    const updateResult1 = session.updateTodo('non-existent', { status: 'done' });
    
    // Add TODO and update it
    session.addTodo({ id: 'todo-1', description: 'Test', status: 'pending' });
    const updateResult2 = session.updateTodo('todo-1', { status: 'done', result: 'Success' });
    
    if (updateResult1 === false && updateResult2 === true && session.todos[0].status === 'done') {
        console.log('✓ TODO update edge cases handled correctly');
    } else {
        throw new Error('TODO update edge cases not handled correctly');
    }

    // Test 4: Execution log limit
    console.log('\nTest 4: Execution log limit...');
    const logSession = contextManager.createSession('Log test', 'gpt-4', 'req-log');
    
    // Add 15 log entries (plus 1 creation log = 16 total)
    for (let i = 0; i < 15; i++) {
        logSession.addExecutionLogEntry({ type: 'test', details: `Entry ${i}` });
    }
    
    const context = contextManager.getSessionContext(logSession.id);
    
    if (context.executionLog.length === 10 && 
        context.executionLog[9].details === 'Entry 14') {
        console.log('✓ Execution log limit working correctly');
        console.log(`  Log entries in context: ${context.executionLog.length}`);
        console.log(`  Last entry: ${context.executionLog[9].details}`);
    } else {
        throw new Error('Execution log limit not working correctly');
    }

    // Test 5: Session cleanup
    console.log('\nTest 5: Session cleanup...');
    
    // Create sessions with different activity times
    const activeSession = contextManager.createSession('Active', 'gpt-4', 'req-active');
    const expiredSession = contextManager.createSession('Expired', 'gpt-4', 'req-expired');
    
    // Manually set expired session to old time
    const oldTime = new Date(Date.now() - 35 * 60 * 1000).toISOString(); // 35 minutes ago
    expiredSession.lastActivity = oldTime;
    
    const cleanedCount = contextManager.cleanupExpiredSessions();
    const remainingSessions = contextManager.getAllSessions();
    
    if (cleanedCount >= 1 && 
        remainingSessions.some(s => s.id === activeSession.id) &&
        !remainingSessions.some(s => s.id === expiredSession.id)) {
        console.log('✓ Session cleanup working correctly');
        console.log(`  Cleaned sessions: ${cleanedCount}`);
        console.log(`  Remaining sessions: ${remainingSessions.length}`);
    } else {
        throw new Error('Session cleanup not working correctly');
    }

    // Test 6: ID prevention during update
    console.log('\nTest 6: ID prevention during update...');
    const testSession = contextManager.createSession('ID test', 'gpt-4', 'req-id');
    const originalId = testSession.id;
    
    contextManager.updateSession(testSession.id, { 
        id: 'malicious-new-id', 
        phase: 'execution',
        originalTask: 'Modified task'
    });
    
    if (testSession.id === originalId && 
        testSession.phase === 'execution' && 
        testSession.originalTask === 'Modified task') {
        console.log('✓ ID prevention working correctly');
        console.log(`  Original ID preserved: ${originalId}`);
        console.log(`  Other updates applied: phase=${testSession.phase}`);
    } else {
        throw new Error('ID prevention not working correctly');
    }

    // Cleanup
    contextManager.clearAllSessions();
    contextManager.stopCleanupTimer();

    console.log('\n🎉 All edge case tests passed! Context Manager is robust.');

} catch (error) {
    console.error('\n❌ Edge case test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
}