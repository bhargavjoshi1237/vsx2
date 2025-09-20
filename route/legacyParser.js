/**
 * Legacy Mode JSON Parser and Validator
 * Handles parsing and validation of LLM JSON responses with graceful error handling
 */

/**
 * Expected JSON schema for Legacy Mode responses
 */
const LEGACY_RESPONSE_SCHEMA = {
  type: 'string',
  phase: 'string',
  todos: 'array',
  toolCall: 'object',
  verification: 'object',
  message: 'string',
  complete: 'boolean'
};

/**
 * Valid phase values
 */
const VALID_PHASES = ['planning', 'execution', 'verification', 'complete'];

/**
 * Valid TODO status values
 */
const VALID_TODO_STATUSES = ['pending', 'in_progress', 'done', 'failed'];

/**
 * Parse and validate Legacy Mode JSON response
 * @param {string} rawResponse - Raw response from LLM
 * @returns {Object} Parsed and validated response object
 */
function parseLegacyResponse(rawResponse) {
  const { errorHandler, LegacyModeError, ERROR_CATEGORIES } = require('../legacy/errorHandler');
  
  try {
    // Handle null/undefined input
    if (rawResponse === null || rawResponse === undefined) {
      throw new LegacyModeError('Input is null or undefined', {
        category: ERROR_CATEGORIES.VALIDATION,
        code: 'NULL_INPUT',
        context: { rawResponse }
      });
    }
    
    if (typeof rawResponse !== 'string') {
      throw new LegacyModeError('Input must be a string', {
        category: ERROR_CATEGORIES.VALIDATION,
        code: 'INVALID_INPUT_TYPE',
        context: { type: typeof rawResponse, rawResponse }
      });
    }
    
    // First attempt to parse as JSON
    let jsonObj;
    try {
      jsonObj = JSON.parse(rawResponse);
    } catch (parseError) {
      console.warn('JSON parsing failed, attempting graceful recovery:', parseError.message);
      
      try {
        jsonObj = attemptJsonRecovery(rawResponse);
      } catch (recoveryError) {
        throw new LegacyModeError('JSON parsing and recovery both failed', {
          category: ERROR_CATEGORIES.PARSING,
          code: 'JSON_PARSE_FAILED',
          context: { 
            originalError: parseError.message,
            recoveryError: recoveryError.message,
            rawResponse: rawResponse.substring(0, 500) + '...'
          },
          originalError: parseError
        });
      }
    }

    // Validate and reconstruct the JSON structure
    const validatedResponse = validateJsonStructure(jsonObj);
    
    console.log('Successfully parsed Legacy Mode response:', validatedResponse);
    return validatedResponse;

  } catch (error) {
    if (error instanceof LegacyModeError) {
      console.error('Failed to parse Legacy Mode response:', error.toJSON());
      throw error;
    }
    
    const handledError = errorHandler.handleError(error, {
      context: 'legacy_response_parsing',
      rawResponse: rawResponse ? rawResponse.substring(0, 200) + '...' : null
    });
    
    console.error('Failed to parse Legacy Mode response:', handledError.toJSON());
    
    // Return a fallback response structure instead of throwing
    return createFallbackResponse(rawResponse, handledError);
  }
}

/**
 * Attempt to recover from malformed JSON using regex patterns
 * @param {string} rawResponse - Raw malformed response
 * @returns {Object} Recovered JSON object
 */
