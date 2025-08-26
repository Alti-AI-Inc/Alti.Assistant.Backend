import { runAIClassificationAgent } from "./ai_classification/workflow.js";

/**
 * Main service for AI-powered user input classification and tool execution
 */

/**
 * Process user input through AI classification and execute the identified action
 */
export const processUserInputService = async (userInput, options = {}) => {
  const {
    userId = null,
    conversationId = null,
    history = []
  } = options;

  try {
    console.log(`Processing user input: "${userInput}" for user: ${userId}`);
    
    const result = await runAIClassificationAgent(userInput, {
      userId,
      conversationId,
      history
    });

    if (result.success) {
      console.log(`Successfully processed input. App: ${result.identifiedApp}, Action: ${result.identifiedAction}`);
      
      return {
        success: true,
        data: {
          userInput: result.userInput,
          identifiedApp: result.identifiedApp,
          identifiedAction: result.identifiedAction,
          confidence: result.confidence,
          executionResult: result.executionResult,
          response: result.response,
          conversationId: result.conversationId
        }
      };
    } else {
      console.error(`Failed to process input: ${result.error}`);
      
      return {
        success: false,
        error: result.error,
        data: {
          userInput: result.userInput,
          conversationId: result.conversationId
        }
      };
    }
  } catch (error) {
    console.error('Error in processUserInputService:', error);
    
    return {
      success: false,
      error: error.message,
      data: {
        userInput
      }
    };
  }
};

/**
 * Get user's connected accounts for apps
 */
export const getUserConnectedAccountsService = async (userId) => {
  try {
    const ComposionAuth = (await import('./composio.model.js')).default;
    
    const accounts = await ComposionAuth.find({
      userId: userId,
      status: 'active'
    });
    
    // Group accounts by app
    const accountsByApp = {};
    accounts.forEach(account => {
      if (account.integrationId) {
        const app = account.integrationId.toLowerCase();
        if (!accountsByApp[app]) {
          accountsByApp[app] = [];
        }
        accountsByApp[app].push({
          connectedAccountId: account.connectedAccountId,
          status: account.status,
          integrationId: account.integrationId
        });
      }
    });
    
    return {
      success: true,
      data: accountsByApp
    };
  } catch (error) {
    console.error('Error in getUserConnectedAccountsService:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check if user has required connections for an app
 */
export const checkUserConnectionsService = async (userId, appName) => {
  try {
    const ComposionAuth = (await import('./composio.model.js')).default;
    
    const accounts = await ComposionAuth.find({
      userId: userId,
      status: 'active'
    });
    
    const hasConnection = accounts.some(account => 
      account.integrationId && 
      account.integrationId.toLowerCase().includes(appName.toLowerCase())
    );
    
    return {
      success: true,
      data: {
        hasConnection,
        appName,
        connectedAccounts: accounts.filter(account => 
          account.integrationId && 
          account.integrationId.toLowerCase().includes(appName.toLowerCase())
        )
      }
    };
  } catch (error) {
    console.error('Error in checkUserConnectionsService:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export const aiClassificationService = {
  processUserInputService,
  getUserConnectedAccountsService,
  checkUserConnectionsService
};
