import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import config from "../../../../../config/index.js";
import { logger } from "../../../../shared/logger.js";
import { composioIntegrationService } from "../services/composioIntegration.service.js";

// Initialize LLM
const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
  openAIApiKey: config.openai_secret_key
});

/**
 * Analyze user intent and classify the request
 */
export const analyzeIntentNode = async (state) => {
  try {
    logger.info("Starting intent analysis");

    // Get available apps for this context
    const availableAppsResult = await composioIntegrationService.getAvailableAppsForDetection();
    const availableApps = availableAppsResult.success ? availableAppsResult.availableApps : [];

    const systemPrompt = `You are an AI assistant that analyzes user requests for workflow automation.

Available apps in the system: ${availableApps.join(', ')}

Your task is to understand what the user wants to automate and classify it.

Analyze the user's request and provide:
1. userIntent: A clear description of what the user wants to achieve
2. taskType: Type of automation (email, social, productivity, finance, communication, notification, scheduling, data_processing)
3. complexity: simple, medium, or complex
4. detectedApps: List of apps/services from the available apps that are mentioned or needed

IMPORTANT: Only suggest apps that are in the available apps list above.

Examples:
- "Send me daily Apple stock updates to my email" -> email automation, simple, [gmail, finance_api] (if available)
- "Post my blog articles to Twitter and LinkedIn when published" -> social automation, medium, [twitter, linkedin] (if available)
- "Remind me every week to review my expenses" -> productivity automation, simple, [calendar, reminder] (if available)

Respond with a JSON object only.`;

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(state.userPrompt)
    ]);

    let cleanedResult = response.content;

    if (cleanedResult.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = cleanedResult.replace(regex, '').trim();
    }

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }


    // console.log('Cleaned Result:', cleanedResult);

    const match = cleanedResult.match(/```json([\s\S]*?)```/);
    if (match) {
      cleanedResult = match[1];
    }

    const analysis = JSON.parse(cleanedResult);

    // Validate detected apps against available apps
    const validationResult = await composioIntegrationService.validateDetectedApps(
      analysis.detectedApps || [],
      state.userId
    );
    console.log({
      userIntent: analysis.userIntent,
      taskType: analysis.taskType,
      complexity: analysis.complexity,
      detectedApps: validationResult.validApps,
      invalidApps: validationResult.invalidApps,
      availableApps: validationResult.availableApps,
      connectionStatus: validationResult.connectionStatus,
      currentStage: "intent_analyzed"
    });

    return {
      userIntent: analysis.userIntent,
      taskType: analysis.taskType,
      complexity: analysis.complexity,
      detectedApps: validationResult.validApps,
      invalidApps: validationResult.invalidApps,
      availableApps: validationResult.availableApps,
      connectionStatus: validationResult.connectionStatus,
      currentStage: "intent_analyzed"
    };

  } catch (error) {
    logger.error("Error in intent analysis:", error);
    return {
      error: `Intent analysis failed: ${error.message}`,
      currentStage: "intent_analysis_error"
    };
  }
};

/**
 * Plan the workflow based on user intent
 */