function attemptJsonRecovery(rawResponse) {
  const { LegacyModeError, ERROR_CATEGORIES } = require('../legacy/errorHandler');
  
  console.log('Attempting JSON recovery for malformed response');
  
  if (!rawResponse || typeof rawResponse !== 'string') {
    throw new LegacyModeError('Cannot recover from null or non-string input', {
      category: ERROR_CATEGORIES.PARSING,
      code: 'INVALID_RECOVERY_INPUT'
    });
  }
  
  const recovered = {};
  
  // Try to extract common fields using regex patterns
  try {
    // Extract type with better error handling
    const typeMatch = rawResponse.match(/"type"\s*:\s*"([^"]+)"/);
    if (typeMatch) {
      recovered.type = typeMatch[1];
    } else {
      console.warn('Could not extract type field during recovery');
    }
    
    // Extract phase with validation
    const phaseMatch = rawResponse.match(/"phase"\s*:\s*"([^"]+)"/);
    if (phaseMatch) {
      const phase = phaseMatch[1];
      if (VALID_PHASES.includes(phase)) {
        recovered.phase = phase;
      } else {
        console.warn(`Invalid phase extracted during recovery: ${phase}`);
        recovered.phase = 'execution'; // Default fallback
      }
    }
    
    // Extract message with length validation
    const messageMatch = rawResponse.match(/"message"\s*:\s*"([^"]+)"/);
    if (messageMatch) {
      recovered.message = messageMatch[1].substring(0, 1000); // Limit message length
    }
    
    // Extract complete boolean with validation
    const completeMatch = rawResponse.match(/"complete"\s*:\s*(true|false)/);
    if (completeMatch) {
      recovered.complete = completeMatch[1] === 'true';
    }
    
    // Try to extract todos array with better error handling
    const todosMatch = rawResponse.match(/"todos"\s*:\s*\[([^\]]*)\]/s);
    if (todosMatch) {
      try {
        const todosStr = `[${todosMatch[1]}]`;
        recovered.todos = JSON.parse(todosStr);
        
        // Validate todos structure
        if (!Array.isArray(recovered.todos)) {
          recovered.todos = [];
        }
      } catch (todosError) {
        console.warn('Failed to parse todos during recovery:', todosError.message);
        recovered.todos = [];
      }
    } else {
      recovered.todos = [];
    }
    
    // Try to extract toolCall object with validation
    const toolCallMatch = rawResponse.match(/"toolCall"\s*:\s*\{([^}]*)\}/s);
    if (toolCallMatch) {
      try {
        const toolCallStr = `{${toolCallMatch[1]}}`;
        const toolCall = JSON.parse(toolCallStr);
        
        // Validate toolCall structure
        if (toolCall && typeof toolCall === 'object' && toolCall.tool) {
          recovered.toolCall = toolCall;
        } else {
          recovered.toolCall = null;
        }
      } catch (toolCallError) {
        console.warn('Failed to parse toolCall during recovery:', toolCallError.message);
        recovered.toolCall = null;
      }
    } else {
      recovered.toolCall = null;
    }
    
    // Try to extract verification object
    const verificationMatch = rawResponse.match(/"verification"\s*:\s*\{([^}]*)\}/s);
    if (verificationMatch) {
      try {
        const verificationStr = `{${verificationMatch[1]}}`;
        const verification = JSON.parse(verificationStr);
        
        // Validate verification structure
        if (verification && typeof verification === 'object') {
          recovered.verification = verification;
        } else {
          recovered.verification = null;
        }
      } catch (verificationError) {
        console.warn('Failed to parse verification during recovery:', verificationError.message);
        recovered.verification = null;
      }
    } else {
      recovered.verification = null;
    }
    
    // Ensure we have at least some valid data
    if (Object.keys(recovered).length === 0) {
      throw new LegacyModeError('No valid fields could be recovered from malformed JSON', {
        category: ERROR_CATEGORIES.PARSING,
        code: 'RECOVERY_FAILED',
        context: { rawResponse: rawResponse.substring(0, 200) + '...' }
      });
    }
    
    console.log('JSON recovery successful:', recovered);
    return recovered;
    
  } catch (recoveryError) {
    if (recoveryError instanceof LegacyModeError) {
      throw recoveryError;
    }
    
    console.error('JSON recovery failed:', recoveryError);
    throw new LegacyModeError(`JSON recovery failed: ${recoveryError.message}`, {
      category: ERROR_CATEGORIES.PARSING,
      code: 'RECOVERY_ERROR',
      context: { 
        originalError: recoveryError.message,
        rawResponse: rawResponse.substring(0, 200) + '...'
      },
      originalError: recoveryError
    });
  }
}

/**
 * Validate JSON structure and add missing fields with placeholders
 * @param {Object} jsonObj - Parsed JSON object
 * @returns {Object} Validated and reconstructed JSON object
 */
function validateJsonStructure(jsonObj) {
  if (!jsonObj || typeof jsonObj !== 'object') {
    throw new Error('Invalid JSON: Expected object, got ' + typeof jsonObj);
  }
  
  const validated = reconstructWithPlaceholders(jsonObj, LEGACY_RESPONSE_SCHEMA);
  
  // Additional validation for specific fields
  validatePhase(validated.phase);
  validateTodos(validated.todos);
  validateToolCall(validated.toolCall);
  validateVerification(validated.verification);
  
  return validated;
}

/**
 * Reconstruct JSON object with placeholders for missing fields
 * @param {Object} jsonObj - Original JSON object
 * @param {Object} expectedSchema - Expected schema structure
 * @returns {Object} Reconstructed object with placeholders
 */
