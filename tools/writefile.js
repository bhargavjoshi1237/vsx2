const path = require('path');
const fs = require('fs');

async function writefile({ 
  filePath, 
  path: p, 
  content, 
  newContent, 
  proposed, 
  lines,
  operations = [],
  createDirectories = true,
  atomic = true,
  encoding = 'utf8'
} = {}) {
  
  // Handle single file operation (backward compatibility)
  if (filePath || p) {
    const fp = filePath || p || null;
    let body = '';
    if (typeof content === 'string') body = content;
    else if (typeof newContent === 'string') body = newContent;
    else if (typeof proposed === 'string') body = proposed;
    else if (Array.isArray(lines)) body = lines.join('\n');

    if (!fp) return { tool: 'writefile', success: false, error: 'no filePath provided' };

    // Return a proposal object; actual write action is handled by the host UI
    return { tool: 'writefile', success: true, filePath: fp, proposed: body };
  }

  // Handle multiple file operations
  if (!Array.isArray(operations) || operations.length === 0) {
    return {
      tool: 'writefile',
      success: false,
      error: 'no operations provided',
      results: []
    };
  }

  const results = [];
  const processedFiles = new Set();

  // Validate all operations first
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    if (!op.filePath && !op.path) {
      results.push({
        index: i,
        filePath: null,
        success: false,
        error: 'no filePath provided in operation',
        operation: op
      });
      continue;
    }

    const fp = op.filePath || op.path;
    let body = '';
    
    if (typeof op.content === 'string') body = op.content;
    else if (typeof op.newContent === 'string') body = op.newContent;
    else if (typeof op.proposed === 'string') body = op.proposed;
    else if (Array.isArray(op.lines)) body = op.lines.join('\n');
    else if (typeof op.body === 'string') body = op.body;

    // Check for duplicate file paths in the same batch
    if (processedFiles.has(fp)) {
      results.push({
        index: i,
        filePath: fp,
        success: false,
        error: 'duplicate filePath in batch operation',
        operation: op
      });
      continue;
    }
    processedFiles.add(fp);

    // Prepare directory creation if needed
    if (createDirectories) {
      const dir = path.dirname(fp);
      try {
        if (!fs.existsSync(dir)) {
          // Note: In the actual implementation, directory creation would be handled by the host UI
          // This is just validation that the directory path is valid
          path.resolve(dir);
        }
      } catch (dirError) {
        results.push({
          index: i,
          filePath: fp,
          success: false,
          error: `invalid directory path: ${dirError.message}`,
          operation: op
        });
        continue;
      }
    }

    // Validate file path
    try {
      path.resolve(fp);
    } catch (pathError) {
      results.push({
        index: i,
        filePath: fp,
        success: false,
        error: `invalid file path: ${pathError.message}`,
        operation: op
      });
      continue;
    }

    // Add successful operation to results
    results.push({
      index: i,
      filePath: fp,
      success: true,
      proposed: body,
      operation: {
        filePath: fp,
        content: body,
        encoding: op.encoding || encoding,
        createDirectories: createDirectories
      }
    });
  }

  // Count successful and failed operations
  const successfulOps = results.filter(r => r.success).length;
  const failedOps = results.filter(r => !r.success).length;

  // If atomic is true and any operation failed, mark all as failed
  if (atomic && failedOps > 0) {
    for (const result of results) {
      if (result.success) {
        result.success = false;
        result.error = 'atomic operation failed due to other operation failures';
      }
    }
    
    return {
      tool: 'writefile',
      success: false,
      error: `atomic operation failed: ${failedOps} operations had errors`,
      results,
      summary: {
        totalOperations: operations.length,
        successfulOperations: 0,
        failedOperations: operations.length,
        atomic: true
      }
    };
  }

  return {
    tool: 'writefile',
    success: failedOps === 0,
    results,
    summary: {
      totalOperations: operations.length,
      successfulOperations: successfulOps,
      failedOperations: failedOps,
      atomic: atomic
    }
  };
}

module.exports = writefile;
