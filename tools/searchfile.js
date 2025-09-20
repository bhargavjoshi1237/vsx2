const fs = require('fs');
const path = require('path');
let vscode = null;
try {
  vscode = require('vscode');
} catch {
  vscode = null;
}

async function searchfile({ q = '', pattern = '', excludePattern = '**/node_modules/**' } = {}) {
  const query = q || pattern || '';

  // Use vscode if available
  if (vscode && vscode.workspace && typeof vscode.workspace.findFiles === 'function') {
    try {
      const pat = (query && !/[\*\?\[\]]/.test(query)) ? `**/*${query}*` : (query || '**/*');
      const uris = await vscode.workspace.findFiles(pat, excludePattern);
      const files = uris.map(u => ({ path: u.fsPath, relativePath: vscode.workspace.asRelativePath(u) }));
      return { tool: 'searchfile', success: true, files };
    } catch {
      return { tool: 'searchfile', success: false, error: 'vscode search failed' };
    }
  }

  // Fallback: naive FS walk from process.cwd()
  const root = process.cwd();
  function walk(dir) {
    let res = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === 'node_modules') continue;
          res = res.concat(walk(full));
        } else if (ent.isFile()) {
          if (!query || full.includes(query) || ent.name.includes(query)) res.push({ path: full, relativePath: path.relative(root, full) });
        }
      }
    } catch {
      // ignore read errors
    }
    return res;
  }

  const files = walk(root);
  return { tool: 'searchfile', success: true, files };
}

module.exports = searchfile;
