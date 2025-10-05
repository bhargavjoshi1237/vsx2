// Tests for enhanced multi-file tool capabilities
// Tests searchfile, fileread, and writefile tools with multiple file operations

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('Starting Multi-File Tools Tests...\n');

// Load the tools
let searchfile, fileread, writefile;
try {
  searchfile = require('../tools/searchfile.js');
  fileread = require('../tools/fileread.js');
  writefile = require('../tools/writefile.js');
} catch (err) {
  console.error('Failed to load tools:', err);
  process.exit(1);
}

// Create temporary test directory and files
const testDir = path.join(os.tmpdir(), 'vsx-multi-file-test-' + Date.now());
const testFiles = {
  'test1.js': 'console.log("test1");',
  'test2.js': 'console.log("test2");',
  'subdir/test3.js': 'console.log("test3");',
  'subdir/test4.txt': 'This is a text file',
  'package.json': '{"name": "test-package", "version": "1.0.0"}'
};

function setupTestFiles() {
  try {
    // Create test directory
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, 'subdir'), { recursive: true });
    
    // Create test files
    for (const [filePath, content] of Object.entries(testFiles)) {
      const fullPath = path.join(testDir, filePath);
      fs.writeFileSync(fullPath, content, 'utf8');
    }
    
    console.log(`Created test directory: ${testDir}`);
    return true;
  } catch (err) {
    console.error('Failed to setup test files:', err);
    return false;
  }
}

function cleanupTestFiles() {
  try {
    // Remove test directory and all files
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log(`Cleaned up test directory: ${testDir}`);
  } catch (err) {
    console.warn('Failed to cleanup test files:', err);
  }
}

// Test functions
async function testSearchfileMultiplePatterns() {
  console.log('=== Testing Searchfile with Multiple Patterns ===');
  
  try {
    // Change to test directory for relative path testing
    const originalCwd = process.cwd();
    process.chdir(testDir);
    
    // Test multiple search patterns
    const result = await searchfile({
      patterns: ['test1', 'test2', 'package'],
      directories: [testDir]
    });
    
    process.chdir(originalCwd);
    
    assert(result.success === true, 'Search should succeed');
    assert(Array.isArray(result.files), 'Should return files array');
    assert(result.files.length >= 3, 'Should find at least 3 files');
    assert(Array.isArray(result.searchPatterns), 'Should return search patterns');
    assert(result.searchPatterns.length === 3, 'Should have 3 search patterns');
    
    // Verify specific files were found
    const filePaths = result.files.map(f => f.path);
    const hasTest1 = filePaths.some(p => p.includes('test1.js'));
    const hasTest2 = filePaths.some(p => p.includes('test2.js'));
    const hasPackage = filePaths.some(p => p.includes('package.json'));
    
    assert(hasTest1, 'Should find test1.js');
    assert(hasTest2, 'Should find test2.js');
    assert(hasPackage, 'Should find package.json');
    
    console.log('✓ Multiple patterns search test passed');
    return true;
  } catch (err) {
    console.error('✗ Multiple patterns search test failed:', err.message);
    return false;
  }
}

async function testSearchfileMultipleDirectories() {
  console.log('\n=== Testing Searchfile with Multiple Directories ===');
  
  try {
    // Test searching in multiple directories
    const result = await searchfile({
      q: 'test',
      directories: [testDir, path.join(testDir, 'subdir')]
    });
    
    assert(result.success === true, 'Search should succeed');
    assert(Array.isArray(result.files), 'Should return files array');
    assert(result.files.length >= 2, 'Should find files in both directories');
    
    // Verify files from both directories were found
    const filePaths = result.files.map(f => f.path);
    const hasMainDir = filePaths.some(p => p.includes('test1.js') || p.includes('test2.js'));
    const hasSubDir = filePaths.some(p => p.includes('test3.js'));
    
    assert(hasMainDir, 'Should find files in main directory');
    assert(hasSubDir, 'Should find files in subdirectory');
    
    console.log('✓ Multiple directories search test passed');
    return true;
  } catch (err) {
    console.error('✗ Multiple directories search test failed:', err.message);
    return false;
  }
}

