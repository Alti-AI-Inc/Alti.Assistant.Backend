import { GoogleGenAI } from '@google/genai';
import config from '../../../../../config/index.js';
import { getAgent, getAgentList } from './specializedCodingAgents.js';
import { vertexClaudeService } from '../../search/services/vertexClaudeService.js';
import { logger } from '../../../../shared/logger.js';

/**
 * @typedef {Object} ChatMessage
 * @property {'user' | 'assistant' | 'model'} role - The role of the message sender.
 * @property {string} content - The content of the message.
 */

/**
 * Initializes the GoogleGenAI client for interacting with Vertex AI.
 * This client is configured to use a specific GCP project and region for Gemini model interactions.
 * @type {GoogleGenAI}
 */
const ai = new GoogleGenAI({
  vertexAI: {
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
  },
});

/**
 * A helper function to interact with Google Gemini 3.1 Pro on Vertex AI for various coding tasks.
 * It handles the conversation history and system instructions to guide the model's behavior.
 *
 * @param {string} systemPrompt - The system prompt to guide the model's behavior and define its persona.
 * @param {Array<ChatMessage>} history - The conversation history, an array of message objects.
 * @returns {Promise<string>} A promise that resolves to the model's generated text response.
 *   Returns 'No reply generated' if the model returns an empty response.
 *   Returns an error message string if an exception occurs during the API call.
 * @throws {Error} If there's an issue with the Google Vertex AI API call.
 */
async function runGeminiTask(systemPrompt, history) {
  try {
    logger.info('Calling Vertex Claude Sonnet 4.5 for coding task...');
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push(...history);

    const result = await vertexClaudeService.generateText(messages, {
      temperature: 0.2,
    });
    return result.text || 'No reply generated';
  } catch (claudeError) {
    logger.warn(`Vertex Claude failed for coding task, falling back to Gemini: ${claudeError.message}`);
    
    try {
      // Translate user and assistant roles to Gemini's expected formats ('user' and 'model')
      const contents = history
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'model')
        .map((msg) => ({
          role: (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user',
          parts: [{ text: msg.content }],
        }));

      const result = await ai.models.generateContent({
        model: config.gemini_pro_model || 'gemini-2.5-pro', // Specifies the Gemini Pro model
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2, // Lower temperature for more focused and less creative responses
        },
      });

      return result?.text || 'No reply generated';
    } catch (error) {
      console.error('Error calling Google Vertex AI for coding task:', error);
      return 'Sorry, I encountered an error while processing your request with the coding model. Please try again.';
    }
  }
}

/**
 * Routes the user's initial coding query to the most appropriate specialized coding agent.
 * 
 * @param {string} query - The user's input/query.
 * @returns {Promise<object>} The resolved routing details.
 */
export const routeToSpecializedCodingAgent = async (query) => {
  try {
    const agents = getAgentList();
    const agentsListStr = agents
      .map(a => `- ID: "${a.id}", Name: "${a.name}", Description: "${a.description}"`)
      .join('\n');

    const prompt = `You are a smart routing orchestrator for an AI coding assistant.
Your task is to analyze the user's coding request and select the appropriate Specialized Type Agent (language/framework), Coding Style Agent, and Task/Purpose Agent from the list below.
You must also decide if a multi-agent Swarm Orchestration is needed (recommended for complex, structural, multi-file, or high-quality requests; set isSwarm to true).

Available Agents:
${agentsListStr}

User Request: "${query}"

Respond ONLY with a valid JSON object matching the following structure. Do not wrap in markdown code blocks, do not include explanations, and do not add any text before or after the JSON. Ensure all agent IDs are from the list above or "general".

{
  "typeAgent": "the_chosen_type_agent_id_or_general",
  "styleAgent": "the_chosen_style_agent_id_or_general",
  "purposeAgent": "the_chosen_purpose_agent_id_or_general",
  "isSwarm": true_or_false
}`;

    const result = await ai.models.generateContent({
      model: config.gemini_pro_model || 'gemini-2.5-pro',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
      }
    });

    const responseText = result?.text?.trim() || '{}';
    let parsed = { typeAgent: 'general', styleAgent: 'general', purposeAgent: 'general', isSwarm: false };
    try {
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = { ...parsed, ...JSON.parse(cleanJson) };
    } catch (e) {
      console.warn('Failed to parse routing JSON in code assistant, trying fallback:', e.message);
    }

    const validIds = new Set(['general', ...agents.map(a => a.id)]);
    if (!validIds.has(parsed.typeAgent)) parsed.typeAgent = 'general';
    if (!validIds.has(parsed.styleAgent)) parsed.styleAgent = 'general';
    if (!validIds.has(parsed.purposeAgent)) parsed.purposeAgent = 'general';

    return parsed;
  } catch (error) {
    console.error('Error routing coding request to specialized agent:', error);
    return { typeAgent: 'general', styleAgent: 'general', purposeAgent: 'general', isSwarm: false }; // Graceful fallback
  }
};

