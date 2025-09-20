import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'test/**/*.test.js',
  version: 'insiders',
  workspaceFolder: '.',
  mocha: {
    ui: 'bdd',
    timeout: 20000
  }
});