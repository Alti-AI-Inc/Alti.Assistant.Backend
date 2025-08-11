import {
  classifyUserIntent,
  extractToolParameters,
  generateUserResponse,
  filterToolsByRelevance,
  executeComposioWithGroq,
} from '../services/aiClassificationService.js';
import { Composio } from '@composio/core';
import config from '../../../../../config/index.js';
import ComposionAuth from '../composio.model.js';
import { LangGraphToolSet } from 'composio-core';

const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

/**
 * Node: Classify user input to identify app and action
 */
export const classifyUserInputNode = async (state) => {
  console.log('--- Node: classifyUserInputNode ---');
  const { userInput, history } = state;

  try {
    // Build conversation context for better classification
    const conversationContext =
      history.length > 0
        ? history.slice(-3) // Last 3 messages for context
        : [];

    console.log(`Classifying user input: "${userInput}"`);

    // Use AI to classify the user input
    const classification = await classifyUserIntent(
      userInput,
      conversationContext
    );

    console.log(`Classification result:`, classification.app, {
      identifiedApp: classification.app,
      identifiedAction: classification.action,
      confidence: classification.confidence,
      extractedParameters: classification.parameters,
      currentStage: 'tools_filtering',
      connectedAccounts: state.connectedAccounts,
      metadata: {
        classificationTime: new Date(),
        ...classification.metadata,
      },
    });

    return {
      identifiedApp: classification.app,
      identifiedAction: classification.action,
      confidence: classification.confidence,
      extractedParameters: classification.parameters,
      currentStage: 'tools_filtering',
      connectedAccounts: state.connectedAccounts,
      metadata: {
        classificationTime: new Date(),
        ...classification.metadata,
      },
    };
  } catch (error) {
    console.error('Error in classifyUserInputNode:', error);
    return {
      error: {
        node: 'classifyUserInput',
        message: error.message,
      },
      currentStage: 'error',
    };
  }
};

/**
 * Node: Filter and identify relevant tools for the classified request
 */
export const filterRelevantToolsNode = async (state) => {
  console.log('--- Node: filterRelevantToolsNode ---');
  const { identifiedApp, identifiedAction, userId } = state;

  try {
    // Get all available tools for the identified app
    const availableTools = await getAvailableToolsForApp(
      userId,
      identifiedApp,
      identifiedAction
    );

    // Filter tools relevant to the identified action
    // const relevantTools = await filterToolsByAction(
    //   availableTools,
    //   identifiedAction,
    //   identifiedApp
    // );

    // // Get user's connected accounts for the app
    const connectedAccounts = await getUserConnectedAccounts(
      userId,
      identifiedApp
    );

    console.log(`Connected accounts for ${identifiedApp}:`, connectedAccounts);

    console.log(
      `Found ${availableTools} relevant tools for ${identifiedApp}:${identifiedAction}`
    );

    return {
      availableTools,
      relevantTools: availableTools, // Assuming all tools are relevant for simplicity
      connectedAccounts,
      currentStage: 'parameter_extraction',
    };
  } catch (error) {
    console.error('Error in filterRelevantToolsNode:', error);
    return {
      error: {
        node: 'filterRelevantTools',
        message: error.message,
      },
      currentStage: 'error',
    };
  }
};

/**
 * Node: Extract and validate parameters for tool execution
 */
export const extractParametersNode = async (state) => {
  console.log('--- Node: extractParametersNode ---');
  const {
    userInput,
    relevantTools,
    extractedParameters,
    identifiedApp,
    identifiedAction,
  } = state;
  console.log(
    `Extracting parameters for ${identifiedApp}:${identifiedAction} with input: "${state}"`
  );

  try {
    // Get the primary tool for execution
    const primaryTool = relevantTools[0];
    if (!primaryTool) {
      throw new Error(
        `No tools available for ${identifiedApp}:${identifiedAction}`
      );
    }

    // Extract and validate parameters using AI
    const parameterExtractionResult = await extractAndValidateParameters(
      userInput,
      primaryTool,
      extractedParameters,
      identifiedApp,
      identifiedAction
    );

    console.log(`Parameter extraction result:`, parameterExtractionResult);

    return {
      extractedParameters: parameterExtractionResult.parameters,
      currentStage: 'tool_execution',
      connectedAccounts: state.connectedAccounts,
      metadata: {
        ...state.metadata,
        parameterExtractionTime: new Date(),
        primaryTool: primaryTool.name,
      },
    };
  } catch (error) {
    console.error('Error in extractParametersNode:', error);
    return {
      error: {
        node: 'extractParameters',
        message: error.message,
      },
      currentStage: 'error',
    };
  }
};

/**
 * Node: Execute the identified tool with extracted parameters
 */