export const planWorkflowNode = async (state) => {
  try {
    logger.info("Starting workflow planning");

    // Get available tools for the user's connected apps
    const userTools = await composioIntegrationService.getUserAvailableTools(
      state.userId,
      state.detectedApps
    );

    const availableToolsInfo = userTools.success ?
      Object.entries(userTools.toolsByApp).map(([app, tools]) =>
        `${app}: ${tools.map(t => t.name).join(', ')}`
      ).join('\n') :
      'No tools available for connected apps';

    const systemPrompt = `You are a workflow planning expert. Create a detailed execution plan for the user's automation request.

Available tools by app:
${availableToolsInfo}

Connected apps: ${state.connectionStatus?.connectedApps?.join(', ') || 'None'}
Available apps: ${state.detectedApps?.join(', ') || 'None'}

Break down the workflow into logical steps. Each step should have:
- stepId: unique identifier
- stepType: action, condition, trigger, or delay
- description: what this step does
- app: the service/app to use (must be from available apps)
- action: specific action to perform (use available tool names when possible)
- parameters: required parameters (use placeholders for user-specific data)
- order: execution order

Consider:
- Authentication requirements for apps
- Data flow between steps
- Error handling
- Schedule requirements

User Intent: ${state.userIntent}
Detected Apps: ${state.detectedApps?.join(', ')}
Task Type: ${state.taskType}

IMPORTANT: Only use apps and tools that are available. If required apps are not connected, note this in the workflow.

Respond with a JSON object containing:
- workflowSteps: array of step objects
- requiredApps: array of app names needed
- scheduleRequired: boolean
- estimatedComplexity: simple/medium/complex
- missingConnections: array of apps that need to be connected`;

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(state.userPrompt)
    ]);

    let cleanedResult = response.content
    if (cleanedResult.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = cleanedResult.replace(regex, '').trim();
    }

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }


    // console.log('Cleaned Result:', cleanedResult);

    console.log('Cleaned Result:', cleanedResult);
    const match = cleanedResult.match(/{[\s\S]*}/);
    if (match) {
      try {
        const cleanedResult = JSON.parse(match[0]);
        console.log("Extracted JSON:", cleanedResult);
      } catch (e) {
        console.error("Invalid JSON:", e);
      }
    } else {
      console.error("No JSON found in string");
    }

    const plan = cleanedResult

    // Validate the planned apps against available ones
    const validationResult = await composioIntegrationService.validateDetectedApps(
      plan.requiredApps || [],
      state.userId
    );

    return {
      workflowSteps: plan.workflowSteps,
      detectedApps: [...(state.detectedApps || []), ...(validationResult.validApps || [])],
      scheduleRequired: plan.scheduleRequired,
      workflowPlan: plan,
      availableTools: userTools.success ? userTools.toolsByApp : {},
      missingConnections: plan.missingConnections || validationResult.connectionStatus?.missingConnections || [],
      currentStage: "workflow_planned"
    };

  } catch (error) {
    logger.error("Error in workflow planning:", error);
    return {
      error: `Workflow planning failed: ${error.message}`,
      currentStage: "planning_error"
    };
  }
};

/**
 * Detect and configure scheduling requirements
 */
export const scheduleDetectionNode = async (state) => {
  try {
    logger.info("Analyzing scheduling requirements");

    if (!state.scheduleRequired) {
      return {
        triggerType: "manual",
        currentStage: "schedule_analyzed"
      };
    }

    const systemPrompt = `Analyze the user's request to determine scheduling configuration.

Extract scheduling information and provide:
- triggerType: schedule, manual, webhook, or event
- scheduleConfig: object with frequency, time, timezone, etc.
- nextExecution: when should it first run

User Request: ${state.userPrompt}

For schedule triggers, determine:
- frequency: daily, weekly, monthly, hourly, custom
- time: specific time if mentioned (HH:mm format)
- timezone: default to UTC if not specified
- daysOfWeek: array of numbers 0-6 for weekly (Sunday=0)
- cronExpression: for complex schedules

Examples:
- "daily at 9 AM" -> {frequency: "daily", time: "09:00", timezone: "UTC"}
- "every Monday" -> {frequency: "weekly", daysOfWeek: [1]}
- "monthly on the 15th" -> {frequency: "monthly", dayOfMonth: 15}

Respond with JSON only.`;

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(state.userPrompt)
    ]);
    let cleanedResult = response.content
    if (cleanedResult.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = cleanedResult.replace(regex, '').trim();
    }

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }


    // console.log('Cleaned Result:', cleanedResult);

    const match = cleanedResult.match(/```json([\s\S]*?)```/);
    if (match) {
      cleanedResult = match[1];
    }
    const scheduleConfig = JSON.parse(cleanedResult);

    return {
      scheduleConfig: scheduleConfig.scheduleConfig,
      triggerType: scheduleConfig.triggerType,
      currentStage: "schedule_analyzed"
    };

  } catch (error) {
    logger.error("Error in schedule detection:", error);
    return {
      error: `Schedule detection failed: ${error.message}`,
      triggerType: "manual",
      currentStage: "schedule_error"
    };
  }
};

