import { GoogleGenerativeAI } from '@google/generative-ai';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { llm } from '../llm.js';
import config from '../../../../../config/index.js';
import { getAgent, getAgentList } from './specializedAgents.js';

/**
 * A generic function to interact with a generative AI model for writing tasks.
 * This function acts as a wrapper, standardizing interaction with the configured model provider.
 * @param {string} systemPrompt - The system prompt to guide the model's behavior.
 * @param {string|Array} message - The conversation history or a single user query.
 * @param {boolean} stream - Whether to stream the response.
 * @param {object} [user=null] - The user object, for future use with usage tracking and limits.
 * @returns {Promise<any>} - The model's response text or an async generator for streaming.
 * @throws {Error} If the API call fails or an error occurs during processing.
 */
async function runGenerativeTask(systemPrompt, message, stream = false, user = null) {
  // TODO: Implement input/output token usage tracking for the user.
  // e.g., const usage = await usageService.recordUsage(user.id, 'gemini-3.5-flash', { inputTokens, outputTokens });
  try {
    const apiKey = config.gemini_secret_key || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: 'gemini-3.5-flash',
      systemInstruction: systemPrompt
    });

    // Sanitize and format the conversation history for the Gemini API.
    const contents = [];
    const messages = Array.isArray(message) ? message : [{ role: 'user', content: message }];

    for (const msg of messages) {
      let role = msg.role;
      if (role === 'assistant') {
        role = 'model';
      } else if (role !== 'user' && role !== 'model') {
        // Default unrecognized roles to 'user' to avoid API errors.
        role = 'user';
      }
      const text = typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '');
      if (!text) continue; // Skip empty messages.

      // Gemini API requires alternating roles. Merge consecutive messages from the same role.
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts.push({ text });
      } else {
        contents.push({ role, parts: [{ text }] });
      }
    }

    // Gemini API requires the conversation to start with a 'user' role.
    if (contents.length > 0 && contents[0].role === 'model') {
      contents.unshift({ role: 'user', parts: [{ text: 'Continue the conversation.' }] });
    }

    if (stream) {
      const resultStream = await model.generateContentStream({ contents });
      
      // Adapt the Gemini stream to a generic format expected by the frontend/client.
      // This adapter mimics the Anthropic streaming format for compatibility.
      const adaptedStream = {
        async *[Symbol.asyncIterator]() {
          for await (const chunk of resultStream.stream) {
            // Ensure chunk and text() exist to prevent runtime errors on empty chunks.
            const chunkText = chunk && typeof chunk.text === 'function' ? chunk.text() : '';
            if (chunkText) {
              yield {
                type: 'content_block_delta',
                delta: {
                  type: 'text_delta',
                  text: chunkText
                }
              };
            }
          }
        }
      };
      return adaptedStream;
    }

    const result = await model.generateContent({ contents });
    return result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error) {
    console.error('Error calling Generative AI API in writing service:', error);
    // Throw a new error with a user-friendly message.
    // The controller layer is responsible for catching this and sending the appropriate HTTP response.
    throw new Error('Sorry, I encountered an error while processing your request. Please try again.');
  }
}
/**
 * Analyzes the user's initial topic and generates clarifying questions.
 * @param {string} topic - The user's initial topic.
 * @param {object} user - The authenticated user object for usage tracking.
 * @returns {Promise<string[]>} - An array of questions.
 * @throws {Error} If the LLM call fails or the response cannot be parsed.
 */
export const generateWritingQuestions = async (topic, user) => {
  // TODO: Verify user has sufficient credits/permissions to perform this action.
  // e.g., if (!await usageService.canPerformAction(user.id, 'generate_writing_questions')) {
  //   throw new Error('Usage limit exceeded. Please upgrade your plan.');
  // }

  const prompt = `A user wants to write something about: "${topic}".
    To help them, generate 3-5 insightful, open-ended questions to understand their needs better.
    Consider asking about: target audience, desired format (e.g., essay, blog post, social media update), key points to include, and desired tone (e.g., formal, casual, persuasive).
    Return ONLY a JSON object with a single key "questions" which is an array of strings.`;

  try {
    const parser = new JsonOutputParser();
    const chain = llm.pipe(parser);
    const result = await chain.invoke(prompt);

    // TODO: Record the action in user usage metrics after a successful call.
    // e.g., await usageService.recordAction(user.id, 'generate_writing_questions', { ...usage_details });

    return result.questions || [];
  } catch (error) {
    console.error('Error generating writing questions:', error);
    throw new Error('Failed to generate clarifying questions. Please try again.');
  }
};

/**
 * Updates the writing brief with new details from the user.
 * @param {string} currentBrief - The existing writing brief.
 * @param {string} userResponse - The user's new input.
 * @param {Array} history - The conversation history for context.
 * @param {object} user - The authenticated user object for usage tracking.
 * @returns {Promise<string>} - The new, updated brief.
 * @throws {Error} If the LLM call fails.
 */
