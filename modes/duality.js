const id = "duality";
const name = "Duality";
const tagline = "Dual Model Processing";

const wrappers = {
  top: `You are VSX, an intelligent coding assistant operating in Duality mode. In this mode, you work as part of a dual-model system where you may serve as either:

1. PRIMARY MODEL: Analyze task complexity and determine if subtasks are needed
2. SECONDARY MODEL: Execute individual subtasks as directed

CORE PRINCIPLES:
- Provide clear, accurate, and actionable responses
- Work efficiently within the dual-model workflow
- Focus on practical implementation and results
- Maintain consistency with the overall task objectives
- Use the workspace root directory for all file operations and terminal commands`,

  bottom: `RESPONSE GUIDELINES:
- As PRIMARY MODEL: Analyze the task and respond with JSON indicating complexity
- As SECONDARY MODEL: Execute the assigned subtask thoroughly and indicate completion
- Always prioritize clarity and usefulness in your responses
- Focus on delivering working, tested solutions when appropriate
- Use relative paths from the workspace root for all file operations
- Execute terminal commands in the correct workspace directory

Remember: You are part of a coordinated dual-model system designed to handle complex tasks systematically.`,

  fileHeader:
    "CONTEXT FILES:\nThe following files are provided for reference. Use them to understand the codebase structure, existing patterns, and implementation details.\n\n",
};

class DualitySession {
  constructor(requestId, primaryModelId, secondaryModelId) {
    this.requestId = requestId;
    this.primaryModelId = primaryModelId;
    this.secondaryModelId = secondaryModelId;
    this.subtasks = [];
    this.currentSubtaskIndex = 0;
    this.startTime = Date.now();
    this.status = "analyzing"; // analyzing, executing, completed, failed
    this.webviewProvider = null;
    this.lastProgressUpdate = null;
    this.lastUpdateTime = null;
    this.subtaskUpdates = [];
    this.sessionData = {};
    this.cleanupCallbacks = [];
  }

  addSubtasks(subtasks) {
    this.subtasks = subtasks.map((task) => ({
      ...task,
      status: "pending", // pending, in_progress, completed, failed
      startTime: null,
      endTime: null,
      result: null,
      verification: null,
    }));
  }

  getCurrentSubtask() {
    return this.subtasks[this.currentSubtaskIndex] || null;
  }

  markSubtaskComplete(index, result, verification = null) {
    if (this.subtasks[index]) {
      this.subtasks[index].status = "completed";
      this.subtasks[index].endTime = Date.now();
      this.subtasks[index].result = result;
      this.subtasks[index].verification = verification;
    }
  }

  markSubtaskFailed(index, error, verification = null) {
    if (this.subtasks[index]) {
      this.subtasks[index].status = "failed";
      this.subtasks[index].endTime = Date.now();
      this.subtasks[index].error = error;
      this.subtasks[index].verification = verification;
    }
  }

  moveToNextSubtask() {
    this.currentSubtaskIndex++;
    return this.getCurrentSubtask();
  }

  isComplete() {
    return this.currentSubtaskIndex >= this.subtasks.length;
  }

  getProgress() {
    const completed = this.subtasks.filter(
      (st) => st.status === "completed"
    ).length;
    const failed = this.subtasks.filter((st) => st.status === "failed").length;
    const inProgress = this.subtasks.filter(
      (st) => st.status === "in_progress"
    ).length;
    const pending = this.subtasks.filter(
      (st) => st.status === "pending"
    ).length;

    return {
      total: this.subtasks.length,
      completed,
      failed,
      inProgress,
      pending,
      percentage:
        this.subtasks.length > 0
          ? Math.round((completed / this.subtasks.length) * 100)
          : 0,
    };
  }

  getExecutionTime() {
    return Date.now() - this.startTime;
  }

  addCleanupCallback(callback) {
    if (typeof callback === "function") {
      this.cleanupCallbacks.push(callback);
    }
  }

  cleanup() {
    try {
      // Execute cleanup callbacks
      for (const callback of this.cleanupCallbacks) {
        try {
          callback();
        } catch (err) {
          console.error("Error in session cleanup callback:", err);
        }
      }

      // Clear references
      this.webviewProvider = null;
      this.cleanupCallbacks = [];
      this.sessionData = {};

      console.log(`Session ${this.requestId} cleaned up successfully`);
    } catch (err) {
      console.error(`Error cleaning up session ${this.requestId}:`, err);
    }
  }

  serialize() {
    return {
      requestId: this.requestId,
      primaryModelId: this.primaryModelId,
      secondaryModelId: this.secondaryModelId,
      subtasks: this.subtasks,
      currentSubtaskIndex: this.currentSubtaskIndex,
      startTime: this.startTime,
      status: this.status,
      lastProgressUpdate: this.lastProgressUpdate,
      lastUpdateTime: this.lastUpdateTime,
      subtaskUpdates: this.subtaskUpdates,
      sessionData: this.sessionData,
    };
  }

