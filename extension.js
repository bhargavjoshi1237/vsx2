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
