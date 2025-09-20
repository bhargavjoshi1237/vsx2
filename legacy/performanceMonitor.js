/**
 * Performance Monitor for Legacy Mode Autonomous Execution
 * Provides comprehensive performance tracking and optimization recommendations
 */

const { EventEmitter } = require('events');

/**
 * Performance Monitor class for tracking Legacy Mode performance
 */
class PerformanceMonitor extends EventEmitter {
    constructor() {
        super();
        
        // Performance metrics
        this.metrics = {
            // Request metrics
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            minResponseTime: Infinity,
            maxResponseTime: 0,
            
            // Session metrics
            sessionsCreated: 0,
            sessionsCompleted: 0,
            sessionsFailed: 0,
            averageSessionDuration: 0,
            
            // Tool execution metrics
            toolsExecuted: 0,
            toolsSuccessful: 0,
            toolsFailed: 0,
            averageToolExecutionTime: 0,
            
            // Memory metrics
            peakMemoryUsage: 0,
            currentMemoryUsage: 0,
            memoryLeakDetected: false,
            
            // Cache metrics
            cacheHits: 0,
            cacheMisses: 0,
            cacheSize: 0,
            
            // UI metrics
            uiUpdatesQueued: 0,
            uiUpdatesBatched: 0,
            averageUIUpdateTime: 0
        };
        
        // Performance thresholds
        this.thresholds = {
            maxResponseTime: 30000, // 30 seconds
            maxMemoryUsage: 500 * 1024 * 1024, // 500MB
            maxSessionDuration: 60 * 60 * 1000, // 1 hour
            minCacheHitRate: 0.3, // 30%
            maxUIUpdateTime: 100 // 100ms
        };
        
        // Monitoring state
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.monitoringFrequency = 30000; // 30 seconds
        this.startTime = Date.now();
        
        // Performance history for trend analysis
        this.performanceHistory = [];
        this.maxHistorySize = 100;
        
        // Optimization recommendations
        this.recommendations = new Set();
    }

    /**
     * Start performance monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) {
            return;
        }
        
        this.isMonitoring = true;
        this.startTime = Date.now();
        
        this.monitoringInterval = setInterval(() => {
            this.collectMetrics();
            this.analyzePerformance();
            this.emit('metrics-collected', this.getMetricsSnapshot());
        }, this.monitoringFrequency);
        
        console.log('Performance monitoring started');
    }

    /**
     * Stop performance monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }
        
        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        console.log('Performance monitoring stopped');
    }

    /**
     * Record a request execution
     */
    recordRequest(duration, success = true) {
        this.metrics.totalRequests++;
        
        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
        }
        
        // Update response time metrics
        this.updateAverageResponseTime(duration);
        this.metrics.minResponseTime = Math.min(this.metrics.minResponseTime, duration);
        this.metrics.maxResponseTime = Math.max(this.metrics.maxResponseTime, duration);
        