  static deserialize(data) {
    const session = new DualitySession(
      data.requestId,
      data.primaryModelId,
      data.secondaryModelId
    );
    session.subtasks = data.subtasks || [];
    session.currentSubtaskIndex = data.currentSubtaskIndex || 0;
    session.startTime = data.startTime || Date.now();
    session.status = data.status || "analyzing";
    session.lastProgressUpdate = data.lastProgressUpdate || null;
    session.lastUpdateTime = data.lastUpdateTime || null;
    session.subtaskUpdates = data.subtaskUpdates || [];
    session.sessionData = data.sessionData || {};
    return session;
  }
}

// Store active sessions for tracking execution state
const activeSessions = new Map();

// Session storage for persistence across page refreshes
const sessionStorage = new Map();

// Session management functions
class SessionManager {
  static storeSession(session) {
    try {
      activeSessions.set(session.requestId, session);
      sessionStorage.set(session.requestId, session.serialize());
      console.log(`Session ${session.requestId} stored successfully`);
    } catch (err) {
      console.error(`Error storing session ${session.requestId}:`, err);
    }
  }

  static getSession(requestId) {
    return activeSessions.get(requestId) || null;
  }

  static recoverSession(requestId) {
    try {
      const storedData = sessionStorage.get(requestId);
      if (storedData) {
        const session = DualitySession.deserialize(storedData);
        activeSessions.set(requestId, session);
        console.log(`Session ${requestId} recovered successfully`);
        return session;
      }
      return null;
    } catch (err) {
      console.error(`Error recovering session ${requestId}:`, err);
      return null;
    }
  }

  static cleanupSession(requestId) {
    try {
      const session = activeSessions.get(requestId);
      if (session) {
        session.cleanup();
      }

      activeSessions.delete(requestId);
      sessionStorage.delete(requestId);
      console.log(`Session ${requestId} cleaned up successfully`);
    } catch (err) {
      console.error(`Error cleaning up session ${requestId}:`, err);
    }
  }

  static cleanupExpiredSessions(maxAgeMs = 3600000) {
    // 1 hour default
    try {
      const now = Date.now();
      const expiredSessions = [];

      for (const [requestId, session] of activeSessions.entries()) {
        if (now - session.startTime > maxAgeMs) {
          expiredSessions.push(requestId);
        }
      }

      for (const requestId of expiredSessions) {
        this.cleanupSession(requestId);
      }

      if (expiredSessions.length > 0) {
        console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
      }
    } catch (err) {
      console.error("Error cleaning up expired sessions:", err);
    }
  }

  static getAllActiveSessions() {
    return Array.from(activeSessions.values());
  }

  static getSessionCount() {
    return activeSessions.size;
  }

  static handleConcurrentSessions(maxConcurrent = 5) {
    try {
      if (activeSessions.size <= maxConcurrent) {
        return;
      }

      // Get sessions sorted by start time (oldest first)
      const sessions = Array.from(activeSessions.values()).sort(
        (a, b) => a.startTime - b.startTime
      );

      // Clean up oldest sessions that exceed the limit
      const sessionsToCleanup = sessions.slice(
        0,
        sessions.length - maxConcurrent
      );

      for (const session of sessionsToCleanup) {
        if (session.status === "completed" || session.status === "failed") {
          this.cleanupSession(session.requestId);
        }
      }

      console.log(
        `Handled concurrent sessions: ${sessionsToCleanup.length} cleaned up`
      );
    } catch (err) {
      console.error("Error handling concurrent sessions:", err);
    }
  }
}

// Periodic cleanup of expired sessions (run every 10 minutes)
setInterval(() => {
  SessionManager.cleanupExpiredSessions();
}, 600000);

// Task analysis prompt template for primary model
function createTaskAnalysisPrompt(userPrompt, workspaceRoot) {
  return `You are the PRIMARY MODEL in a dual-model system. Your role is to analyze the user's request and determine if it should be broken down into subtasks.

WORKSPACE CONTEXT:
- Current workspace root: ${workspaceRoot}
- Use relative paths from this root for all file operations
- Terminal commands will be executed in this directory

ANALYSIS CRITERIA:
- Simple tasks: Single file operations, basic questions, straightforward code changes, simple terminal commands
- Complex tasks: Multi-file operations, architectural changes, multi-step workflows, comprehensive features, complex build processes

USER REQUEST:
${userPrompt}

DECISION PROCESS:
1. If the task is simple and can be completed in a single operation, respond with needsSubtasks: false
2. If the task is complex and would benefit from being broken into logical steps, respond with needsSubtasks: true and provide subtasks

RESPONSE FORMAT: You MUST respond with valid JSON in this exact format:

For SIMPLE tasks (execute in legacy mode):
{
  "needsSubtasks": false
}

For COMPLEX tasks (break into subtasks):
{
  "needsSubtasks": true,
  "subtasks": [
    {
      "displayText": "Brief description for UI display",
      "objectivePrompt": "Detailed prompt for secondary model execution including workspace context",
      "expectationResults": "What should be accomplished/verified",
      "done": false
    }
  ]
}

IMPORTANT:
- Respond ONLY with valid JSON
- No additional text or explanations
- Each subtask must have all 4 required fields
- Keep displayText concise (under 50 characters)
- Make objectivePrompt specific and actionable with workspace context
- Include workspace root information in objectivePrompt for file/terminal operations
- Set done to false initially`;
}

