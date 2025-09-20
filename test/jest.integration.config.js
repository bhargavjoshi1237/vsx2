/**
 * Jest configuration for Legacy Mode Integration Tests
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/test/legacyModeIntegration.test.js',
    '**/test/*Integration*.test.js'
  ],
  
  // Setup and teardown
  setupFilesAfterEnv: ['<rootDir>/test/integrationSetup.js'],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'html', 'lcov'],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Files to collect coverage from
  collectCoverageFrom: [
    'legacy/**/*.js',
    'route/legacyParser.js',
    'route/route.js',
    'modes/legacy.js',
    '!**/*.test.js',
    '!**/node_modules/**'
  ],
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Handle async operations
  detectOpenHandles: true,
  forceExit: true,
  
  // Module paths
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Transform configuration (if needed for ES modules)
  transform: {},
  
  // Global setup and teardown
  globalSetup: '<rootDir>/test/globalIntegrationSetup.js',
  globalTeardown: '<rootDir>/test/globalIntegrationTeardown.js',
  
  // Reporter configuration
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './coverage/integration',
      filename: 'integration-report.html',
      expand: true
    }]
  ],
  
  // Error handling
  errorOnDeprecated: true,
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Maximum worker processes
  maxWorkers: '50%'
};