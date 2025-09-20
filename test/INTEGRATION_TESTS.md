# Legacy Mode Integration Tests

This document describes the comprehensive integration tests for the Legacy Mode autonomous execution feature.

## Overview

The integration tests verify the complete end-to-end functionality of Legacy Mode, including:

- **End-to-End Execution Cycles**: Complete planning-execution-verification workflows
- **WebView Integration**: Mock user interactions and session management
- **LLM Integration**: Mock LLM responses and communication patterns
- **Error Scenarios**: Graceful degradation and recovery mechanisms
- **Performance Tests**: Stress testing and resource management

## Test Structure

### Test Files

- `test/legacyModeIntegration.test.js` - Main integration test suite
- `test/runLegacyModeIntegrationTests.js` - Test runner with CLI interface
- `test/jest.integration.config.js` - Jest configuration for integration tests
- `test/integrationSetup.js` - Test setup utilities and mocks
- `test/globalIntegrationSetup.js` - Global test environment setup
- `test/globalIntegrationTeardown.js` - Global test cleanup

### Test Suites

#### 1. End-to-End Legacy Mode Execution Cycles

Tests complete autonomous execution workflows:

- **Full Planning-Execution-Verification Cycle**: Tests the complete workflow from task breakdown to completion
- **Complex Multi-Phase Execution**: Tests handling of complex tasks with multiple tool calls
- **Iterative Refinement**: Tests TODO updates and refinement based on feedback

**Key Test Cases:**
- Configuration file creation with validation
- Node.js project setup with multiple steps
- Iterative improvement based on verification feedback

#### 2. WebView Integration with Mock User Interactions

Tests the integration between Legacy Mode and the VSCode WebView:

- **Session Management**: Creation, retrieval, and updates of Legacy Mode sessions
- **User Confirmation Workflows**: Mock user interactions for TODO verification
- **Message Passing**: Communication between WebView and Legacy Mode components

**Key Test Cases:**
- WebView session lifecycle management
- User confirmation with timeout handling
- Message system for real-time updates

#### 3. LLM Integration with Mock Responses

Tests communication with Language Learning Models:

- **Response Format Handling**: Various LLM response formats and structures
- **Malformed Response Recovery**: Graceful handling of invalid or incomplete responses
- **Router Integration**: Integration with the routing system for LLM communication

**Key Test Cases:**
- Valid JSON response parsing
- Malformed JSON recovery mechanisms
- Multi-step LLM conversation flows

#### 4. Error Scenario Tests for Graceful Degradation and Recovery

Tests error handling and recovery mechanisms:

- **Tool Execution Failures**: Handling of failed file operations and commands
- **Session Timeout and Cleanup**: Timeout handling and resource cleanup
- **Context Corruption Recovery**: Recovery from corrupted session data
- **Network Failures**: Retry logic and network error handling
- **Verification System Failures**: Fallback mechanisms for verification issues
- **Memory Pressure**: Resource management under stress
- **Concurrent Operations**: Thread safety and concurrent session handling
- **Parser Edge Cases**: Handling of malformed and edge-case data

**Key Test Cases:**
- Permission denied file operations with retry
- Session timeout with automatic cleanup
- Network failure with exponential backoff retry
- Memory pressure with automatic garbage collection

#### 5. Performance and Stress Tests

Tests system performance under various conditions:

- **Large TODO Lists**: Handling of extensive task lists efficiently
- **Rapid Context Building**: Performance of context generation
- **Memory Management**: Resource usage optimization
- **Concurrent Sessions**: Multiple simultaneous Legacy Mode sessions

**Key Test Cases:**
- 1000+ TODO processing performance
- Context building speed optimization
- Memory usage monitoring and cleanup

## Running the Tests

### Prerequisites

Ensure all required files are present:
```bash
npm run test:integration:check
```

### Run All Integration Tests

```bash
npm run test:integration
```

### Run Specific Test Suites

```bash
# End-to-end tests
npm run test:integration:e2e

# WebView integration tests
npm run test:integration:webview

# LLM integration tests
npm run test:integration:llm

# Error scenario tests
npm run test:integration:error

# Performance tests
npm run test:integration:performance
```

### Generate Test Report

```bash
npm run test:integration:report
```

This generates a comprehensive test report with coverage information in `coverage/integration/`.

## Test Configuration

### Jest Configuration

The integration tests use a custom Jest configuration (`test/jest.integration.config.js`) with:

- **Test Environment**: Node.js environment for backend testing
- **Coverage Thresholds**: 70% minimum coverage for branches, functions, lines, and statements
- **Timeout**: 30-second timeout for long-running integration tests
- **Setup/Teardown**: Comprehensive environment setup and cleanup

### Mock Configuration

The tests use extensive mocking for:

- **VSCode API**: Mock VSCode workspace, window, and command APIs
- **File System**: In-memory file system for testing file operations
- **Terminal**: Mock terminal for command execution testing
- **Network**: Mock HTTP clients for LLM communication testing

## Coverage Requirements

The integration tests maintain minimum coverage thresholds:

- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

Coverage is collected from:
- `legacy/**/*.js` - All Legacy Mode components
- `route/legacyParser.js` - JSON parser
- `route/route.js` - Router integration
- `modes/legacy.js` - Legacy Mode implementation

## Continuous Integration

The integration tests are designed to run in CI/CD environments:

- **Deterministic**: Tests use controlled mocks and timeouts
- **Isolated**: Each test cleans up after itself
- **Fast**: Optimized for quick execution while maintaining thoroughness
- **Reliable**: Robust error handling and retry mechanisms

## Troubleshooting

### Common Issues

1. **Test Timeouts**: Increase timeout in `jest.integration.config.js` if needed
2. **File System Errors**: Ensure test workspace directory is writable
3. **Memory Issues**: Run tests with `--detectOpenHandles` to identify leaks
4. **Coverage Issues**: Check that all required files are included in coverage collection

### Debug Mode

Run tests with verbose output:
```bash
npx jest test/legacyModeIntegration.test.js --verbose --detectOpenHandles
```

### Test Data Cleanup

If tests leave behind test data:
```bash
# Manual cleanup
rm -rf test-workspace coverage/integration
```

## Contributing

When adding new integration tests:

1. **Follow Naming Conventions**: Use descriptive test names that explain the scenario
2. **Use Test Utilities**: Leverage `testUtils` from `integrationSetup.js`
3. **Clean Up Resources**: Ensure tests clean up after themselves
4. **Mock External Dependencies**: Use mocks for VSCode API, file system, and network calls
5. **Test Error Scenarios**: Include both success and failure cases
6. **Document Complex Tests**: Add comments explaining complex test logic

## Requirements Coverage

The integration tests verify the following requirements from the specification:

- **Requirement 1.1**: Autonomous task breakdown and execution
- **Requirement 1.2**: Context maintenance across LLM calls
- **Requirement 1.3**: TODO lifecycle management
- **Requirement 1.4**: Session completion verification
- **Requirement 8.5**: File editing and modification capabilities

Each test case includes requirement references to ensure complete coverage of the specification.