export const updateWritingBrief = async (
  currentBrief,
  userResponse,
  history,
  user
) => {
  // TODO: Verify user has sufficient credits/permissions.
  // e.g., if (!await usageService.canPerformAction(user.id, 'update_writing_brief')) {
  //   throw new Error('Usage limit exceeded.');
  // }

  const historyString = history
    .map((h) => `${h.role}: ${h.content}`)
    .join('\n');
  const prompt = `You are an AI assistant helping a user build a detailed brief for a writing task.
    The current brief is:
    ---
    ${currentBrief}
    ---
    The user has just provided new information: "${userResponse}".
    Integrate this new information into the brief, creating a more detailed and cohesive set of instructions for a writer.
    
    Full Conversation History (for context):
    ${historyString}

    Return ONLY the new, updated brief.`;
  
  try {
    const result = await llm.invoke(prompt);
    
    // TODO: Record the action in user usage metrics.
    // e.g., await usageService.recordAction(user.id, 'update_writing_brief', { ...usage_details });

    return result.content;
  } catch (error) {
    console.error('Error updating writing brief:', error);
    throw new Error('Failed to update the writing brief. Please try again.');
  }
};

/**
 * Routes the user's initial writing topic to the most appropriate specialized writing agent.
 * 
 * @param {string} topic - The user's input/topic.
 * @returns {Promise<string>} The ID of the chosen specialized writing agent, or 'general'.
 */
export const routeToSpecializedAgent = async (topic) => {
  try {
    const apiKey = config.gemini_secret_key || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { typeAgent: 'general', styleAgent: 'general', purposeAgent: 'general', isSwarm: false };
    }
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: 'gemini-1.5-flash-latest',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 150
      }
    });

    const agents = getAgentList();
    const agentsListStr = agents
      .map(a => `- ID: "${a.id}", Name: "${a.name}", Description: "${a.description}"`)
      .join('\n');

    const prompt = `You are a smart routing orchestrator for an AI writing assistant.
Your task is to analyze the user's writing request and select the appropriate Specialized Type Agent, Writing Style, and Writing Purpose from the list below. You must also decide if a multi-agent Swarm Orchestration is needed (recommended for complex, detailed, multi-section, or high-quality requests).

Available Agents:
${agentsListStr}

User Request: "${topic}"

Respond ONLY with a valid JSON object matching the following structure. Do not wrap in markdown code blocks, do not include explanations, and do not add any text before or after the JSON. Ensure all agent IDs are from the list above or "general".

{
  "typeAgent": "the_chosen_type_agent_id_or_general",
  "styleAgent": "the_chosen_style_agent_id_or_general",
  "purposeAgent": "the_chosen_purpose_agent_id_or_general",
  "isSwarm": true_or_false
}`;

    const result = await model.generateContent(prompt);
    const responseText = result?.response?.text()?.trim() || '{}';
    
    let parsed = { typeAgent: 'general', styleAgent: 'general', purposeAgent: 'general', isSwarm: false };
    try {
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = { ...parsed, ...JSON.parse(cleanJson) };
    } catch (e) {
      console.warn('Failed to parse routing JSON, trying plain string fallback:', e.message);
      const cleanedId = responseText.replace(/['"`]/g, '').trim();
      const validIds = new Set(agents.map(a => a.id));
      if (validIds.has(cleanedId)) {
        parsed.typeAgent = cleanedId;
      }
    }

    const validIds = new Set(['general', ...agents.map(a => a.id)]);
    if (!validIds.has(parsed.typeAgent)) parsed.typeAgent = 'general';
    if (!validIds.has(parsed.styleAgent)) parsed.styleAgent = 'general';
    if (!validIds.has(parsed.purposeAgent)) parsed.purposeAgent = 'general';
    
    return parsed;
  } catch (error) {
    console.error('Error routing writing request to specialized agent:', error);
    return { typeAgent: 'general', styleAgent: 'general', purposeAgent: 'general', isSwarm: false }; // Graceful fallback
  }
};

/**
 * Coordinates a multi-agent swarm to outline, draft, style, and edit the final content.
 * 
 * @param {string} brief - The writing brief.
 * @param {Array} history - The conversation history.
 * @param {boolean} stream - Flag to indicate if response should be streamed.
 * @param {object} user - The user object.
 * @param {string} typeAgent - Type agent ID.
 * @param {string} styleAgent - Style agent ID.
 * @param {string} purposeAgent - Purpose agent ID.
 * @returns {Promise<any>} The content stream or text.
 */