/**
 * Extract and validate parameters for workflow steps
 */
export const extractParametersNode = async (state) => {
  try {
    logger.info("Extracting parameters from user input");

    const systemPrompt = `Extract specific parameters from the user's request that are needed for the workflow.

Based on the workflow steps and user request, identify:
1. Explicit parameters mentioned by the user
2. Parameters that need to be collected
3. Default values that can be inferred

Workflow Steps: ${JSON.stringify(state.workflowSteps)}
User Request: ${state.userPrompt}

For each parameter, determine:
- value: if explicitly mentioned
- required: true/false
- type: string, number, boolean, array, object
- description: what this parameter is for

Common parameters to look for:
- Email addresses
- Time preferences
- Content templates
- Notification preferences
- Frequency settings
- App-specific configurations

Respond with JSON:
{
  "extractedParameters": {...},
  "missingParameters": ["param1", "param2"],
  "parameterSchema": {...}
}`;

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`${state.userPrompt}\n\nWorkflow: ${JSON.stringify(state.workflowSteps)}`)
    ]);
    let cleanedResult = response.content
    if (cleanedResult.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = cleanedResult.replace(regex, '').trim();
    }

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }


    // console.log('Cleaned Result:', cleanedResult);

    const match = cleanedResult.match(/```json([\s\S]*?)```/);
    if (match) {
      cleanedResult = match[1];
    }
    const paramData = JSON.parse(cleanedResult);

    return {
      extractedParameters: paramData.extractedParameters,
      missingParameters: paramData.missingParameters || [],
      currentStage: "parameters_extracted"
    };

  } catch (error) {
    logger.error("Error in parameter extraction:", error);
    return {
      error: `Parameter extraction failed: ${error.message}`,
      currentStage: "parameter_error"
    };
  }
};

/**
 * Validate workflow and check for issues
 */
export const validateWorkflowNode = async (state) => {
  try {
    logger.info("Validating workflow configuration");

    const validation = {
      isValid: true,
      issues: [],
      warnings: []
    };

    // Check app connections if user ID is available
    if (state.userId && state.detectedApps?.length > 0) {
      const connectionCheck = await composioIntegrationService.checkAppConnections(
        state.userId,
        state.detectedApps
      );

      if (connectionCheck.success) {
        if (!connectionCheck.allConnected) {
          validation.warnings.push(
            `Missing app connections: ${connectionCheck.missingConnections.join(', ')}`
          );
          validation.missingConnections = connectionCheck.missingConnections;
          validation.connectionUrls = {};

          // Generate connection URLs for missing apps
          for (const appName of connectionCheck.missingConnections) {
            try {
              const connectionResult = await composioIntegrationService.getConnectionUrl(
                state.userId,
                appName
              );
              if (connectionResult.success && !connectionResult.alreadyConnected) {
                validation.connectionUrls[appName] = connectionResult.connectionUrl;
              }
            } catch (urlError) {
              logger.warn(`Could not generate connection URL for ${appName}:`, urlError);
            }
          }
        }
      } else {
        validation.issues.push(`Failed to check app connections: ${connectionCheck.error}`);
      }
    }

    // Check for missing required parameters
    if (state.missingParameters?.length > 0) {
      validation.warnings.push(`Missing parameters: ${state.missingParameters.join(', ')}`);
    }

    // Validate workflow steps
    if (!state.workflowSteps || state.workflowSteps.length === 0) {
      validation.issues.push("No workflow steps defined");
      validation.isValid = false;
    }

    // Check for invalid apps
    if (state.invalidApps?.length > 0) {
      validation.warnings.push(`Unsupported apps detected: ${state.invalidApps.join(', ')}`);
    }

    return {
      validationResult: validation,
      needsConfirmation: !validation.isValid || validation.warnings.length > 0,
      currentStage: "workflow_validated"
    };

  } catch (error) {
    logger.error("Error in workflow validation:", error);
    return {
      error: `Workflow validation failed: ${error.message}`,
      currentStage: "validation_error"
    };
  }
};

/**
 * Generate appropriate response based on current state
 */
