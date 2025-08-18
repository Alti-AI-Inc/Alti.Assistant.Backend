import {
  classifyUserIntent,
  extractToolParameters,
  generateUserResponse,
  filterToolsByRelevance,
  executeComposioWithGroq,
  classifyAppIntent,
  classifyActionIntent,
  identifyRequiredApps,
  createExecutionPlan,
  extractCrossStepParameters,
  generateStepExecutionSummary,
} from '../services/aiClassificationService.js';
import { Composio } from '@composio/core';
import config from '../../../../../config/index.js';
import ComposionAuth from '../composio.model.js';
import { LangGraphToolSet } from 'composio-core';
import Tool from '../tools.model.js';
import fs from 'fs';
import { detectSchedulingRequirements } from '../services/scheduleDetection.service.js';
import AuthConfig from '../authConfig.model.js';
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
    
    console.log(`Found ${availableApps.length} apps in database:`);

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

    // console.log(`App classification result:`, appClassification);

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
    
    console.log(`Found available actions ${availableActions.length} actions for app "${identifiedApp}":`);

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

    // console.log(`Classification result:`, classification.app, {
    //   identifiedApp: classification.app,
    //   identifiedAction: classification.action,
    //   confidence: classification.confidence,
    //   extractedParameters: classification.parameters,
    //   currentStage: 'tools_filtering',
    //   connectedAccounts: state.connectedAccounts,
    //   metadata: {
    //     classificationTime: new Date(),
    //     ...classification.metadata,
    //   },
    // });

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

    // console.log(`Connected accounts for ${identifiedApp}: ${availableTools}`);

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
  // console.log(
  //   `Extracting parameters for ${identifiedApp}:${identifiedAction} with input: `
  // );

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

    // console.log(`Parameter extraction result:`, parameterExtractionResult);

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
    // console.log(
    //   `Executing tool for ${identifiedApp}:${identifiedAction} with parameters:`,
    //   extractedParameters
    // );

    const primaryTool = relevantTools[0];
    const connectedAccount = connectedAccounts?.[0];
    // console.log(`Connected accounts for ${identifiedApp}:`, relevantTools);

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
      ...state,
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
    // console.log(
    //   `Fetching available tools for app: ${appName} with keywords: ${actionKeywords}`
    // );

    const allTools = await composio.tools.get(user_id, {
      tools: [actionKeywords],
    });
    const relevantTools = allTools.filter((tool) => {
      // console.log(`Checking tool: ${tool.function.name}`, actionKeywords);

      const toolName = tool.function.name.toLowerCase();
      const normalizedTool = toolName.toLowerCase().replace(/\s+/g, '_');
      const normalizedKw = actionKeywords.toLowerCase().replace(/\s+/g, '_');
      const isMatched = normalizedTool.includes(normalizedKw);
      // console.log(
      //   `Keyword "${actionKeywords}" = ${toolName} matched: ${isMatched}`
      // );
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

    // console.log(`Using ${toolsToUse.length} tools`);
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

// =====================================================
// NEW MULTI-STEP WORKFLOW NODES
// =====================================================

/**
 * Node: Plan multi-step workflow
 * Analyzes user input to identify required apps and create execution plan
 */
export const planWorkflowNode = async (state) => {
  console.log('--- Node: planWorkflowNode ---');
  const { userInput, history, conversationContext } = state;

  console.log(`User Input: ${userInput}`);
  // console.log(`Conversation Context: ${JSON.stringify(state.connectedAccounts)}`);

  try {
    // Step 1: Get all available apps from database
    const availableAppsFromTools = await Tool.find({}).distinct('slug');
    // console.log(`Found ${availableApps.length} available apps:`);
    const availableApps = []

    for (let i = 0; i < availableAppsFromTools.length; i++) {
      const element = availableAppsFromTools[i];
      const authConfig = await AuthConfig.find({
        app: element
      })
      if (authConfig.length === 0) {
        continue
      } else {
        availableApps.push(element)
      }
    }
    // Step 2: Identify required apps for this request
    const recentContext = history.length > 0 ? history.slice(-3) : [];
    const appIdentification = await identifyRequiredApps(userInput, availableApps, recentContext);
    
    console.log('App identification result:', appIdentification);

    // Step 3: If single-step workflow, use existing flow
    if (appIdentification.workflowType === 'single_step' || appIdentification.requiredApps.length <= 1) {
      return {
        workflowType: 'single_step',
        requiredApps: appIdentification.requiredApps,
        planningMetadata: {
          reasoning: appIdentification.reasoning,
          confidence: appIdentification.confidence,
          planningTime: new Date()
        },
        currentStage: 'single_step_classification'
      };
    }

    // Step 4: For multi-step workflow, get actions for all required apps
    const actionsMap = {};
    for (const app of appIdentification.requiredApps) {
      const actions = await Tool.find({ slug: app }).select('name description');
      actionsMap[app] = actions;
    }

    console.log('Actions map for required apps:' , actionsMap.github?.length, actionsMap.gmail?.length);

    // Step 5: Create execution plan
    const planResult = await createExecutionPlan(
      userInput,
      appIdentification.requiredApps,
      actionsMap,
      recentContext
    );

    console.log('Execution plan created:', planResult);

    // Step 6: Extract cross-step parameters
    const parameterResult = await extractCrossStepParameters(
      userInput,
      planResult.executionPlan
    );

    console.log('Cross-step parameters extracted:', parameterResult);

    return {
      workflowType: 'multi_step',
      requiredApps: appIdentification.requiredApps,
      executionPlan: planResult.executionPlan,
      totalSteps: planResult.totalSteps,
      currentStep: 0,
      stepResults: [],
      dependencyGraph: planResult.dependencyGraph,
      crossStepParameters: parameterResult.stepParameters,
      connectedAccounts: state.connectedAccounts,
      planningMetadata: {
        reasoning: `${appIdentification.reasoning}. ${planResult.reasoning}`,
        confidence: appIdentification.confidence,
        planningTime: new Date(),
        executionType: planResult.executionType
      },
      currentStage: 'workflow_validation'
    };

  } catch (error) {
    console.error('Error in planWorkflowNode:', error);
    return {
      error: {
        node: 'planWorkflow',
        message: error.message,
      },
      currentStage: 'error',
    };
  }
};

/**
 * Node: Validate workflow plan
 * Checks if all required apps are connected and plan is executable
 */
export const validatePlanNode = async (state) => {
  console.log('--- Node: validatePlanNode ---');
  const { requiredApps, executionPlan, connectedAccounts } = state;

  try {
    // Check if all required apps have connected accounts
    const connectedAppSlugs = connectedAccounts?.map(acc => acc.toolkit.slug) || [];
    console.log('Connected app slugs:', connectedAppSlugs);

    const missingConnections = requiredApps.filter(app => !connectedAppSlugs.includes(app));

    if (missingConnections.length > 0) {
      return {
        error: {
          node: 'validatePlan',
          message: `Missing connections for apps: ${missingConnections.join(', ')}. Please connect these apps first.`,
          missingConnections
        },
        currentStage: 'error'
      };
    }

    // Validate execution plan structure
    if (!executionPlan || executionPlan.length === 0) {
      return {
        error: {
          node: 'validatePlan',
          message: 'Invalid or empty execution plan',
        },
        currentStage: 'error'
      };
    }

    console.log('Workflow validation successful. Ready to execute.');

    return {
      ...state,
      connectedAccounts: state.connectedAccounts,
      validationResult: {
        valid: true,
        connectedApps: connectedAppSlugs,
        planSteps: executionPlan.length
      },
      currentStage: 'step_execution'
    };

  } catch (error) {
    console.error('Error in validatePlanNode:', error);
    return {
      error: {
        node: 'validatePlan',
        message: error.message,
      },
      currentStage: 'error',
    };
  }
};

/**
 * Node: Execute current step in multi-step workflow
 */
export const executeStepNode = async (state) => {
  console.log('--- Node: executeStepNode ---');
  const { 
    userInput, 
    executionPlan, 
    currentStep, 
    stepResults, 
    stepSummaries,
    crossStepParameters,
    connectedAccounts,
    history,
    conversationContext
  } = state;

  try {
    if (!executionPlan || currentStep >= executionPlan.length) {
      return {
        workflowComplete: true,
        currentStage: 'workflow_completion'
      };
    }

    const currentStepPlan = executionPlan[currentStep];
    console.log(`Executing step ${currentStep + 1}/${executionPlan.length}:`, currentStepPlan);

    

    // Get parameters for current step
    let stepParameters = crossStepParameters[currentStep + 1] || {};
    
    // Map data from previous steps
    if (currentStepPlan.dependencies && currentStepPlan.dependencies.length > 0) {
      for (const depStep of currentStepPlan.dependencies) {
        const prevResult = stepResults[depStep - 1];
        if (prevResult && currentStepPlan.parameters) {
          // Map previous step outputs to current step inputs
          Object.entries(currentStepPlan.parameters).forEach(([key, value]) => {
            if (typeof value === 'string' && value.startsWith('from_step_')) {
              const [, stepNum, field] = value.split('.');
              if (prevResult.data && prevResult.data[field]) {
                stepParameters[key] = prevResult.data[field];
              }
            }
          });
        }
      }
    }

    // Merge with plan parameters
    stepParameters = { ...currentStepPlan.parameters, ...stepParameters };

    // console.log('Step parameters:', stepParameters);
    // console.log('Connected accounts:', connectedAccounts);
    console.log('Currentplan app', currentStepPlan.app, 'ConnectedAccounts', JSON.stringify(connectedAccounts));
    
    // Find connected account for this app
    const connectedAccount = connectedAccounts?.find(acc => acc.toolkit.slug === currentStepPlan.app);
    if (!connectedAccount) {
      throw new Error(`No connected account found for ${currentStepPlan.app}`);
    }
    // console.log(`Using connected account for ${currentStepPlan.app}:`, connectedAccount);
    const account = await ComposionAuth.findOne({
      connectedAccountId: connectedAccount.id
    });
    // Execute the tool
    const primaryTool = currentStepPlan.action;
    const historySummary = createHistorySummary(history, conversationContext);
    const tool = await composio.tools.get(account.userId, {
      tools: [primaryTool],
    })

    // Build context with previous step summaries
    let executionContext = `${currentStepPlan.description}: ${JSON.stringify(stepParameters)}`;

    console.log('Step Result with step summaries:', stepSummaries);
    if (stepSummaries && stepSummaries.length > 0) {
      executionContext += '\n\nPREVIOUS STEPS CONTEXT:\n';
      stepSummaries.forEach(summary => {
        executionContext += `Step ${summary.stepNumber}: ${summary.summary}\n`;
        if (summary.contextForNextStep) {
          executionContext += `Context: ${summary.contextForNextStep}\n`;
        }
        if (Object.keys(summary.keyOutputs).length > 0) {
          executionContext += `Key Outputs: ${JSON.stringify(summary.keyOutputs)}\n`;
        }
        executionContext += '\n';
      });
      
      executionContext += `Current Step (${currentStep + 1}): Execute ${currentStepPlan.action} on ${currentStepPlan.app}\n`;
      executionContext += `Use the context from previous steps to inform your current action.\n`;
    }

    console.log('Execution context with previous steps:', executionContext);

    const executionResult = await executeComposioWithGroq(
      account.userId,
      executionContext,
      tool,
      currentStepPlan.app,
      historySummary
    );

    console.log(`Step ${currentStep + 1} execution result:`, executionResult);

    // Store step result
    const stepResult = {
      step: currentStep + 1,
      app: currentStepPlan.app,
      action: currentStepPlan.action,
      parameters: stepParameters,
      result: executionResult,
      timestamp: new Date()
    };

    // Generate step execution summary
    console.log('Generating step execution summary...');
    const stepSummary = await generateStepExecutionSummary(stepResult, executionPlan, currentStep);
    // console.log(`Step ${currentStep + 1} summary:`, stepSummary);

    const updatedStepResults = [...stepResults, stepResult];
    const updatedStepSummaries = [...(state.stepSummaries || []), stepSummary];
    // console.log('Updated step results:', updatedStepResults);
    console.log('Updated step summaries:', updatedStepSummaries);

    return {
      ...state,
      stepResults: updatedStepResults,
      stepSummaries: updatedStepSummaries,
      currentStep: currentStep + 1,
      lastStepResult: stepResult,
      lastStepSummary: stepSummary,
      currentStage: 'step_execution',
    };

  } catch (error) {
    console.error('Error in executeStepNode:', error);
    return {
      error: {
        node: 'executeStep',
        step: currentStep + 1,
        message: error.message,
      },
      currentStage: 'error',
    };
  }
};

/**
 * Node: Check if workflow is complete
 */
export const checkCompletionNode = async (state) => {
  console.log('--- Node: checkCompletionNode ---');
  const { executionPlan, currentStep, stepResults } = state;
  
  try {
    // console.log('Checking workflow completion...', currentStep, executionPlan.length, state.stepSummaries);

    const isComplete = currentStep >= executionPlan.length;
    
    if (isComplete) {
      console.log('Workflow completed successfully');
      return {
        ...state,
        workflowComplete: true,
        currentStage: 'aggregation',
      };
    } else {
      // console.log(`Workflow continuing to step ${currentStep + 1}/${executionPlan.length}`);
      return {
        workflowComplete: false,
        currentStage: 'step_execution'
      };
    }

  } catch (error) {
    console.error('Error in checkCompletionNode:', error);
    return {
      error: {
        node: 'checkCompletion',
        message: error.message,
      },
      currentStage: 'error',
    };
  }
};

/**
 * Node: Aggregate results from all workflow steps
 */
export const aggregateResultsNode = async (state) => {
  console.log('--- Node: aggregateResultsNode ---');
  const { userInput, stepResults, stepSummaries, executionPlan, planningMetadata } = state;

  try {
    // Aggregate all step results
    const aggregatedResults = stepResults.map(step => ({
      step: step.step,
      app: step.app,
      action: step.action,
      success: step.result.success,
      data: step.result.tool_call_results || step.result.content
    }));

    // Create workflow summary from step summaries
    const workflowSummary = stepSummaries?.map(summary => ({
      step: summary.stepNumber,
      summary: summary.summary,
      status: summary.status,
      keyOutputs: summary.keyOutputs
    })) || [];

    // Generate comprehensive response
    const finalResponse = await generateUserResponse(
      userInput,
      'multi_step_workflow',
      'workflow_execution',
      {
        totalSteps: executionPlan.length,
        stepResults: aggregatedResults,
        workflowSummary: workflowSummary,
        workflowType: 'multi_step',
        planning: planningMetadata
      },
      false
    );

    console.log('Workflow aggregation completed');

    return {
      aggregatedResults,
      workflowSummary,
      response: finalResponse,
      executionResult: {
        success: true,
        totalSteps: executionPlan.length,
        completedSteps: stepResults.length,
        stepResults: aggregatedResults,
        workflowSummary: workflowSummary
      },
      currentStage: 'response_generation'
    };

  } catch (error) {
    console.error('Error in aggregateResultsNode:', error);
    return {
      error: {
        node: 'aggregateResults',
        message: error.message,
      },
      currentStage: 'error',
    };
  }
};

/**
 * Schedule Detection Node - Analyzes user input for scheduling requirements
 */
export const scheduleDetectionNode = async (state) => {
  try {
    console.log('Starting schedule detection...');

    const { userInput, workflowType, executionPlan, userId } = state;


    // Detect scheduling requirements
    const scheduleResult = await detectSchedulingRequirements(userInput);

    console.log('Schedule detection result:', scheduleResult);

    return {
      needsScheduling: scheduleResult.needsScheduling,
      schedulingDetected: scheduleResult.needsScheduling,
      scheduleType: scheduleResult.scheduleType,
      cronExpression: scheduleResult.cronExpression,
      oneTimeDate: scheduleResult.oneTimeDate,
      timezone: scheduleResult.timezone,
      scheduleDescription: scheduleResult.description,
      scheduleMetadata: scheduleResult.metadata,
      confidence: scheduleResult.confidence,
      currentStage: 'schedule_detection'
    };

  } catch (error) {
    console.error('Error in scheduleDetectionNode:', error);
    return {
      error: {
        node: 'schedule_detection',
        message: error.message,
      },
      needsScheduling: false,
      currentStage: 'error',
    };
  }
};

/**
 * Save Workflow Node - Saves workflow for scheduled execution
 */
export const saveWorkflowNode = async (state) => {
  try {
    console.log('Starting workflow save...');

    const { 
      userInput, 
      userId, 
      workflowType, 
      executionPlan, 
      requiredApps,
      scheduleType,
      cronExpression,
      oneTimeDate,
      timezone,
      scheduleDescription,
      scheduleMetadata,
      planningMetadata,
      crossStepParameters
    } = state;

    // Import workflow service
    const { workflowService } = await import('../services/workflow.service.js');

    // Prepare workflow data
    const workflowData = {
      name: scheduleMetadata?.workflowName || `Workflow for: ${userInput.substring(0, 50)}...`,
      description: userInput,
      userId: userId,
      workflowType: workflowType,
      executionPlan: executionPlan,
      requiredApps: requiredApps,
      crossStepParameters: crossStepParameters,
      totalSteps: executionPlan?.length || 1,
      
      // Scheduling data
      scheduleType: scheduleType,
      cronExpression: cronExpression,
      oneTimeDate: oneTimeDate,
      timezone: timezone || 'UTC',
      
      // Metadata
      planningMetadata: planningMetadata,
      createdFromInput: userInput,
      scheduleDetected: true
    };

    // Save the workflow
    const saveResult = await workflowService.createScheduledWorkflow(workflowData);

    if (!saveResult.success) {
      throw new Error(saveResult.error);
    }

    console.log('Workflow saved successfully:', saveResult.data.workflowId);

    // Prepare response message
    let responseMessage = `✅ **Workflow Scheduled Successfully!**\n\n`;
    responseMessage += `**Workflow ID:** ${saveResult.data.workflowId}\n`;
    responseMessage += `**Name:** ${saveResult.data.name}\n`;
    
    if (scheduleType === 'recurring') {
      responseMessage += `**Schedule:** ${scheduleDescription} (${cronExpression})\n`;
    } else if (scheduleType === 'one_time') {
      responseMessage += `**Scheduled for:** ${new Date(oneTimeDate).toLocaleString()}\n`;
    }
    
    responseMessage += `**Apps involved:** ${requiredApps?.join(', ') || 'Various'}\n`;
    responseMessage += `**Total steps:** ${executionPlan?.length || 1}\n\n`;
    
    responseMessage += `Your workflow has been saved and will execute automatically according to the schedule. `;
    responseMessage += `You can manage this workflow using the workflow ID: ${saveResult.data.workflowId}`;

    return {
      workflowSaved: true,
      savedWorkflowId: saveResult.data.workflowId,
      savedWorkflowData: saveResult.data,
      response: responseMessage,
      finalResponse: responseMessage,
      executionResult: {
        success: true,
        action: 'workflow_scheduled',
        workflowId: saveResult.data.workflowId,
        scheduleType: scheduleType,
        message: 'Workflow scheduled successfully'
      },
      currentStage: 'workflow_saved'
    };

  } catch (error) {
    console.error('Error in saveWorkflowNode:', error);
    
    let errorMessage = `❌ **Failed to Schedule Workflow**\n\n`;
    errorMessage += `Error: ${error.message}\n\n`;
    errorMessage += `Please try rephrasing your request or contact support if the issue persists.`;

    return {
      error: {
        node: 'save_workflow',
        message: error.message,
      },
      workflowSaved: false,
      response: errorMessage,
      finalResponse: errorMessage,
      currentStage: 'error',
    };
  }
};
