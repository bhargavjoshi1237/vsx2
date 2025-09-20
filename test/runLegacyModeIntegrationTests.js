#!/usr/bin/env node

/**
 * Test runner for Legacy Mode Integration Tests
 * Runs comprehensive integration tests for Legacy Mode autonomous execution
 */

const { spawn } = require('child_process');
const path = require('path');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logHeader(message) {
  log(`\n${colors.bright}${colors.blue}=== ${message} ===${colors.reset}`);
}

function logSuccess(message) {
  log(`${colors.green}✓ ${message}${colors.reset}`);
}

function logError(message) {
  log(`${colors.red}✗ ${message}${colors.reset}`);
}

function logWarning(message) {
  log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'pipe',
      shell: true,
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr
      });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function checkPrerequisites() {
  logHeader('Checking Prerequisites');

  // Check if Node.js is available
  try {
    const nodeResult = await runCommand('node', ['--version']);
    if (nodeResult.code === 0) {
      logSuccess(`Node.js version: ${nodeResult.stdout.trim()}`);
    } else {
      logError('Node.js not found');
      return false;
    }
  } catch (error) {
    logError(`Failed to check Node.js: ${error.message}`);
    return false;
  }

  // Check if required test files exist
  const requiredFiles = [
    'test/legacyModeIntegration.test.js',
    'legacy/contextManager.js',
    'legacy/todoManager.js',
    'legacy/toolExecutor.js',
    'legacy/verificationSystem.js',
    'route/legacyParser.js',
    'route/route.js'
  ];

  for (const file of requiredFiles) {
    try {
      const fs = require('fs');
      if (fs.existsSync(file)) {
        logSuccess(`Found: ${file}`);
      } else {
        logError(`Missing required file: ${file}`);
        return false;
      }
    } catch (error) {
      logError(`Error checking file ${file}: ${error.message}`);
      return false;
    }
  }

  return true;
}

async function runIntegrationTests() {
  logHeader('Running Legacy Mode Integration Tests');

  try {
    // Use Jest if available, otherwise use Node.js built-in test runner
    let testCommand, testArgs;

    try {
      const jestCheck = await runCommand('npx', ['jest', '--version']);
      if (jestCheck.code === 0) {
        log('Using Jest test runner');
        testCommand = 'npx';
        testArgs = [
          'jest',
          'test/legacyModeIntegration.test.js',
          '--verbose',
          '--detectOpenHandles',
          '--forceExit'
        ];
      } else {
        throw new Error('Jest not available');
      }
    } catch (error) {
      log('Jest not available, using Node.js test runner');
      testCommand = 'node';
      testArgs = ['test/legacyModeIntegration.test.js'];
    }

    const testResult = await runCommand(testCommand, testArgs);

    if (testResult.code === 0) {
      logSuccess('All integration tests passed!');
      log(testResult.stdout);
      return true;
    } else {
      logError('Some integration tests failed');
      log(testResult.stdout);
      if (testResult.stderr) {
        logError('Error output:');
        log(testResult.stderr);
      }
      return false;
    }
  } catch (error) {
    logError(`Failed to run integration tests: ${error.message}`);
    return false;
  }
}

async function runSpecificTestSuite(suiteName) {
  logHeader(`Running Specific Test Suite: ${suiteName}`);

  const testSuites = {
    'e2e': 'End-to-End Legacy Mode Execution Cycles',
    'webview': 'WebView Integration with Mock User Interactions',
    'llm': 'LLM Integration with Mock Responses',
    'error': 'Error Scenario Tests for Graceful Degradation and Recovery',
    'performance': 'Performance and Stress Tests'
  };

  if (!testSuites[suiteName]) {
    logError(`Unknown test suite: ${suiteName}`);
    log('Available test suites:');
    Object.keys(testSuites).forEach(suite => {
      log(`  - ${suite}: ${testSuites[suite]}`);
    });
    return false;
  }

  try {
    const testCommand = 'npx';
    const testArgs = [
      'jest',
      'test/legacyModeIntegration.test.js',
      '--testNamePattern',
      testSuites[suiteName],
      '--verbose'
    ];

    const testResult = await runCommand(testCommand, testArgs);

    if (testResult.code === 0) {
      logSuccess(`Test suite '${suiteName}' passed!`);
      return true;
    } else {
      logError(`Test suite '${suiteName}' failed`);
      log(testResult.stdout);
      return false;
    }
  } catch (error) {
    logError(`Failed to run test suite '${suiteName}': ${error.message}`);
    return false;
  }
}

async function generateTestReport() {
  logHeader('Generating Test Report');

  try {
    const testCommand = 'npx';
    const testArgs = [
      'jest',
      'test/legacyModeIntegration.test.js',
      '--coverage',
      '--coverageReporters=text',
      '--coverageReporters=html',
      '--coverageDirectory=coverage/integration'
    ];

    const testResult = await runCommand(testCommand, testArgs);

    if (testResult.code === 0) {
      logSuccess('Test report generated successfully');
      log('Coverage report available in: coverage/integration/');
      return true;
    } else {
      logWarning('Test report generation completed with warnings');
      log(testResult.stdout);
      return true;
    }
  } catch (error) {
    logError(`Failed to generate test report: ${error.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';

  log(`${colors.bright}${colors.magenta}Legacy Mode Integration Test Runner${colors.reset}`);
  log(`${colors.cyan}Testing comprehensive Legacy Mode autonomous execution${colors.reset}\n`);

  switch (command) {
    case 'check':
      const prereqsOk = await checkPrerequisites();
      process.exit(prereqsOk ? 0 : 1);
      break;

    case 'run':
      const prereqsCheck = await checkPrerequisites();
      if (!prereqsCheck) {
        logError('Prerequisites check failed');
        process.exit(1);
      }

      const testsPassed = await runIntegrationTests();
      process.exit(testsPassed ? 0 : 1);
      break;

    case 'suite':
      const suiteName = args[1];
      if (!suiteName) {
        logError('Please specify a test suite name');
        logError('Usage: node runLegacyModeIntegrationTests.js suite <suite-name>');
        process.exit(1);
      }

      const suiteCheck = await checkPrerequisites();
      if (!suiteCheck) {
        process.exit(1);
      }

      const suitePassed = await runSpecificTestSuite(suiteName);
      process.exit(suitePassed ? 0 : 1);
      break;

    case 'report':
      const reportCheck = await checkPrerequisites();
      if (!reportCheck) {
        process.exit(1);
      }

      const reportGenerated = await generateTestReport();
      process.exit(reportGenerated ? 0 : 1);
      break;

    case 'help':
      log('Usage: node runLegacyModeIntegrationTests.js <command>');
      log('\nCommands:');
      log('  check   - Check prerequisites and required files');
      log('  run     - Run all integration tests (default)');
      log('  suite   - Run specific test suite (e2e, webview, llm, error, performance)');
      log('  report  - Generate test coverage report');
      log('  help    - Show this help message');
      log('\nExamples:');
      log('  node runLegacyModeIntegrationTests.js');
      log('  node runLegacyModeIntegrationTests.js check');
      log('  node runLegacyModeIntegrationTests.js suite e2e');
      log('  node runLegacyModeIntegrationTests.js report');
      break;

    default:
      logError(`Unknown command: ${command}`);
      log('Use "help" command to see available options');
      process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logError(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(`Unhandled rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});

// Run the main function
main().catch(error => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});