/**
 * Coordinates a multi-agent coding swarm to generate, test, review, and document code.
 * 
 * @param {string} brief - The coding prompt or instruction.
 * @param {Array} history - The conversation history.
 * @param {string} typeAgent - Type agent ID.
 * @param {string} styleAgent - Style agent ID.
 * @param {string} purposeAgent - Purpose agent ID.
 * @returns {Promise<string>} The integrated code package in markdown.
 */
export const generateSwarmCode = async (brief, history, typeAgent, styleAgent, purposeAgent) => {
  const typeAgentObj = getAgent(typeAgent);
  const styleAgentObj = getAgent(styleAgent);
  const purposeAgentObj = getAgent(purposeAgent);

  console.log(`[Swarm Orchestration] Starting Multi-Agent Coding Swarm...`);

  // 1. Architect Step
  const architectPrompt = `Create a software architecture and module blueprint based on the following task:
Brief:
${brief}

History:
${history.map(h => `${h.role}: ${h.content}`).join('\n')}`;
  const blueprint = await runGeminiTask(getAgent('swarm_architect').systemPrompt, [{ role: 'user', content: architectPrompt }]);

  // 2. Coder Step
  const coderPrompt = `Implement the source code strictly following this architectural blueprint.
Blueprint:
${blueprint}

Brief:
${brief}

Specific Coding Directives:
${typeAgentObj.systemPrompt}
${styleAgentObj.systemPrompt}`;
  const code = await runGeminiTask(getAgent('swarm_coder').systemPrompt, [{ role: 'user', content: coderPrompt }]);

  // 3. Tester Step
  const testerPrompt = `Generate comprehensive unit and integration tests for the code below.
Code:
${code}

Brief:
${brief}`;
  const tests = await runGeminiTask(getAgent('swarm_tester').systemPrompt, [{ role: 'user', content: testerPrompt }]);

  // 4. Reviewer Step
  const reviewerPrompt = `Review the code and tests below for logical bugs, syntax errors, security holes, and code complexity.
Code:
${code}

Tests:
${tests}

Specific Directives:
${purposeAgentObj.systemPrompt}`;
  const review = await runGeminiTask(getAgent('swarm_reviewer').systemPrompt, [{ role: 'user', content: reviewerPrompt }]);

  // 5. Documenter Step
  const documenterPrompt = `Generate clean documentations/docstrings and a README with dependency install/running guides for the code.
Code:
${code}

Review:
${review}`;
  const docs = await runGeminiTask(getAgent('swarm_documenter').systemPrompt, [{ role: 'user', content: documenterPrompt }]);

  // 6. Editor Step (Final integration)
  const editorPrompt = `You are the Swarm Final Code Editor. Combine the blueprints, implementation code, unit tests, reviewer feedback, and developer documentation into a single, cohesive, premium deliverable. Ensure clear markdown sections.

Architect Blueprint:
${blueprint}

Implementation Code:
${code}

Unit Tests:
${tests}

Reviewer Audit:
${review}

Documentation:
${docs}`;
  
  const finalResult = await runGeminiTask(getAgent('swarm_editor').systemPrompt, [{ role: 'user', content: editorPrompt }]);

  const header = `> **[Swarm Orchestration Mode Activated]**
> 🤖 **Agents Collaborating:**
> - **Architect**: *${getAgent('swarm_architect').name}*
> - **Developer Role**: *${typeAgentObj.name}*
> - **Coding Style**: *${styleAgentObj.name}*
> - **Task Directive**: *${purposeAgentObj.name}*

\n\n`;

  return header + finalResult;
};

