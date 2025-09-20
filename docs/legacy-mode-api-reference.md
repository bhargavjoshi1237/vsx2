# Legacy Mode API Reference

## Overview

This document provides comprehensive API documentation for all Legacy Mode components, including classes, methods, and interfaces.

## Core Classes

### LegacyMode (`modes/legacy.js`)

Main orchestrator for autonomous execution.

#### Methods

##### `execute(params)`
Main execute function for Legacy Mode.

**Parameters:**
- `params.router` (Object) - Router instance for LLM communication
- `params.modelId` (string) - Model ID to use
- `params.prompt` (string) - User prompt/task
- `params.requestId` (string) - Request ID for tracking
- `params.context` (Object, optional) - Additional context

**Returns:** `Promise<Object>` - Execution result

**Example:**
```javascript
const result = await legacyMode.execute({
  router: routerInstance,
  modelId: 'gpt-4',
  prompt: 'Create a React component',
  requestId: 'req_123',
  context: { sessionId: 'session_456' }
});
```

##### `parseLegacyResponse(rawResponse)`
Parses and validates Legacy Mode JSON responses.

**Parameters:**
- `rawResponse` (string) - Raw response from LLM

**Returns:** `Object` - Parsed and validated response object

##### `validateJsonStructure(jsonObj)`
Validates a JSON response against the Legacy Mode schema.

**Parameters:**
- `jsonObj` (Object) - The parsed JSON object to validate

**Returns:** `Object` - Validation result with isValid flag and errors array

### TodoManager (`legacy/todoManager.js`)

Handles TODO lifecycle management with status tracking and CRUD operations.

#### Constructor
```javascript
const todoManager = new TodoManager();
```

#### Methods

##### `createTodo(description, expectedResult, customId?)`
Create a new TODO.

**Parameters:**
- `description` (string) - Task description
- `expectedResult` (string) - Expected outcome
- `customId` (string, optional) - Custom ID to use instead of generated one

**Returns:** `LegacyTodo` - The created TODO

**Throws:** `LegacyModeError` - If validation fails

**Example:**
```javascript
const todo = todoManager.createTodo(
  'Implement user authentication',
  'Login and signup forms with validation'
);
```

##### `getTodoById(todoId)`
Get a TODO by its ID.

**Parameters:**
- `todoId` (string) - The TODO ID

**Returns:** `LegacyTodo|null` - The TODO or null if not found

##### `getAllTodos()`
Get all TODOs.

**Returns:** `Array<LegacyTodo>` - Array of all TODOs

##### `getTodosByStatus(status)`
Get TODOs by status.

**Parameters:**
- `status` ('pending'|'in_progress'|'done'|'failed') - Status to filter by

**Returns:** `Array<LegacyTodo>` - Array of TODOs with the specified status

##### `updateTodoStatus(todoId, status)`
Update a TODO's status.

**Parameters:**
- `todoId` (string) - The TODO ID
- `status` ('pending'|'in_progress'|'done'|'failed') - New status

**Returns:** `boolean` - True if updated successfully, false if TODO not found

##### `markTodoComplete(todoId, result)`
Mark a TODO as complete.

**Parameters:**
- `todoId` (string) - The TODO ID
- `result` (string) - The actual result achieved

**Returns:** `boolean` - True if completed successfully, false if TODO not found

##### `getStats()`
Get completion statistics.

**Returns:** `Object` - Statistics about TODO completion
```javascript
{
  total: number,
  pending: number,
  in_progress: number,
  done: number,
  failed: number,
  completionRate: number
}
```

### LegacyTodo (`legacy/todoManager.js`)

Represents a single TODO item.

#### Constructor
```javascript
const todo = new LegacyTodo(description, expectedResult);
```

#### Properties
- `id` (string) - Unique identifier
- `description` (string) - Task description
- `expectedResult` (string) - Expected outcome
- `status` ('pending'|'in_progress'|'done'|'failed') - Current status
- `createdAt` (string) - ISO timestamp when created
- `completedAt` (string|null) - ISO timestamp when completed
- `result` (string|null) - Actual result when completed
- `toolCalls` (Array) - Array of tool calls made for this TODO

#### Methods

##### `updateStatus(newStatus)`
Update the status of this TODO.

**Parameters:**
- `newStatus` ('pending'|'in_progress'|'done'|'failed') - New status

##### `complete(result)`
Mark this TODO as complete with a result.

**Parameters:**
- `result` (string) - The actual result achieved

