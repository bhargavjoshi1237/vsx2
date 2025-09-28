const child_process = require('child_process');

async function terminalCommand({ command, cmd, args, timeout = 30000, cwd } = {}) {
  const cli = command || cmd || null;
  if (!cli || typeof cli !== 'string' || !cli.trim()) {
    return { tool: 'terminal_command', success: false, error: 'no command provided' };
  }

  // Limit execution: timeout and buffer
  const options = { timeout: Number(timeout) || 30000, maxBuffer: 1024 * 500 };
  if (cwd && typeof cwd === 'string') options.cwd = cwd;

  return new Promise((resolve) => {
    try {
      child_process.exec(cli, options, (err, stdout, stderr) => {
        try {
          const out = (stdout || '').toString();
          const errOut = (stderr || '').toString();
          if (err) {
            // include exit code if available
            const code = err && typeof err.code !== 'undefined' ? err.code : null;
            resolve({ tool: 'terminal_command', success: false, error: String(err.message || err), code, stdout: out, stderr: errOut });
          } else {
            resolve({ tool: 'terminal_command', success: true, stdout: out, stderr: errOut, code: 0 });
          }
        } catch (e) {
          resolve({ tool: 'terminal_command', success: false, error: String(e) });
        }
      });
    } catch (e) {
      resolve({ tool: 'terminal_command', success: false, error: String(e) });
    }
  });
}

module.exports = terminalCommand;