// Force subtask prompt template for primary model (when forceSubtasks is enabled)
function createForceSubtaskPrompt(userPrompt, workspaceRoot) {
  return `You are the PRIMARY MODEL in a dual-model system. You MUST break down the user's request into subtasks for execution by the secondary model.

WORKSPACE CONTEXT:
- Current workspace root: ${workspaceRoot}
- Use relative paths from this root for all file operations
- Terminal commands will be executed in this directory

USER REQUEST:
${userPrompt}

INSTRUCTIONS:
You must break this task into logical subtasks. Do not analyze whether it needs subtasks - it will be broken down regardless.

RESPONSE FORMAT: You MUST respond with valid JSON in this exact format:

{
  "needsSubtasks": true,
  "subtasks": [
    {
      "displayText": "Brief description for UI display",
      "objectivePrompt": "Detailed prompt for secondary model execution including workspace context",
      "expectationResults": "What should be accomplished/verified",
      "done": false
    }
  ]
}

IMPORTANT:
- Respond ONLY with valid JSON
- No additional text or explanations
- Always set needsSubtasks to true
- Each subtask must have all 4 required fields
- Keep displayText concise (under 50 characters)
- Make objectivePrompt specific and actionable with workspace context
- Include workspace root information in objectivePrompt for file/terminal operations
- Set done to false initially
- Break the task into 2-5 logical steps`;
}

// Parse and validate JSON response from primary model
function parseTaskAnalysisResponse(responseText) {
  console.log("🔍 Starting to parse response text:", responseText);
  
  try {
    // Clean the response text - remove any markdown code blocks or extra text
    let cleanedText = responseText.trim();
    console.log("📝 Cleaned text (trimmed):", cleanedText);

    // Extract JSON from markdown code blocks if present
    const jsonMatch = cleanedText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      cleanedText = jsonMatch[1];
      console.log("📦 Extracted from markdown code block:", cleanedText);
    }

    // Try to find JSON object in the text
    const jsonStart = cleanedText.indexOf("{");
    const jsonEnd = cleanedText.lastIndexOf("}");
    console.log("🔍 JSON boundaries - start:", jsonStart, "end:", jsonEnd);

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
      console.log("✂️ Extracted JSON substring:", cleanedText);
    }

    console.log("🔄 Attempting to parse JSON:", cleanedText);
    const parsed = JSON.parse(cleanedText);
    console.log("✅ JSON parsed successfully:", parsed);

    // Validate the response structure
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Response is not a valid object");
    }

    if (typeof parsed.needsSubtasks !== "boolean") {
      console.log("❌ needsSubtasks validation failed - type:", typeof parsed.needsSubtasks, "value:", parsed.needsSubtasks);
      throw new Error("needsSubtasks field is missing or not boolean");
    }

    console.log("✅ needsSubtasks validation passed:", parsed.needsSubtasks);

    // If needsSubtasks is true, validate subtasks array
    if (parsed.needsSubtasks) {
      if (!Array.isArray(parsed.subtasks)) {
        console.log("❌ subtasks validation failed - type:", typeof parsed.subtasks, "value:", parsed.subtasks);
        throw new Error("subtasks field is missing or not an array");
      }

      console.log("✅ subtasks array validation passed, length:", parsed.subtasks.length);

      // Validate each subtask using the validation function
      for (let i = 0; i < parsed.subtasks.length; i++) {
        const validation = validateSubtaskStructure(parsed.subtasks[i]);
        console.log(`🔍 Subtask ${i + 1} validation:`, validation);
        if (!validation.isValid) {
          throw new Error(
            `Subtask ${i + 1} validation failed: ${validation.errors.join(
              ", "
            )}`
          );
        }
      }
    }

    console.log("🎉 Parse successful, returning data:", parsed);
    return { success: true, data: parsed };
  } catch (error) {
    console.log("❌ Parse failed with error:", error.message);
    console.log("📄 Original response text:", responseText);
    return {
      success: false,
      error: error.message,
      fallbackToLegacy: true,
    };
  }
}