##### `fail(errorInfo)`
Mark this TODO as failed with optional error info.

**Parameters:**
- `errorInfo` (string) - Information about the failure

##### `addToolCall(toolCall)`
Add a tool call to this TODO's history.

**Parameters:**
- `toolCall` (Object) - Tool call information

### ToolExecutor (`legacy/toolExecutor.js`)

Provides comprehensive tooling support for autonomous execution.

#### Constructor
```javascript
const toolExecutor = new ToolExecutor(vscodeInstance);
```

#### Methods

##### `executeTool(toolName, params, context?)`
Execute a tool with given parameters.

**Parameters:**
- `toolName` (string) - Name of the tool to execute
- `params` (Object) - Parameters for the tool
- `context` (Object, optional) - Execution context

**Returns:** `Promise<Object>` - Tool execution result

**Example:**
```javascript
const result = await toolExecutor.executeTool('readFile', {
  filePath: 'src/component.js'
});
```

#### Supported Tools

##### File Operations

###### `readFile`
Read file content.

**Parameters:**
- `filePath` (string) - Path to file relative to workspace

**Returns:**
```javascript
{
  filePath: string,
  content: string,
  size: number,
  modified: string,
  encoding: string
}
```

###### `writeFile`
Write content to file.

**Parameters:**
- `filePath` (string) - Path to file relative to workspace
- `content` (string) - Content to write
- `append` (boolean, optional) - Whether to append instead of overwrite

**Returns:**
```javascript
{
  filePath: string,
  operation: 'write'|'append',
  bytesWritten: number,
  modified: string
}
```

###### `createFile`
Create new file.

**Parameters:**
- `filePath` (string) - Path to new file
- `content` (string, optional) - Initial content

**Returns:**
```javascript
{
  filePath: string,
  created: boolean,
  size: number
}
```

###### `deleteFile`
Delete file.

**Parameters:**
- `filePath` (string) - Path to file to delete

**Returns:**
```javascript
{
  filePath: string,
  deleted: boolean
}
```

##### Search Operations

###### `searchFiles`
Search for files by pattern.

**Parameters:**
- `pattern` (string) - Glob pattern to search for
- `maxResults` (number, optional) - Maximum number of results (default: 50)

**Returns:**
```javascript
{
  pattern: string,
  results: Array<{path: string, uri: string}>,
  count: number,
  truncated: boolean
}
```

###### `findInFiles`
Find text in files.

**Parameters:**
- `searchTerm` (string) - Text to search for
- `filePattern` (string, optional) - File pattern to search in (default: '**/*')
- `maxResults` (number, optional) - Maximum number of results (default: 100)

**Returns:**
```javascript
{
  searchTerm: string,
  results: Array<{
    file: string,
    matches: Array<{
      line: number,
      content: string,
      context: {before: string, after: string}
    }>
  }>,
  totalMatches: number,
  truncated: boolean
}
```

##### Terminal Operations

###### `executeCommand`
Execute terminal command.

**Parameters:**
- `command` (string) - Command to execute
- `timeout` (number, optional) - Timeout in milliseconds

**Returns:**
```javascript
{
  command: string,
  stdout: string,
  stderr: string,
  exitCode: number,
  duration: number
}
```

##### VSCode Operations

###### `showMessage`
Show message to user.

**Parameters:**
- `message` (string) - Message to display
- `type` ('info'|'warning'|'error', optional) - Message type

**Returns:**
```javascript
{
  message: string,
  type: string,
  displayed: boolean
}
```

###### `openFile`
Open file in VSCode.

**Parameters:**
- `filePath` (string) - Path to file to open

**Returns:**
```javascript
{
  filePath: string,
  opened: boolean
}
```

### ContextManager (`legacy/contextManager.js`)

Handles session state across stateless API calls.

#### Methods

##### `createSession(task, modelId, requestId)`
Create a new Legacy Mode session.

**Parameters:**
- `task` (string) - Original task description
- `modelId` (string) - Model ID being used
- `requestId` (string) - Request ID for tracking

**Returns:** `LegacySession` - New session object

##### `getSession(sessionId)`
Get session by ID.

**Parameters:**
- `sessionId` (string) - Session ID

**Returns:** `LegacySession|null` - Session object or null if not found

##### `updateSession(sessionId, updates)`
Update session with new data.

**Parameters:**
- `sessionId` (string) - Session ID
- `updates` (Object) - Updates to apply

**Returns:** `boolean` - True if updated successfully

