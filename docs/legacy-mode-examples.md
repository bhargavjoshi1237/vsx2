# Legacy Mode Examples and JSON Response Formats

## Example Tasks

This document provides examples of tasks suitable for Legacy Mode and the expected JSON response formats for each phase of execution.

### Example 1: Create a React Component

**Task Description:**
"Create a new React component for user authentication with login and signup forms, including validation and styling"

**Expected Execution Flow:**

#### Phase 1: Planning Response
```json
{
  "type": "legacy_response",
  "phase": "planning",
  "todos": [
    {
      "id": "todo_1",
      "description": "Create component directory structure",
      "expectedResult": "Directory structure created with components/auth folder",
      "status": "pending"
    },
    {
      "id": "todo_2", 
      "description": "Implement LoginForm component with validation",
      "expectedResult": "LoginForm.jsx with email/password validation",
      "status": "pending"
    },
    {
      "id": "todo_3",
      "description": "Implement SignupForm component with validation", 
      "expectedResult": "SignupForm.jsx with form validation and error handling",
      "status": "pending"
    },
    {
      "id": "todo_4",
      "description": "Create AuthContainer component to manage forms",
      "expectedResult": "AuthContainer.jsx that switches between login/signup",
      "status": "pending"
    },
    {
      "id": "todo_5",
      "description": "Add CSS styling for authentication components",
      "expectedResult": "auth.css with responsive styling",
      "status": "pending"
    },
    {
      "id": "todo_6",
      "description": "Create unit tests for authentication components",
      "expectedResult": "Test files with comprehensive coverage",
      "status": "pending"
    }
  ],
  "toolCall": null,
  "verification": null,
  "message": "I've analyzed your task and broken it down into 6 manageable TODOs. This will create a complete authentication system with forms, validation, styling, and tests.",
  "complete": false
}
```

#### Phase 2: Execution Response (Creating Directory)
```json
{
  "type": "legacy_response",
  "phase": "execution",
  "todos": [
    {
      "id": "todo_1",
      "description": "Create component directory structure",
      "expectedResult": "Directory structure created with components/auth folder",
      "status": "in_progress"
    }
  ],
  "toolCall": {
    "tool": "createFile",
    "params": {
      "filePath": "src/components/auth/index.js",
      "content": "// Authentication components\nexport { default as LoginForm } from './LoginForm';\nexport { default as SignupForm } from './SignupForm';\nexport { default as AuthContainer } from './AuthContainer';\n"
    }
  },
  "verification": null,
  "message": "Creating the directory structure for authentication components...",
  "complete": false
}
```

#### Phase 3: Verification Response
```json
{
  "type": "legacy_response",
  "phase": "verification",
  "todos": [
    {
      "id": "todo_1",
      "description": "Create component directory structure",
      "expectedResult": "Directory structure created with components/auth folder",
      "status": "done"
    }
  ],
  "toolCall": null,
  "verification": {
    "todoId": "todo_1",
    "approved": true,
    "feedback": "Directory structure created successfully with proper index file"
  },
  "message": "TODO 1 completed successfully. Moving to next task...",
  "complete": false
}
```

#### Phase 4: Completion Response
```json
{
  "type": "legacy_response",
  "phase": "complete",
  "todos": [
    {
      "id": "todo_1",
      "description": "Create component directory structure",
      "expectedResult": "Directory structure created with components/auth folder",
      "status": "done"
    },
    {
      "id": "todo_2",
      "description": "Implement LoginForm component with validation",
      "expectedResult": "LoginForm.jsx with email/password validation",
      "status": "done"
    },
    {
      "id": "todo_3",
      "description": "Implement SignupForm component with validation",
      "expectedResult": "SignupForm.jsx with form validation and error handling",
      "status": "done"
    },
    {
      "id": "todo_4",
      "description": "Create AuthContainer component to manage forms",
      "expectedResult": "AuthContainer.jsx that switches between login/signup",
      "status": "done"
    },
    {
      "id": "todo_5",
      "description": "Add CSS styling for authentication components",
      "expectedResult": "auth.css with responsive styling",
      "status": "done"
    },
    {
      "id": "todo_6",
      "description": "Create unit tests for authentication components",
      "expectedResult": "Test files with comprehensive coverage",
      "status": "done"
    }
  ],
  "toolCall": null,
  "verification": null,
  "message": "Authentication system implementation completed successfully! All components, styling, and tests have been created.",
  "complete": true
}
```