async function testFilereadMultipleFiles() {
  console.log('\n=== Testing Fileread with Multiple Files ===');
  
  try {
    // Test reading multiple files
    const filePaths = [
      path.join(testDir, 'test1.js'),
      path.join(testDir, 'test2.js'),
      path.join(testDir, 'package.json')
    ];
    
    const result = await fileread({
      paths: filePaths
    });
    
    assert(result.success === true, 'File read should succeed');
    assert(Array.isArray(result.files), 'Should return files array');
    assert(result.files.length === 3, 'Should read 3 files');
    assert(result.summary.totalFiles === 3, 'Summary should show 3 total files');
    assert(result.summary.successfulReads === 3, 'Summary should show 3 successful reads');
    assert(result.summary.failedReads === 0, 'Summary should show 0 failed reads');
    
    // Verify file contents
    const test1File = result.files.find(f => f.path.includes('test1.js'));
    const test2File = result.files.find(f => f.path.includes('test2.js'));
    const packageFile = result.files.find(f => f.path.includes('package.json'));
    
    assert(test1File && test1File.success, 'test1.js should be read successfully');
    assert(test1File.content === 'console.log("test1");', 'test1.js content should match');
    assert(test2File && test2File.success, 'test2.js should be read successfully');
    assert(test2File.content === 'console.log("test2");', 'test2.js content should match');
    assert(packageFile && packageFile.success, 'package.json should be read successfully');
    
    console.log('✓ Multiple files read test passed');
    return true;
  } catch (err) {
    console.error('✗ Multiple files read test failed:', err.message);
    return false;
  }
}

async function testFilereadErrorHandling() {
  console.log('\n=== Testing Fileread Error Handling ===');
  
  try {
    // Test reading mix of existing and non-existing files
    const filePaths = [
      path.join(testDir, 'test1.js'), // exists
      path.join(testDir, 'nonexistent.js'), // doesn't exist
      path.join(testDir, 'test2.js') // exists
    ];
    
    const result = await fileread({
      paths: filePaths
    });
    
    assert(result.success === false, 'Should fail when some files cannot be read');
    assert(Array.isArray(result.files), 'Should return files array');
    assert(result.files.length === 3, 'Should attempt to read 3 files');
    assert(result.summary.totalFiles === 3, 'Summary should show 3 total files');
    assert(result.summary.successfulReads === 2, 'Summary should show 2 successful reads');
    assert(result.summary.failedReads === 1, 'Summary should show 1 failed read');
    
    // Verify individual file results
    const successfulFiles = result.files.filter(f => f.success);
    const failedFiles = result.files.filter(f => !f.success);
    
    assert(successfulFiles.length === 2, 'Should have 2 successful files');
    assert(failedFiles.length === 1, 'Should have 1 failed file');
    assert(failedFiles[0].error, 'Failed file should have error message');
    
    console.log('✓ Error handling test passed');
    return true;
  } catch (err) {
    console.error('✗ Error handling test failed:', err.message);
    return false;
  }
}

async function testWritefileMultipleOperations() {
  console.log('\n=== Testing Writefile with Multiple Operations ===');
  
  try {
    // Test multiple file write operations
    const operations = [
      {
        filePath: path.join(testDir, 'new1.js'),
        content: 'console.log("new file 1");'
      },
      {
        filePath: path.join(testDir, 'new2.js'),
        content: 'console.log("new file 2");'
      },
      {
        filePath: path.join(testDir, 'subdir/new3.js'),
        content: 'console.log("new file 3");'
      }
    ];
    
    const result = await writefile({
      operations: operations,
      createDirectories: true,
      atomic: false
    });
    
    assert(result.success === true, 'Write operations should succeed');
    assert(Array.isArray(result.results), 'Should return results array');
    assert(result.results.length === 3, 'Should have 3 operation results');
    assert(result.summary.totalOperations === 3, 'Summary should show 3 total operations');
    assert(result.summary.successfulOperations === 3, 'Summary should show 3 successful operations');
    assert(result.summary.failedOperations === 0, 'Summary should show 0 failed operations');
    
    // Verify individual operation results
    for (let i = 0; i < result.results.length; i++) {
      const opResult = result.results[i];
      assert(opResult.success === true, `Operation ${i} should succeed`);
      assert(opResult.filePath, `Operation ${i} should have filePath`);
      assert(opResult.proposed, `Operation ${i} should have proposed content`);
      assert(opResult.index === i, `Operation ${i} should have correct index`);
    }
    
    console.log('✓ Multiple operations write test passed');
    return true;
  } catch (err) {
    console.error('✗ Multiple operations write test failed:', err.message);
    return false;
  }
}

