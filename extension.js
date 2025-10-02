const vscode = require('vscode');
const MyWebviewProvider = require('./ui/webviewProvider');

function activate(context) {
    console.log('VSX extension is now active!');
    
    // Create webview provider
    const webviewProvider = new MyWebviewProvider(context);
    
    // Register webview provider with enhanced persistence
    const disposable = vscode.window.registerWebviewViewProvider(
        'myView',
        webviewProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true,
                enableFindWidget: true
            }
        }
    );
    
    context.subscriptions.push(disposable);
    
    // Register commands
    const helloWorldCommand = vscode.commands.registerCommand('vsx.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from VSX!');
    });
    
    const newChatCommand = vscode.commands.registerCommand('vsx.newChat', () => {
        // Trigger new chat in webview
        if (webviewProvider && webviewProvider.webviewView && webviewProvider.webviewView.webview) {
            webviewProvider.webviewView.webview.postMessage({ command: 'newChat' });
        }
    });
    
    context.subscriptions.push(helloWorldCommand);
    context.subscriptions.push(newChatCommand);
    
    console.log('VSX extension activated successfully');
}

function deactivate() {
    console.log('VSX extension deactivated');
}

module.exports = {
    activate,
    deactivate
};