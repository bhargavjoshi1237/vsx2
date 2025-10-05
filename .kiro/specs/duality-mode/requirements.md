# Requirements Document

## Introduction

The Duality mode is a new intelligent mode for VSX that leverages two AI models working in tandem to handle complex tasks. The primary model acts as a task analyzer and coordinator, determining whether a user request should be handled as a single task or broken down into subtasks. When subtasks are identified, a secondary model executes each subtask individually while the system tracks progress and verifies completion. This mode provides enhanced task management with visual progress tracking and minimal chat spam.

## Requirements

### Requirement 1

**User Story:** As a developer, I want to select Duality mode from the mode dropdown, so that I can leverage dual-model task processing for complex requests.

#### Acceptance Criteria

1. WHEN the user opens the mode dropdown THEN the system SHALL display "Duality" as an available mode option
2. WHEN the user selects Duality mode THEN the system SHALL update the UI to show dual model selectors
3. WHEN Duality mode is active THEN the input area SHALL display both primary and secondary model selection dropdowns with appropriate labels

### Requirement 2

**User Story:** As a developer, I want to configure both a primary model and a secondary model in Duality mode, so that I can customize the task analysis and execution workflow.

#### Acceptance Criteria

1. WHEN Duality mode is selected THEN the system SHALL display a "Primary Model" selector with all available models
2. WHEN Duality mode is selected THEN the system SHALL display a "Secondary Model" selector with all available models  
3. WHEN a user selects different models for primary and secondary THEN the system SHALL store these selections for the current session
4. WHEN no models are selected THEN the system SHALL disable the send button and show appropriate validation messages

### Requirement 3

**User Story:** As a developer, I want the primary model to analyze my request and determine if it needs to be broken into subtasks, so that complex tasks can be handled systematically.

#### Acceptance Criteria

1. WHEN a user sends a prompt in Duality mode THEN the system SHALL send the prompt to the primary model first
2. WHEN the primary model receives a prompt THEN it SHALL respond with a JSON structure indicating task complexity
3. IF the task is simple THEN the primary model SHALL return `{"needsSubtasks": false}` and execute like legacy mode
4. IF the task is complex THEN the primary model SHALL return `{"needsSubtasks": true, "subtasks": [array of subtask objects]}`
5. WHEN subtasks are identified THEN each subtask SHALL contain: display text, objective prompt, expectation results text, and done boolean (initially false)

### Requirement 4

**User Story:** As a developer, I want the secondary model to execute individual subtasks when a complex task is identified, so that each component is handled systematically.

#### Acceptance Criteria

1. WHEN subtasks are received from the primary model THEN the system SHALL begin executing them sequentially using the secondary model
2. WHEN executing a subtask THEN the system SHALL send the objective prompt to the secondary model
3. WHEN the secondary model completes a subtask THEN it SHALL respond indicating whether the subtask should be marked as done
4. WHEN a subtask is marked as done THEN the system SHALL perform verification using the expectation results text
5. WHEN all subtasks are completed THEN the system SHALL notify the user of completion

### Requirement 5

**User Story:** As a developer, I want to see a visual progress tracker for subtasks, so that I can monitor the execution progress without chat spam.

#### Acceptance Criteria

1. WHEN subtasks are identified THEN the system SHALL display a subtask progress widget in the chat
2. WHEN displaying subtasks THEN the widget SHALL show each subtask with its display text and current status
3. WHEN a subtask is in progress THEN the widget SHALL show a loading indicator for that specific subtask
4. WHEN a subtask is completed THEN the widget SHALL show a checkmark and update the progress indicator
5. WHEN subtasks are executing THEN the system SHALL NOT spam the chat with individual subtask messages

### Requirement 6

**User Story:** As a developer, I want the subtask progress widget to match the current UI design and color scheme, so that it integrates seamlessly with the existing interface.

#### Acceptance Criteria

1. WHEN the subtask widget is displayed THEN it SHALL use the same color scheme as existing widgets (#212121 background, #474747 borders)
2. WHEN the subtask widget is displayed THEN it SHALL follow the same styling patterns as code widgets and terminal widgets
3. WHEN the subtask widget is displayed THEN it SHALL be responsive and fit within the chat message container
4. WHEN the subtask widget is displayed THEN it SHALL use consistent typography and spacing with other UI elements

### Requirement 7

**User Story:** As a developer, I want the legacy mode terminal command bug to be fixed, so that commands don't execute automatically without my consent.

#### Acceptance Criteria

1. WHEN using legacy mode THEN the system SHALL NOT automatically execute terminal commands without user confirmation
2. WHEN a terminal command is identified in legacy mode THEN the system SHALL display a confirmation prompt before execution
3. WHEN a user declines to execute a terminal command THEN the system SHALL skip the command and continue processing
4. WHEN a user confirms a terminal command THEN the system SHALL execute it and display the results

### Requirement 8

**User Story:** As a developer, I want Duality mode to follow the current implementation flow and patterns, so that it integrates seamlessly with the existing codebase.

#### Acceptance Criteria

1. WHEN implementing Duality mode THEN it SHALL follow the same module structure as existing modes (ask.js, legacy.js)
2. WHEN implementing Duality mode THEN it SHALL use the same router and execution patterns as other modes
3. WHEN implementing Duality mode THEN it SHALL integrate with the existing webview provider and message handling system
4. WHEN implementing Duality mode THEN it SHALL maintain compatibility with existing tool systems and file operations