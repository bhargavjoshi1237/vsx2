/**
 * Unit tests for Verification System
 * Tests verification workflows, auto-approval logic, timeout handling, and edge cases
 */

const { VerificationSystem, AUTO_APPROVAL_RULES, DEFAULT_CONFIG } = require('../legacy/verificationSystem');

describe('VerificationSystem', () => {
    let verificationSystem;

    beforeEach(() => {
        verificationSystem = new VerificationSystem();
    });

    afterEach(() => {
        verificationSystem.cleanup();
    });

    describe('Constructor and Configuration', () => {
        test('should initialize with default configuration', () => {
            const system = new VerificationSystem();
            expect(system.config).toEqual(DEFAULT_CONFIG);
            expect(system.pendingVerifications.size).toBe(0);
            expect(system.verificationHistory).toEqual([]);
        });

        test('should accept custom configuration', () => {
            const customConfig = {
                defaultTimeoutMs: 60000,
                autoApprovalEnabled: false,
                maxPendingVerifications: 5
            };
            const system = new VerificationSystem(customConfig);
            expect(system.config.defaultTimeoutMs).toBe(60000);
            expect(system.config.autoApprovalEnabled).toBe(false);
            expect(system.config.maxPendingVerifications).toBe(5);
        });

        test('should merge custom config with defaults', () => {
            const customConfig = { defaultTimeoutMs: 60000 };
            const system = new VerificationSystem(customConfig);
            expect(system.config.defaultTimeoutMs).toBe(60000);
            expect(system.config.autoApprovalEnabled).toBe(DEFAULT_CONFIG.autoApprovalEnabled);
        });
    });

    describe('Auto-approval Logic', () => {
        test('should auto-approve file creation results', () => {
            const results = [
                'File test.js created successfully',
                'Directory src written successfully',
                'File config.json created successfully'
            ];
            
            results.forEach(result => {
                expect(verificationSystem.shouldAutoApprove(result)).toBe(true);
            });
        });

        test('should auto-approve file read results', () => {
            const results = [
                'File content read successfully',
                'Content retrieved successfully',
                'File data.json read successfully'
            ];
            
            results.forEach(result => {
                expect(verificationSystem.shouldAutoApprove(result)).toBe(true);
            });
        });

        test('should auto-approve search results', () => {
            const results = [
                'Search completed',
                'Search found 5 results',
                'Search found 0 results'
            ];
            
            results.forEach(result => {
                expect(verificationSystem.shouldAutoApprove(result)).toBe(true);
            });
        });

        test('should auto-approve command success results', () => {
            const results = [
                'Command executed successfully',
                'Process completed successfully',
                'Operation done successfully'
            ];
            
            results.forEach(result => {
                expect(verificationSystem.shouldAutoApprove(result)).toBe(true);
            });
        });

        test('should not auto-approve error results', () => {
            const results = [
                'Error: File not found',
                'Command failed with error',
                'Permission denied',
                'Access denied to file',
                'Invalid input provided',
                'Exception occurred during execution'
            ];
            
            results.forEach(result => {
                expect(verificationSystem.shouldAutoApprove(result)).toBe(false);
            });
        });

        test('should not auto-approve when disabled in config', () => {
            const system = new VerificationSystem({ autoApprovalEnabled: false });
            expect(system.shouldAutoApprove('File created successfully')).toBe(false);
        });

        test('should auto-approve based on success indicators', () => {
            const results = [
                'Task completed without issues',
                'Data updated in database',
                'Configuration saved to file',
                'Tests found and executed'
            ];
            
            results.forEach(result => {
                expect(verificationSystem.shouldAutoApprove(result)).toBe(true);
            });
        });
    });

    describe('Verification Request Handling', () => {
        test('should create verification request with auto-approval', async () => {
            const result = await verificationSystem.requestVerification(
                'todo_123',
                'File created successfully'
            );

            expect(result.todoId).toBe('todo_123');
            expect(result.status).toBe('approved');
            expect(result.autoApproved).toBe(true);
            expect(result.feedback).toBe('Auto-approved based on result pattern');
            expect(verificationSystem.verificationHistory).toHaveLength(1);
        });

        test('should create pending verification for manual approval', (done) => {
            const todoId = 'todo_456';
            const result = 'Complex operation completed with warnings';

            verificationSystem.addEventListener('verification_requested', (data) => {
                expect(data.todoId).toBe(todoId);
                expect(data.result).toBe(result);
                expect(data.id).toBeDefined();
                expect(verificationSystem.pendingVerifications.size).toBe(1);
                done();
            });

            verificationSystem.requestVerification(todoId, result);
        });

        test('should handle verification approval', async () => {
            const todoId = 'todo_789';
            const result = 'Manual verification required';

            // Start verification (will be pending)
            const verificationPromise = verificationSystem.requestVerification(todoId, result);

            // Get the verification ID from pending verifications
            const pendingVerifications = verificationSystem.getAllPendingVerifications();
            expect(pendingVerifications).toHaveLength(1);
            const verificationId = pendingVerifications[0].id;

            // Approve the verification
            const handled = verificationSystem.handleVerificationResponse(
                verificationId,
                true,
                'Looks good to me'
            );

            expect(handled).toBe(true);

            const verificationResult = await verificationPromise;
            expect(verificationResult.status).toBe('approved');
            expect(verificationResult.feedback).toBe('Looks good to me');
            expect(verificationResult.autoApproved).toBe(false);
        });

        test('should handle verification rejection', async () => {
            const todoId = 'todo_reject';
            const result = 'Operation completed with issues';

            const verificationPromise = verificationSystem.requestVerification(todoId, result);

            const pendingVerifications = verificationSystem.getAllPendingVerifications();
            const verificationId = pendingVerifications[0].id;

            const handled = verificationSystem.handleVerificationResponse(
                verificationId,
                false,
                'Please fix the issues first'
            );

            expect(handled).toBe(true);

            const verificationResult = await verificationPromise;
            expect(verificationResult.status).toBe('rejected');
            expect(verificationResult.feedback).toBe('Please fix the issues first');
        });

        test('should validate input parameters', async () => {
            await expect(verificationSystem.requestVerification('', 'result'))
                .rejects.toThrow('TODO ID is required and must be a string');

            await expect(verificationSystem.requestVerification('todo_123', ''))
                .rejects.toThrow('Result is required and must be a string');

            await expect(verificationSystem.requestVerification(null, 'result'))
                .rejects.toThrow('TODO ID is required and must be a string');

            await expect(verificationSystem.requestVerification('todo_123', null))
                .rejects.toThrow('Result is required and must be a string');
        });

        test('should enforce maximum pending verifications limit', async () => {
            const system = new VerificationSystem({ maxPendingVerifications: 2 });

            // Create 2 pending verifications
            await system.requestVerification('todo_1', 'Manual verification 1');
            await system.requestVerification('todo_2', 'Manual verification 2');

            // Third should fail
            await expect(system.requestVerification('todo_3', 'Manual verification 3'))
                .rejects.toThrow('Maximum number of pending verifications reached');
        });
    });

    describe('Timeout Handling', () => {
        test('should handle verification timeout', (done) => {
            const system = new VerificationSystem({ defaultTimeoutMs: 100 });
            const todoId = 'todo_timeout';
            const result = 'Manual verification with timeout';

            system.addEventListener('verification_timeout', (data) => {
                expect(data.todoId).toBe(todoId);
                expect(data.result).toBe(result);
                expect(system.pendingVerifications.size).toBe(0);
                done();
            });

            system.requestVerification(todoId, result);
        });

        test('should auto-approve on timeout', (done) => {
            const system = new VerificationSystem({ defaultTimeoutMs: 100 });
            const todoId = 'todo_timeout_approve';
            const result = 'Manual verification with auto-approval on timeout';

            system.addEventListener('verification_completed', (data) => {
                if (data.timedOut) {
                    expect(data.status).toBe('approved');
                    expect(data.autoApproved).toBe(true);
                    expect(data.feedback).toBe('Verification timed out - auto-approved');
                    done();
                }
            });

            system.requestVerification(todoId, result);
        });

        test('should use custom timeout', (done) => {
            const customTimeout = 50;
            const startTime = Date.now();

            verificationSystem.addEventListener('verification_timeout', () => {
                const elapsed = Date.now() - startTime;
                expect(elapsed).toBeGreaterThanOrEqual(customTimeout);
                expect(elapsed).toBeLessThan(customTimeout + 50); // Allow some margin
                done();
            });

            verificationSystem.requestVerification(
                'todo_custom_timeout',
                'Custom timeout test',
                { timeoutMs: customTimeout }
            );
        });

        test('should clear timeout when verification is handled', async () => {
            const system = new VerificationSystem({ defaultTimeoutMs: 1000 });
            
            const verificationPromise = system.requestVerification(
                'todo_clear_timeout',
                'Manual verification'
            );

            const pendingVerifications = system.getAllPendingVerifications();
            const verificationId = pendingVerifications[0].id;
            const verification = system.getPendingVerification(verificationId);
            
            expect(verification.timeoutHandle).toBeDefined();

            // Handle verification before timeout
            system.handleVerificationResponse(verificationId, true);

            const result = await verificationPromise;
            expect(result.status).toBe('approved');
        });
    });

    describe('Verification Management', () => {
        test('should get pending verification by ID', async () => {
            await verificationSystem.requestVerification('todo_pending', 'Manual verification');
            
            const pendingVerifications = verificationSystem.getAllPendingVerifications();
            const verificationId = pendingVerifications[0].id;
            
            const verification = verificationSystem.getPendingVerification(verificationId);
            expect(verification).toBeDefined();
            expect(verification.todoId).toBe('todo_pending');
            expect(verification.status).toBe('pending');
        });

        test('should return null for non-existent verification', () => {
            const verification = verificationSystem.getPendingVerification('non_existent');
            expect(verification).toBeNull();
        });

        test('should get all pending verifications', async () => {
            await verificationSystem.requestVerification('todo_1', 'Manual verification 1');
            await verificationSystem.requestVerification('todo_2', 'Manual verification 2');
            
            const pendingVerifications = verificationSystem.getAllPendingVerifications();
            expect(pendingVerifications).toHaveLength(2);
            expect(pendingVerifications[0].todoId).toBe('todo_1');
            expect(pendingVerifications[1].todoId).toBe('todo_2');
        });

        test('should cancel pending verification', async () => {
            await verificationSystem.requestVerification('todo_cancel', 'Manual verification');
            
            const pendingVerifications = verificationSystem.getAllPendingVerifications();
            const verificationId = pendingVerifications[0].id;
            
            const cancelled = verificationSystem.cancelVerification(verificationId);
            expect(cancelled).toBe(true);
            expect(verificationSystem.pendingVerifications.size).toBe(0);
        });

        test('should return false when cancelling non-existent verification', () => {
            const cancelled = verificationSystem.cancelVerification('non_existent');
            expect(cancelled).toBe(false);
        });

        test('should clear all pending verifications', async () => {
            await verificationSystem.requestVerification('todo_1', 'Manual verification 1');
            await verificationSystem.requestVerification('todo_2', 'Manual verification 2');
            
            expect(verificationSystem.pendingVerifications.size).toBe(2);
            
            verificationSystem.clearPendingVerifications();
            expect(verificationSystem.pendingVerifications.size).toBe(0);
        });
    });

    describe('Verification History', () => {
        test('should track verification history', async () => {
            // Auto-approved verification
            await verificationSystem.requestVerification('todo_1', 'File created successfully');
            
            // Manual verification
            const verificationPromise = verificationSystem.requestVerification('todo_2', 'Manual verification');
            const pendingVerifications = verificationSystem.getAllPendingVerifications();
            const verificationId = pendingVerifications[0].id;
            verificationSystem.handleVerificationResponse(verificationId, true, 'Approved manually');
            await verificationPromise;

            const history = verificationSystem.getVerificationHistory();
            expect(history).toHaveLength(2);
            
            // Check that both verifications are in history
            const todoIds = history.map(h => h.todoId);
            expect(todoIds).toContain('todo_1');
            expect(todoIds).toContain('todo_2');
        });

        test('should filter verification history by TODO ID', async () => {
            await verificationSystem.requestVerification('todo_filter', 'File created successfully');
            await verificationSystem.requestVerification('todo_other', 'File updated successfully');
            
            const history = verificationSystem.getVerificationHistory({ todoId: 'todo_filter' });
            expect(history).toHaveLength(1);
            expect(history[0].todoId).toBe('todo_filter');
        });

        test('should filter verification history by status', async () => {
            await verificationSystem.requestVerification('todo_approved', 'File created successfully');
            
            const verificationPromise = verificationSystem.requestVerification('todo_rejected', 'Manual verification');
            const pendingVerifications = verificationSystem.getAllPendingVerifications();
            const verificationId = pendingVerifications[0].id;
            verificationSystem.handleVerificationResponse(verificationId, false, 'Rejected');
            await verificationPromise;

            const approvedHistory = verificationSystem.getVerificationHistory({ status: 'approved' });
            expect(approvedHistory).toHaveLength(1);
            expect(approvedHistory[0].todoId).toBe('todo_approved');

            const rejectedHistory = verificationSystem.getVerificationHistory({ status: 'rejected' });
            expect(rejectedHistory).toHaveLength(1);
            expect(rejectedHistory[0].todoId).toBe('todo_rejected');
        });

        test('should limit verification history results', async () => {
            await verificationSystem.requestVerification('todo_1', 'File created successfully');
            await verificationSystem.requestVerification('todo_2', 'File updated successfully');
            await verificationSystem.requestVerification('todo_3', 'File deleted successfully');
            
            const history = verificationSystem.getVerificationHistory({ limit: 2 });
            expect(history).toHaveLength(2);
        });
    });

    describe('Statistics', () => {
        test('should calculate verification statistics', async () => {
            // Auto-approved
            await verificationSystem.requestVerification('todo_1', 'File created successfully');
            
            // Manual approved
            const verificationPromise1 = verificationSystem.requestVerification('todo_2', 'Manual verification');
            let pendingVerifications = verificationSystem.getAllPendingVerifications();
            let verificationId = pendingVerifications[0].id;
            verificationSystem.handleVerificationResponse(verificationId, true);
            await verificationPromise1;
            
            // Manual rejected
            const verificationPromise2 = verificationSystem.requestVerification('todo_3', 'Manual verification');
            pendingVerifications = verificationSystem.getAllPendingVerifications();
            verificationId = pendingVerifications[0].id;
            verificationSystem.handleVerificationResponse(verificationId, false);
            await verificationPromise2;
            
            // Pending
            await verificationSystem.requestVerification('todo_4', 'Manual verification pending');

            const stats = verificationSystem.getStats();
            expect(stats.total).toBe(3); // Completed verifications
            expect(stats.pending).toBe(1);
            expect(stats.approved).toBe(2);
            expect(stats.rejected).toBe(1);
            expect(stats.autoApproved).toBe(1);
            expect(stats.approvalRate).toBe(200/3); // 2 approved out of 3 total
            expect(stats.autoApprovalRate).toBe(100/3); // 1 auto-approved out of 3 total
        });

        test('should handle empty statistics', () => {
            const stats = verificationSystem.getStats();
            expect(stats.total).toBe(0);
            expect(stats.pending).toBe(0);
            expect(stats.approved).toBe(0);
            expect(stats.rejected).toBe(0);
            expect(stats.timeout).toBe(0);
            expect(stats.autoApproved).toBe(0);
            expect(stats.approvalRate).toBe(0);
            expect(stats.autoApprovalRate).toBe(0);
            expect(stats.averageResponseTime).toBe(0);
        });
    });

    describe('Event System', () => {
        test('should emit verification_requested event', (done) => {
            verificationSystem.addEventListener('verification_requested', (data) => {
                expect(data.todoId).toBe('todo_event');
                expect(data.result).toBe('Manual verification');
                expect(data.id).toBeDefined();
                done();
            });

            verificationSystem.requestVerification('todo_event', 'Manual verification');
        });

        test('should emit verification_completed event', (done) => {
            verificationSystem.addEventListener('verification_completed', (data) => {
                expect(data.todoId).toBe('todo_complete');
                expect(data.status).toBe('approved');
                expect(data.autoApproved).toBe(true);
                done();
            });

            verificationSystem.requestVerification('todo_complete', 'File created successfully');
        });

        test('should emit verification_cancelled event', (done) => {
            verificationSystem.addEventListener('verification_cancelled', (data) => {
                expect(data.todoId).toBe('todo_cancel_event');
                done();
            });

            verificationSystem.requestVerification('todo_cancel_event', 'Manual verification')
                .then(() => {
                    const pendingVerifications = verificationSystem.getAllPendingVerifications();
                    const verificationId = pendingVerifications[0].id;
                    verificationSystem.cancelVerification(verificationId);
                });
        });

        test('should remove event handlers', () => {
            const handler = jest.fn();
            verificationSystem.addEventListener('test_event', handler);
            verificationSystem.removeEventHandler('test_event', handler);
            
            verificationSystem.emitEvent('test_event', {});
            expect(handler).not.toHaveBeenCalled();
        });

        test('should handle errors in event handlers gracefully', () => {
            const errorHandler = () => {
                throw new Error('Handler error');
            };
            const normalHandler = jest.fn();

            verificationSystem.addEventListener('test_event', errorHandler);
            verificationSystem.addEventListener('test_event', normalHandler);

            // Should not throw and should still call normal handler
            expect(() => {
                verificationSystem.emitEvent('test_event', {});
            }).not.toThrow();
            
            expect(normalHandler).toHaveBeenCalled();
        });
    });

    describe('Data Import/Export', () => {
        test('should export verification data', async () => {
            await verificationSystem.requestVerification('todo_export', 'File created successfully');
            
            const exportedData = verificationSystem.exportData();
            expect(exportedData.config).toEqual(verificationSystem.config);
            expect(exportedData.verificationHistory).toHaveLength(1);
            expect(exportedData.pendingVerifications).toEqual([]);
        });

        test('should import verification data', () => {
            const importData = {
                config: { defaultTimeoutMs: 60000 },
                verificationHistory: [
                    {
                        id: 'verify_123',
                        todoId: 'todo_import',
                        result: 'Imported result',
                        status: 'approved',
                        createdAt: '2023-01-01T00:00:00.000Z'
                    }
                ]
            };

            verificationSystem.importData(importData);
            
            expect(verificationSystem.config.defaultTimeoutMs).toBe(60000);
            expect(verificationSystem.verificationHistory).toHaveLength(1);
            expect(verificationSystem.verificationHistory[0].todoId).toBe('todo_import');
        });
    });

    describe('Edge Cases', () => {
        test('should handle verification response for non-existent verification', () => {
            const handled = verificationSystem.handleVerificationResponse('non_existent', true);
            expect(handled).toBe(false);
        });

        test('should handle multiple rapid verification requests', async () => {
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    verificationSystem.requestVerification(`todo_${i}`, 'File created successfully')
                );
            }

            const results = await Promise.all(promises);
            expect(results).toHaveLength(5);
            results.forEach((result, index) => {
                expect(result.todoId).toBe(`todo_${index}`);
                expect(result.status).toBe('approved');
                expect(result.autoApproved).toBe(true);
            });
        });

        test('should handle cleanup properly', async () => {
            await verificationSystem.requestVerification('todo_cleanup1', 'Manual verification');
            await verificationSystem.requestVerification('todo_cleanup2', 'File created successfully');
            
            expect(verificationSystem.pendingVerifications.size).toBe(1);
            expect(verificationSystem.verificationHistory).toHaveLength(1);
            
            verificationSystem.cleanup();
            
            expect(verificationSystem.pendingVerifications.size).toBe(0);
            expect(verificationSystem.verificationHistory).toHaveLength(0);
            expect(verificationSystem.eventHandlers.size).toBe(0);
        });

        test('should handle configuration updates', () => {
            const newConfig = {
                defaultTimeoutMs: 45000,
                autoApprovalEnabled: false
            };

            verificationSystem.updateConfig(newConfig);
            
            expect(verificationSystem.config.defaultTimeoutMs).toBe(45000);
            expect(verificationSystem.config.autoApprovalEnabled).toBe(false);
            expect(verificationSystem.config.maxPendingVerifications).toBe(DEFAULT_CONFIG.maxPendingVerifications);
        });
    });
});