import { runGeminiTask } from '../services/aiClassificationService.js';

// Security: Sanitize string inputs to prevent prompt injection by escaping double quotes.
const escapeQuotes = (str) => (typeof str === 'string' ? str.replace(/"/g, '\\"') : str);

// Security: Sanitize output strings to prevent XSS by encoding HTML special characters.
const sanitizeForXSS = (str) => {
  if (typeof str !== 'string' || str === null) return str;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
};

/**
 * @module ScheduleDetectionService
 * @description Provides services for detecting scheduling requirements, parsing schedule expressions,
 * and generating workflow metadata using AI models, with fallback mechanisms.
 */

/**
 * Detects if a user's input implies a need for scheduling a workflow, immediate execution,
 * or manual triggering. It leverages an AI model for sophisticated analysis and includes
 * a keyword-based fallback mechanism.
 *
 * @async
 * @function detectSchedulingRequirements
 * @param {string} userInput - The natural language input from the user.
 * @param {Array<Object>} [conversationContext=[]] - Optional. An array of previous conversation turns to provide context.
 * @returns {Promise<Object>} A promise that resolves to an object containing the detection result.
 * @returns {boolean} returns.success - Indicates if the detection was successful.
 * @returns {Object} returns.data - The parsed scheduling detection data.
 * @returns {boolean} returns.data.requiresScheduling - True if scheduling is required, false otherwise.
 * @returns {'immediate'|'manual'|'scheduled'|'recurring'} returns.data.triggerType - The type of trigger detected.
 * @returns {string|null} returns.data.scheduleExpression - The natural language schedule expression detected, or null.
 * @returns {Object} returns.data.scheduleConfig - Configuration details for the schedule.
 * @returns {string|null} returns.data.scheduleConfig.triggerDate - ISO date string for a specific trigger date, or null.
 * @returns {string|null} returns.data.scheduleConfig.cronExpression - Cron expression for recurring schedules, or null.
 * @returns {'daily'|'weekly'|'monthly'|'custom'|'hourly'|null} returns.data.scheduleConfig.recurrencePattern - Detected recurrence pattern, or null.
 * @returns {string} returns.data.scheduleConfig.timezone - The timezone for the schedule (e.g., 'UTC').
 * @returns {number} returns.data.confidence - A confidence score for the detection.
 * @returns {string} returns.data.reasoning - An explanation of the detection.
 * @returns {string|null} returns.data.workflowTitle - A suggested title for the workflow, or null.
 * @returns {string|null} returns.data.workflowDescription - A suggested description for the workflow, or null.
 */
export const detectSchedulingRequirements = async (
  userInput,
  conversationContext = []
) => {
  const systemPrompt = `You are an expert schedule detection system. Analyze user input to determine if they want to:
1. Execute immediately (right now)
2. Save as workflow for manual trigger later
3. Schedule for specific date/time
4. Set up recurring automation

SCHEDULING KEYWORDS TO DETECT:
- Manual trigger: "create workflow", "save for later", "don't run yet", "set up automation", "create automation"
- Scheduled: "tomorrow", "next week", "at 3 PM", "on Friday", "schedule for", "run at"
- Recurring: "daily", "weekly", "every day", "every Monday", "monthly", "every hour"

You must respond with ONLY a valid JSON object.`;

  // Security: Sanitize user input to prevent prompt injection.
  const sanitizedUserInput = escapeQuotes(userInput);

  const userPrompt = `USER INPUT: "${sanitizedUserInput}"

CONVERSATION CONTEXT: ${JSON.stringify(conversationContext)}

Analyze the input and determine scheduling requirements. Look for:
1. Time expressions (tomorrow, 3 PM, Friday, etc.)
2. Workflow creation keywords (create workflow, save for later, etc.)
3. Recurring patterns (daily, weekly, etc.)
4. Immediate execution (no scheduling mentioned)

Respond with a JSON object:
{
  "requiresScheduling": true|false,
  "triggerType": "immediate|manual|scheduled|recurring",
  "scheduleExpression": "parsed_schedule_or_null",
  "scheduleConfig": {
    "triggerDate": "ISO_date_or_null",
    "cronExpression": "cron_expression_or_null",
    "recurrencePattern": "daily|weekly|monthly|custom|null",
    "timezone": "UTC"
  },
  "confidence": 0.95,
  "reasoning": "explanation of detection",
  "workflowTitle": "suggested_title_or_null",
  "workflowDescription": "suggested_description_or_null"
}`;

  try {
    const result = await runGeminiTask(userPrompt, systemPrompt);

    let cleanedResult = result;
    if (result.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = result.replace(regex, '').trim();
    }

    // Robustly remove markdown code block wrappers
    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    } else if (cleanedResult.startsWith('```')) { // Handle generic code block if not specifically JSON
      cleanedResult = cleanedResult
        .replace(/```\s*/, '')
        .replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanedResult);
    console.log('Schedule detection result:', parsed);

    // Validate structure
    if (typeof parsed.requiresScheduling !== 'boolean' || !parsed.triggerType) {
      throw new Error('Invalid schedule detection structure');
    }

    // Security: Sanitize AI-generated output to prevent XSS before returning.
    const sanitizedData = {
      ...parsed,
      scheduleExpression: sanitizeForXSS(parsed.scheduleExpression),
      reasoning: sanitizeForXSS(parsed.reasoning),
      workflowTitle: sanitizeForXSS(parsed.workflowTitle),
      workflowDescription: sanitizeForXSS(parsed.workflowDescription),
    };

    return {
      success: true,
      data: sanitizedData,
    };
  } catch (error) {
    console.error('Error in detectSchedulingRequirements:', error);

    // Fallback detection based on keywords
    const fallbackDetection = fallbackScheduleDetection(userInput);

    // Security: Sanitize fallback output to prevent XSS before returning.
    const sanitizedFallbackData = {
      ...fallbackDetection,
      scheduleExpression: sanitizeForXSS(fallbackDetection.scheduleExpression),
      reasoning: sanitizeForXSS(fallbackDetection.reasoning),
    };

    return {
      success: true,
      data: sanitizedFallbackData,
    };
  }
};

/**
 * Converts a natural language schedule expression into a cron expression using an AI model.
 * It also provides a human-readable description and an estimated next execution date.
 *
 * @async
 * @function parseScheduleExpression
 * @param {string} scheduleExpression - The natural language schedule expression (e.g., "every Monday at 9 AM").
 * @param {string} [timezone='UTC'] - Optional. The timezone to consider for the schedule.
 * @returns {Promise<Object>} A promise that resolves to an object containing the parsed cron expression.
 * @returns {boolean} returns.success - Indicates if the parsing was successful.
 * @returns {Object} returns.data - The parsed schedule data.
 * @returns {string|null} returns.data.cronExpression - The generated cron expression, or null if parsing failed.
 * @returns {string} returns.data.description - A human-readable description of the cron expression.
 * @returns {string|null} returns.data.nextExecution - An estimated ISO date string for the next execution, or null.
 * @returns {boolean} returns.data.isValid - True if the cron expression is considered valid, false otherwise.
 * @returns {string} returns.data.timezone - The timezone used for parsing.
 * @returns {string} [returns.error] - An error message if parsing failed.
 */
export const parseScheduleExpression = async (
  scheduleExpression,
  timezone = 'UTC'
) => {
  const systemPrompt = `You are an expert cron expression generator. Convert natural language schedule expressions into valid cron expressions.

CRON FORMAT: minute hour day_of_month month day_of_week
Examples:
- "0 9 * * *" = Every day at 9 AM
- "0 17 * * 1" = Every Monday at 5 PM  
- "0 0 1 * *" = First day of every month at midnight
- "*/30 * * * *" = Every 30 minutes

You must respond with ONLY a valid JSON object.`;

  // Security: Sanitize user input to prevent prompt injection.
  const sanitizedScheduleExpression = escapeQuotes(scheduleExpression);

  const userPrompt = `SCHEDULE EXPRESSION: "${sanitizedScheduleExpression}"
TIMEZONE: ${timezone}

Convert this natural language expression to a cron expression. Consider:
1. Time expressions (9 AM, 5 PM, noon, midnight)
2. Day patterns (daily, Monday, weekends, first of month)
3. Frequency (every hour, every 30 minutes, weekly)

Respond with a JSON object:
{
  "cronExpression": "valid_cron_expression",
  "description": "human_readable_description",
  "nextExecution": "estimated_next_run_iso_date",
  "isValid": true|false,
  "timezone": "${timezone}"
}`;

  try {
    const result = await runGeminiTask(userPrompt, systemPrompt);

    let cleanedResult = result;
    if (result.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = result.replace(regex, '').trim();
    }

    // Robustly remove markdown code block wrappers
    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    } else if (cleanedResult.startsWith('```')) { // Handle generic code block if not specifically JSON
      cleanedResult = cleanedResult
        .replace(/```\s*/, '')
        .replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanedResult);

    // Security: Sanitize AI-generated output to prevent XSS before returning.
    const sanitizedData = {
      ...parsed,
      description: sanitizeForXSS(parsed.description),
      nextExecution: sanitizeForXSS(parsed.nextExecution),
    };

    return {
      success: true,
      data: sanitizedData,
    };
  } catch (error) {
    console.error('Error in parseScheduleExpression:', error);

    return {
      success: false,
      error: error.message,
      data: {
        cronExpression: null,
        description: 'Failed to parse schedule',
        isValid: false,
        timezone,
      },
    };
  }
};

/**
 * Generates a title, description, and tags for a workflow based on user input,
 * an execution plan, and the applications required. It uses an AI model for
 * intelligent naming and description generation.
 *
 * @async
 * @function generateWorkflowMetadata
 * @param {string} userInput - The original natural language input from the user.
 * @param {Array<Object>} executionPlan - The structured plan of actions for the workflow.
 * @param {Array<string>} requiredApps - An array of application names required for the workflow.
 * @returns {Promise<Object>} A promise that resolves to an object containing the generated metadata.
 * @returns {boolean} returns.success - Indicates if the metadata generation was successful.
 * @returns {Object} returns.data - The generated workflow metadata.
 * @returns {string} returns.data.title - A descriptive title for the workflow.
 * @returns {string} returns.data.description - A detailed description of the workflow.
 * @returns {Array<string>} returns.data.tags - An array of relevant tags for categorization.
 */
export const generateWorkflowMetadata = async (
  userInput,
  executionPlan,
  requiredApps
) => {
  const systemPrompt = `You are an expert workflow naming system. Generate clear, descriptive titles and descriptions for automation workflows based on user input and execution plans.

TITLE GUIDELINES:
- Keep it short and descriptive (max 50 characters)
- Use action verbs
- Mention key apps or actions
- Be user-friendly

DESCRIPTION GUIDELINES:  
- Explain what the workflow does
- Mention apps involved
- Describe the sequence of actions
- Keep it under 200 characters

You must respond with ONLY a valid JSON object.`;

  // Security: Sanitize user input to prevent prompt injection.
  const sanitizedUserInput = escapeQuotes(userInput);
  const sanitizedApps = requiredApps.map(escapeQuotes);

  const userPrompt = `USER INPUT: "${sanitizedUserInput}"

REQUIRED APPS: ${sanitizedApps.join(', ')}

EXECUTION PLAN: ${JSON.stringify(executionPlan, null, 2)}

Generate a title and description for this workflow. Make it clear what the automation does and which apps it uses.

Respond with a JSON object:
{
  "title": "descriptive_workflow_title",
  "description": "detailed_workflow_description",
  "tags": ["relevant", "tags", "for", "categorization"]
}`;

  try {
    const result = await runGeminiTask(userPrompt, systemPrompt);

    let cleanedResult = result;
    if (result.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = result.replace(regex, '').trim();
    }

    // Robustly remove markdown code block wrappers
    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    } else if (cleanedResult.startsWith('```')) { // Handle generic code block if not specifically JSON
      cleanedResult = cleanedResult
        .replace(/```\s*/, '')
        .replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanedResult);

    // Security: Sanitize AI-generated output to prevent XSS before returning.
    const sanitizedData = {
      ...parsed,
      title: sanitizeForXSS(parsed.title),
      description: sanitizeForXSS(parsed.description),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(sanitizeForXSS) : [],
    };

    return {
      success: true,
      data: sanitizedData,
    };
  } catch (error) {
    console.error('Error in generateWorkflowMetadata:', error);

    // Fallback metadata generation
    const fallbackTitle = generateFallbackTitle(userInput, requiredApps);

    return {
      success: true,
      data: {
        // Security: Sanitize fallback output to prevent XSS before returning.
        title: sanitizeForXSS(fallbackTitle),
        description: `Automated workflow: ${sanitizeForXSS(userInput)}`,
        tags: requiredApps.map(sanitizeForXSS),
      },
    };
  }
};

/**
 * Provides a basic, keyword-based fallback for schedule detection when AI parsing fails.
 * It checks for common keywords related to immediate, manual, scheduled, and recurring triggers.
 *
 * @private
 * @function fallbackScheduleDetection
 * @param {string} userInput - The natural language input from the user.
 * @returns {Object} An object containing the fallback schedule detection result.
 * @returns {boolean} returns.requiresScheduling - True if scheduling is required, false otherwise.
 * @returns {'immediate'|'manual'|'scheduled'|'recurring'} returns.triggerType - The type of trigger detected.
 * @returns {string|null} returns.scheduleExpression - The natural language schedule expression detected, or null.
 * @returns {Object} returns.scheduleConfig - Configuration details for the schedule.
 * @returns {string|null} returns.scheduleConfig.triggerDate - ISO date string for a specific trigger date, or null.
 * @returns {string|null} returns.scheduleConfig.cronExpression - Cron expression for recurring schedules, or null.
 * @returns {'daily'|'weekly'|'monthly'|'custom'|'hourly'|null} returns.scheduleConfig.recurrencePattern - Detected recurrence pattern, or null.
 * @returns {string} returns.scheduleConfig.timezone - The timezone for the schedule (e.g., 'UTC').
 * @returns {number} returns.confidence - A confidence score for the detection.
 * @returns {string} returns.reasoning - An explanation of the detection.
 * @returns {string|null} returns.workflowTitle - A suggested title for the workflow, or null.
 * @returns {string|null} returns.workflowDescription - A suggested description for the workflow, or null.
 */
const fallbackScheduleDetection = (userInput) => {
  const input = userInput.toLowerCase();

  // Check for workflow creation keywords
  const workflowKeywords = [
    'create workflow',
    'save for later',
    'set up automation',
    'create automation',
    "don't run yet",
    'save as workflow',
  ];

  const isWorkflowCreation = workflowKeywords.some((keyword) =>
    input.includes(keyword)
  );

  // Check for schedule keywords
  const scheduleKeywords = [
    'tomorrow',
    'next week',
    'schedule for',
    'run at',
    'at 3 pm',
    'on friday',
    'every day',
    'daily',
    'weekly',
    'monthly',
  ];

  const hasSchedule = scheduleKeywords.some((keyword) =>
    input.includes(keyword)
  );

  // Check for recurring keywords
  const recurringKeywords = [
    'daily',
    'weekly',
    'monthly',
    'every day',
    'every hour',
  ];
  const isRecurring = recurringKeywords.some((keyword) =>
    input.includes(keyword)
  );

  let triggerType = 'immediate';
  if (isWorkflowCreation) triggerType = 'manual';
  else if (isRecurring) triggerType = 'recurring';
  else if (hasSchedule) triggerType = 'scheduled';

  return {
    requiresScheduling: triggerType !== 'immediate',
    triggerType,
    scheduleExpression: hasSchedule ? extractScheduleFromInput(input) : null,
    scheduleConfig: {
      triggerDate: null,
      cronExpression: null,
      recurrencePattern: isRecurring ? detectRecurrencePattern(input) : null,
      timezone: 'UTC',
    },
    confidence: 0.7,
    reasoning: `Fallback detection based on keywords. Detected: ${triggerType}`,
    workflowTitle: null,
    workflowDescription: null,
  };
};

/**
 * Extracts a natural language schedule expression from the input text using regex patterns.
 * This is a helper function for fallback detection.
 *
 * @private
 * @function extractScheduleFromInput
 * @param {string} input - The lowercased user input string.
 * @returns {string|null} The extracted schedule expression (e.g., "tomorrow", "at 3 PM") or null if none is found.
 */
const extractScheduleFromInput = (input) => {
  const timePatterns = [
    /at (\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
    /(tomorrow|next week|friday|monday|tuesday|wednesday|thursday|saturday|sunday)/i,
  ];

  for (const pattern of timePatterns) {
    const match = input.match(pattern);
    if (match) return match[1] || match[0];
  }

  return null;
};

/**
 * Detects a recurrence pattern (daily, weekly, monthly, hourly) from the input string
 * based on specific keywords. This is a helper function for fallback detection.
 *
 * @private
 * @function detectRecurrencePattern
 * @param {string} input - The lowercased user input string.
 * @returns {'daily'|'weekly'|'monthly'|'hourly'|'custom'} The detected recurrence pattern. Defaults to 'custom' if no specific pattern is found.
 */
const detectRecurrencePattern = (input) => {
  if (input.includes('daily') || input.includes('every day')) return 'daily';
  if (input.includes('weekly') || input.includes('every week')) return 'weekly';
  if (input.includes('monthly') || input.includes('every month'))
    return 'monthly';
  if (input.includes('every hour')) return 'hourly';
  return 'custom';
};

/**
 * Generates a simple fallback title for a workflow based on the first few words
 * of the user input and the required applications.
 *
 * @private
 * @function generateFallbackTitle
 * @param {string} userInput - The original natural language input from the user.
 * @param {Array<string>} requiredApps - An array of application names required for the workflow.
 * @returns {string} The generated fallback workflow title, truncated to 50 characters.
 */
const generateFallbackTitle = (userInput, requiredApps) => {
  const action = userInput.split(' ').slice(0, 4).join(' ');
  const apps = requiredApps.slice(0, 2).join(' & ');
  return `${action} (${apps})`.substring(0, 50);
};