##### `buildContextPrompt(sessionId)`
Build context prompt for LLM.

**Parameters:**
- `sessionId` (string) - Session ID

**Returns:** `string` - Context prompt with session history

### LegacySession (`legacy/contextManager.js`)

Represents a Legacy Mode execution session.

#### Constructor
```javascript
const session = new LegacySession(task, modelId, requestId);
```

#### Properties
- `id` (string) - Unique session identifier
- `originalTask` (string) - Original task description
- `modelId` (string) - Model ID being used
- `requestId` (string) - Request ID for tracking
- `todos` (Array) - Array of TODOs in this session
- `executionLog` (Array) - Log of execution events
- `phase` ('planning'|'execution'|'verification'|'complete') - Current phase
- `startTime` (string) - ISO timestamp when session started
- `context` (Object) - Additional context data
- `lastActivity` (string) - ISO timestamp of last activity

#### Methods

##### `addExecutionLogEntry(entry)`
Add entry to execution log.

**Parameters:**
- `entry` (Object) - Log entry data

##### `updatePhase(newPhase)`
Update the current execution phase.

**Parameters:**
- `newPhase` ('planning'|'execution'|'verification'|'complete') - New phase

##### `addTodo(todo)`
Add a TODO to this session.

**Parameters:**
- `todo` (LegacyTodo) - TODO to add

### VerificationSystem (`legacy/verificationSystem.js`)

Handles TODO completion verification and user feedback.

#### Constructor
```javascript
const verificationSystem = new VerificationSystem(config);
```

#### Methods

##### `requestVerification(todoId, result, timeoutMs?)`
Request verification for a TODO completion.

**Parameters:**
- `todoId` (string) - ID of TODO to verify
- `result` (string) - Result to verify
- `timeoutMs` (number, optional) - Timeout in milliseconds

**Returns:** `Promise<Object>` - Verification result

##### `handleVerificationResponse(verificationId, approved, feedback?)`
Handle user response to verification request.

**Parameters:**
- `verificationId` (string) - Verification request ID
- `approved` (boolean) - Whether user approved
- `feedback` (string, optional) - User feedback

**Returns:** `boolean` - True if handled successfully

##### `shouldAutoApprove(todo, result)`
Check if a TODO result should be auto-approved.

**Parameters:**
- `todo` (LegacyTodo) - TODO being verified
- `result` (string) - Result to check

**Returns:** `boolean` - True if should be auto-approved

## Error Handling

### LegacyModeError

Custom error class for Legacy Mode operations.

#### Constructor
```javascript
const error = new LegacyModeError(message, options);
```

**Parameters:**
- `message` (string) - Error message
- `options` (Object) - Error options
  - `category` (string) - Error category
  - `code` (string) - Error code
  - `context` (Object) - Additional context
  - `suggestions` (Array<string>) - Recovery suggestions
  - `retryable` (boolean) - Whether error is retryable
  - `recoverable` (boolean) - Whether error is recoverable

#### Properties
- `message` (string) - Error message
- `userMessage` (string) - User-friendly message
- `category` (string) - Error category
- `code` (string) - Error code
- `context` (Object) - Additional context
- `suggestions` (Array<string>) - Recovery suggestions
- `retryable` (boolean) - Whether error is retryable
- `recoverable` (boolean) - Whether error is recoverable

#### Methods

##### `toJSON()`
Convert error to JSON representation.

**Returns:** `Object` - JSON representation of error

### Error Categories

```javascript
const ERROR_CATEGORIES = {
  VALIDATION: 'validation',
  PARSING: 'parsing',
  FILE_SYSTEM: 'file_system',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  PERMISSION: 'permission',
  VSCODE_API: 'vscode_api',
  SYSTEM: 'system',
  USER_INPUT: 'user_input'
};
```

## JSON Schema

### Legacy Response Schema

```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "enum": ["legacy_response"]
    },
    "phase": {
      "type": "string", 
      "enum": ["planning", "execution", "verification", "complete"]
    },
    "todos": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {"type": "string"},
          "description": {"type": "string"},
          "expectedResult": {"type": "string"},
          "status": {
            "type": "string",
            "enum": ["pending", "in_progress", "done", "failed"]
          },
          "toolCalls": {"type": "array"}
        },
        "required": ["id", "description", "expectedResult", "status"]
      }
    },
    "toolCall": {
      "type": ["object", "null"],
      "properties": {
        "tool": {"type": "string"},
        "params": {"type": "object"}
      }
    },
    "verification": {
      "type": ["object", "null"],
      "properties": {
        "todoId": {"type": "string"},
        "approved": {"type": "boolean"},
        "feedback": {"type": "string"}
      }
    },
    "message": {"type": "string"},
    "complete": {"type": "boolean"}
  },
  "required": ["type", "phase", "message", "complete"]
}
```

