const fs = require('fs');
const path = require('path');
let vscode = null;
try {
  vscode = require('vscode');
} catch {
  vscode = null;
}

async function fileread({ path: singlePath, paths, files, encoding = 'utf8', maxFileSize = 10 * 1024 * 1024 } = {}) {
  // normalize input: accept `path`, `paths`, or `files` array
  const requested = [];
  if (singlePath) requested.push(singlePath);
  if (paths && Array.isArray(paths)) requested.push(...paths);
  if (files && Array.isArray(files)) {
    for (const f of files) {
      if (typeof f === 'string') requested.push(f);
      else if (f && f.path) requested.push(f.path);
    }
  }

  // dedupe
  const uniq = Array.from(new Set(requested));

  // helper to read one file, returning object with path and content
  async function readOne(fp, fileEncoding = encoding) {
    const startTime = Date.now();
    try {
      // Check file size first to avoid reading very large files
      let stats = null;
      try {
        const abs = path.isAbsolute(fp) ? fp : path.join(process.cwd(), fp);
        stats = fs.statSync(abs);
        if (stats.size > maxFileSize) {
          return {
            path: fp,
            relativePath: path.relative(process.cwd(), abs),
            content: null,
            success: false,
            error: `File too large: ${stats.size} bytes (max: ${maxFileSize})`,
            metadata: {
              size: stats.size,
              modified: stats.mtime,
              encoding: fileEncoding,
              readTime: Date.now() - startTime
            }
          };
        }
      } catch {
        // Continue with read attempt even if stat fails
      }

      // If vscode API available, prefer it so we can read from workspace URIs
      if (vscode && vscode.workspace && typeof vscode.workspace.fs.readFile === 'function') {
        try {
          const uri = vscode.Uri.file(fp);
          const bytes = await vscode.workspace.fs.readFile(uri);
          const content = Buffer.from(bytes).toString(fileEncoding);
          return {
            path: fp,
            relativePath: vscode.workspace.asRelativePath(uri),
            content,
            success: true,
            metadata: {
              size: bytes.length,
              modified: stats ? stats.mtime : null,
              encoding: fileEncoding,
              readTime: Date.now() - startTime
            }
          };
        } catch {
          // fallthrough to node fs
        }
      }

      // Fallback to node fs
      const abs = path.isAbsolute(fp) ? fp : path.join(process.cwd(), fp);
      const content = fs.readFileSync(abs, fileEncoding);
      return {
        path: abs,
        relativePath: path.relative(process.cwd(), abs),
        content,
        success: true,
        metadata: {
          size: stats ? stats.size : Buffer.byteLength(content, fileEncoding),
          modified: stats ? stats.mtime : null,
          encoding: fileEncoding,
          readTime: Date.now() - startTime
        }
      };
    } catch (err) {
      const relativePath = (vscode && vscode.workspace && typeof vscode.workspace.asRelativePath === 'function') 
        ? (() => { try { return vscode.workspace.asRelativePath(fp); } catch { return fp; } })() 
        : fp;
      
      return {
        path: fp,
        relativePath,
        content: null,
        success: false,
        error: String(err),
        metadata: {
          size: null,
          modified: null,
          encoding: fileEncoding,
          readTime: Date.now() - startTime
        }
      };
    }
  }

  // If no files requested, return error
  if (!uniq.length) {
    return {
      tool: 'fileread',
      success: false,
      error: 'no path(s) provided',
      files: [],
      summary: {
        totalFiles: 0,
        successfulReads: 0,
        failedReads: 0,
        totalSize: 0
      }
    };
  }

  const results = [];
  let successfulReads = 0;
  let failedReads = 0;
  let totalSize = 0;

  // Process files in batches to avoid overwhelming the system
  const batchSize = 10;
  for (let i = 0; i < uniq.length; i += batchSize) {
    const batch = uniq.slice(i, i + batchSize);
    const batchPromises = batch.map(async (p) => {
      // Support different encodings per file if specified as object
      let fileEncoding = encoding;
      let filePath = p;
      
      if (typeof p === 'object' && p.path) {
        filePath = p.path;
        fileEncoding = p.encoding || encoding;
      }
      
      return await readOne(filePath, fileEncoding);
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Update counters
    for (const result of batchResults) {
      if (result.success) {
        successfulReads++;
        totalSize += result.metadata.size || 0;
      } else {
        failedReads++;
      }
    }
  }

  return {
    tool: 'fileread',
    success: failedReads === 0, // Only successful if all files were read
    files: results,
    summary: {
      totalFiles: uniq.length,
      successfulReads,
      failedReads,
      totalSize,
      encoding
    }
  };
}

module.exports = fileread;
