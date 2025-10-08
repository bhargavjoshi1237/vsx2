# Technology Stack & Build System

## Core Technologies

- **Runtime**: Node.js with VS Code Extension API
- **Frontend**: HTML/CSS/JavaScript with Tailwind CSS for styling
- **UI Framework**: Webview-based interface with custom components
- **AI Integration**: Multiple providers (Gemini, NVIDIA, Cerebras) via REST APIs

## Key Dependencies

- **VS Code Extension API**: `vscode` package for extension lifecycle and UI
- **HTTP Client**: `node-fetch` for AI provider API calls
- **UI Components**: Tailwind CSS, Lucide React icons
- **Build Tools**: ESLint for linting, PostCSS for CSS processing

## Project Structure

- **Extension Entry**: `extension.js` - main extension activation
- **Modes**: `modes/` - different AI interaction patterns (ask, legacy, duality)
- **UI**: `ui/` - webview provider and client-side components
- **Tools**: `tools/` - file operations and terminal command utilities
- **Routing**: `route/` - AI provider routing and response parsing

## Common Commands

```bash
# Linting
npm run lint

# Testing (includes linting)
npm run pretest
npm test

# Development
# No build step required - extension runs directly from source
```

## Configuration

Extension settings are managed through VS Code's configuration system:
- API keys stored in workspace configuration
- Mode preferences and autopilot settings
- Provider-specific options (e.g., Cerebras reasoning effort)

## Architecture Patterns

- **Provider Pattern**: Abstracted AI provider interfaces
- **Mode Pattern**: Pluggable interaction modes
- **Tool Pattern**: Reusable file and terminal operations
- **Session Management**: State tracking for complex multi-step operations