### Example 2: API Endpoint Implementation

**Task Description:**
"Create a REST API endpoint for user registration with email validation and database integration"

#### Planning Response
```json
{
  "type": "legacy_response",
  "phase": "planning",
  "todos": [
    {
      "id": "todo_1",
      "description": "Create user model with validation schema",
      "expectedResult": "User model with email, password validation",
      "status": "pending"
    },
    {
      "id": "todo_2",
      "description": "Implement registration route handler",
      "expectedResult": "POST /api/register endpoint with validation",
      "status": "pending"
    },
    {
      "id": "todo_3",
      "description": "Add email validation middleware",
      "expectedResult": "Email format and uniqueness validation",
      "status": "pending"
    },
    {
      "id": "todo_4",
      "description": "Create database integration for user storage",
      "expectedResult": "Database connection and user creation logic",
      "status": "pending"
    },
    {
      "id": "todo_5",
      "description": "Add error handling and response formatting",
      "expectedResult": "Proper error responses and success messages",
      "status": "pending"
    },
    {
      "id": "todo_6",
      "description": "Create integration tests for registration endpoint",
      "expectedResult": "Test suite covering success and error cases",
      "status": "pending"
    }
  ],
  "toolCall": null,
  "verification": null,
  "message": "I'll create a complete user registration API with validation, database integration, and tests.",
  "complete": false
}
```

### Example 3: Test Suite Creation

**Task Description:**
"Create comprehensive unit tests for the shopping cart module"

#### Tool Call Examples During Execution

**Reading existing code:**
```json
{
  "type": "legacy_response",
  "phase": "execution",
  "toolCall": {
    "tool": "readFile",
    "params": {
      "filePath": "src/modules/shoppingCart.js"
    }
  },
  "message": "Reading the shopping cart module to understand its structure...",
  "complete": false
}
```

**Creating test file:**
```json
{
  "type": "legacy_response",
  "phase": "execution",
  "toolCall": {
    "tool": "writeFile",
    "params": {
      "filePath": "tests/shoppingCart.test.js",
      "content": "const { ShoppingCart } = require('../src/modules/shoppingCart');\n\ndescribe('ShoppingCart', () => {\n  let cart;\n\n  beforeEach(() => {\n    cart = new ShoppingCart();\n  });\n\n  describe('addItem', () => {\n    it('should add item to cart', () => {\n      const item = { id: 1, name: 'Test Product', price: 10.99 };\n      cart.addItem(item);\n      expect(cart.getItems()).toHaveLength(1);\n    });\n  });\n});"
    }
  },
  "message": "Creating comprehensive test suite for shopping cart functionality...",
  "complete": false
}
```

**Running tests:**
```json
{
  "type": "legacy_response",
  "phase": "execution",
  "toolCall": {
    "tool": "executeCommand",
    "params": {
      "command": "npm test -- shoppingCart.test.js"
    }
  },
  "message": "Running the test suite to verify functionality...",
  "complete": false
}
```

## JSON Response Schema Reference

### Complete Schema Structure
```json
{
  "type": "legacy_response",           // Always "legacy_response"
  "phase": "string",                   // "planning" | "execution" | "verification" | "complete"
  "todos": [                           // Array of TODO objects
    {
      "id": "string",                  // Unique identifier
      "description": "string",         // Task description
      "expectedResult": "string",      // Expected outcome
      "status": "string",              // "pending" | "in_progress" | "done" | "failed"
      "toolCalls": []                  // Array of tool calls made for this TODO
    }
  ],
  "toolCall": {                        // Tool to execute (optional)
    "tool": "string",                  // Tool name
    "params": {}                       // Tool parameters
  },
  "verification": {                    // Verification result (optional)
    "todoId": "string",                // TODO being verified
    "approved": "boolean",             // Whether approved
    "feedback": "string"               // Feedback message
  },
  "message": "string",                 // Human-readable message
  "complete": "boolean"                // Whether execution is complete
}
```

### Supported Tools

#### File Operations
- **readFile**: `{"tool": "readFile", "params": {"filePath": "path/to/file.js"}}`
- **writeFile**: `{"tool": "writeFile", "params": {"filePath": "path/to/file.js", "content": "file content"}}`
- **createFile**: `{"tool": "createFile", "params": {"filePath": "path/to/new-file.js", "content": "initial content"}}`
- **deleteFile**: `{"tool": "deleteFile", "params": {"filePath": "path/to/file.js"}}`

