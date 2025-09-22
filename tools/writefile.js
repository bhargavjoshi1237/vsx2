const path = require('path');

async function writefile({ filePath, path: p, content, newContent, proposed, lines } = {}) {
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

module.exports = writefile;