function reconstructWithPlaceholders(jsonObj) {
  const reconstructed = { ...jsonObj };
  
  // Add missing fields with appropriate defaults
  if (!reconstructed.type) {
    reconstructed.type = 'legacy_response';
    console.warn('Missing "type" field, using default: legacy_response');
  }
  
  if (!reconstructed.phase) {
    reconstructed.phase = 'execution';
    console.warn('Missing "phase" field, using default: execution');
  }
  
  if (!reconstructed.todos) {
    reconstructed.todos = [];
    console.warn('Missing "todos" field, using empty array');
  }
  
  if (!reconstructed.hasOwnProperty('toolCall')) {
    reconstructed.toolCall = null;
    console.warn('Missing "toolCall" field, using null');
  }
  
  if (!reconstructed.hasOwnProperty('verification')) {
    reconstructed.verification = null;
    console.warn('Missing "verification" field, using null');
  }
  
  if (!reconstructed.message) {
    reconstructed.message = 'Processing request...';
    console.warn('Missing "message" field, using default message');
  }
  
  if (!reconstructed.hasOwnProperty('complete')) {
    reconstructed.complete = false;
    console.warn('Missing "complete" field, using default: false');
  }
  
  return reconstructed;
}

/**
 * Validate phase field
 * @param {string} phase - Phase value to validate
 */
function validatePhase(phase) {
  if (typeof phase !== 'string') {
    throw new Error(`Invalid phase type: expected string, got ${typeof phase}`);
  }
  
  if (!VALID_PHASES.includes(phase)) {
    console.warn(`Invalid phase value: ${phase}. Valid phases: ${VALID_PHASES.join(', ')}`);
  }
}

/**
 * Validate todos array
 * @param {Array} todos - Todos array to validate
 */
function validateTodos(todos) {
  if (!Array.isArray(todos)) {
    throw new Error(`Invalid todos type: expected array, got ${typeof todos}`);
  }
  
  todos.forEach((todo, index) => {
    if (!todo || typeof todo !== 'object') {
      throw new Error(`Invalid todo at index ${index}: expected object, got ${typeof todo}`);
    }
    
    // Validate required todo fields
    if (!todo.id) {
      console.warn(`TODO at index ${index} missing id field`);
    }
    
    if (!todo.description) {
      console.warn(`TODO at index ${index} missing description field`);
    }
    
    if (todo.status && !VALID_TODO_STATUSES.includes(todo.status)) {
      console.warn(`TODO at index ${index} has invalid status: ${todo.status}`);
    }
  });
}

/**
 * Validate toolCall object
 * @param {Object|null} toolCall - Tool call object to validate
 */
function validateToolCall(toolCall) {
  if (toolCall === null || toolCall === undefined) {
    return; // null/undefined is valid
  }
  
  if (typeof toolCall !== 'object') {
    throw new Error(`Invalid toolCall type: expected object or null, got ${typeof toolCall}`);
  }
  
  if (!toolCall.tool) {
    console.warn('ToolCall missing "tool" field');
  }
  
  if (!toolCall.params) {
    console.warn('ToolCall missing "params" field');
  }
}

/**
 * Validate verification object
 * @param {Object|null} verification - Verification object to validate
 */
function validateVerification(verification) {
  if (verification === null || verification === undefined) {
    return; // null/undefined is valid
  }
  
  if (typeof verification !== 'object') {
    throw new Error(`Invalid verification type: expected object or null, got ${typeof verification}`);
  }
  
  if (!verification.todoId) {
    console.warn('Verification missing "todoId" field');
  }
  
  if (typeof verification.approved !== 'boolean') {
    console.warn('Verification missing or invalid "approved" field');
  }
}

/**
 * Create fallback response when parsing completely fails
 * @param {string} rawResponse - Original raw response
 * @param {Error} error - The error that occurred
 * @returns {Object} Fallback response object
 */
function createFallbackResponse(rawResponse, error) {
  console.error('Creating fallback response due to parsing failure');
  
  const responsePreview = rawResponse ? rawResponse.substring(0, 200) : 'null';
  
  return {
    type: 'legacy_response',
    phase: 'execution',
    todos: [],
    toolCall: null,
    verification: null,
    message: `Error parsing response: ${error.message}. Raw response: ${responsePreview}...`,
    complete: false,
    parseError: true,
    originalResponse: rawResponse
  };
}

/**
 * Check if a response indicates parsing error
 * @param {Object} response - Parsed response object
 * @returns {boolean} True if response has parsing error
 */
function hasParseError(response) {
  return !!(response && response.parseError === true);
}

/**
 * Get validation summary for a parsed response
 * @param {Object} response - Parsed response object
 * @returns {Object} Validation summary
 */
function getValidationSummary(response) {
  return {
    isValid: !hasParseError(response),
    hasRequiredFields: !!(response.type && response.phase && response.message),
    phase: response.phase,
    todoCount: response.todos ? response.todos.length : 0,
    hasToolCall: !!response.toolCall,
    hasVerification: !!response.verification,
    isComplete: response.complete === true
  };
}

module.exports = {
  parseLegacyResponse,
  validateJsonStructure,
  reconstructWithPlaceholders,
  attemptJsonRecovery,
  createFallbackResponse,
  hasParseError,
  getValidationSummary,
  LEGACY_RESPONSE_SCHEMA,
  VALID_PHASES,
  VALID_TODO_STATUSES
};