## Configuration

### Legacy Mode Configuration

Configuration options for Legacy Mode behavior.

```javascript
{
  // General settings
  enabled: boolean,
  defaultTimeout: number,
  maxSessionDuration: number,
  
  // Security settings
  security: {
    allowFileSystemAccess: boolean,
    allowTerminalCommands: boolean,
    blockedPaths: Array<string>,
    maxFileSize: number,
    workspaceOnly: boolean
  },
  
  // Tool settings
  tools: {
    retryAttempts: number,
    timeoutMs: number,
    enabledTools: Array<string>
  },
  
  // Verification settings
  verification: {
    autoApprovalEnabled: boolean,
    defaultTimeoutMs: number,
    maxPendingVerifications: number
  }
}
```

## Events

### Session Events

Events emitted during Legacy Mode execution.

#### `sessionCreated`
Emitted when a new session is created.

**Data:**
```javascript
{
  sessionId: string,
  task: string,
  modelId: string,
  timestamp: string
}
```

#### `todoCreated`
Emitted when a TODO is created.

**Data:**
```javascript
{
  sessionId: string,
  todoId: string,
  description: string,
  expectedResult: string,
  timestamp: string
}
```

#### `toolExecuted`
Emitted when a tool is executed.

**Data:**
```javascript
{
  sessionId: string,
  toolName: string,
  success: boolean,
  duration: number,
  timestamp: string
}
```

#### `phaseChanged`
Emitted when execution phase changes.

**Data:**
```javascript
{
  sessionId: string,
  oldPhase: string,
  newPhase: string,
  timestamp: string
}
```

#### `sessionCompleted`
Emitted when a session completes.

**Data:**
```javascript
{
  sessionId: string,
  success: boolean,
  duration: number,
  todoCount: number,
  completedCount: number,
  timestamp: string
}
```

## Usage Examples

### Basic Task Execution

```javascript
// Initialize Legacy Mode
const legacyMode = require('./modes/legacy');

// Execute a task
const result = await legacyMode.execute({
  router: routerInstance,
  modelId: 'gpt-4',
  prompt: 'Create a React button component with TypeScript',
  requestId: 'req_123'
});

console.log('Execution result:', result);
```

### Manual TODO Management

```javascript
const { TodoManager } = require('./legacy/todoManager');

// Create TODO manager
const todoManager = new TodoManager();

// Create TODOs
const todo1 = todoManager.createTodo(
  'Create component file',
  'Button.tsx file created with basic structure'
);

const todo2 = todoManager.createTodo(
  'Add TypeScript interfaces',
  'Props interface defined with proper types'
);

// Update status
todoManager.updateTodoStatus(todo1.id, 'in_progress');

// Complete TODO
todoManager.markTodoComplete(todo1.id, 'Button.tsx created successfully');

// Get statistics
const stats = todoManager.getStats();
console.log('Completion rate:', stats.completionRate);
```

### Tool Execution

```javascript
const { ToolExecutor } = require('./legacy/toolExecutor');

// Create tool executor
const toolExecutor = new ToolExecutor();

// Execute file operation
const readResult = await toolExecutor.executeTool('readFile', {
  filePath: 'src/components/Button.tsx'
});

if (readResult.success) {
  console.log('File content:', readResult.result.content);
} else {
  console.error('Error:', readResult.error.message);
}

// Execute terminal command
const testResult = await toolExecutor.executeTool('executeCommand', {
  command: 'npm test Button.test.tsx'
});

console.log('Test output:', testResult.result.stdout);
```

### Session Management

```javascript
const { contextManager } = require('./legacy/contextManager');

// Create session
const session = contextManager.createSession(
  'Create authentication system',
  'gpt-4',
  'req_456'
);

// Add execution log entry
session.addExecutionLogEntry({
  type: 'todo_created',
  todoId: 'todo_1',
  description: 'Create login form'
});

// Update phase
session.updatePhase('execution');

// Build context for LLM
const contextPrompt = contextManager.buildContextPrompt(session.id);
console.log('Context:', contextPrompt);
```

This API reference provides comprehensive documentation for all Legacy Mode components, enabling developers to understand and extend the system effectively.