export const executeToolNode = async (state) => {
  console.log('--- Node: executeToolNode ---');
  const {
    relevantTools,
    extractedParameters,
    connectedAccounts,
    identifiedApp,
    identifiedAction,
  } = state;

  try {
    console.log(
      `Executing tool for ${identifiedApp}:${identifiedAction} with parameters:`,
      state
    );

    const primaryTool = relevantTools[0];
    const connectedAccount = connectedAccounts?.[0];
    console.log(`Connected accounts for ${identifiedApp}:`, relevantTools);

    if (!connectedAccount) {
      throw new Error(
        `No connected account found for ${identifiedApp}. Please connect your account first.`
      );
    }

    console.log(
      `Executing tool: ${identifiedApp} with parameters:`,
      extractedParameters
    );

    // Execute the tool using Composio
    const executionResult = await executeComposioWithGroq(
      connectedAccount.userId,
      state.userInput,
      relevantTools,
      identifiedApp
    );

    console.log(`Tool execution completed successfully`);

    return {
      executionResult,
      currentStage: 'response_generation',
      connectedAccounts: state.connectedAccounts,
      metadata: {
        ...state.metadata,
        executionTime: new Date(),
        toolExecuted: identifiedAction,
      },
    };
  } catch (error) {
    console.error('Error in executeToolNode:', error);
    return {
      error: {
        node: 'executeTool',
        message: error.message,
      },
      currentStage: 'error',
    };
  }
};

/**
 * Node: Generate final response based on execution result
 */
export const generateResponseNode = async (state) => {
  console.log('--- Node: generateResponseNode ---');
  const { userInput, identifiedApp, identifiedAction, executionResult, error } =
    state;

  try {
    let response;

    if (error) {
      // Generate error response
      response = await generateErrorResponse(
        error,
        identifiedApp,
        identifiedAction
      );
    } else {
      // Generate success response
      response = await generateSuccessResponse(
        userInput,
        identifiedApp,
        identifiedAction,
        executionResult
      );
    }

    console.log(`Generated response for user`);

    return {
      response,
      currentStage: 'completed',
      metadata: {
        ...state.metadata,
        responseGenerationTime: new Date(),
      },
    };
  } catch (error) {
    console.error('Error in generateResponseNode:', error);
    return {
      response:
        'I apologize, but I encountered an error while processing your request. Please try again.',
      error: {
        node: 'generateResponse',
        message: error.message,
      },
      currentStage: 'error',
    };
  }
};

/**
 * Helper: Get available tools for an app
 */
const getAvailableToolsForApp = async (user_id, appName, actionKeywords) => {
  try {
    // Get actions from Composio for the specific app
    // const actions = await composio.actions.list({
    //   appNames: [appName.toUpperCase()]
    // });
    console.log(
      `Fetching available tools for app: ${appName} with keywords: ${actionKeywords}`
    );

    const allTools = await composio.tools.get(user_id, {
      toolkits: [appName.toUpperCase()],
    });
    const relevantTools = allTools.filter((tool) => {
      console.log(`Checking tool: ${tool.function.name}`, actionKeywords);

      const toolName = tool.function.name.toLowerCase();
      const normalizedTool = toolName.toLowerCase().replace(/\s+/g, '_');
      const normalizedKw = actionKeywords.toLowerCase().replace(/\s+/g, '_');
      const isMatched = normalizedTool.includes(normalizedKw);
      console.log(
        `Keyword "${actionKeywords}" = ${toolName} matched: ${isMatched}`
      );
      return isMatched;
    });

    console.log(
      `Filtered to ${relevantTools.length} relevant tools:`,
      relevantTools.map((t) => t.function.name)
    );

    // If no specific matches, take first few tools to avoid the 128 limit
    const toolsToUse =
      relevantTools.length > 0
        ? relevantTools.slice(0, 10)
        : allTools.slice(0, 10);

    console.log(`Using ${toolsToUse.length} tools`);
    return toolsToUse;
  } catch (error) {
    console.error(`Error fetching tools for ${appName}:`, error);
    return [];
  }
};

/**
 * Helper: Filter tools by action
 */
const filterToolsByAction = async (availableTools, actionName, appName) => {
  return await filterToolsByRelevance(availableTools, actionName, appName);
};

/**
 * Helper: Get user's connected accounts for an app
 */
const getUserConnectedAccounts = async (userId, appName) => {
  try {
    const accounts = await ComposionAuth.find({
      userId: userId,
      status: 'ACTIVE',
    });

    // Filter accounts for the specific app
    return accounts;
  } catch (error) {
    console.error(
      `Error fetching connected accounts for user ${userId}:`,
      error
    );
    return [];
  }
};

/**
 * Helper: Extract and validate parameters for tool execution
 */
const extractAndValidateParameters = async (
  userInput,
  tool,
  existingParameters,
  appName,
  actionName
) => {
  const parameters = await extractToolParameters(
    userInput,
    tool,
    existingParameters
  );
  return { parameters };
};

/**
 * Helper: Execute tool using Composio
 */
const executeComposioTool = async (
  identified_app_name,
  identifiedAction,
  parameters,
  connectedAccount,
  appName
) => {
  try {
    const result = await composio.actions.execute({
      actionName: identifiedAction,
      params: parameters,
      connectedAccountId: connectedAccount.connectedAccountId,
    });

    return result;
  } catch (error) {
    console.error(`Error executing ${identified_app_name}:`, error);
    throw error;
  }
};

/**
 * Helper: Generate success response
 */
const generateSuccessResponse = async (
  userInput,
  appName,
  actionName,
  executionResult
) => {
  return await generateUserResponse(
    userInput,
    appName,
    actionName,
    executionResult,
    false
  );
};

/**
 * Helper: Generate error response
 */
const generateErrorResponse = async (error, appName, actionName) => {
  return await generateUserResponse(
    `Error: ${error.message}`,
    appName,
    actionName,
    error,
    true
  );
};