/**
 * Generic runner that executes a coding assistant task with smart routing and swarms.
 * 
 * @param {string} defaultPrompt - The fallback system prompt for the task.
 * @param {Array<ChatMessage>} history - The conversation history.
 * @param {object} [state={}] - Optional LangGraph state context.
 * @returns {Promise<string>} The generated result string.
 */
async function resolveRoutingAndExecute(defaultPrompt, history, state = {}) {
  const lastMessage = history[history.length - 1]?.content || '';
  
  let typeAgent = state.selectedAgent || null;
  let styleAgent = state.selectedStyle || null;
  let purposeAgent = state.selectedPurpose || null;
  let isSwarm = state.isSwarm || false;

  // Execute smart routing dynamically if typeAgent is not resolved yet
  if (!typeAgent) {
    const routing = await routeToSpecializedCodingAgent(lastMessage);
    typeAgent = routing.typeAgent;
    styleAgent = routing.styleAgent;
    purposeAgent = routing.purposeAgent;
    isSwarm = routing.isSwarm;
  }

  if (isSwarm) {
    return generateSwarmCode(lastMessage, history, typeAgent, styleAgent, purposeAgent);
  }

  // Single Agent Execution: Combine specialized prompts if they are not 'general' fallback
  const agentObj = typeAgent && typeAgent !== 'general' ? getAgent(typeAgent) : null;
  const styleObj = styleAgent && styleAgent !== 'general' ? getAgent(styleAgent) : null;
  const purposeObj = purposeAgent && purposeAgent !== 'general' ? getAgent(purposeAgent) : null;

  let combinedPrompt = defaultPrompt;
  if (agentObj) {
    combinedPrompt += `\n\n- Specialized Agent: ${agentObj.name} (${agentObj.description})\n- Directives: ${agentObj.systemPrompt}`;
  }
  if (styleObj) {
    combinedPrompt += `\n\n- Style Standards: ${styleObj.systemPrompt}`;
  }
  if (purposeObj) {
    combinedPrompt += `\n\n- Task Focus: ${purposeObj.systemPrompt}`;
  }

  const result = await runGeminiTask(combinedPrompt, history);
  if (result === 'No reply generated' || result.startsWith('Sorry, I encountered an error')) {
    return result;
  }
  
  // Construct dynamic active agent header if any specialized agent was activated
  if (agentObj || styleObj || purposeObj) {
    const activeAgentName = agentObj ? agentObj.name : 'General Coding Assistant';
    const activeStyleName = styleObj ? styleObj.name : 'General';
    const activePurposeName = purposeObj ? purposeObj.name : 'General';

    const header = `> 🤖 **Active Specialist:** *${activeAgentName}* | **Style**: *${activeStyleName}* | **Focus**: *${activePurposeName}*\n\n`;
    return header + result;
  }
  
  return result;
}

/**
 * An exported function that acts as a specialized code generation assistant using Gemini.
 * It takes a conversation history and generates code based on the user's request,
 * including instructions on how to run the generated code.
 *
 * @param {Array<ChatMessage>} history - The conversation history leading up to the code generation request.
 * @param {object} [state={}] - Optional LangGraph state context.
 * @returns {Promise<string>} A promise that resolves to the generated code and running instructions in markdown format.
 */
export const codeGenerator = (history, state = {}) => {
  const systemPrompt = `You are an expert code generation assistant. Your task is to generate clean, efficient, and well-documented code based on the user's request.
- Analyze the user's request from the conversation history.
- Provide the code in a clear markdown block.
- After the code block, provide a section titled "How to Run" that includes step-by-step commands for running the code.
- This section must include any necessary dependency installation commands (e.g., 'npm install axios', 'pip install requests') and the exact command to execute the code (e.g., 'node index.js', 'python app.py').
- If any other setup is needed (like creating a file or setting environment variables), explain that as well.`;
  return resolveRoutingAndExecute(systemPrompt, history, state);
};