        // Check thresholds
        if (duration > this.thresholds.maxResponseTime) {
            this.addRecommendation('slow-response', 
                `Response time ${duration}ms exceeds threshold ${this.thresholds.maxResponseTime}ms`);
        }
    }

    /**
     * Record a session lifecycle event
     */
    recordSession(event, sessionId, duration = null) {
        switch (event) {
            case 'created':
                this.metrics.sessionsCreated++;
                break;
            case 'completed':
                this.metrics.sessionsCompleted++;
                if (duration) {
                    this.updateAverageSessionDuration(duration);
                    
                    if (duration > this.thresholds.maxSessionDuration) {
                        this.addRecommendation('long-session',
                            `Session ${sessionId} duration ${duration}ms exceeds threshold`);
                    }
                }
                break;
            case 'failed':
                this.metrics.sessionsFailed++;
                break;
        }
    }

    /**
     * Record tool execution
     */
    recordToolExecution(toolName, duration, success = true) {
        this.metrics.toolsExecuted++;
        
        if (success) {
            this.metrics.toolsSuccessful++;
        } else {
            this.metrics.toolsFailed++;
        }
        
        this.updateAverageToolExecutionTime(duration);
    }

    /**
     * Record cache operation
     */
    recordCacheOperation(hit = true, cacheSize = null) {
        if (hit) {
            this.metrics.cacheHits++;
        } else {
            this.metrics.cacheMisses++;
        }
        
        if (cacheSize !== null) {
            this.metrics.cacheSize = cacheSize;
        }
        
        // Check cache hit rate
        const totalCacheOps = this.metrics.cacheHits + this.metrics.cacheMisses;
        if (totalCacheOps > 10) { // Only check after some operations
            const hitRate = this.metrics.cacheHits / totalCacheOps;
            if (hitRate < this.thresholds.minCacheHitRate) {
                this.addRecommendation('low-cache-hit-rate',
                    `Cache hit rate ${(hitRate * 100).toFixed(1)}% is below threshold ${(this.thresholds.minCacheHitRate * 100)}%`);
            }
        }
    }

    /**
     * Record UI update performance
     */
    recordUIUpdate(duration, batched = false) {
        this.metrics.uiUpdatesQueued++;
        
        if (batched) {
            this.metrics.uiUpdatesBatched++;
        }
        
        this.updateAverageUIUpdateTime(duration);
        
        if (duration > this.thresholds.maxUIUpdateTime) {
            this.addRecommendation('slow-ui-update',
                `UI update took ${duration}ms, exceeding threshold ${this.thresholds.maxUIUpdateTime}ms`);
        }
    }

    /**
     * Collect current system metrics
     */
    collectMetrics() {
        const memoryUsage = process.memoryUsage();
        this.metrics.currentMemoryUsage = memoryUsage.heapUsed;
        this.metrics.peakMemoryUsage = Math.max(this.metrics.peakMemoryUsage, memoryUsage.heapUsed);
        
        // Check memory threshold
        if (memoryUsage.heapUsed > this.thresholds.maxMemoryUsage) {
            this.addRecommendation('high-memory-usage',
                `Memory usage ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB exceeds threshold ${Math.round(this.thresholds.maxMemoryUsage / 1024 / 1024)}MB`);
        }
        
        // Detect potential memory leaks
        if (this.performanceHistory.length > 10) {
            const recentHistory = this.performanceHistory.slice(-10);
            const memoryTrend = this.calculateMemoryTrend(recentHistory);
            
            if (memoryTrend > 0.1) { // 10% increase trend
                this.metrics.memoryLeakDetected = true;
                this.addRecommendation('memory-leak',
                    'Potential memory leak detected - memory usage trending upward');
            }
        }
    }

    /**
     * Analyze performance and generate recommendations
     */
    analyzePerformance() {
        const snapshot = this.getMetricsSnapshot();
        
        // Add to history
        this.performanceHistory.push(snapshot);
        if (this.performanceHistory.length > this.maxHistorySize) {
            this.performanceHistory.shift();
        }
        
        // Analyze trends and patterns
        this.analyzeResponseTimeTrend();
        this.analyzeFailureRate();
        this.analyzeResourceUtilization();
    }

    /**
     * Analyze response time trends
     */
    analyzeResponseTimeTrend() {
        if (this.performanceHistory.length < 5) return;
        
        const recentHistory = this.performanceHistory.slice(-5);
        const responseTimes = recentHistory.map(h => h.averageResponseTime);
        
        const trend = this.calculateTrend(responseTimes);
        if (trend > 0.2) { // 20% increase trend
            this.addRecommendation('response-time-degradation',
                'Response times are trending upward - consider optimization');
        }
    }

    /**
     * Analyze failure rates
     */
    analyzeFailureRate() {
        const totalRequests = this.metrics.totalRequests;
        if (totalRequests < 10) return;
        
        const failureRate = this.metrics.failedRequests / totalRequests;
        if (failureRate > 0.1) { // 10% failure rate
            this.addRecommendation('high-failure-rate',
                `Failure rate ${(failureRate * 100).toFixed(1)}% is concerning`);
        }
    }

    /**
     * Analyze resource utilization
     */
    analyzeResourceUtilization() {
        const memoryUsage = this.metrics.currentMemoryUsage;
        const utilizationRate = memoryUsage / this.thresholds.maxMemoryUsage;
        
        if (utilizationRate > 0.8) { // 80% utilization
            this.addRecommendation('high-resource-utilization',
                `Memory utilization at ${(utilizationRate * 100).toFixed(1)}%`);
        }
    }

    /**
     * Calculate trend from array of values
     */
    calculateTrend(values) {
        if (values.length < 2) return 0;
        
        const first = values[0];
        const last = values[values.length - 1];
        
        if (first === 0) return 0;
        return (last - first) / first;
    }

    /**
     * Calculate memory trend from performance history
     */
    calculateMemoryTrend(history) {
        const memoryValues = history.map(h => h.currentMemoryUsage);
        return this.calculateTrend(memoryValues);
    }

    /**
     * Update average response time
     */
    updateAverageResponseTime(newTime) {
        const current = this.metrics.averageResponseTime;
        const count = this.metrics.totalRequests;
        
        if (count === 1) {
            this.metrics.averageResponseTime = newTime;
        } else {
            this.metrics.averageResponseTime = (current * (count - 1) + newTime) / count;
        }
    }

    /**
     * Update average session duration
     */
    updateAverageSessionDuration(newDuration) {
        const current = this.metrics.averageSessionDuration;
        const count = this.metrics.sessionsCompleted;
        
        if (count === 1) {
            this.metrics.averageSessionDuration = newDuration;
        } else {
            this.metrics.averageSessionDuration = (current * (count - 1) + newDuration) / count;
        }
    }

    /**
     * Update average tool execution time
     */
    updateAverageToolExecutionTime(newTime) {
        const current = this.metrics.averageToolExecutionTime;
        const count = this.metrics.toolsExecuted;
        
        if (count === 1) {
            this.metrics.averageToolExecutionTime = newTime;
        } else {
            this.metrics.averageToolExecutionTime = (current * (count - 1) + newTime) / count;
        }
    }

    /**
     * Update average UI update time
     */
    updateAverageUIUpdateTime(newTime) {
        const current = this.metrics.averageUIUpdateTime;
        const count = this.metrics.uiUpdatesQueued;
        
        if (count === 1) {
            this.metrics.averageUIUpdateTime = newTime;
        } else {
            this.metrics.averageUIUpdateTime = (current * (count - 1) + newTime) / count;
        }
    }

    /**
     * Add optimization recommendation
     */
    addRecommendation(type, message) {
        const recommendation = {
            type,
            message,
            timestamp: new Date().toISOString(),
            severity: this.getRecommendationSeverity(type)
        };
        
        this.recommendations.add(JSON.stringify(recommendation));
        this.emit('recommendation', recommendation);
    }

    /**
     * Get recommendation severity
     */
    getRecommendationSeverity(type) {
        const severityMap = {
            'slow-response': 'medium',
            'long-session': 'low',
            'high-memory-usage': 'high',
            'memory-leak': 'critical',
            'low-cache-hit-rate': 'medium',
            'slow-ui-update': 'low',
            'response-time-degradation': 'medium',
            'high-failure-rate': 'high',
            'high-resource-utilization': 'high'
        };
        
        return severityMap[type] || 'low';
    }

    /**
     * Get current metrics snapshot
     */
    getMetricsSnapshot() {
        const uptime = Date.now() - this.startTime;
        
        return {
            timestamp: new Date().toISOString(),
            uptime,
            metrics: { ...this.metrics },
            recommendations: Array.from(this.recommendations).map(r => JSON.parse(r)),
            thresholds: { ...this.thresholds }
        };
    }

    /**
     * Get performance report
     */
    getPerformanceReport() {
        const snapshot = this.getMetricsSnapshot();
        const totalRequests = this.metrics.totalRequests;
        
        return {
            ...snapshot,
            summary: {
                successRate: totalRequests > 0 ? (this.metrics.successfulRequests / totalRequests * 100).toFixed(1) + '%' : 'N/A',
                cacheHitRate: (this.metrics.cacheHits + this.metrics.cacheMisses) > 0 ? 
                    (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(1) + '%' : 'N/A',
                memoryUsageMB: Math.round(this.metrics.currentMemoryUsage / 1024 / 1024),
                peakMemoryUsageMB: Math.round(this.metrics.peakMemoryUsage / 1024 / 1024),
                averageResponseTimeMs: Math.round(this.metrics.averageResponseTime),
                toolSuccessRate: this.metrics.toolsExecuted > 0 ? 
                    (this.metrics.toolsSuccessful / this.metrics.toolsExecuted * 100).toFixed(1) + '%' : 'N/A'
            }
        };
    }

    /**
     * Reset all metrics
     */
    resetMetrics() {
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            minResponseTime: Infinity,
            maxResponseTime: 0,
            sessionsCreated: 0,
            sessionsCompleted: 0,
            sessionsFailed: 0,
            averageSessionDuration: 0,
            toolsExecuted: 0,
            toolsSuccessful: 0,
            toolsFailed: 0,
            averageToolExecutionTime: 0,
            peakMemoryUsage: 0,
            currentMemoryUsage: 0,
            memoryLeakDetected: false,
            cacheHits: 0,
            cacheMisses: 0,
            cacheSize: 0,
            uiUpdatesQueued: 0,
            uiUpdatesBatched: 0,
            averageUIUpdateTime: 0
        };
        
        this.recommendations.clear();
        this.performanceHistory = [];
        this.startTime = Date.now();
        
        console.log('Performance metrics reset');
    }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = {
    PerformanceMonitor,
    performanceMonitor
};