// Validate subtask data structure (implements subtask 3.2)
function validateSubtaskStructure(subtask) {
  const errors = [];
  const requiredFields = [
    "displayText",
    "objectivePrompt",
    "expectationResults",
    "done",
  ];

  if (!subtask || typeof subtask !== "object") {
    return { isValid: false, errors: ["Subtask must be an object"] };
  }

  // Check for required fields
  for (const field of requiredFields) {
    if (!(field in subtask)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate field types and constraints
  if ("displayText" in subtask) {
    if (typeof subtask.displayText !== "string") {
      errors.push("displayText must be a string");
    } else if (subtask.displayText.trim().length === 0) {
      errors.push("displayText cannot be empty");
    } else if (subtask.displayText.length > 100) {
      errors.push("displayText should be under 100 characters");
    }
  }

  if ("objectivePrompt" in subtask) {
    if (typeof subtask.objectivePrompt !== "string") {
      errors.push("objectivePrompt must be a string");
    } else if (subtask.objectivePrompt.trim().length === 0) {
      errors.push("objectivePrompt cannot be empty");
    }
  }

  if ("expectationResults" in subtask) {
    if (typeof subtask.expectationResults !== "string") {
      errors.push("expectationResults must be a string");
    } else if (subtask.expectationResults.trim().length === 0) {
      errors.push("expectationResults cannot be empty");
    }
  }

  if ("done" in subtask) {
    if (typeof subtask.done !== "boolean") {
      errors.push("done must be a boolean");
    }
  }

  return { isValid: errors.length === 0, errors };
}

// Subtask verification system (implements task 5.2)
class SubtaskVerifier {
  static async verify(subtask, result, expectationResults) {
    // Simple verification logic based on expectation results
    const verification = {
      passed: true,
      confidence: 0.8,
      notes: "Subtask completed successfully",
    };

    // Basic checks
    if (!result || typeof result !== "string" || result.trim().length === 0) {
      verification.passed = false;
      verification.confidence = 0.1;
      verification.notes = "No meaningful result produced";
      return verification;
    }

    // Check if result seems to address the expectation
    const resultLower = result.toLowerCase();
    const expectationLower = expectationResults.toLowerCase();

    // Extract key terms from expectation results
    const expectationWords = expectationLower
      .split(/\s+/)
      .filter(
        (word) =>
          word.length > 3 &&
          ![
            "should",
            "will",
            "must",
            "need",
            "have",
            "with",
            "from",
            "that",
            "this",
          ].includes(word)
      );

    // Check if result contains relevant terms
    let matchCount = 0;
    for (const word of expectationWords) {
      if (resultLower.includes(word)) {
        matchCount++;
      }
    }

    const matchRatio =
      expectationWords.length > 0 ? matchCount / expectationWords.length : 0;

    if (matchRatio < 0.2) {
      verification.passed = false;
      verification.confidence = 0.3;
      verification.notes =
        "Result doesn't seem to address the expected outcomes";
    } else if (matchRatio < 0.5) {
      verification.confidence = 0.6;
      verification.notes = "Partial match with expected outcomes";
    } else {
      verification.confidence = Math.min(0.9, 0.5 + matchRatio * 0.4);
      verification.notes = "Good match with expected outcomes";
    }

    return verification;
  }
}

// Execute subtasks sequentially using secondary model (implements task 5.1)
async function executeSubtasks(
  session,
  router,
  requestId,
  webviewProvider = null,
  workspaceRoot = null
) {
  try {
    // Store session for tracking and add webview provider reference
    session.webviewProvider = webviewProvider;
    SessionManager.storeSession(session);

    // Handle concurrent session management
    SessionManager.handleConcurrentSessions();

    let allResults = [];
    let overallSuccess = true;
    let retryCount = 0;
    const maxRetries = 3;

    // Send initial progress update to UI
    await sendProgressUpdate(requestId, {
      type: "subtask_started",
      totalSubtasks: session.subtasks.length,
      currentIndex: 0,
      subtasks: session.subtasks.map((st) => ({
        displayText: st.displayText,
        status: st.status,
      })),
    });

    // Execute each subtask sequentially
    for (let i = 0; i < session.subtasks.length; i++) {
      const subtask = session.subtasks[i];

      try {
        // Update subtask status to in-progress
        subtask.status = "in_progress";
        subtask.startTime = Date.now();
        session.currentSubtaskIndex = i;

        // Send progress update to UI
        await sendProgressUpdate(requestId, {
          type: "subtask_progress",
          subtaskIndex: i,
          status: "in_progress",
          totalSubtasks: session.subtasks.length,
          completed: i,
          percentage: Math.round((i / session.subtasks.length) * 100),
        });

        // Execute subtask with secondary model
        const subtaskResult = await executeSubtask(
          subtask,
          session.secondaryModelId,
          router,
          requestId,
          workspaceRoot,
          session.webviewProvider
        );

        // Verify the result
        const verification = await SubtaskVerifier.verify(
          subtask,
          subtaskResult.text,
          subtask.expectationResults
        );

        // Update subtask with results
        subtask.result = subtaskResult.text;
        subtask.verification = verification;
        subtask.endTime = Date.now();

        if (verification.passed) {
          subtask.status = "completed";
          allResults.push({
            subtask: subtask.displayText,
            result: subtaskResult.text,
            verification: verification,
          });
        } else {
          subtask.status = "failed";
          overallSuccess = false;
          allResults.push({
            subtask: subtask.displayText,
            result: subtaskResult.text,
            verification: verification,
            error: verification.notes,
          });
        }

        // Send progress update to UI
        await sendProgressUpdate(requestId, {
          type: "subtask_progress",
          subtaskIndex: i,
          status: subtask.status,
          totalSubtasks: session.subtasks.length,
          completed: subtask.status === "completed" ? i + 1 : i,
          percentage: Math.round(((i + 1) / session.subtasks.length) * 100),
          verification: verification,
        });
      } catch (error) {
        console.error(`Error executing subtask ${i}:`, error);

        // Implement retry logic for network/temporary errors
        const isRetryableError = isRetryableErrorType(error);
        const shouldRetry = isRetryableError && retryCount < maxRetries;

        if (shouldRetry) {
          retryCount++;
          console.log(
            `Retrying subtask ${i} (attempt ${retryCount}/${maxRetries})`
          );

          // Send retry notification to UI
          await sendProgressUpdate(requestId, {
            type: "subtask_retry",
            subtaskIndex: i,
            retryAttempt: retryCount,
            maxRetries: maxRetries,
            error: error.message,
          });

          // Wait before retry with exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, retryCount) * 1000)
          );

          // Retry the subtask
          i--; // Decrement to retry the same subtask
          continue;
        }

        // Mark subtask as failed after retries exhausted or non-retryable error
        subtask.status = "failed";
        subtask.endTime = Date.now();
        subtask.error = error.message;
        subtask.retryCount = retryCount;
        overallSuccess = false;
        retryCount = 0; // Reset retry count for next subtask

        allResults.push({
          subtask: subtask.displayText,
          error: error.message,
          retryCount: subtask.retryCount,
          verification: {
            passed: false,
            confidence: 0,
            notes: "Execution failed",
          },
        });

        // Send error update to UI
        await sendProgressUpdate(requestId, {
          type: "subtask_progress",
          subtaskIndex: i,
          status: "failed",
          totalSubtasks: session.subtasks.length,
          completed: i,
          percentage: Math.round(((i + 1) / session.subtasks.length) * 100),
          error: error.message,
          retryCount: subtask.retryCount,
          isRetryableError: isRetryableError,
        });
      }
    }

    // Mark session as completed
    session.status = overallSuccess ? "completed" : "failed";

    // Send final completion update
    await sendProgressUpdate(requestId, {
      type: "subtask_completed",
      totalSubtasks: session.subtasks.length,
      completed: session.subtasks.filter((st) => st.status === "completed")
        .length,
      failed: session.subtasks.filter((st) => st.status === "failed").length,
      percentage: 100,
      overallSuccess: overallSuccess,
    });

    // Clean up session
    SessionManager.cleanupSession(requestId);

    // Return comprehensive results
    const completedCount = session.subtasks.filter(
      (st) => st.status === "completed"
    ).length;
    const failedCount = session.subtasks.filter(
      (st) => st.status === "failed"
    ).length;

    return {
      text:
        `Duality mode execution ${
          overallSuccess ? "completed successfully" : "completed with errors"
        }. ` +
        `${completedCount}/${session.subtasks.length} subtasks completed successfully.` +
        (failedCount > 0 ? ` ${failedCount} subtasks failed.` : ""),
      raw: {
        subtasks: allResults,
        session: {
          totalSubtasks: session.subtasks.length,
          completed: completedCount,
          failed: failedCount,
          overallSuccess: overallSuccess,
          executionTime: Date.now() - session.startTime,
        },
      },
      done: true,
      isDualityExecution: true,
    };
  } catch (error) {
    console.error("Error in subtask execution:", error);

    // Clean up session
    SessionManager.cleanupSession(requestId);

    return {
      text: `Error during subtask execution: ${error.message}`,
      raw: { error: error.message },
      done: true,
    };
  }
}

// Execute a single subtask using the secondary model
async function executeSubtask(
  subtask,
  secondaryModelId,
  router,
  requestId,
  workspaceRoot = null,
  webviewProvider = null
) {
  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount <= maxRetries) {
    try {

      // Create execution prompt for secondary model
      const executionPrompt = createSubtaskExecutionPrompt(subtask, workspaceRoot);

      // Prefer running the secondary model through legacy mode so it has access
      // to legacy helpers (file/terminal tools). Use router.runMode if available.
      const executionTimeout = 60000;
      let executionPromise;
      if (router && typeof router.runMode === 'function') {
        // Run legacy mode providing the secondaryModelId as the model to use
        executionPromise = router.runMode('legacy', {
          router,
          modelId: secondaryModelId,
          prompt: executionPrompt,
          requestId,
          webviewProvider,
          context: null,
        });
      } else {
        executionPromise = router.sendPrompt(secondaryModelId, executionPrompt, id, requestId);
      }

      const response = await Promise.race([
        executionPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Subtask execution timeout")), executionTimeout)
        ),
      ]);

      // Validate response
      if (!response) {
        throw new Error("Empty response from secondary model");
      }

      // Extract response text using parser to handle streaming responses
      let responseText = "";
      try {
        // Use the parser to properly extract content from streaming responses
          const parser = require("../route/parser");
          const parsed = parser.parseResponse(response && response.raw !== undefined ? response.raw : response);
          responseText = parsed.plain_text || "";

        // If parser didn't extract anything useful, fall back to direct extraction
          if (!responseText || responseText.trim().length === 0) {
            if (response && typeof response.text === "string") {
              responseText = response.text;
            } else if (response && response.raw !== undefined) {
              responseText = typeof response.raw === "string" ? response.raw : JSON.stringify(response.raw);
            } else if (typeof response === "string") {
              responseText = response;
            }
          }
      } catch (parseError) {
        console.warn(
          "Error parsing subtask response, using fallback extraction:",
          parseError.message
        );
        // Fallback to direct extraction
        if (response && typeof response.text === "string") {
          responseText = response.text;
        } else if (response && response.raw !== undefined) {
          responseText =
            typeof response.raw === "string"
              ? response.raw
              : JSON.stringify(response.raw);
        } else if (typeof response === "string") {
          responseText = response;
        }
      }

      // Validate response content
      if (!responseText || responseText.trim().length === 0) {
        throw new Error("Empty response text from secondary model");
      }

      return {
        text: responseText,
        raw: response,
        retryCount: retryCount,
      };
    } catch (error) {
      retryCount++;

      // Check if error is retryable and we haven't exceeded max retries
      if (retryCount <= maxRetries && isRetryableErrorType(error)) {
        console.warn(
          `Subtask execution attempt ${retryCount} failed, retrying:`,
          error.message
        );

        // Wait before retry with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, retryCount) * 1000)
        );
        continue;
      }

      // If we've exhausted retries or error is not retryable, throw with context
      const errorMessage = `Failed to execute subtask after ${retryCount} attempts: ${error.message}`;
      const enhancedError = new Error(errorMessage);
      enhancedError.originalError = error;
      enhancedError.retryCount = retryCount;
      enhancedError.isRetryable = isRetryableErrorType(error);
      throw enhancedError;
    }
  }
}

