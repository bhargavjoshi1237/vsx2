/**
 * Test suite for Legacy Mode Performance Optimizations
 */

const { PerformanceMonitor } = require('../legacy/performanceMonitor');
const { ContextManager } = require('../legacy/contextManager');

describe('Performance Optimizations', () => {
    let performanceMonitor;
    let contextManager;

    beforeEach(() => {
        performanceMonitor = new PerformanceMonitor();
        contextManager = new ContextManager();
    });

    afterEach(() => {
        if (performanceMonitor) {
            performanceMonitor.stopMonitoring();
        }
        if (contextManager) {
            contextManager.shutdown();
        }
    });

    describe('PerformanceMonitor', () => {
        test('should track request metrics correctly', () => {
            // Record some requests
            performanceMonitor.recordRequest(100, true);
            performanceMonitor.recordRequest(200, true);
            performanceMonitor.recordRequest(150, false);

            const metrics = performanceMonitor.metrics;
            expect(metrics.totalRequests).toBe(3);
            expect(metrics.successfulRequests).toBe(2);
            expect(metrics.failedRequests).toBe(1);
            expect(metrics.averageResponseTime).toBe(150); // (100 + 200 + 150) / 3
            expect(metrics.minResponseTime).toBe(100);
            expect(metrics.maxResponseTime).toBe(200);
        });

        test('should track session lifecycle', () => {
            performanceMonitor.recordSession('created', 'session1');
            performanceMonitor.recordSession('completed', 'session1', 5000);
            performanceMonitor.recordSession('failed', 'session2');

            const metrics = performanceMonitor.metrics;
            expect(metrics.sessionsCreated).toBe(1);
            expect(metrics.sessionsCompleted).toBe(1);
            expect(metrics.sessionsFailed).toBe(1);
            expect(metrics.averageSessionDuration).toBe(5000);
        });

        test('should track tool execution', () => {
            performanceMonitor.recordToolExecution('readFile', 50, true);
            performanceMonitor.recordToolExecution('writeFile', 100, true);
            performanceMonitor.recordToolExecution('deleteFile', 75, false);

            const metrics = performanceMonitor.metrics;
            expect(metrics.toolsExecuted).toBe(3);
            expect(metrics.toolsSuccessful).toBe(2);
            expect(metrics.toolsFailed).toBe(1);
            expect(metrics.averageToolExecutionTime).toBe(75); // (50 + 100 + 75) / 3
        });

        test('should track cache operations', () => {
            performanceMonitor.recordCacheOperation(true, 10);
            performanceMonitor.recordCacheOperation(true, 15);
            performanceMonitor.recordCacheOperation(false, 20);

            const metrics = performanceMonitor.metrics;
            expect(metrics.cacheHits).toBe(2);
            expect(metrics.cacheMisses).toBe(1);
            expect(metrics.cacheSize).toBe(20);
        });

        test('should generate recommendations for slow responses', () => {
            const recommendations = [];
            performanceMonitor.on('recommendation', (rec) => {
                recommendations.push(rec);
            });

            // Record a slow response (exceeds 30s threshold)
            performanceMonitor.recordRequest(35000, true);

            expect(recommendations).toHaveLength(1);
            expect(recommendations[0].type).toBe('slow-response');
            expect(recommendations[0].severity).toBe('medium');
        });

        test('should detect memory trends', () => {
            performanceMonitor.startMonitoring();

            // Simulate memory usage data
            const mockHistory = [
                { currentMemoryUsage: 100 * 1024 * 1024 },
                { currentMemoryUsage: 110 * 1024 * 1024 },
                { currentMemoryUsage: 120 * 1024 * 1024 },
                { currentMemoryUsage: 130 * 1024 * 1024 },
                { currentMemoryUsage: 140 * 1024 * 1024 }
            ];

            const trend = performanceMonitor.calculateMemoryTrend(mockHistory);
            expect(trend).toBeGreaterThan(0.1); // Should detect upward trend

            performanceMonitor.stopMonitoring();
        });

        test('should provide performance report', () => {
            performanceMonitor.recordRequest(100, true);
            performanceMonitor.recordRequest(200, false);
            performanceMonitor.recordCacheOperation(true);
            performanceMonitor.recordCacheOperation(false);
            performanceMonitor.recordToolExecution('readFile', 50, true);

            const report = performanceMonitor.getPerformanceReport();

            expect(report.summary.successRate).toBe('50.0%');
            expect(report.summary.cacheHitRate).toBe('50.0%');
            expect(report.summary.toolSuccessRate).toBe('100.0%');
            expect(report.summary.averageResponseTimeMs).toBe(150);
        });

        test('should reset metrics correctly', () => {
            performanceMonitor.recordRequest(100, true);
            performanceMonitor.recordSession('created', 'session1');
            performanceMonitor.recordToolExecution('readFile', 50, true);

            performanceMonitor.resetMetrics();

            const metrics = performanceMonitor.metrics;
            expect(metrics.totalRequests).toBe(0);
            expect(metrics.sessionsCreated).toBe(0);
            expect(metrics.toolsExecuted).toBe(0);
            expect(performanceMonitor.recommendations.size).toBe(0);
        });
    });

    describe('ContextManager Performance', () => {
        test('should limit session count', async () => {
            // Set a low limit for testing
            contextManager.maxSessions = 5;

            // Create sessions up to the limit
            const sessions = [];
            for (let i = 0; i < 5; i++) {
                const session = contextManager.createSession(`task${i}`, 'model1', `req${i}`);
                sessions.push(session);
            }

            expect(contextManager.sessions.size).toBe(5);

            // Try to create one more - should trigger cleanup
            try {
                contextManager.createSession('task6', 'model1', 'req6');
                // Should not reach here if limit is enforced
                expect(true).toBe(false);
            } catch (error) {
                expect(error.code).toBe('SESSION_LIMIT_EXCEEDED');
            }
        });

        test('should batch session updates', (done) => {
            const session = contextManager.createSession('test task', 'model1', 'req1');
            
            // Batch multiple updates
            contextManager.updateSession(session.id, { phase: 'execution' });
            contextManager.updateSession(session.id, { todos: [] });
            contextManager.updateSession(session.id, { context: { test: true } });

            // Updates should be batched
            expect(contextManager.pendingUpdates.size).toBe(1);
            expect(contextManager.batchUpdateTimer).toBeTruthy();

            // Wait for batch processing
            setTimeout(() => {
                expect(contextManager.pendingUpdates.size).toBe(0);
                expect(contextManager.batchUpdateTimer).toBe(null);
                
                const updatedSession = contextManager.getSession(session.id);
                expect(updatedSession.phase).toBe('execution');
                expect(updatedSession.context.test).toBe(true);
                
                done();
            }, 150); // Wait longer than batch interval
        });

        test('should perform memory cleanup', () => {
            const session = contextManager.createSession('test task', 'model1', 'req1');
            
            // Add many execution log entries
            for (let i = 0; i < 100; i++) {
                session.addExecutionLogEntry({
                    type: 'test_entry',
                    data: `entry ${i}`
                });
            }

            expect(session.executionLog.length).toBe(50); // Should be trimmed to max

            // Add many TODOs
            for (let i = 0; i < 250; i++) {
                const added = session.addTodo({
                    id: `todo${i}`,
                    description: `Todo ${i}`,
                    status: i < 200 ? 'pending' : 'done',
                    createdAt: new Date().toISOString(),
                    completedAt: i >= 200 ? new Date().toISOString() : null
                });
                
                if (i >= 200 && !added) {
                    // Should start rejecting after limit
                    break;
                }
            }

            expect(session.todos.length).toBeLessThanOrEqual(200); // Should respect limit
        });

        test('should provide comprehensive memory stats', () => {
            // Create some sessions with data
            for (let i = 0; i < 3; i++) {
                const session = contextManager.createSession(`task${i}`, 'model1', `req${i}`);
                session.addTodo({ id: `todo${i}`, description: `Todo ${i}`, status: 'pending' });
                session.addExecutionLogEntry({ type: 'test', data: `data${i}` });
            }

            const stats = contextManager.getMemoryStats();

            expect(stats.sessionCount).toBe(3);
            expect(stats.totalTodos).toBe(3);
            expect(stats.totalLogEntries).toBe(3);
            expect(stats.memoryUsage.heapUsed).toBeGreaterThan(0);
            expect(stats.limits.maxSessions).toBe(contextManager.maxSessions);
            expect(stats.metrics.sessionsCreated).toBe(3);
        });

        test('should cleanup expired sessions', () => {
            // Create sessions
            const session1 = contextManager.createSession('task1', 'model1', 'req1');
            const session2 = contextManager.createSession('task2', 'model1', 'req2');

            // Manually set old lastActivity for session1
            session1.lastActivity = new Date(Date.now() - 35 * 60 * 1000).toISOString(); // 35 minutes ago

            const cleanedCount = contextManager.cleanupExpiredSessions();

            expect(cleanedCount).toBe(1);
            expect(contextManager.sessions.size).toBe(1);
            expect(contextManager.getSession(session1.id)).toBe(null);
            expect(contextManager.getSession(session2.id)).toBeTruthy();
        });
    });

    describe('Integration Tests', () => {
        test('should handle performance monitoring lifecycle', () => {
            performanceMonitor.startMonitoring();
            expect(performanceMonitor.isMonitoring).toBe(true);
            expect(performanceMonitor.monitoringInterval).toBeTruthy();

            performanceMonitor.stopMonitoring();
            expect(performanceMonitor.isMonitoring).toBe(false);
            expect(performanceMonitor.monitoringInterval).toBe(null);
        });

        test('should emit metrics events during monitoring', (done) => {
            let eventCount = 0;
            
            performanceMonitor.on('metrics-collected', (metrics) => {
                eventCount++;
                expect(metrics.timestamp).toBeTruthy();
                expect(metrics.metrics).toBeTruthy();
                
                if (eventCount >= 1) {
                    performanceMonitor.stopMonitoring();
                    done();
                }
            });

            // Set very short interval for testing
            performanceMonitor.monitoringFrequency = 50;
            performanceMonitor.startMonitoring();
        });
    });
});