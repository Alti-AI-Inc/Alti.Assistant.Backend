import {
  classifyUserIntent,
  extractToolParameters,
  generateUserResponse,
  filterToolsByRelevance,
  executeComposioWithGroq,
  classifyAppIntent,
  classifyActionIntent,
} from '../services/aiClassificationService.js';
import { Composio } from '@composio/core';
import config from '../../../../../config/index.js';
import ComposionAuth from '../composio.model.js';
import { LangGraphToolSet } from 'composio-core';
import Tool from '../tools.model.js';

const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

/**
 * Helper: Create a comprehensive history summary for tool execution context
 */
const createHistorySummary = (history, conversationContext) => {
  if (!history || history.length === 0) {
    return null;
  }

  const { lastApp, lastAction, lastParameters, recentTools, conversationSummary } = conversationContext || {};
  
  // Get recent conversation context (last 3 exchanges)
  const recentHistory = history.slice(-6); // Last 6 messages (3 exchanges)
  
  const historySummary = {
    recentConversation: recentHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: msg.metadata
    })),
    context: {
      lastApp,
      lastAction, 
      lastParameters,
      recentTools: recentTools || [],
      conversationSummary: conversationSummary || '',
      totalTurns: history.length / 2 // Approximate conversation turns
    },
    summary: `User has been working with: ${recentTools?.join(', ') || 'various tools'}. Recent focus on ${lastApp || 'unknown app'} for ${lastAction || 'unknown action'}.`
  };

  return historySummary;
};

/**
 * Node: Classify user input to identify the app
 */
export const classifyAppNode = async (state) => {
  console.log('--- Node: classifyAppNode ---');
  const { userInput, history, conversationContext, messages } = state;

  try {
    // Get all available apps from database
    const availableApps = await Tool.find({}).distinct('slug');
    
    console.log(`Found ${availableApps.length} apps in database:`, availableApps);

    // Build conversation context for better classification
    const recentContext = history.length > 0 ? history.slice(-3) : [];

    console.log(`Classifying user input for app: "${userInput}"`);

    // Use AI to classify the user input to identify the app
    const appClassification = await classifyAppIntent(
      userInput,
      availableApps,
      recentContext,
      conversationContext
    );

    console.log(`App classification result:`, appClassification);

    return {
      availableApps,
      identifiedApp: appClassification.app,
      confidence: appClassification.confidence,
      currentStage: 'action_classification',
      metadata: {
        ...state.metadata,
        appClassificationTime: new Date(),
        appClassificationReasoning: appClassification.reasoning,
        ...appClassification.metadata,
      },
    };
  } catch (error) {
    console.error('Error in classifyAppNode:', error);
    return {
      error: {
        node: 'classifyApp',
        message: error.message,
      },
      currentStage: 'error',
    };
  }
};

/**
 * Node: Classify user input to identify the action for the identified app
 */