// Create execution prompt for secondary model
function createSubtaskExecutionPrompt(subtask, workspaceRoot) {
  return `You are the SECONDARY MODEL in a dual-model system. Your role is to execute the specific subtask assigned to you.

WORKSPACE CONTEXT:
- Current workspace root: ${workspaceRoot}
- Use relative paths from this root for all file operations
- Terminal commands will be executed in this directory

SUBTASK OBJECTIVE:
${subtask.objectivePrompt}

EXPECTED RESULTS:
${subtask.expectationResults}

INSTRUCTIONS:
- Focus solely on completing this specific subtask
- Provide a thorough and complete response
- Include any code, explanations, or actions needed
- Use the correct workspace root for all file and terminal operations
- Be specific and actionable in your response
- Indicate clearly when the subtask is complete

Execute this subtask now:`;
}

// Send progress updates to the UI through webview messaging
async function sendProgressUpdate(requestId, progressData) {
  try {
    console.log(`Progress update for ${requestId}:`, progressData);

    // Get the webview provider instance from the active session
    const session = activeSessions.get(requestId);
    if (session && session.webviewProvider) {
      // Send progress update through webview messaging
      if (
        session.webviewProvider.webviewView &&
        session.webviewProvider.webviewView.webview
      ) {
        session.webviewProvider.webviewView.webview.postMessage({
          command: "dualityModeProgress",
          requestId,
          progressData,
        });
          // Also send a dedicated subtask update for finer-grained UI updates
          try {
            if (progressData && progressData.type === 'subtask_progress') {
              session.webviewProvider.webviewView.webview.postMessage({
                command: 'dualityModeSubtaskUpdate',
                requestId,
                subtaskIndex: progressData.subtaskIndex,
                status: progressData.status,
                result: progressData.result || null,
                verification: progressData.verification || null,
              });
            }
          } catch (err) {
            console.warn('duality progress -> subtask update forwarding failed', err && err.message ? err.message : err);
          }
      }
    }
  } catch (error) {
    console.error("Error sending progress update:", error);
  }
}

