const fs = require('fs');
const path = require('path');
let vscode = null;
try {
  vscode = require('vscode');
} catch {
  vscode = null;
}

async function searchfile({ q = '', pattern = '', patterns = [], directories = [], excludePattern = '**/node_modules/**' } = {}) {
  // Support both single and multiple search patterns
  const searchPatterns = [];
  if (q) searchPatterns.push(q);
  if (pattern) searchPatterns.push(pattern);
  if (patterns && Array.isArray(patterns)) searchPatterns.push(...patterns);
  
  // If no patterns provided, default to all files
  if (searchPatterns.length === 0) searchPatterns.push('');
  
  // Support multiple directories or default to current workspace
  const searchDirectories = directories && Array.isArray(directories) && directories.length > 0 
    ? directories 
    : [process.cwd()];

  const allResults = [];
  const processedPaths = new Set(); // Avoid duplicates

  // Use vscode if available
  if (vscode && vscode.workspace && typeof vscode.workspace.findFiles === 'function') {
    try {
      for (const searchPattern of searchPatterns) {
        const pat = (searchPattern && !/[\*\?\[\]]/.test(searchPattern)) 
          ? `**/*${searchPattern}*` 
          : (searchPattern || '**/*');
        
        const uris = await vscode.workspace.findFiles(pat, excludePattern);
        
        for (const uri of uris) {
          const filePath = uri.fsPath;
          if (!processedPaths.has(filePath)) {
            processedPaths.add(filePath);
            allResults.push({
              path: filePath,
              relativePath: vscode.workspace.asRelativePath(uri),
              matchedPattern: searchPattern || 'all',
              directory: path.dirname(filePath)
            });
          }
        }
      }
      
      return { 
        tool: 'searchfile', 
        success: true, 
        files: allResults,
        searchPatterns,
        searchDirectories: ['workspace']
      };
    } catch (error) {
      return { 
        tool: 'searchfile', 
        success: false, 
        error: `vscode search failed: ${error.message}`,
        searchPatterns,
        searchDirectories
      };
    }
  }

  // Fallback: naive FS walk from specified directories
  function walk(dir, currentPattern) {
    let res = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === 'node_modules') continue;
          res = res.concat(walk(full, currentPattern));
        } else if (ent.isFile()) {
          const shouldInclude = !currentPattern || 
            full.includes(currentPattern) || 
            ent.name.includes(currentPattern);
          
          if (shouldInclude && !processedPaths.has(full)) {
            processedPaths.add(full);
            res.push({
              path: full,
              relativePath: path.relative(process.cwd(), full),
              matchedPattern: currentPattern || 'all',
              directory: path.dirname(full)
            });
          }
        }
      }
    } catch {
      // ignore read errors
    }
    return res;
  }

  // Search across all directories and patterns
  for (const directory of searchDirectories) {
    for (const searchPattern of searchPatterns) {
      const results = walk(directory, searchPattern);
      allResults.push(...results);
    }
  }

  return { 
    tool: 'searchfile', 
    success: true, 
    files: allResults,
    searchPatterns,
    searchDirectories
  };
}

module.exports = searchfile;
