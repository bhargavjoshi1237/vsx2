# Legacy Mode Troubleshooting Guide

## Common Issues and Solutions

This guide covers the most common issues you might encounter when using Legacy Mode and provides step-by-step solutions.

## JSON Parsing Issues

### Issue: "JSON parsing failed" Error

**Symptoms:**
- Error message: "JSON parsing and recovery both failed"
- Malformed response displayed in chat
- Execution stops unexpectedly

**Causes:**
- LLM response is not valid JSON
- Response contains syntax errors
- Response is truncated or incomplete

**Solutions:**

1. **Check LLM Model Configuration**
   ```
   - Ensure you're using a model that supports structured JSON output
   - Try switching to a different model if available
   - Check model temperature settings (lower values produce more consistent output)
   ```

2. **Verify Prompt Context**
   ```
   - Ensure the task description is clear and specific
   - Avoid overly complex or ambiguous requests
   - Break down large tasks into smaller, more manageable parts
   ```

3. **Manual Recovery**
   ```
   - Copy the malformed response from the error message
   - Manually fix the JSON syntax errors
   - Restart the Legacy Mode session with a clearer task description
   ```

**Prevention:**
- Use specific, well-defined task descriptions
- Avoid tasks that are too broad or complex
- Test with simpler tasks first to verify system functionality

### Issue: "Missing required fields" Warning

**Symptoms:**
- Warning messages about missing JSON fields
- Execution continues but with placeholder values
- Unexpected behavior in tool execution

**Causes:**
- LLM response missing required schema fields
- Incomplete JSON structure
- Model not following the expected format

**Solutions:**

1. **Review Task Complexity**
   ```
   - Simplify the task description
   - Break complex tasks into smaller steps
   - Provide more specific requirements
   ```

2. **Check Model Performance**
   ```
   - Try a different LLM model
   - Adjust model parameters if available
   - Verify model supports the required JSON schema
   ```

3. **Manual Intervention**
   ```
   - Note which fields are missing from the logs
   - Restart with a more specific task that addresses those areas
   - Use the examples in the documentation as templates
   ```

## File System Issues

### Issue: "File not found" Error

**Symptoms:**
- Error: "File not found: [filepath]"
- Tool execution fails
- Cannot read or modify files

**Causes:**
- Incorrect file path
- File doesn't exist in workspace
- Path traversal outside workspace

**Solutions:**

1. **Verify File Paths**
   ```bash
   # Check if file exists in workspace
   ls -la src/components/
   
   # Verify relative path from workspace root
   find . -name "component.js" -type f
   ```

2. **Check Workspace Configuration**
   ```
   - Ensure VSCode has a workspace folder open
   - Verify workspace permissions
   - Check if files are in the correct directory structure
   ```

3. **Create Missing Files**
   ```
   - Use Legacy Mode to create the missing file first
   - Ensure directory structure exists
   - Check file naming conventions
   ```

**Prevention:**
- Always use relative paths from workspace root
- Verify file structure before starting complex tasks
- Use file search tools to confirm file locations

### Issue: "Permission denied" Error

**Symptoms:**
- Error: "Permission denied reading/writing file"
- EACCES error codes
- Cannot modify certain files

**Causes:**
- Insufficient file permissions
- File locked by another process
- Security restrictions in Legacy Mode settings

**Solutions:**

1. **Check File Permissions**
   ```bash
   # Check file permissions
   ls -la path/to/file.js
   
   # Fix permissions if needed (Unix/Mac)
   chmod 644 path/to/file.js
   
   # For Windows, check file properties and security settings
   ```

2. **Close File Locks**
   ```
   - Close the file in VSCode editor if open
   - Check if file is open in other applications
   - Restart VSCode if necessary
   ```

3. **Review Security Settings**
   ```
   - Check Legacy Mode security configuration
   - Verify blocked paths settings
   - Ensure workspace path restrictions are appropriate
   ```

### Issue: "Path traversal denied" Error

**Symptoms:**
- Error: "File access outside workspace is not allowed"
- Cannot access files with absolute paths
- Security restriction messages

**Causes:**
- Attempting to access files outside workspace
- Using absolute paths instead of relative paths
- Security settings preventing access

**Solutions:**

1. **Use Relative Paths**
   ```javascript
   // Good - relative to workspace root
   "filePath": "src/components/Button.jsx"
   
   // Bad - absolute path
   "filePath": "/Users/username/project/src/components/Button.jsx"
   ```