async function testWritefileAtomicOperations() {
  console.log('\n=== Testing Writefile Atomic Operations ===');
  
  try {
    // Test atomic operations with one invalid operation
    const operations = [
      {
        filePath: path.join(testDir, 'atomic1.js'),
        content: 'console.log("atomic file 1");'
      },
      {
        filePath: '', // Invalid path
        content: 'console.log("invalid");'
      },
      {
        filePath: path.join(testDir, 'atomic3.js'),
        content: 'console.log("atomic file 3");'
      }
    ];
    
    const result = await writefile({
      operations: operations,
      atomic: true
    });
    
    assert(result.success === false, 'Atomic operation should fail when any operation fails');
    assert(Array.isArray(result.results), 'Should return results array');
    assert(result.results.length === 3, 'Should have 3 operation results');
    assert(result.summary.totalOperations === 3, 'Summary should show 3 total operations');
    assert(result.summary.successfulOperations === 0, 'Summary should show 0 successful operations (atomic)');
    assert(result.summary.failedOperations === 3, 'Summary should show 3 failed operations (atomic)');
    
    // Verify that all operations are marked as failed due to atomic constraint
    const failedOps = result.results.filter(r => !r.success);
    assert(failedOps.length === 3, 'All operations should be marked as failed in atomic mode');
    
    console.log('✓ Atomic operations test passed');
    return true;
  } catch (err) {
    console.error('✗ Atomic operations test failed:', err.message);
    return false;
  }
}

async function testBackwardCompatibility() {
  console.log('\n=== Testing Backward Compatibility ===');
  
  try {
    // Test single file operations (backward compatibility)
    
    // Test searchfile with single pattern
    const searchResult = await searchfile({ q: 'test1' });
    assert(searchResult.success === true, 'Single pattern search should work');
    assert(Array.isArray(searchResult.files), 'Should return files array');
    
    // Test fileread with single file
    const readResult = await fileread({ 
      path: path.join(testDir, 'test1.js') 
    });
    assert(readResult.success === true, 'Single file read should work');
    assert(readResult.files.length === 1, 'Should read 1 file');
    assert(readResult.files[0].success === true, 'File should be read successfully');
    
    // Test writefile with single file
    const writeResult = await writefile({
      filePath: path.join(testDir, 'backward-compat.js'),
      content: 'console.log("backward compatibility");'
    });
    assert(writeResult.success === true, 'Single file write should work');
    assert(writeResult.filePath, 'Should have filePath');
    assert(writeResult.proposed, 'Should have proposed content');
    
    console.log('✓ Backward compatibility test passed');
    return true;
  } catch (err) {
    console.error('✗ Backward compatibility test failed:', err.message);
    return false;
  }
}

async function testLegacyModeIntegration() {
  console.log('\n=== Testing Legacy Mode Integration ===');
  
  try {
    // Test that enhanced tools work with legacy mode patterns
    // This simulates how legacy mode would call the tools
    
    // Test searchfile call from legacy mode
    const searchArgs = { q: 'test', pattern: '*.js' };
    const searchResult = await searchfile(searchArgs);
    assert(searchResult.success === true, 'Legacy searchfile call should work');
    
    // Test fileread call from legacy mode
    const readArgs = { path: path.join(testDir, 'test1.js') };
    const readResult = await fileread(readArgs);
    assert(readResult.success === true, 'Legacy fileread call should work');
    
    // Test writefile call from legacy mode
    const writeArgs = { 
      filePath: path.join(testDir, 'legacy-test.js'),
      newContent: 'console.log("legacy test");'
    };
    const writeResult = await writefile(writeArgs);
    assert(writeResult.success === true, 'Legacy writefile call should work');
    
    console.log('✓ Legacy mode integration test passed');
    return true;
  } catch (err) {
    console.error('✗ Legacy mode integration test failed:', err.message);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  // Setup test environment
  if (!setupTestFiles()) {
    console.error('Failed to setup test files');
    return false;
  }
  
  const testFunctions = [
    testSearchfileMultiplePatterns,
    testSearchfileMultipleDirectories,
    testFilereadMultipleFiles,
    testFilereadErrorHandling,
    testWritefileMultipleOperations,
    testWritefileAtomicOperations,
    testBackwardCompatibility,
    testLegacyModeIntegration
  ];
  
  let passedTests = 0;
  let totalTests = testFunctions.length;
  
  for (const testFn of testFunctions) {
    try {
      const passed = await testFn();
      if (passed) {
        passedTests++;
      }
    } catch (err) {
      console.error(`Test ${testFn.name} threw unexpected error:`, err);
    }
  }
  
  // Cleanup test environment
  cleanupTestFiles();
  
  console.log(`\n=== Test Results ===`);
  console.log(`Passed: ${passedTests}/${totalTests} tests`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All Multi-File Tools tests passed!');
    return true;
  } else {
    console.log('\n❌ Some tests failed. Please review the implementation.');
    return false;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

// Export for use in test runners
module.exports = {
  runAllTests,
  testDir,
  setupTestFiles,
  cleanupTestFiles
};