// Send error updates to the UI through webview messaging
async function sendErrorUpdate(requestId, errorData, webviewProvider = null) {
  try {
    console.log(`Error update for ${requestId}:`, errorData);

    // Try to get webview provider from session first
    let provider = webviewProvider;
    if (!provider) {
      const session = activeSessions.get(requestId);
      if (session && session.webviewProvider) {
        provider = session.webviewProvider;
      }
    }

    if (provider && provider.webviewView && provider.webviewView.webview) {
      provider.webviewView.webview.postMessage({
        command: "dualityModeError",
        requestId,
        errorData,
      });
    }
  } catch (error) {
    console.error("Error sending error update:", error);
  }
}

async function execute({
  router,
  modelId,
  prompt,
  requestId,
  webviewProvider,
}) {
  if (!router) {
    const error = new Error("Router is required for duality mode");
    await sendErrorUpdate(
      requestId,
      {
        type: "configuration_error",
        message: "Router not configured",
        error: error.message,
        recoverable: false,
      },
      webviewProvider
    );
    throw error;
  }

  // Get workspace root for path resolution and prompt augmentation
  const vscode = require("vscode");
  const workspaceRoot =
    vscode.workspace &&
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : process.cwd();

  // Parse dual model configuration from modelId (format: "primary_model_id|secondary_model_id")
  const modelIds = modelId.split("|");
  const primaryModelId = modelIds[0];
  const secondaryModelId = modelIds[1] || primaryModelId; // fallback to primary if secondary not specified

  // Validate model IDs
  if (!primaryModelId || primaryModelId.trim() === "") {
    const error = new Error("Primary model ID is required");
    await sendErrorUpdate(
      requestId,
      {
        type: "configuration_error",
        message: "Primary model not selected",
        error: error.message,
        recoverable: false,
      },
      webviewProvider
    );
    throw error;
  }

  try {
    // Check duality mode setting
    let forceSubtasks = false;
    try {
      const cfg = vscode.workspace.getConfiguration('vsx');
      forceSubtasks = cfg.get('duality.forceSubtasks', false);
      console.log("🔧 Duality Mode Setting - forceSubtasks:", forceSubtasks);
    } catch (error) {
      console.warn('Could not read duality.forceSubtasks setting:', error);
    }

    let analysisResult;
    
    if (forceSubtasks) {
      // Force subtasks mode - directly ask for subtasks without decision
      console.log("🚀 Duality Mode: Force subtasks enabled, directly creating subtasks");
      
      const subtaskPrompt = createForceSubtaskPrompt(prompt, workspaceRoot);
      console.log("📝 Force Subtask Prompt:", subtaskPrompt);
      
      const subtaskResponse = await router.sendPrompt(
        primaryModelId,
        subtaskPrompt,
        id,
        requestId
      );

      console.log("🤖 Raw Force Subtask Response:", {
        text: subtaskResponse?.text,
        raw: subtaskResponse?.raw,
        fullResponse: subtaskResponse,
      });

      // Prefer using the shared parser when available so responses from
      // non-Gemini providers (NVIDIA, Cerebras) are normalized the same way
      let responseText = "";
      try {
        const parser = require("../route/parser");
        const parsed = parser.parseResponse(
          subtaskResponse && subtaskResponse.raw !== undefined
            ? subtaskResponse.raw
            : subtaskResponse
        );
        responseText = parsed.plain_text || subtaskResponse.text || "";
      } catch (err) {
        console.warn('parser.parseResponse failed for force-subtask response', err && err.message ? err.message : err);
        // Fallback to safe extraction
        responseText = subtaskResponse && subtaskResponse.text
          ? subtaskResponse.text
          : subtaskResponse && subtaskResponse.raw
          ? typeof subtaskResponse.raw === "string"
            ? subtaskResponse.raw
            : JSON.stringify(subtaskResponse.raw)
          : JSON.stringify(subtaskResponse);
      }

      console.log("📄 Response Text for Parsing:", responseText);

      // Parse the subtask response
      analysisResult = parseTaskAnalysisResponse(responseText);
      
      console.log("🔍 Force Subtask Parse Result:", {
        success: analysisResult.success,
        data: analysisResult.data,
        error: analysisResult.error,
        fullResult: analysisResult
      });

      // Force needsSubtasks to true since we're in force mode
      if (analysisResult.success && analysisResult.data) {
        analysisResult.data.needsSubtasks = true;
        console.log("✅ Forced needsSubtasks to true");
      } else {
        console.log("❌ Failed to parse force subtask response - will fall back to legacy mode");
      }
    } else {
      // Auto-decide mode - let primary model decide
      console.log(
        "🤔 Duality Mode: Auto-decide mode, analyzing task complexity with primary model:",
        primaryModelId
      );

      const analysisPrompt = createTaskAnalysisPrompt(prompt, workspaceRoot);
      console.log("📝 Analysis Prompt:", analysisPrompt);
      
      const analysisResponse = await router.sendPrompt(
        primaryModelId,
        analysisPrompt,
        id,
        requestId
      );

      console.log("🤖 Raw Analysis Response:", {
        text: analysisResponse?.text,
        raw: analysisResponse?.raw,
        fullResponse: analysisResponse,
      });

      // Prefer the shared parser to extract plain_text for non-Gemini providers
      let responseText = "";
      try {
        const parser = require("../route/parser");
        const parsed = parser.parseResponse(
          analysisResponse && analysisResponse.raw !== undefined
            ? analysisResponse.raw
            : analysisResponse
        );
        responseText = parsed.plain_text || analysisResponse.text || "";
      } catch (err) {
        console.warn('parser.parseResponse failed for analysis response', err && err.message ? err.message : err);
        responseText = analysisResponse && analysisResponse.text
          ? analysisResponse.text
          : analysisResponse && analysisResponse.raw
          ? typeof analysisResponse.raw === "string"
            ? analysisResponse.raw
            : JSON.stringify(analysisResponse.raw)
          : JSON.stringify(analysisResponse);
      }

      console.log("📄 Response Text for Parsing:", responseText);

      // Parse the analysis response
      analysisResult = parseTaskAnalysisResponse(responseText);
      
      console.log("🔍 Analysis Parse Result:", {
        success: analysisResult.success,
        data: analysisResult.data,
        error: analysisResult.error,
        fullResult: analysisResult
      });
    }

    // If parsing failed or task is simple, fall back to legacy mode
    console.log("🔍 Decision Check:", {
      analysisSuccess: analysisResult.success,
      hasData: !!analysisResult.data,
      needsSubtasks: analysisResult.data?.needsSubtasks,
      forceSubtasks: forceSubtasks,
      willFallbackToLegacy: !analysisResult.success || !analysisResult.data?.needsSubtasks
    });

    if (!analysisResult.success || !analysisResult.data?.needsSubtasks) {
      console.log(
        "⚠️ Duality Mode: Task is simple or analysis failed, executing in legacy mode"
      );
      
      if (!analysisResult.success) {
        console.log("❌ Analysis failed - reason:", analysisResult.error);
      } else if (!analysisResult.data?.needsSubtasks) {
        console.log("📝 Analysis succeeded but needsSubtasks is false");
      }

      // Send primary model decision to UI
      if (
        webviewProvider &&
        webviewProvider.webviewView &&
        webviewProvider.webviewView.webview
      ) {
        webviewProvider.webviewView.webview.postMessage({
          command: "dualityModePrimaryDecision",
          requestId,
          primaryModelId,
          secondaryModelId,
          primaryDecision: {
            needsSubtasks: false,
            reasoning: forceSubtasks 
              ? "Force subtasks mode enabled, but task execution failed - executing directly"
              : analysisResult.success 
                ? "Task is simple enough to execute directly" 
                : "Task analysis failed, executing as single task"
          },
        });
      }

      // Execute in legacy mode
      const legacyMode = require("./legacy");
      return await legacyMode.execute({
        router,
        modelId: primaryModelId, // Use primary model for legacy execution
        prompt,
        requestId,
        webviewProvider,
      });
    }

    // Step 2: Task is complex, create session and execute subtasks
    console.log("🎉 Duality Mode: Task is complex, creating subtasks");
    console.log("📋 Subtasks to create:", analysisResult.data.subtasks);

    const session = new DualitySession(
      requestId,
      primaryModelId,
      secondaryModelId
    );
    session.addSubtasks(analysisResult.data.subtasks);
    
    console.log("✅ Session created with subtasks:", session.subtasks.length);

    // Send primary model decision and subtasks to UI for display
    if (
      webviewProvider &&
      webviewProvider.webviewView &&
      webviewProvider.webviewView.webview
    ) {
      webviewProvider.webviewView.webview.postMessage({
        command: "dualityModeSubtasksCreated",
        requestId,
        primaryModelId,
        secondaryModelId,
        primaryDecision: {
          needsSubtasks: true,
          reasoning: forceSubtasks 
            ? "Force subtasks mode enabled - task will be subdivided into steps"
            : "Task complexity requires subdivision into manageable steps"
        },
        subtasks: session.subtasks.map((st) => ({
          displayText: st.displayText,
          status: st.status,
          expectationResults: st.expectationResults,
        })),
      });
    }

    // Step 3: Execute subtasks sequentially using secondary model
    return await executeSubtasks(
      session,
      router,
      requestId,
      webviewProvider,
      workspaceRoot
    );
  } catch (error) {
    console.error("Error in duality mode execution:", error);

    // Send error update to UI
    await sendErrorUpdate(
      requestId,
      {
        type: "execution_error",
        message: "Duality mode execution failed",
        error: error.message,
        recoverable: true,
      },
      webviewProvider
    );

    // Fall back to legacy mode on error
    console.log("Duality Mode: Falling back to legacy mode due to error");
    try {
      const legacyMode = require("./legacy");
      return await legacyMode.execute({
        router,
        modelId: primaryModelId,
        prompt,
        requestId,
        webviewProvider,
      });
    } catch (legacyError) {
      throw new Error(
        `Duality mode failed: ${error.message}. Legacy fallback also failed: ${legacyError.message}`
      );
    }
  }
}

// Helper function to determine if an error is retryable
function isRetryableErrorType(error) {
  if (!error) return false;

  const errorMessage = error.message || String(error);
  const retryablePatterns = [
    /network/i,
    /timeout/i,
    /connection/i,
    /rate limit/i,
    /429/,
    /502/,
    /503/,
    /504/,
    /ECONNRESET/,
    /ENOTFOUND/,
    /ETIMEDOUT/,
    /fetch failed/i,
    /request failed/i,
    /temporary/i,
    /unavailable/i,
  ];

  return retryablePatterns.some((pattern) => pattern.test(errorMessage));
}

// Helper function to normalize response format

module.exports = {
  id,
  name,
  execute,
  wrappers,
  tagline,
  DualitySession,
  SubtaskVerifier,
  SessionManager,
  validateSubtaskStructure,
  parseTaskAnalysisResponse,
  createTaskAnalysisPrompt,
  executeSubtasks,
  executeSubtask,
  activeSessions,
  sessionStorage,
};