2. **Verify Workspace Boundaries**
   ```
   - Ensure all files are within the workspace folder
   - Check workspace root directory
   - Move files into workspace if needed
   ```

3. **Adjust Security Settings**
   ```
   - Review Legacy Mode security configuration
   - Update workspace path restrictions if appropriate
   - Ensure security settings match your needs
   ```

## Tool Execution Issues

### Issue: "Command not found" Error

**Symptoms:**
- Error when executing terminal commands
- "command not found" or "not recognized" messages
- Tool execution fails

**Causes:**
- Command not installed on system
- Command not in system PATH
- Incorrect command syntax

**Solutions:**

1. **Verify Command Installation**
   ```bash
   # Check if command exists
   which npm
   which node
   which git
   
   # For Windows
   where npm
   where node
   ```

2. **Install Missing Commands**
   ```bash
   # Install Node.js and npm
   # Visit nodejs.org for installation instructions
   
   # Install specific tools
   npm install -g create-react-app
   npm install -g typescript
   ```

3. **Use Full Paths**
   ```json
   {
     "tool": "executeCommand",
     "params": {
       "command": "/usr/local/bin/npm test"
     }
   }
   ```

4. **Check PATH Environment**
   ```bash
   # View current PATH
   echo $PATH
   
   # Add to PATH if needed (Unix/Mac)
   export PATH=$PATH:/usr/local/bin
   ```

### Issue: "Tool execution timeout" Error

**Symptoms:**
- Commands hang or take too long
- Timeout error messages
- Execution stops without completion

**Causes:**
- Command takes longer than timeout limit
- Command waiting for user input
- Infinite loops or hanging processes

**Solutions:**

1. **Increase Timeout Settings**
   ```
   - Check Legacy Mode configuration for timeout settings
   - Increase timeout for long-running operations
   - Consider breaking down long tasks
   ```

2. **Use Non-Interactive Commands**
   ```bash
   # Good - non-interactive
   npm test --silent
   
   # Bad - may prompt for input
   npm init
   ```

3. **Background Processes**
   ```bash
   # For long-running processes, use background execution
   npm start &
   
   # Or use specific flags to prevent hanging
   npm test --watchAll=false
   ```

### Issue: "VSCode API not available" Error

**Symptoms:**
- Error: "VSCode API not available"
- Tools fail to execute
- Cannot access workspace features

**Causes:**
- Extension not properly loaded
- Running outside VSCode environment
- VSCode API initialization issues

**Solutions:**

1. **Restart VSCode**
   ```
   - Close VSCode completely
   - Reopen workspace
   - Wait for extension to fully load
   ```

2. **Check Extension Status**
   ```
   - Open VSCode Extensions panel
   - Verify Legacy Mode extension is enabled
   - Check for extension errors or warnings
   ```

3. **Reload Extension**
   ```
   - Use Command Palette (Ctrl/Cmd + Shift + P)
   - Run "Developer: Reload Window"
   - Or "Extensions: Reload Extension"
   ```

## Session Management Issues

### Issue: "Session timeout" Error

**Symptoms:**
- Session expires during execution
- Lost context between operations
- Need to restart from beginning

**Causes:**
- Session exceeded timeout limit
- Long periods of inactivity
- System resource constraints

**Solutions:**

1. **Adjust Timeout Settings**
   ```
   - Increase session timeout in Legacy Mode settings
   - Configure appropriate timeout for your tasks
   - Consider task complexity when setting timeouts
   ```

2. **Break Down Tasks**
   ```
   - Split large tasks into smaller sessions
   - Complete one major component at a time
   - Save progress frequently
   ```

3. **Monitor Session Activity**
   ```
   - Keep track of session duration
   - Provide input or feedback to keep session active
   - Use shorter, more focused task descriptions
   ```

### Issue: "Context loss" Error

**Symptoms:**
- System forgets previous actions
- Repeats completed tasks
- Inconsistent behavior

**Causes:**
- Session data corruption
- Memory management issues
- Context size limitations

**Solutions:**

1. **Restart Session**
   ```
   - Start a new Legacy Mode session
   - Provide clear context about what's already completed
   - Use specific task descriptions
   ```

2. **Reduce Context Size**
   ```
   - Focus on smaller, specific tasks
   - Avoid overly complex execution histories
   - Clear completed sessions regularly
   ```

3. **Manual Context Provision**
   ```
   - Explicitly state what has been completed
   - Provide file listings or current state
   - Use specific references to existing code
   ```

## Performance Issues

### Issue: Slow Execution

**Symptoms:**
- Long delays between operations
- Slow tool execution
- Unresponsive interface

