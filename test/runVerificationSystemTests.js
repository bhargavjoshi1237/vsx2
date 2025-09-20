/**
 * Simple test runner for Verification System
 * Tests core functionality without complex async timing issues
 */

const { VerificationSystem, AUTO_APPROVAL_RULES, DEFAULT_CONFIG } = require('../legacy/verificationSystem');

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

async function runTests() {
    console.log('Running Verification System Tests...\n');

    // Test 1: Basic initialization
    console.log('Test 1: Basic initialization');
    const system = new VerificationSystem();
    assert(system.config.defaultTimeoutMs === DEFAULT_CONFIG.defaultTimeoutMs, 'Default config should be set');
    assert(system.pendingVerifications.size === 0, 'Should start with no pending verifications');
    assert(system.verificationHistory.length === 0, 'Should start with empty history');
    console.log('✓ Passed\n');

    // Test 2: Auto-approval logic
    console.log('Test 2: Auto-approval logic');
    assert(system.shouldAutoApprove('File created successfully'), 'Should auto-approve file creation');
    assert(system.shouldAutoApprove('Search completed'), 'Should auto-approve search completion');
    assert(!system.shouldAutoApprove('Error: File not found'), 'Should not auto-approve errors');
    assert(!system.shouldAutoApprove('Permission denied'), 'Should not auto-approve permission errors');
    console.log('✓ Passed\n');

    // Test 3: Auto-approved verification
    console.log('Test 3: Auto-approved verification');
    const autoResult = await system.requestVerification('todo_auto', 'File created successfully');
    assert(autoResult.status === 'approved', 'Should be approved');
    assert(autoResult.autoApproved === true, 'Should be auto-approved');
    assert(autoResult.todoId === 'todo_auto', 'Should have correct TODO ID');
    assert(system.verificationHistory.length === 1, 'Should be in history');
    console.log('✓ Passed\n');

    // Test 4: Manual verification workflow
    console.log('Test 4: Manual verification workflow');
    const system2 = new VerificationSystem({ defaultTimeoutMs: 10000 }); // Longer timeout for manual test
    
    // Start manual verification (don't await yet) - use a result that won't auto-approve
    const manualPromise = system2.requestVerification('todo_manual', 'Complex operation with warnings and issues');
    
    // Check it's pending
    const pending = system2.getAllPendingVerifications();
    assert(pending.length === 1, 'Should have one pending verification');
    assert(pending[0].todoId === 'todo_manual', 'Should have correct TODO ID');
    
    // Approve it
    const handled = system2.handleVerificationResponse(pending[0].id, true, 'Looks good');
    assert(handled === true, 'Should handle verification response');
    
    // Wait for completion
    const manualResult = await manualPromise;
    assert(manualResult.status === 'approved', 'Should be approved');
    assert(manualResult.autoApproved === false, 'Should not be auto-approved');
    assert(manualResult.feedback === 'Looks good', 'Should have feedback');
    
    // Check it's no longer pending
    const pendingAfter = system2.getAllPendingVerifications();
    assert(pendingAfter.length === 0, 'Should have no pending verifications');
    
    system2.cleanup();
    console.log('✓ Passed\n');

    // Test 5: Verification rejection
    console.log('Test 5: Verification rejection');
    const system3 = new VerificationSystem({ defaultTimeoutMs: 10000 });
    
    const rejectPromise = system3.requestVerification('todo_reject', 'Operation with warnings and issues');
    const pendingReject = system3.getAllPendingVerifications();
    
    const rejectedHandled = system3.handleVerificationResponse(pendingReject[0].id, false, 'Please fix issues');
    assert(rejectedHandled === true, 'Should handle rejection');
    
    const rejectResult = await rejectPromise;
    assert(rejectResult.status === 'rejected', 'Should be rejected');
    assert(rejectResult.feedback === 'Please fix issues', 'Should have rejection feedback');
    
    system3.cleanup();
    console.log('✓ Passed\n');

    // Test 6: Timeout handling
    console.log('Test 6: Timeout handling');
    const system4 = new VerificationSystem({ defaultTimeoutMs: 100 });
    
    const timeoutResult = await system4.requestVerification('todo_timeout', 'Manual verification with warnings');
    assert(timeoutResult.status === 'approved', 'Should be auto-approved on timeout');
    assert(timeoutResult.timedOut === true, 'Should be marked as timed out');
    assert(timeoutResult.autoApproved === true, 'Should be auto-approved');
    
    system4.cleanup();
    console.log('✓ Passed\n');

    // Test 7: Configuration and limits
    console.log('Test 7: Configuration and limits');
    const system5 = new VerificationSystem({ 
        maxPendingVerifications: 2,
        autoApprovalEnabled: false 
    });
    
    // Should not auto-approve when disabled
    assert(!system5.shouldAutoApprove('File created successfully'), 'Should not auto-approve when disabled');
    
    // Test pending limit
    const promise1 = system5.requestVerification('todo_1', 'Manual verification with warnings');
    const promise2 = system5.requestVerification('todo_2', 'Manual verification with issues');
    
    try {
        await system5.requestVerification('todo_3', 'Manual verification with problems');
        assert(false, 'Should throw error when limit exceeded');
    } catch (error) {
        assert(error.message.includes('Maximum number of pending verifications reached'), 'Should throw limit error');
    }
    
    system5.cleanup();
    console.log('✓ Passed\n');

    // Test 8: Statistics
    console.log('Test 8: Statistics');
    const system6 = new VerificationSystem();
    
    // Add some verifications
    await system6.requestVerification('todo_stat1', 'File created successfully'); // Auto-approved
    
    const manualStatPromise = system6.requestVerification('todo_stat2', 'Manual verification with warnings');
    const pendingStat = system6.getAllPendingVerifications();
    system6.handleVerificationResponse(pendingStat[0].id, true);
    await manualStatPromise;
    
    const stats = system6.getStats();
    assert(stats.total === 2, 'Should have 2 total verifications');
    assert(stats.approved === 2, 'Should have 2 approved');
    assert(stats.autoApproved === 1, 'Should have 1 auto-approved');
    assert(stats.approvalRate === 100, 'Should have 100% approval rate');
    
    system6.cleanup();
    console.log('✓ Passed\n');

    // Test 9: Event system
    console.log('Test 9: Event system');
    const system7 = new VerificationSystem();
    let eventFired = false;
    
    system7.addEventListener('verification_completed', (data) => {
        eventFired = true;
        assert(data.todoId === 'todo_event', 'Event should have correct TODO ID');
    });
    
    await system7.requestVerification('todo_event', 'File created successfully');
    assert(eventFired === true, 'Event should have been fired');
    
    system7.cleanup();
    console.log('✓ Passed\n');

    // Test 10: Data export/import
    console.log('Test 10: Data export/import');
    const system8 = new VerificationSystem();
    await system8.requestVerification('todo_export', 'File created successfully');
    
    const exportData = system8.exportData();
    assert(exportData.verificationHistory.length === 1, 'Should export history');
    assert(exportData.config.defaultTimeoutMs === DEFAULT_CONFIG.defaultTimeoutMs, 'Should export config');
    
    const system9 = new VerificationSystem();
    system9.importData(exportData);
    assert(system9.verificationHistory.length === 1, 'Should import history');
    assert(system9.verificationHistory[0].todoId === 'todo_export', 'Should import correct data');
    
    system8.cleanup();
    system9.cleanup();
    console.log('✓ Passed\n');

    console.log('All Verification System tests passed! ✅');
}

// Run the tests
runTests().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});