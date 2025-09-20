# Legacy Mode Documentation

Welcome to the Legacy Mode documentation. Legacy Mode is an autonomous execution feature that enables the VSCode extension to handle large and complex functionality implementations through an intelligent loop of planning, execution, and verification.

## Documentation Overview

This documentation is organized into several key sections to help you understand, use, and troubleshoot Legacy Mode effectively.

### 📚 Core Documentation

#### [User Guide](./legacy-mode-guide.md)
Complete guide for end users covering:
- Getting started with Legacy Mode
- How the autonomous execution works
- User interface overview
- Best practices for writing effective tasks
- Security considerations and performance tips

#### [Examples and JSON Formats](./legacy-mode-examples.md)
Comprehensive examples including:
- Real-world task examples (React components, APIs, tests)
- Complete JSON response formats for each execution phase
- Tool usage examples and patterns
- Common task patterns and workflows

#### [Troubleshooting Guide](./legacy-mode-troubleshooting.md)
Solutions for common issues:
- JSON parsing problems
- File system and permission errors
- Tool execution failures
- Session management issues
- Performance and network problems
- Debugging tips and diagnostic information

#### [API Reference](./legacy-mode-api-reference.md)
Technical documentation for developers:
- Complete API documentation for all classes and methods
- Error handling and custom error types
- JSON schema specifications
- Configuration options
- Event system documentation
- Usage examples for each component

## Quick Start

### For Users
1. Read the [User Guide](./legacy-mode-guide.md) to understand how Legacy Mode works
2. Check out [Examples](./legacy-mode-examples.md) for task inspiration
3. If you encounter issues, consult the [Troubleshooting Guide](./legacy-mode-troubleshooting.md)

### For Developers
1. Start with the [API Reference](./legacy-mode-api-reference.md) for technical details
2. Review [Examples](./legacy-mode-examples.md) for implementation patterns
3. Use the [Troubleshooting Guide](./legacy-mode-troubleshooting.md) for debugging

## Key Features

### 🤖 Autonomous Execution
- Breaks down complex tasks into manageable TODOs
- Maintains context across multiple LLM interactions
- Executes tasks with minimal user intervention

### 🛠️ Comprehensive Tooling
- File operations (read, write, create, delete)
- Search capabilities (files and content)
- Terminal command execution
- VSCode integration features

### 📊 Progress Tracking
- Real-time TODO status updates
- Visual progress indicators
- Detailed execution logs
- Completion statistics

### 🔒 Security & Safety
- Workspace-restricted file access
- Command validation and whitelisting
- User confirmation for critical operations
- Configurable security settings

### 🎯 Structured Communication
- JSON-based LLM communication
- Graceful error recovery
- Consistent response parsing
- Comprehensive error handling

## Architecture Overview

Legacy Mode consists of several key components working together:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Input    │───▶│   Legacy Mode    │───▶│  LLM Interface  │
└─────────────────┘    │   Orchestrator   │    └─────────────────┘
                       └──────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ JSON Parser &   │◀───│  Context Manager │───▶│  TODO Manager   │
│   Validator     │    │   & Sessions     │    │   & Tracking    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Verification    │◀───│  Tool Executor   │───▶│  VSCode API     │
│    System       │    │   Framework      │    │  Integration    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Core Components

- **Legacy Mode Orchestrator**: Main execution controller
- **JSON Parser & Validator**: Handles LLM response parsing with error recovery
- **TODO Manager**: Manages task breakdown and progress tracking
- **Tool Executor**: Provides comprehensive development tooling
- **Context Manager**: Maintains state across stateless API calls
- **Verification System**: Handles completion verification and user feedback

## Common Use Cases

### 🏗️ Component Development
- Create React/Vue/Angular components
- Implement component logic and styling
- Generate unit tests
- Set up component documentation

### 🌐 API Development
- Build REST API endpoints
- Implement data models and validation
- Create database integration
- Add comprehensive error handling

### 🧪 Testing & Quality
- Generate unit and integration tests
- Set up test infrastructure
- Implement code coverage
- Create testing utilities

### 🔧 Code Refactoring
- Modernize legacy code
- Improve code structure
- Add TypeScript types
- Optimize performance

### 📝 Documentation
- Generate API documentation
- Create user guides
- Add code comments
- Build example projects

## Best Practices

### ✅ Effective Task Descriptions
- Be specific and clear about requirements
- Break complex tasks into focused requests
- Provide context about existing code
- Specify expected outcomes

### ✅ Security Considerations
- Review file operations before approval
- Understand workspace restrictions
- Monitor terminal command execution
- Use appropriate security settings

### ✅ Performance Optimization
- Keep tasks reasonably scoped
- Monitor system resources
- Use specific file patterns for searches
- Restart sessions for long-running tasks

### ✅ Error Recovery
- Understand common error patterns
- Use troubleshooting guide for solutions
- Provide clear feedback for failures
- Test with simple cases first

## Getting Help

### 📖 Documentation
- Start with the appropriate guide based on your role
- Use the search function to find specific topics
- Check examples for similar use cases

### 🐛 Troubleshooting
- Consult the troubleshooting guide for common issues
- Check console logs for detailed error information
- Test with simpler tasks to isolate problems

### 💬 Community Support
- Check extension marketplace for updates
- Review GitHub issues for known problems
- Participate in developer community discussions

### 📊 Reporting Issues
When reporting problems, include:
- Exact error messages
- Steps to reproduce the issue
- System and environment information
- Task description and expected behavior
- Console logs and diagnostic data

## Version Information

This documentation covers Legacy Mode version 1.0.0 and is compatible with:
- VSCode 1.60.0 and later
- Node.js 14.0.0 and later
- Modern LLM APIs with JSON support

## Contributing

Legacy Mode is designed to be extensible and maintainable. Developers can:
- Add new tools to the Tool Executor
- Extend the JSON schema for new features
- Implement custom verification rules
- Create specialized task patterns

For technical details on extending Legacy Mode, see the [API Reference](./legacy-mode-api-reference.md).

---

**Next Steps:**
- New users: Start with the [User Guide](./legacy-mode-guide.md)
- Developers: Review the [API Reference](./legacy-mode-api-reference.md)
- Having issues: Check the [Troubleshooting Guide](./legacy-mode-troubleshooting.md)
- Need examples: Browse the [Examples](./legacy-mode-examples.md)