**Causes:**
- Large file operations
- Complex search operations
- System resource constraints

**Solutions:**

1. **Optimize File Operations**
   ```
   - Avoid reading very large files
   - Use specific file patterns for searches
   - Limit search results with maxResults parameter
   ```

2. **System Resources**
   ```
   - Close unnecessary applications
   - Ensure sufficient disk space
   - Monitor CPU and memory usage
   ```

3. **Task Optimization**
   ```
   - Break down large tasks
   - Use more specific tool parameters
   - Avoid broad search patterns
   ```

### Issue: Memory Usage

**Symptoms:**
- High memory consumption
- System slowdown
- Out of memory errors

**Causes:**
- Large context accumulation
- Memory leaks in long sessions
- Processing large files

**Solutions:**

1. **Session Management**
   ```
   - Restart sessions periodically
   - Clear completed sessions
   - Use shorter task descriptions
   ```

2. **File Size Limits**
   ```
   - Avoid processing very large files
   - Use file streaming for large operations
   - Check file size limits in settings
   ```

3. **Resource Monitoring**
   ```
   - Monitor system memory usage
   - Close other memory-intensive applications
   - Restart VSCode if memory usage is high
   ```

## Network and API Issues

### Issue: "LLM API failure" Error

**Symptoms:**
- No response from LLM
- API timeout errors
- Network connection issues

**Causes:**
- Network connectivity problems
- API service unavailable
- Rate limiting or quota exceeded

**Solutions:**

1. **Check Network Connection**
   ```bash
   # Test internet connectivity
   ping google.com
   
   # Check DNS resolution
   nslookup api.openai.com
   ```

2. **Verify API Configuration**
   ```
   - Check API keys and credentials
   - Verify API endpoint configuration
   - Ensure API service is available
   ```

3. **Handle Rate Limits**
   ```
   - Wait before retrying requests
   - Check API usage quotas
   - Consider using different API tiers
   ```

### Issue: "Rate limit exceeded" Error

**Symptoms:**
- API requests rejected
- Rate limit error messages
- Temporary service unavailability

**Causes:**
- Too many requests in short time
- API quota exceeded
- Service rate limiting

**Solutions:**

1. **Implement Delays**
   ```
   - Wait between requests
   - Use exponential backoff
   - Reduce request frequency
   ```

2. **Optimize Requests**
   ```
   - Combine multiple operations
   - Use more efficient prompts
   - Reduce unnecessary API calls
   ```

3. **Upgrade Service**
   ```
   - Consider higher API tier
   - Check quota limits
   - Monitor usage patterns
   ```

## Debugging Tips

### Enable Debug Logging

1. **Check Console Output**
   ```
   - Open VSCode Developer Tools (Help > Toggle Developer Tools)
   - Check Console tab for error messages
   - Look for Legacy Mode specific logs
   ```

2. **Review Extension Logs**
   ```
   - Open Output panel in VSCode
   - Select "Legacy Mode" from dropdown
   - Review detailed execution logs
   ```

### Collect Diagnostic Information

1. **System Information**
   ```
   - VSCode version
   - Extension version
   - Operating system
   - Node.js version
   ```

2. **Error Context**
   ```
   - Exact error message
   - Steps to reproduce
   - Task description used
   - JSON response (if available)
   ```

3. **Environment Details**
   ```
   - Workspace structure
   - File permissions
   - Network configuration
   - Security settings
   ```

### Test with Simple Cases

1. **Basic File Operations**
   ```
   Task: "Create a simple hello.txt file with 'Hello World' content"
   ```

2. **Simple Component Creation**
   ```
   Task: "Create a basic React button component"
   ```

3. **Basic Terminal Commands**
   ```
   Task: "Run 'npm --version' to check npm installation"
   ```

## Getting Additional Help

### Documentation Resources
- [Legacy Mode User Guide](./legacy-mode-guide.md)
- [Examples and JSON Formats](./legacy-mode-examples.md)
- Extension README and documentation

### Community Support
- VSCode Extension marketplace reviews
- GitHub issues (if available)
- Developer community forums

### Reporting Issues
When reporting issues, include:
1. Exact error message
2. Steps to reproduce
3. System information
4. Task description used
5. Expected vs actual behavior
6. Console logs and error details

### Best Practices for Prevention
1. Start with simple tasks to verify functionality
2. Use clear, specific task descriptions
3. Monitor system resources during execution
4. Keep VSCode and extensions updated
5. Regularly restart sessions for long tasks
6. Test in a clean workspace when troubleshooting