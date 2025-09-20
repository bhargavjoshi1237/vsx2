/**
 * Integration test for Verification System with TODO Manager
 * Tests the integration between verification system and TODO management
 */

const { VerificationSystem } = require('../legacy/verificationSystem');
const { TodoManager } = require('../legacy/todoManager');

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

async function runIntegrationTest() {
    console.log('Running Verification System Integration Test...\n');

    // Create instances
    const todoManager = new TodoManager();
    const verificationSystem = new VerificationSystem({ defaultTimeoutMs: 5000 });

    // Test 1: Create TODO and verify completion
    console.log('Test 1: TODO creation and verification workflow');
    
    const todo = todoManager.createTodo(
        'Create configuration file',
        'Config file should be created with default settings'
    );
    
    // Mark TODO as in progress
    todoManager.updateTodoStatus(todo.id, 'in_progress');
    
    // Simulate tool execution result
    const toolResult = 'File config.json created successfully with default settings';
    
    // Request verification
    const verificationResult = await verificationSystem.requestVerification(todo.id, toolResult);
    
    // Should be auto-approved
    assert(verificationResult.status === 'approved', 'Should be auto-approved');
    assert(verificationResult.autoApproved === true, 'Should be marked as auto-approved');
    
    // Complete the TODO based on verification
    if (verificationResult.status === 'approved') {
        todoManager.markTodoComplete(todo.id, toolResult);
    }
    
    // Verify TODO is completed
    const completedTodo = todoManager.getTodoById(todo.id);
    assert(completedTodo.status === 'done', 'TODO should be marked as done');
    assert(completedTodo.result === toolResult, 'TODO should have the result');
    
    console.log('✓ Passed\n');

    // Test 2: Manual verification workflow
    console.log('Test 2: Manual verification workflow');
    
    const todo2 = todoManager.createTodo(
        'Complex database migration',
        'Database should be migrated with all data intact'
    );
    
    todoManager.updateTodoStatus(todo2.id, 'in_progress');
    
    // Simulate complex operation result that requires manual verification
    const complexResult = 'Database migration finished but encountered several issues that need review';
    
    // Start verification (will be pending)
    const verificationPromise = verificationSystem.requestVerification(todo2.id, complexResult);
    
    // Check that verification is pending
    const pendingVerifications = verificationSystem.getAllPendingVerifications();
    assert(pendingVerifications.length === 1, 'Should have one pending verification');
    assert(pendingVerifications[0].todoId === todo2.id, 'Should be for the correct TODO');
    
    // Simulate user approval
    const verificationId = pendingVerifications[0].id;
    verificationSystem.handleVerificationResponse(
        verificationId, 
        true, 
        'Warnings are acceptable, migration looks good'
    );
    
    // Wait for verification to complete
    const manualVerificationResult = await verificationPromise;
    assert(manualVerificationResult.status === 'approved', 'Should be approved');
    assert(manualVerificationResult.autoApproved === false, 'Should not be auto-approved');
    
    // Complete the TODO
    todoManager.markTodoComplete(todo2.id, complexResult);
    
    const completedTodo2 = todoManager.getTodoById(todo2.id);
    assert(completedTodo2.status === 'done', 'TODO should be completed');
    
    console.log('✓ Passed\n');

    // Test 3: Verification rejection and retry
    console.log('Test 3: Verification rejection and retry workflow');
    
    const todo3 = todoManager.createTodo(
        'Deploy application',
        'Application should be deployed without errors'
    );
    
    todoManager.updateTodoStatus(todo3.id, 'in_progress');
    
    // First attempt with errors
    const errorResult = 'Deployment failed: Connection timeout to production server';
    
    const rejectionPromise = verificationSystem.requestVerification(todo3.id, errorResult);
    
    const pendingRejection = verificationSystem.getAllPendingVerifications();
    const rejectionId = pendingRejection[0].id;
    
    // User rejects the result
    verificationSystem.handleVerificationResponse(
        rejectionId,
        false,
        'Deployment failed, please fix connection issues and retry'
    );
    
    const rejectionResult = await rejectionPromise;
    assert(rejectionResult.status === 'rejected', 'Should be rejected');
    
    // Mark TODO as failed based on rejection
    todoManager.markTodoFailed(todo3.id, 'Deployment failed - needs retry');
    
    const failedTodo = todoManager.getTodoById(todo3.id);
    assert(failedTodo.status === 'failed', 'TODO should be marked as failed');
    
    // Retry with successful result
    todoManager.updateTodoStatus(todo3.id, 'in_progress');
    const successResult = 'Application deployed successfully to production server';
    
    const retryVerification = await verificationSystem.requestVerification(todo3.id, successResult);
    assert(retryVerification.status === 'approved', 'Retry should be approved');
    
    // Complete the TODO on successful retry
    todoManager.markTodoComplete(todo3.id, successResult);
    
    const retriedTodo = todoManager.getTodoById(todo3.id);
    assert(retriedTodo.status === 'done', 'TODO should be completed after retry');
    
    console.log('✓ Passed\n');

    // Test 4: Statistics and reporting
    console.log('Test 4: Statistics and reporting');
    
    const todoStats = todoManager.getStats();
    const verificationStats = verificationSystem.getStats();
    
    assert(todoStats.total === 3, 'Should have 3 TODOs total');
    assert(todoStats.done === 3, 'Should have 3 completed TODOs (including retry)');
    assert(todoStats.failed === 0, 'Should have 0 failed TODOs (retry succeeded)');
    
    assert(verificationStats.total >= 4, 'Should have at least 4 verifications');
    assert(verificationStats.approved >= 3, 'Should have at least 3 approved');
    assert(verificationStats.rejected >= 1, 'Should have at least 1 rejected');
    
    console.log('✓ Passed\n');

    // Test 5: Event coordination
    console.log('Test 5: Event coordination between systems');
    
    let verificationCompleted = false;
    let todoCompleted = false;
    
    // Set up event listeners
    verificationSystem.addEventListener('verification_completed', (data) => {
        if (data.todoId === 'todo_event_test') {
            verificationCompleted = true;
            
            // Auto-complete TODO when verification is approved
            if (data.status === 'approved') {
                todoManager.markTodoComplete(data.todoId, data.result);
                todoCompleted = true;
            }
        }
    });
    
    // Create TODO and verify
    const eventTodo = todoManager.createTodo(
        'Event coordination test',
        'Should coordinate between verification and TODO systems'
    );
    eventTodo.id = 'todo_event_test'; // Set specific ID for event tracking
    todoManager.todos.set(eventTodo.id, eventTodo);
    
    await verificationSystem.requestVerification(eventTodo.id, 'Test completed successfully');
    
    assert(verificationCompleted === true, 'Verification event should have fired');
    assert(todoCompleted === true, 'TODO should have been completed via event');
    
    const eventCompletedTodo = todoManager.getTodoById(eventTodo.id);
    assert(eventCompletedTodo.status === 'done', 'TODO should be marked as done');
    
    console.log('✓ Passed\n');

    // Cleanup
    verificationSystem.cleanup();
    todoManager.clearAll();

    console.log('All Integration tests passed! ✅');
}

// Run the integration test
runIntegrationTest().catch(error => {
    console.error('Integration test failed:', error);
    process.exit(1);
});