#### Search Operations
- **searchFiles**: `{"tool": "searchFiles", "params": {"pattern": "**/*.js", "maxResults": 50}}`
- **findInFiles**: `{"tool": "findInFiles", "params": {"searchTerm": "function", "filePattern": "**/*.js"}}`

#### Terminal Operations
- **executeCommand**: `{"tool": "executeCommand", "params": {"command": "npm test"}}`
- **executeTerminal**: `{"tool": "executeTerminal", "params": {"command": "npm start"}}`

#### VSCode Operations
- **showMessage**: `{"tool": "showMessage", "params": {"message": "Task completed", "type": "info"}}`
- **openFile**: `{"tool": "openFile", "params": {"filePath": "src/component.js"}}`
- **executeVSCodeCommand**: `{"tool": "executeVSCodeCommand", "params": {"command": "workbench.action.files.save"}}`

## Best Practices for JSON Responses

### 1. Always Include Required Fields
Every response must include `type`, `phase`, and `message` fields.

### 2. Use Descriptive TODO Descriptions
```json
// Good
"description": "Implement user authentication with JWT tokens"

// Bad  
"description": "Add auth"
```

### 3. Provide Clear Expected Results
```json
// Good
"expectedResult": "LoginForm.jsx component with email/password validation and error handling"

// Bad
"expectedResult": "Login form done"
```

### 4. Use Appropriate Tool Parameters
```json
// Good - Specific file operations
{
  "tool": "writeFile",
  "params": {
    "filePath": "src/components/Button.jsx",
    "content": "import React from 'react';\n\nconst Button = ({ children, onClick, type = 'button' }) => {\n  return (\n    <button type={type} onClick={onClick}>\n      {children}\n    </button>\n  );\n};\n\nexport default Button;"
  }
}

// Bad - Vague parameters
{
  "tool": "writeFile", 
  "params": {
    "filePath": "button.js",
    "content": "button component"
  }
}
```

### 5. Provide Meaningful Verification Feedback
```json
// Good
{
  "todoId": "todo_3",
  "approved": true,
  "feedback": "Component created successfully with proper prop validation and export"
}

// Bad
{
  "todoId": "todo_3", 
  "approved": true,
  "feedback": "OK"
}
```

## Error Handling Examples

### Malformed JSON Recovery
If the LLM response is malformed, the parser will attempt recovery:

**Original Malformed Response:**
```
{
  "type": "legacy_response",
  "phase": "execution"
  "message": "Creating component...
  "toolCall": {
    "tool": "writeFile",
    "params": {"filePath": "component.js"
```

**Recovered Response:**
```json
{
  "type": "legacy_response",
  "phase": "execution", 
  "todos": [],
  "toolCall": {
    "tool": "writeFile",
    "params": {"filePath": "component.js"}
  },
  "verification": null,
  "message": "Creating component...",
  "complete": false
}
```

### Tool Execution Errors
When tools fail, the system provides structured error information:

```json
{
  "type": "legacy_response",
  "phase": "execution",
  "message": "Tool execution failed: File not found",
  "toolCall": null,
  "error": {
    "tool": "readFile",
    "message": "File not found: src/nonexistent.js",
    "suggestions": [
      "Check if the file path is correct",
      "Verify the file exists in the workspace"
    ]
  },
  "complete": false
}
```

## Common Task Patterns

### 1. Component Creation Pattern
1. **Planning**: Break down into structure, implementation, styling, tests
2. **Execution**: Create files, implement logic, add styles
3. **Verification**: Check each component works correctly
4. **Completion**: Confirm all parts integrated

### 2. API Development Pattern  
1. **Planning**: Model, routes, validation, database, tests
2. **Execution**: Implement each layer incrementally
3. **Verification**: Test endpoints and error handling
4. **Completion**: Full API functionality confirmed

### 3. Testing Pattern
1. **Planning**: Analyze code, identify test cases, setup structure
2. **Execution**: Write tests, run them, fix issues
3. **Verification**: Confirm coverage and functionality
4. **Completion**: Complete test suite ready

### 4. Refactoring Pattern
1. **Planning**: Analyze current code, identify improvements
2. **Execution**: Make incremental changes, maintain functionality  
3. **Verification**: Run tests, check no regressions
4. **Completion**: Improved code with same functionality