export const classifyActionNode = async (state) => {
  console.log('--- Node: classifyActionNode ---');
  const { userInput, identifiedApp, history, conversationContext } = state;

  if (!identifiedApp) {
    return {
      error: {
        node: 'classifyAction',
        message: 'No app identified in previous step',
      },
      currentStage: 'error',
    };
  }

  try {
    // Get all available actions for the identified app from database
    const availableActions = await Tool.find({ slug: identifiedApp }).select('name description');
    
    console.log(`Found available actions ${availableActions.length} actions for app "${identifiedApp}":`, availableActions);

    // Build conversation context for better classification
    const recentContext = history.length > 0 ? history.slice(-3) : [];

    console.log(`Classifying user input for action in app "${identifiedApp}": "${userInput}"`);

    // Use AI to classify the user input to identify the action
    const actionClassification = await classifyActionIntent(
      userInput,
      identifiedApp,
      availableActions,
      recentContext,
      conversationContext
    );

    console.log(`Action classification result:`, actionClassification);

    // Update conversation context with new information
    const updatedConversationContext = {
      ...conversationContext,
      lastApp: identifiedApp,
      lastAction: actionClassification.action,
      recentTools: [
        ...(conversationContext.recentTools || []).slice(-2), // Keep last 2 tools
        `${identifiedApp}_${actionClassification.action}`
      ]
    };

    return {
      availableActions,
      identifiedAction: actionClassification.action,
      confidence: actionClassification.confidence,
      conversationContext: updatedConversationContext,
      currentStage: 'tools_filtering',
      metadata: {
        ...state.metadata,
        actionClassificationTime: new Date(),
        actionClassificationReasoning: actionClassification.reasoning,
        ...actionClassification.metadata,
      },
    };
  } catch (error) {
    console.error('Error in classifyActionNode:', error);
    return {
      error: {
        node: 'classifyAction',
        message: error.message,
      },
      currentStage: 'error',
    };
  }
};

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

    console.log(`Connected accounts for ${identifiedApp}: ${availableTools}`);

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
    `Extracting parameters for ${identifiedApp}:${identifiedAction} with input: `
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
    history,
    conversationContext,
    userInput
  } = state;

  try {
    console.log(
      `Executing tool for ${identifiedApp}:${identifiedAction} with parameters:`,
      extractedParameters
    );

    const primaryTool = relevantTools[0];
    const connectedAccount = connectedAccounts?.[0];
    console.log(`Connected accounts for ${identifiedApp}:`, relevantTools);

    if (!connectedAccount) {
      throw new Error(
        `No connected account found for ${identifiedApp}. Please connect your account first.`
      );
    }

    // Create a comprehensive context summary for the execution
    const historySummary = createHistorySummary(history, conversationContext);
    
    console.log(
      `Executing tool: ${identifiedApp} with parameters:`,
      extractedParameters,
      'with history context:', historySummary
    );

    // Execute the tool using Composio with history context
    const executionResult = await executeComposioWithGroq(
      connectedAccount.userId,
      userInput,
      relevantTools,
      identifiedApp,
      historySummary,
      conversationContext
    );

    console.log(`Tool execution completed successfully`);

    return {
      executionResult,
      currentStage: 'response_generation',
      connectedAccounts: state.connectedAccounts,
      finalResponse: executionResult.tool_call_results,
      metadata: {
        ...state.metadata,
        executionTime: new Date(),
        toolExecuted: identifiedAction,
        usedHistoryContext: !!historySummary,
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
  const { 
    userInput, 
    identifiedApp, 
    identifiedAction, 
    executionResult, 
    error, 
    finalResponse,
    history,
    messages,
    conversationContext,
    extractedParameters
  } = state;
  
  console.log('Final response from state:', finalResponse);
  
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
        executionResult,
        finalResponse
      );
    }

    let cleanedResult = '';
    if (response.includes('<think>')) {
      const regex = /<think>[\s\S]*?<\/think>/g;
      cleanedResult = response.replace(regex, '').trim();
    }

    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/```json\s*/, '')
        .replace(/\s*```$/, '');
    }
    if (cleanedResult.startsWith('```')) {
      cleanedResult = cleanedResult
        .replace(/```\s*/, '')
        .replace(/\s*```$/, '');
    }

    console.log(`Generated response for user`);

    // Update conversation context with completed action
    const updatedConversationContext = {
      ...conversationContext,
      lastParameters: extractedParameters,
      conversationSummary: `Last action: ${identifiedAction} on ${identifiedApp}`,
    };

    // Add assistant response to messages
    const updatedMessages = [
      ...messages,
      {
        role: 'assistant',
        content: cleanedResult,
        timestamp: new Date().toISOString(),
        metadata: {
          app: identifiedApp,
          action: identifiedAction,
          success: !error
        }
      }
    ];

    // Update conversation history
    const updatedHistory = [
      ...history,
      {
        role: 'user',
        content: userInput,
        timestamp: new Date().toISOString()
      },
      {
        role: 'assistant', 
        content: cleanedResult,
        timestamp: new Date().toISOString(),
        metadata: {
          app: identifiedApp,
          action: identifiedAction,
          success: !error
        }
      }
    ];

    return {
      response: cleanedResult,
      finalResponse: cleanedResult,
      conversationContext: updatedConversationContext,
      messages: updatedMessages,
      history: updatedHistory,
      currentStage: 'completed',
      metadata: {
        ...state.metadata,
        responseGenerationTime: new Date(),
        conversationUpdated: true,
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
      tools: [actionKeywords],
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
  executionResult,
  finalResponse
) => {
  return await generateUserResponse(
    userInput,
    appName,
    actionName,
    executionResult,
    finalResponse,
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