/**
 * An exported function that acts as a specialized code explanation assistant using Gemini.
 * It takes a conversation history and explains a piece of code provided by the user.
 *
 * @param {Array<ChatMessage>} history - The conversation history containing the code to be explained.
 * @param {object} [state={}] - Optional LangGraph state context.
 * @returns {Promise<string>} A promise that resolves to a detailed explanation of the code.
 */
export const codeExplainer = (history, state = {}) => {
  const systemPrompt = `You are an expert code explanation assistant. Your task is to explain a piece of code provided by the user.
- Analyze the user's request and the provided code from the conversation history.
- Break down the code into logical parts and explain each part clearly.
- Use analogies if they help clarify complex concepts.`;
  return resolveRoutingAndExecute(systemPrompt, history, state);
};

/**
 * An exported function that acts as a specialized code debugging assistant using Gemini.
 * It takes a conversation history, identifies bugs in the provided code, suggests fixes,
 * and explains the cause and resolution of the bug.
 *
 * @param {Array<ChatMessage>} history - The conversation history containing the problematic code and bug description.
 * @param {object} [state={}] - Optional LangGraph state context.
 * @returns {Promise<string>} A promise that resolves to the debugging analysis, corrected code, and explanations.
 */
export const codeDebugger = (history, state = {}) => {
  const systemPrompt = `You are an expert code debugging assistant. Your task is to help the user find and fix bugs in their code.
- Analyze the user's problem description and the provided code from the conversation history.
- Identify the likely cause of the bug.
- Suggest a corrected version of the code, highlighting the changes.
- Explain why the bug occurred and how the fix resolves it.`;
  return resolveRoutingAndExecute(systemPrompt, history, state);
};

/**
 * An exported function that acts as a specialized best practices advisor using Gemini.
 * It reviews user-provided code and suggests improvements based on software engineering best practices.
 *
 * @param {Array<ChatMessage>} history - The conversation history containing the code to be reviewed.
 * @param {object} [state={}] - Optional LangGraph state context.
 * @returns {Promise<string>} A promise that resolves to suggestions for improving code quality, readability, performance, security, and maintainability.
 */
export const bestPracticesAdvisor = (history, state = {}) => {
  const systemPrompt = `You are an expert software engineering advisor. Your task is to review the user's code and suggest improvements based on best practices.
- Analyze the provided code from the conversation history.
- Suggest improvements related to readability, performance, security, and maintainability.
- Provide code examples for your suggestions.`;
  return resolveRoutingAndExecute(systemPrompt, history, state);
};

/**
 * An exported function that acts as a general-purpose AI coding assistant using Gemini.
 * It engages in a versatile conversation, answering follow-up questions, refining code,
 * and maintaining context for broad coding assistance.
 *
 * @param {Array<ChatMessage>} history - The ongoing conversation history with the user.
 * @param {object} [state={}] - Optional LangGraph state context.
 * @returns {Promise<string>} A promise that resolves to a helpful and context-aware response from the assistant.
 */
export const generalCodeAssistant = (history, state = {}) => {
  const systemPrompt = `You are a helpful and versatile AI coding assistant. Engage in a conversation with the user about their coding needs.
- Answer follow-up questions.
- Refine previously generated code.
- Maintain the context of the conversation to provide relevant and accurate assistance.`;
  return resolveRoutingAndExecute(systemPrompt, history, state);
};

/**
 * An exported function that acts as a code refinement assistant using Gemini.
 * It improves user-provided code based on their feedback, focusing on quality, readability, and performance.
 *
 * @param {Array<ChatMessage>} history - The conversation history containing the code and user feedback for refinement.
 * @param {object} [state={}] - Optional LangGraph state context.
 * @returns {Promise<string>} A promise that resolves to a revised version of the code with explanations for the changes made.
 */
export const refineCode = (history, state = {}) => {
  const systemPrompt = `You are a code refinement assistant. Your task is to improve the user's code based on their feedback.
- Analyze the user's feedback and the provided code from the conversation history.
- Suggest improvements to enhance code quality, readability, and performance.
- Provide a revised version of the code with explanations for the changes made.`;
  return resolveRoutingAndExecute(systemPrompt, history, state);
};