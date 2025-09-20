# Legacy Mode User Guide

## Overview

Legacy Mode is an autonomous execution feature that enables the VSCode extension to handle large and complex functionality implementations through an intelligent loop of planning, execution, and verification. This mode breaks down complex tasks into manageable TODOs, maintains context across multiple LLM calls, and uses structured JSON communication to coordinate between the LLM, parser, and execution tools.

## Key Features

- **Autonomous Task Execution**: Breaks down complex tasks into smaller, manageable TODOs
- **Context Management**: Maintains state across multiple LLM interactions
- **Comprehensive Tooling**: Supports file operations, terminal commands, and VSCode integrations
- **Structured Communication**: Uses JSON-based communication for reliable parsing
- **Progress Tracking**: Visual progress indicators and status updates
- **Error Recovery**: Graceful error handling with recovery suggestions

## Getting Started

### Activating Legacy Mode

1. Open the VSCode extension
2. Select "Legacy Mode" from the available modes
3. Provide your task description in natural language
4. The system will analyze your task and create an execution plan

### Example Usage

```
Task: "Create a new React component for user authentication with login and signup forms"

The system will:
1. Analyze the task and break it into TODOs
2. Create necessary files and directories
3. Implement the component logic
4. Add styling and validation
5. Create tests for the component
6. Verify completion at each step
```

## How Legacy Mode Works

### Phase 1: Planning
- Analyzes your task description
- Breaks down the work into specific TODOs
- Each TODO includes description and expected result
- Displays the plan for your review

### Phase 2: Execution
- Executes each TODO sequentially
- Uses appropriate tools (file operations, terminal commands)
- Maintains context between steps
- Shows real-time progress updates

### Phase 3: Verification
- Verifies completion of each TODO
- May request user confirmation for critical steps
- Handles feedback and adjustments
- Ensures quality before proceeding

### Phase 4: Completion
- Confirms all TODOs are complete
- Provides execution summary
- Offers next steps or improvements

## User Interface

### Session Display
The Legacy Mode interface shows:
- Session ID and start time
- Current execution phase
- Progress bar with completion percentage
- Original task description

### TODO List
Each TODO displays:
- Status indicator (pending/in progress/done/failed)
- Task description
- Expected result
- Timestamps for creation and completion

### Tool Calls
Tool executions show:
- Tool name and icon
- Input parameters
- Output results
- Success/failure status

### Terminal Commands
Command executions display:
- Command being executed
- Full output or error messages
- Execution time and status

## Best Practices

### Writing Effective Task Descriptions

**Good Examples:**
- "Create a REST API endpoint for user registration with email validation"
- "Implement a shopping cart component with add/remove functionality and persistence"
- "Set up automated testing for the authentication module"

**Avoid:**
- Vague descriptions: "Make the app better"
- Multiple unrelated tasks: "Fix bugs and add new features and update documentation"
- Tasks requiring external resources: "Deploy to production server"

### Task Complexity Guidelines

**Ideal for Legacy Mode:**
- Feature implementations (components, APIs, modules)
- Code refactoring and optimization
- Test creation and automation
- Documentation generation
- Configuration setup

**Not Suitable:**
- Tasks requiring external services or APIs
- User interface design decisions
- Business logic that needs domain expertise
- Tasks requiring real-time user input

## Troubleshooting

### Common Issues

#### "Task too complex" Error
**Cause:** The task description is too broad or contains multiple unrelated subtasks.
**Solution:** Break down your task into smaller, more specific requests.

#### "File permission denied" Error
**Cause:** The system cannot access or modify certain files.
**Solution:** Check file permissions and ensure the workspace is properly configured.

#### "Command execution failed" Error
**Cause:** A terminal command failed to execute properly.
**Solution:** Review the command output, check dependencies, and ensure the environment is set up correctly.

#### Session Timeout
**Cause:** The execution took longer than the configured timeout period.
**Solution:** Break the task into smaller parts or increase the timeout in settings.

### Getting Help

If you encounter issues:
1. Check the execution log for detailed error messages
2. Review the troubleshooting section above
3. Try breaking down complex tasks into smaller parts
4. Ensure your development environment is properly configured

## Advanced Features

### Custom Tool Configuration
You can configure which tools Legacy Mode can use through the extension settings:
- File system access restrictions
- Terminal command whitelist
- Timeout settings
- Auto-approval preferences

### Session Management
- Sessions are automatically cleaned up after completion
- You can view session history and logs
- Multiple sessions can run concurrently (if configured)

### Integration with VSCode
Legacy Mode integrates seamlessly with VSCode features:
- File explorer updates
- Terminal integration
- Problem panel updates
- Extension API access

## Security Considerations

Legacy Mode includes several security measures:
- **Sandboxed Execution**: File operations are restricted to the workspace
- **Command Validation**: Terminal commands are validated before execution
- **Permission Checks**: File permissions are verified before modifications
- **User Confirmation**: Critical operations may require user approval

## Performance Tips

- Keep task descriptions focused and specific
- Ensure your workspace has sufficient disk space
- Close unnecessary files and applications during execution
- Monitor system resources during long-running tasks

## Feedback and Support

Legacy Mode is designed to learn and improve from usage. The system logs execution patterns and success rates to enhance future performance. Your feedback helps improve the autonomous execution capabilities.