export const generateResponseNode = async (state) => {
  try {
    logger.info("Generating response for user");

    if (state.error) {
      return {
        response: `I encountered an error: ${state.error}. Please try rephrasing your request or contact support if the issue persists.`,
        responseType: "error",
        currentStage: "response_generated"
      };
    }

    if (state.needsConfirmation) {
      const issues = state.validationResult?.issues || [];
      const warnings = state.validationResult?.warnings || [];
      const missingConnections = state.validationResult?.missingConnections || state.missingConnections || [];
      const connectionUrls = state.validationResult?.connectionUrls || {};

      let confirmationMessage = "I've analyzed your request and created a workflow plan. ";

      if (issues.length > 0) {
        confirmationMessage += `However, there are some issues that need to be resolved:\n${issues.map(issue => `• ${issue}`).join('\n')}\n\n`;
      }

      if (warnings.length > 0) {
        confirmationMessage += `Please note:\n${warnings.map(warning => `• ${warning}`).join('\n')}\n\n`;
      }

      // Add connection requirements
      if (missingConnections.length > 0) {
        confirmationMessage += `**App Connections Needed:**\n`;
        missingConnections.forEach(app => {
          confirmationMessage += `• ${app}`;
          if (connectionUrls[app]) {
            confirmationMessage += ` - [Connect here](${connectionUrls[app]})`;
          }
          confirmationMessage += '\n';
        });
        confirmationMessage += '\n';
      }

      confirmationMessage += `**Workflow Summary:**\n`;
      confirmationMessage += `• Task: ${state.userIntent}\n`;
      confirmationMessage += `• Type: ${state.taskType}\n`;
      confirmationMessage += `• Apps needed: ${state.detectedApps?.join(', ') || 'None'}\n`;
      confirmationMessage += `• Connected apps: ${state.connectionStatus?.connectedApps?.join(', ') || 'None'}\n`;
      confirmationMessage += `• Steps: ${state.workflowSteps?.length || 0}\n`;

      if (state.scheduleRequired) {
        confirmationMessage += `• Schedule: ${state.scheduleConfig?.frequency || 'As configured'}\n`;
      }

      if (missingConnections.length > 0) {
        confirmationMessage += `\n**Next Steps:**\n`;
        confirmationMessage += `1. Connect the required apps using the links above\n`;
        confirmationMessage += `2. Confirm to create the workflow\n`;
        confirmationMessage += `\nWould you like me to proceed with creating this workflow?`;
      } else {
        confirmationMessage += `\nWould you like me to proceed with creating this workflow?`;
      }

      return {
        response: confirmationMessage,
        responseType: "confirmation",
        confirmationMessage: confirmationMessage,
        missingConnections,
        connectionUrls,
        currentStage: "awaiting_confirmation"
      };
    }

    // Success response
    let successMessage = "Great! I've successfully created your workflow automation.\n\n";
    successMessage += `**Workflow Details:**\n`;
    successMessage += `• Name: ${state.userIntent}\n`;
    successMessage += `• Type: ${state.taskType}\n`;
    successMessage += `• Trigger: ${state.triggerType}\n`;
    successMessage += `• Connected apps: ${state.connectionStatus?.connectedApps?.join(', ') || 'None'}\n`;

    if (state.scheduleRequired && state.scheduleConfig) {
      successMessage += `• Schedule: ${state.scheduleConfig.frequency}`;
      if (state.scheduleConfig.time) {
        successMessage += ` at ${state.scheduleConfig.time}`;
      }
      successMessage += `\n`;
    }

    successMessage += `• Steps: ${state.workflowSteps?.length || 0} actions\n`;

    if (state.workflowId) {
      successMessage += `• Workflow ID: ${state.workflowId}\n`;
    }

    successMessage += `\nYour workflow is now ${state.scheduleRequired ? 'scheduled and will run automatically' : 'ready to be executed manually'}.`;

    return {
      response: successMessage,
      responseType: "success",
      currentStage: "completed"
    };

  } catch (error) {
    logger.error("Error in response generation:", error);
    return {
      response: "I apologize, but I encountered an error while generating the response. Please try again.",
      responseType: "error",
      currentStage: "response_error"
    };
  }
};