export const generateSwarmContent = async function* (
  brief,
  history,
  stream,
  user,
  typeAgent,
  styleAgent,
  purposeAgent
) {
  const typeName = getAgent(typeAgent).name;
  const styleName = getAgent(styleAgent).name;
  const purposeName = getAgent(purposeAgent).name;

  // Stream intermediate updates if streaming is enabled
  if (stream) {
    yield {
      type: 'content_block_delta',
      delta: {
        type: 'text_delta',
        text: `> **[Swarm Orchestration Mode Activated]**\n> 🤖 **Agents Collaborating:**\n> - **Writer Role**: *${typeName}*\n> - **Stylist Role**: *${styleName}*\n> - **Purpose Goal**: *${purposeName}*\n\n`
      }
    };

    yield {
      type: 'content_block_delta',
      delta: {
        type: 'text_delta',
        text: `⏳ *Step 1/4: Swarm Outline Planner is creating a structured document plan...*\n\n`
      }
    };
  }

  // 1. Outline Step
  const outlinePrompt = `Create a structured markdown outline/plan based on the following writing brief.
Brief:
${brief}
History:
${history.map(h => `${h.role}: ${h.content}`).join('\n')}`;
  const outline = await runGenerativeTask(getAgent('swarm_outliner').systemPrompt, outlinePrompt, false, user);

  if (stream) {
    yield {
      type: 'content_block_delta',
      delta: {
        type: 'text_delta',
        text: `📋 *Outline generated successfully. Directing Swarm Draft Writer to write the copy...*\n\n`
      }
    };
  }

  // 2. Draft Step
  const typeAgentObj = getAgent(typeAgent);
  const draftPrompt = `Write the first draft based on the outline below.
Outline:
${outline}

Brief:
${brief}

Specific Writer Directives:
${typeAgentObj.systemPrompt}`;
  const draft = await runGenerativeTask(getAgent('swarm_writer').systemPrompt, draftPrompt, false, user);

  if (stream) {
    yield {
      type: 'content_block_delta',
      delta: {
        type: 'text_delta',
        text: `✍️ *Draft completed. Directing Stylist and Purpose agents to refine tone...*\n\n`
      }
    };
  }

  // 3. Style Adaptation Step
  const styleAgentObj = getAgent(styleAgent);
  const purposeAgentObj = getAgent(purposeAgent);
  const stylePrompt = `Polish the draft to match the specified style and purpose.
Draft:
${draft}

Style Directive:
${styleAgentObj.systemPrompt}

Purpose Directive:
${purposeAgentObj.systemPrompt}`;
  const polished = await runGenerativeTask(getAgent('swarm_style_adapter').systemPrompt, stylePrompt, false, user);

  if (stream) {
    yield {
      type: 'content_block_delta',
      delta: {
        type: 'text_delta',
        text: `✨ *Tone refined. Initiating final review, revision, and delivery by Revision Editor...*\n\n---\n\n`
      }
    };
  }

  // 4. Final Edit Step
  const editorPrompt = `Edit and proofread the polished text. Correct any spelling or grammatical errors, improve sentence transitions, and ensure standard formatting.
Polished Text:
${polished}`;
  if (stream) {
    const editStream = await runGenerativeTask(getAgent('swarm_editor').systemPrompt, editorPrompt, true, user);
    for await (const chunk of editStream) {
      yield chunk;
    }
  } else {
    const finalResult = await runGenerativeTask(getAgent('swarm_editor').systemPrompt, editorPrompt, false, user);
    yield {
      type: 'content_block_delta',
      delta: {
        type: 'text_delta',
        text: finalResult
      }
    };
  }
};

/**
 * Generates the final written content based on a detailed brief.
 * @param {string} brief - The final, detailed writing brief.
 * @param {Array} history - The full conversation history to provide context.
 * @param {boolean} stream - Flag to indicate if the response should be streamed.
 * @param {object} user - The authenticated user object for usage tracking.
 * @param {string} [selectedAgentId] - The ID of the selected specialized writing agent.
 * @param {string} [selectedStyleId='general'] - The ID of the writing style agent.
 * @param {string} [selectedPurposeId='general'] - The ID of the purpose agent.
 * @param {boolean} [isSwarm=false] - Whether to run swarm orchestration.
 * @returns {Promise<any>} - The generated content as a string or a stream.
 */
export const generateFinalContent = (
  brief,
  history,
  stream,
  user,
  selectedAgentId,
  selectedStyleId = 'general',
  selectedPurposeId = 'general',
  isSwarm = false
) => {
  // TODO: Verify user has sufficient credits/permissions for final generation.
  
  if (isSwarm) {
    return generateSwarmContent(
      brief,
      history,
      stream,
      user,
      selectedAgentId || 'general',
      selectedStyleId || 'general',
      selectedPurposeId || 'general'
    );
  }

  const agent = getAgent(selectedAgentId);
  const systemPrompt = `${agent.systemPrompt}

Adhere strictly to all instructions in the brief regarding format, tone, audience, and key points.

The final, detailed brief is:
---
${brief}
---

Now, write the final piece.`;

  return runGenerativeTask(systemPrompt, history, stream, user);
};