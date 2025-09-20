/**
 * Global teardown for Legacy Mode Integration Tests
 * Runs once after all tests
 */

const fs = require('fs').promises;
const path = require('path');

module.exports = async () => {
  console.log('Cleaning up Legacy Mode Integration Tests...');

  // Clean up test files and directories
  const cleanupPaths = [
    'test-workspace',
    'temp-test-files'
  ];

  for (const cleanupPath of cleanupPaths) {
    try {
      const stats = await fs.stat(cleanupPath);
      if (stats.isDirectory()) {
        await fs.rmdir(cleanupPath, { recursive: true });
      } else {
        await fs.unlink(cleanupPath);
      }
    } catch (error) {
      // Path might not exist or already cleaned up
      if (error.code !== 'ENOENT') {
        console.warn(`Warning: Could not clean up ${cleanupPath}:`, error.message);
      }
    }
  }

  // Clean up environment variables
  delete process.env.VSX_TEST_MODE;
  delete process.env.VSX_TEST_WORKSPACE;

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  console.log('Integration test cleanup completed');
};