const fs = require('fs');
const path = require('path');
let vscode = null;
try {
  vscode = require('vscode');
} catch {
  vscode = null;
}

async function fileread({ path: singlePath, paths, files } = {}) {
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
  async function readOne(fp) {
    try {
      // If vscode API available, prefer it so we can read from workspace URIs
      if (vscode && vscode.workspace && typeof vscode.workspace.fs.readFile === 'function') {
        try {
          const uri = vscode.Uri.file(fp);
          const bytes = await vscode.workspace.fs.readFile(uri);
          const content = Buffer.from(bytes).toString('utf8');
          return { path: fp, relativePath: vscode.workspace.asRelativePath(uri), content, success: true };
        } catch {
          // fallthrough to node fs
        }
      }

      // Fallback to node fs
      const abs = path.isAbsolute(fp) ? fp : path.join(process.cwd(), fp);
      const content = fs.readFileSync(abs, 'utf8');
      return { path: abs, relativePath: path.relative(process.cwd(), abs), content, success: true };
    } catch (err) {
      return { path: fp, relativePath: (vscode && vscode.workspace && typeof vscode.workspace.asRelativePath === 'function') ? (() => { try { return vscode.workspace.asRelativePath(fp); } catch { return fp; } })() : fp, content: null, success: false, error: String(err) };
    }
  }

  // If no files requested, return error
  if (!uniq.length) return { tool: 'fileread', success: false, error: 'no path(s) provided', files: [] };

  const results = [];
  for (const p of uniq) {
    // small safety: avoid reading very large binary by size check when possible
    const res = await readOne(p);
    results.push(res);
  }

  return { tool: 'fileread', success: true, files: results };
}

module.exports = fileread;
