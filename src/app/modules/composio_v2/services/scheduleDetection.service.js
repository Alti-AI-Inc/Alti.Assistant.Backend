import { runGeminiTask } from '../services/aiClassificationService.js';

/**
 * Schedule Detection Service - Detects scheduling requirements from user input
 */

/**
 * Detect if user wants to schedule a workflow instead of immediate execution
 */
export const detectSchedulingRequirements = async (userInput, conversationContext = []) => {
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

  const userPrompt = `USER INPUT: "${userInput}"

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

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult.replace(/```json\s*/, '').replace(/\s*```$/, '');
    }

    if (cleanedResult.startsWith('```')) {
      cleanedResult = cleanedResult.replace(/```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanedResult);
    console.log('Schedule detection result:', parsed);

    // Validate structure
    if (typeof parsed.requiresScheduling !== 'boolean' || !parsed.triggerType) {
      throw new Error('Invalid schedule detection structure');
    }

    return {
      success: true,
      data: parsed
    };

  } catch (error) {
    console.error('Error in detectSchedulingRequirements:', error);

    // Fallback detection based on keywords
    const fallbackDetection = fallbackScheduleDetection(userInput);

    return {
      success: true,
      data: fallbackDetection
    };
  }
};

/**
 * Parse natural language schedule expressions into cron format
 */
export const parseScheduleExpression = async (scheduleExpression, timezone = 'UTC') => {
  const systemPrompt = `You are an expert cron expression generator. Convert natural language schedule expressions into valid cron expressions.

CRON FORMAT: minute hour day_of_month month day_of_week
Examples:
- "0 9 * * *" = Every day at 9 AM
- "0 17 * * 1" = Every Monday at 5 PM  
- "0 0 1 * *" = First day of every month at midnight
- "*/30 * * * *" = Every 30 minutes

You must respond with ONLY a valid JSON object.`;

  const userPrompt = `SCHEDULE EXPRESSION: "${scheduleExpression}"
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

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult.replace(/```json\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanedResult);

    return {
      success: true,
      data: parsed
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
        timezone
      }
    };
  }
};

/**
 * Generate workflow title and description from user input
 */
export const generateWorkflowMetadata = async (userInput, executionPlan, requiredApps) => {
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

  const userPrompt = `USER INPUT: "${userInput}"

REQUIRED APPS: ${requiredApps.join(', ')}

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

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult.replace(/```json\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanedResult);

    return {
      success: true,
      data: parsed
    };

  } catch (error) {
    console.error('Error in generateWorkflowMetadata:', error);

    // Fallback metadata generation
    const fallbackTitle = generateFallbackTitle(userInput, requiredApps);

    return {
      success: true,
      data: {
        title: fallbackTitle,
        description: `Automated workflow: ${userInput}`,
        tags: requiredApps
      }
    };
  }
};

/**
 * Fallback schedule detection using keyword matching
 */
const fallbackScheduleDetection = (userInput) => {
  const input = userInput.toLowerCase();

  // Check for workflow creation keywords
  const workflowKeywords = [
    'create workflow', 'save for later', 'set up automation',
    'create automation', 'don\'t run yet', 'save as workflow'
  ];

  const isWorkflowCreation = workflowKeywords.some(keyword => input.includes(keyword));

  // Check for schedule keywords
  const scheduleKeywords = [
    'tomorrow', 'next week', 'schedule for', 'run at', 'at 3 pm',
    'on friday', 'every day', 'daily', 'weekly', 'monthly'
  ];

  const hasSchedule = scheduleKeywords.some(keyword => input.includes(keyword));

  // Check for recurring keywords
  const recurringKeywords = ['daily', 'weekly', 'monthly', 'every day', 'every hour'];
  const isRecurring = recurringKeywords.some(keyword => input.includes(keyword));

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
      timezone: 'UTC'
    },
    confidence: 0.7,
    reasoning: `Fallback detection based on keywords. Detected: ${triggerType}`,
    workflowTitle: null,
    workflowDescription: null
  };
};

/**
 * Extract schedule expression from input text
 */
const extractScheduleFromInput = (input) => {
  const timePatterns = [
    /at (\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
    /(tomorrow|next week|friday|monday|tuesday|wednesday|thursday|saturday|sunday)/i
  ];

  for (const pattern of timePatterns) {
    const match = input.match(pattern);
    if (match) return match[1] || match[0];
  }

  return null;
};

/**
 * Detect recurrence pattern from input
 */
const detectRecurrencePattern = (input) => {
  if (input.includes('daily') || input.includes('every day')) return 'daily';
  if (input.includes('weekly') || input.includes('every week')) return 'weekly';
  if (input.includes('monthly') || input.includes('every month')) return 'monthly';
  if (input.includes('every hour')) return 'hourly';
  return 'custom';
};

/**
 * Generate fallback workflow title
 */
const generateFallbackTitle = (userInput, requiredApps) => {
  const action = userInput.split(' ').slice(0, 4).join(' ');
  const apps = requiredApps.slice(0, 2).join(' & ');
  return `${action} (${apps})`.substring(0, 50);
};
