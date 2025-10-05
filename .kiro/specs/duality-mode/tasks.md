# Implementation Plan

- [x] 1. Create Duality mode module and register it in the mode system

  - Create `modes/duality.js` following the existing mode pattern with id, name, tagline, and execute function
  - Add Duality mode to the MODES array in `modes/index.js`
  - Implement basic mode structure with proper wrappers and execution flow
  - _Requirements: 1.1, 1.2, 8.1, 8.2_

- [x] 2. Implement dual model selection UI components

  - [x] 2.1 Create dual model selector HTML structure in input-area.html

    - Add hidden dual model selector container that shows when Duality mode is selected
    - Create primary and secondary model dropdown elements with proper labels
    - Style the dual selectors to match existing UI patterns and color scheme
    - _Requirements: 2.1, 2.2, 6.1, 6.2, 6.3_

  - [x] 2.2 Implement dual model selector JavaScript logic in webview-client.js

    - Add functions to show/hide dual model selectors based on selected mode
    - Implement model selection handling for both primary and secondary dropdowns
    - Add validation to disable send button when models are not selected
    - Store selected model IDs for Duality mode execution
    - _Requirements: 2.3, 2.4, 8.3_

- [x] 3. Implement primary model task analysis logic

  - [x] 3.1 Create task analysis prompt and response handling

    - Design prompt template for primary model to analyze task complexity
    - Implement JSON response parsing for needsSubtasks and subtasks array
    - Add fallback logic for invalid JSON responses to execute as legacy mode
    - Handle timeout scenarios with graceful degradation
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Implement subtask data structure validation

    - Create validation functions for subtask JSON structure
    - Ensure all required fields (displayText, objectivePrompt, expectationResults, done) are present
    - Add error handling for malformed subtask data
    - _Requirements: 3.5_

- [x] 4. Create subtask progress widget UI component

  - [x] 4.1 Design and implement subtask progress widget HTML structure

    - Create widget following existing code-widget and terminal-widget patterns
    - Implement header with progress indicator and subtask list container
    - Add status icons for pending, in-progress, completed, and failed states
    - Style widget to match existing UI color scheme (#212121 background, #474747 borders)
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 6.4_

  - [x] 4.2 Implement progress widget JavaScript functionality

    - Create functions to render and update subtask progress widget
    - Add real-time progress updates as subtasks are executed
    - Implement smooth animations for status changes
    - Add widget to webview-client.js widget creation functions
    - _Requirements: 5.3, 5.4_

- [x] 5. Implement secondary model subtask execution system

  - [x] 5.1 Create subtask execution loop in Duality mode

    - Implement sequential subtask processing using secondary model
    - Send objective prompts to secondary model for each subtask
    - Handle secondary model responses and completion detection
    - Update progress widget in real-time during execution
    - _Requirements: 4.1, 4.2, 5.5_

  - [x] 5.2 Implement subtask verification system

    - Create verification logic using expectation results text
    - Implement basic completion detection based on secondary model responses
    - Add verification feedback to progress widget
    - Handle verification failures with appropriate error states
    - _Requirements: 4.3, 4.4, 4.5_

- [x] 6. Enhance existing tools to support multiple file operations

  - [x] 6.1 Enhance searchfile tool to support multiple file searches

    - Modify `tools/searchfile.js` to accept array of search patterns
    - Implement batch search functionality with consolidated results
    - Add support for searching across multiple directories simultaneously
    - Return structured results with file paths and match contexts
    - _Requirements: 8.4_

  - [x] 6.2 Enhance fileread tool to support multiple file reading

    - Modify `tools/fileread.js` to accept array of file paths
    - Implement batch file reading with error handling for missing files
    - Return structured results with file contents and metadata
    - Add support for reading files with different encodings
    - _Requirements: 8.4_

  - [x] 6.3 Enhance writefile tool to support multiple file editing

    - Modify `tools/writefile.js` to accept array of file operations
    - Implement batch file writing with atomic operations
    - Add support for creating directories as needed
    - Return detailed results for each file operation with success/failure status
    - _Requirements: 8.4_

  - [x] 6.4 Update legacy mode to use enhanced multi-file tools

    - Modify legacy mode tool call handling to support new multi-file capabilities
    - Update tool call parsing to handle array-based parameters
    - Ensure backward compatibility with existing single-file tool calls
    - Add proper error handling for batch operations
    - _Requirements: 8.4_

- [x] 7. Integrate Duality mode with existing router and tool systems

  - [x] 7.1 Update webviewProvider.js to handle Duality mode messages

    - Add message handling for dual model selection
    - Implement Duality mode execution in sendPrompt message handler
    - Ensure compatibility with enhanced multi-file tool systems
    - Add proper error handling and response formatting
    - _Requirements: 8.3, 8.4_

  - [x] 7.2 Implement session management for Duality mode

    - Create DualitySession class to track execution state
    - Implement session storage and cleanup logic
    - Add session recovery for page refreshes
    - Handle concurrent session management
    - _Requirements: 8.1, 8.2_

- [x] 8. Fix legacy mode terminal command auto-execution bug

  - [x] 8.1 Implement terminal command confirmation system

    - Modify legacy mode to detect terminal commands before execution
    - Create confirmation prompt UI component matching existing widget styles
    - Add user confirmation handling in webview message system
    - Implement skip functionality for declined commands
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 8.2 Update terminal command execution flow in legacy mode

    - Replace automatic execution with confirmation-based execution
    - Maintain existing functionality for approved commands
    - Add proper error handling for skipped commands
    - Ensure backward compatibility with existing tool workflows
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 9. Implement error handling and edge cases

- [ ] 9. Implement error handling and edge cases

  - [x] 9.1 Add comprehensive error handling for model failures

    - Handle primary model timeout and fallback scenarios
    - Implement secondary model failure recovery
    - Add network error handling with retry mechanisms
    - Create user-friendly error messages and recovery options
    - _Requirements: 3.1, 4.1, 4.2_

  - [x] 9.2 Implement input validation and user feedback

    - Validate dual model selection before allowing execution
    - Add loading states and progress indicators
    - Implement proper cleanup for cancelled operations
    - Add user feedback for all error scenarios
    - _Requirements: 2.4, 5.1, 5.2, 5.3, 5.4_

- [-] 10. Add final integration and testing

  - [x] 10.1 Test complete Duality mode workflow end-to-end

    - Test simple task fallback to legacy-style execution
    - Test complex task subtask generation and execution
    - Verify progress tracking and UI updates work correctly
    - Test error scenarios and recovery mechanisms
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 10.2 Test enhanced multi-file tool capabilities

    - Test searchfile tool with multiple search patterns and directories
    - Test fileread tool with multiple file paths and error handling
    - Test writefile tool with multiple file operations and atomic writes
    - Verify backward compatibility with existing single-file tool calls
    - _Requirements: 8.4_

  - [x] 10.3 Verify legacy mode terminal command fix

    - Test that terminal commands no longer execute automatically
    - Verify confirmation prompts appear and function correctly
    - Test skip functionality and continued processing
    - Ensure existing tool workflows remain functional
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 10.4 Write unit tests for core Duality mode functionality

    - Create tests for DualitySession class methods and state management
    - Write tests for subtask validation and verification logic
    - Add tests for UI component rendering and interaction
    - Test error handling and edge case scenarios
    - _Requirements: All requirements_

  - [ ] 10.5 Create integration tests for router and tool compatibility




    - Test Duality mode integration with existing router patterns
    - Verify compatibility with all existing tool systems
    - Test webview message handling and response processing
    - Add tests for session management and cleanup
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
