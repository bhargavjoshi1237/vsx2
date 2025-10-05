// Mock vscode module for testing
const path = require('path');

const mockVscode = {
  workspace: {
    workspaceFolders: [
      {
        uri: {
          fsPath: process.cwd()
        }
      }
    ],
    asRelativePath: (uri) => {
      if (typeof uri === 'string') {
        return path.relative(process.cwd(), uri);
      }
      return path.relative(process.cwd(), uri.fsPath || uri);
    },
    findFiles: async (pattern, exclude) => {
      // Mock implementation - return empty array for testing
      return [];
    },
    fs: {
      readFile: async (uri) => {
        // Mock implementation
        const fs = require('fs');
        const filePath = uri.fsPath || uri;
        return fs.readFileSync(filePath);
      }
    }
  },
  Uri: {
    file: (filePath) => ({
      fsPath: filePath
    })
  }
};

module.exports = mockVscode;