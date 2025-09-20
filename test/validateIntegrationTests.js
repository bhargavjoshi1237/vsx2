#!/usr/bin/env node

/**
 * Validation script for Legacy Mode Integration Tests
 * Checks test structure and dependencies without running Jest
 */

const fs = require('fs');
const path = require('path');

function validateFile(filePath, description) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`✓ ${description}: ${filePath} (${stats.size} bytes)`);
      return true;
    } else {
      console.log(`✗ ${description}: ${filePath} - NOT FOUND`);
      return false;
    }
  } catch (error) {
    console.log(`✗ ${description}: ${filePath} - ERROR: ${error.message}`);
    return false;
  }
}

function validateTestStructure() {
  console.log('Validating Legacy Mode Integration Test Structure...\n');

  const requiredFiles = [
    { path: 'test/legacyModeIntegration.test.js', desc: 'Main integration test suite' },
    { path: 'test/runLegacyModeIntegrationTests.js', desc: 'Test runner script' },
    { path: 'test/jest.integration.config.js', desc: 'Jest configuration' },
    { path: 'test/integrationSetup.js', desc: 'Test setup utilities' },
    { path: 'test/globalIntegrationSetup.js', desc: 'Global setup' },
    { path: 'test/globalIntegrationTeardown.js', desc: 'Global teardown' },
    { path: 'test/INTEGRATION_TESTS.md', desc: 'Integration test documentation' }
  ];

  let allValid = true;

  console.log('Required Test Files:');
  for (const file of requiredFiles) {
    if (!validateFile(file.path, file.desc)) {
      allValid = false;
    }
  }

  console.log('\nDependency Files:');
  const dependencyFiles = [
    { path: 'legacy/contextManager.js', desc: 'Context Manager' },
    { path: 'legacy/todoManager.js', desc: 'TODO Manager' },
    { path: 'legacy/toolExecutor.js', desc: 'Tool Executor' },
    { path: 'legacy/verificationSystem.js', desc: 'Verification System' },
    { path: 'route/legacyParser.js', desc: 'Legacy Parser' },
    { path: 'route/route.js', desc: 'Router' },
    { path: 'modes/legacy.js', desc: 'Legacy Mode' }
  ];

  for (const file of dependencyFiles) {
    if (!validateFile(file.path, file.desc)) {
      allValid = false;
    }
  }

  return allValid;
}

function validateTestContent() {
  console.log('\nValidating Test Content...');

  try {
    const testContent = fs.readFileSync('test/legacyModeIntegration.test.js', 'utf8');
    
    const requiredSections = [
      'End-to-End Legacy Mode Execution Cycles',
      'WebView Integration with Mock User Interactions',
      'LLM Integration with Mock Responses',
      'Error Scenario Tests for Graceful Degradation and Recovery',
      'Performance and Stress Tests'
    ];

    let sectionsFound = 0;
    for (const section of requiredSections) {
      if (testContent.includes(section)) {
        console.log(`✓ Found test suite: ${section}`);
        sectionsFound++;
      } else {
        console.log(`✗ Missing test suite: ${section}`);
      }
    }

    console.log(`\nTest Suites: ${sectionsFound}/${requiredSections.length} found`);
    return sectionsFound === requiredSections.length;
  } catch (error) {
    console.log(`✗ Error reading test file: ${error.message}`);
    return false;
  }
}

function validatePackageJson() {
  console.log('\nValidating package.json scripts...');

  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    const requiredScripts = [
      'test:integration',
      'test:integration:check',
      'test:integration:e2e',
      'test:integration:webview',
      'test:integration:llm',
      'test:integration:error',
      'test:integration:performance',
      'test:integration:report'
    ];

    let scriptsFound = 0;
    for (const script of requiredScripts) {
      if (packageJson.scripts && packageJson.scripts[script]) {
        console.log(`✓ Found script: ${script}`);
        scriptsFound++;
      } else {
        console.log(`✗ Missing script: ${script}`);
      }
    }

    console.log(`\nScripts: ${scriptsFound}/${requiredScripts.length} found`);
    return scriptsFound === requiredScripts.length;
  } catch (error) {
    console.log(`✗ Error reading package.json: ${error.message}`);
    return false;
  }
}

function main() {
  console.log('Legacy Mode Integration Test Validation\n');
  console.log('=' .repeat(50));

  const structureValid = validateTestStructure();
  const contentValid = validateTestContent();
  const packageValid = validatePackageJson();

  console.log('\n' + '=' .repeat(50));
  console.log('Validation Summary:');
  console.log(`File Structure: ${structureValid ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Test Content: ${contentValid ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Package Scripts: ${packageValid ? '✓ PASS' : '✗ FAIL'}`);

  const overallValid = structureValid && contentValid && packageValid;
  console.log(`Overall: ${overallValid ? '✓ PASS' : '✗ FAIL'}`);

  if (overallValid) {
    console.log('\n🎉 Integration tests are properly configured!');
    console.log('You can now run: npm run test:integration');
  } else {
    console.log('\n❌ Some issues found. Please fix them before running tests.');
  }

  process.exit(overallValid ? 0 : 1);
}

main();