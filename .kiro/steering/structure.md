# Project Organization & Folder Structure

## Root Level Files

- `extension.js` - Main extension entry point and activation logic
- `package.json` - Extension manifest with commands, configuration, and dependencies
- `jsconfig.json` - JavaScript project configuration
- `eslint.config.mjs` - Linting rules and configuration

## Core Directories

### `/modes/`
AI interaction mode implementations:
- `index.js` - Mode registry and loader
- `ask.js` - Simple Q&A mode
- `legacy.js` - Traditional AI assistance with tools
- `duality.js` - Dual-model task breakdown system

### `/ui/`
Webview interface components:
- `webviewProvider.js` - Main webview provider and message handling
- `webview-client.js` - Client-side JavaScript for the webview
- `webview-styles.css` - Custom styles for the interface
- `/components/` - HTML templates for UI elements
- `/handlers/`, `/managers/`, `/providers/`, `/utils/` - Supporting modules

### `/tools/`
Utility functions for AI operations:
- `fileread.js` - File reading operations with batch support
- `writefile.js` - File writing and modification
- `searchfile.js` - File search functionality
- `terminal_command.js` - Terminal command execution

### `/route/`
AI provider routing and communication (referenced but not visible in current structure)

### `/test/`
Test suites:
- Unit tests for individual modes
- Integration tests for multi-component workflows
- End-to-end tests for complete user scenarios
- `/mocks/` - Test fixtures and mock data

### `/scripts/`
Development and testing utilities:
- `require_check.js` - Dependency validation
- `test_*.js` - Individual test runners

## File Naming Conventions

- **Kebab-case** for directories and most files
- **camelCase** for JavaScript modules and functions
- **PascalCase** for class names and constructors
- **UPPERCASE** for constants and environment variables

## Module Organization

- Each mode is self-contained with its own execution logic
- Tools are stateless utility functions
- UI components are modular HTML templates
- Configuration is centralized in package.json and VS Code settings

## Import/Export Patterns

- Use CommonJS (`require`/`module.exports`) for Node.js compatibility
- Prefer explicit exports over default exports
- Group related functionality in index files for clean imports