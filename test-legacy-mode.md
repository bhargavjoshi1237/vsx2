# Legacy Mode Test Cases

## Test Case 1: Simple File Operation
**Input:** "Create a new file called 'hello.txt' with content 'Hello, Legacy Mode!'"

**Expected Behavior:**
1. Legacy Mode should break this into TODOs:
   - TODO 1: Create file hello.txt with specified content
2. Execute the TODO using file creation tools
3. Ask for confirmation
4. Mark as complete when confirmed

## Test Case 2: Multiple File Operations
**Input:** "Create three files: config.json, readme.md, and package.json with basic content"

**Expected Behavior:**
1. Break into 3 separate TODOs
2. Execute each file creation sequentially
3. Request confirmation for each
4. Display progress and final completion

## Test Case 3: File Search and Modification
**Input:** "Find all .js files in the project and add a comment '// Legacy Mode Test' at the top"

**Expected Behavior:**
1. TODO 1: Search for .js files
2. TODO 2: Read each file and modify content
3. TODO 3: Write modified content back
4. Show tool calls and terminal output in UI

## Expected UI Elements

### Legacy Mode Selection
- Mode dropdown should show "Legacy" option
- When selected, prompts should be processed differently

### TODO Display
- Each TODO should show:
  - Status icon (⏳ pending, ✅ done)
  - Description
  - Expected result
  - Timestamps

### Tool Call Display
- Show tool name
- Display input parameters
- Show output/results
- Error handling with suggestions

### Terminal Output
- Command executed
- Output/results
- Working directory

### Confirmation Requests
- Clear TODO description
- Execution result
- Approve/Reject buttons
- Feedback textarea for rejections

## Test Instructions

1. Open VSX extension in VS Code (F5 from extension development)
2. Open the VSX panel in the activity bar
3. Change mode from "Ask" to "Legacy"
4. Enter one of the test prompts above
5. Observe the autonomous execution flow
6. Verify UI components render correctly
7. Test confirmation flow
8. Check final completion status