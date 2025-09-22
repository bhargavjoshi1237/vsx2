const vscode = require("vscode");
const MyWebviewProvider = require('./ui/webviewProvider');

function activate(context) {
  console.log('Congratulations, your extension "vsx" is now active!');
  const provider = new MyWebviewProvider(context);
  vscode.window.registerWebviewViewProvider(
    "myView",
    provider
  );
  const setupApiCommand = vscode.commands.registerCommand('vsx.setupApiKeys', async () => {
    try {
      if (provider && typeof provider.openApiKeySetup === 'function') {
        await provider.openApiKeySetup();
      } else {
        vscode.window.showErrorMessage('API key setup not available');
      }
    } catch (e) {
      console.error('Error running setupApiKeys command', e);
      vscode.window.showErrorMessage('Error opening API key setup: ' + String(e));
    }
  });
  context.subscriptions.push(setupApiCommand);
  // Command to apply a write-file proposal via the webview provider
  const applyWriteFileCmd = vscode.commands.registerCommand('vsx.applyWriteFile', async (filePath, newContent, requestId) => {
    try {
      if (provider && typeof provider.handleWriteFileTool === 'function') {
        return await provider.handleWriteFileTool(filePath, newContent, requestId);
      }
      throw new Error('Write-file handler not available');
    } catch (err) {
      vscode.window.showErrorMessage('Error applying write file: ' + String(err));
      throw err;
    }
  });
  context.subscriptions.push(applyWriteFileCmd);
  // Commands to accept or reject pending write proposals created by webviewProvider
  const keepCmd = vscode.commands.registerCommand('vsx.keepChange', async (id) => {
    try {
      if (provider && typeof provider.handleKeepById === 'function') return await provider.handleKeepById(id);
      return false;
    } catch (e) {
      console.error('keepChange command failed', e);
      return false;
    }
  });
  const undoCmd = vscode.commands.registerCommand('vsx.undoChange', async (id) => {
    try {
      if (provider && typeof provider.handleUndoById === 'function') return await provider.handleUndoById(id);
      return false;
    } catch (e) {
      console.error('undoChange command failed', e);
      return false;
    }
  });
  context.subscriptions.push(keepCmd);
  context.subscriptions.push(undoCmd);
  const disposable = vscode.commands.registerCommand(
    "vsx.helloWorld",
    function () {
      vscode.window.showInformationMessage("Hello World from vsx!");
    }
  );

  context.subscriptions.push(disposable);
}
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
