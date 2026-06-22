// codeGeneration.js - Dedicated code generation endpoint using Claude Sonnet 4.5
import { prepareConversationContext } from './utils/historyManager.js';
import { executeToolBasedConversation } from './services/reactAgent.js';
import Conversation from '../conversations/conversation.model.js';
import { decryptConversation } from '../conversations/conversation.helpers.js';
import { vertexClaudeService } from './services/vertexClaudeService.js';

/**
 * Dedicated code generation function using Claude Sonnet 4.5.
 *
 * This function orchestrates the code generation process, leveraging a sophisticated
 * decision framework to determine whether to generate code directly from its knowledge base
 * or to utilize optional web search tools via a ReAct agent.
 *
 * APPROACH:
 * - 95% of requests: Generate code directly from knowledge base for established patterns,
 *   frameworks, and common programming tasks.
 * - 5% of requests: Use search only when absolutely necessary, such as for bleeding-edge
 *   technologies, very recent releases (<6 months), or explicit "latest" requests.
 * - Optional search is facilitated by a ReAct agent with Google Custom Search and WebBrowser tools.
 *
 * DECISION FRAMEWORK:
 * - Generate directly for: Standard frameworks (e.g., Express.js, React), common patterns (e.g., JWT auth, CRUD),
 *   established libraries, API implementations, authentication, data processing, etc.
 * - Search only for: Very recent releases (<6 months), explicit "latest" requests, genuine uncertainty
 *   about current best practices or API syntax for new technologies.
 *
 * @param {object} state - An object containing the current state and context for the code generation request.
 * @param {string} state.currentQuery - The user's current query for code generation.
 * @param {string} [state.query] - An alternative property for the user's current query.
 * @param {string} [state.userId] - The ID of the user making the request.
 * @param {string} [state.authUserId] - An alternative property for the authenticated user's ID.
 * @param {object} [state.user] - User object, potentially containing `id`.
 * @param {string} [state.conversationId] - The ID of the ongoing conversation, used to retrieve history.
 * @param {Array<object>} [state.conversationContext] - An array of message objects representing the conversation history.
 * @param {string} [state.conversationSummary] - A summary of the conversation history.
 * @param {boolean} [stream=false] - Whether to stream the response back to the client.
 * @returns {Promise<object>} - A promise that resolves to an object containing the code generation result.
 *   The result object typically includes:
 *   - `answer`: The generated code and accompanying explanation.
 *   - `reference`: Any references used (e.g., from search results).
 *   - `citations`: Detailed citations for any external information.
 *   - `citationMetadata`: Additional metadata about the generation process, including error information if applicable.
 * @throws {Error} If an unexpected error occurs during the code generation process.
 */
export const runCodeGeneration = async (state, stream = false) => {
  try {
    console.log('🔧 Running dedicated code generation with Claude Sonnet 4.5');

    const query = state.currentQuery || state.query || '';
    const userId = state.userId || state.authUserId || state?.user?.id || null;

    // Handle conversation context
    let conversationContext;
    let existingSummary = state.conversationSummary || null;

    if (state.conversationContext !== undefined) {
      conversationContext = state.conversationContext;
    } else if (state.conversationId) {
      const conversation = await Conversation.findOne({
        conversationId: state.conversationId,
      })
        .select('messages conversationSummary')
        .lean();
      const decryptedConv = decryptConversation(conversation);
      conversationContext = decryptedConv?.messages || [];
      existingSummary = decryptedConv?.conversationSummary || existingSummary;
    } else {
      conversationContext = [];
    }

    console.log('Length of conversation context:', conversationContext.length);

    // Filter and prepare context - remove duplicate consecutive user messages
    conversationContext = conversationContext.filter((item, index, arr) => {
      if (item.role === 'user')
        return index === 0 || arr[index - 1]?.role !== 'user';
      return true;
    });

    // Manage conversation history intelligently
    const contextResult = await prepareConversationContext(
      conversationContext,
      existingSummary,
      query
    );
    const conversationHistory = contextResult.formattedContext;

    console.log(
      `✅ Context prepared: ${contextResult.contextTokens} tokens (managed: ${contextResult.isOptimized})`
    );

    // Get current date context
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentDateString = currentDate.toDateString();

    // Comprehensive system prompt for code generation with optional search capability
    const systemPrompt = `You are an expert code generation assistant powered by Claude Sonnet 4.5. Your primary task is to generate high-quality, production-ready code based on user requests.

CURRENT CONTEXT:
- Today's date: ${currentDateString}
- Current year: ${currentYear}

CORE PRINCIPLES FOR CODE GENERATION:
1. **GENERATE ACTUAL CODE** - Provide complete, working code implementations
2. **BEST PRACTICES** - Follow language-specific best practices and conventions
3. **DOCUMENTATION** - Include clear comments explaining complex logic
4. **ERROR HANDLING** - Implement proper error handling and validation
5. **SECURITY** - Follow security best practices (no hardcoded secrets, proper input validation)
6. **MODERN SYNTAX** - Use modern language features and up-to-date patterns

SEARCH CAPABILITY (OPTIONAL - USE ONLY WHEN NECESSARY):
You have access to web search tools (google-custom-search, web-browser). These are OPTIONAL tools.

⚠️ IMPORTANT: Only use search when you genuinely need external information. Most code generation requests can be handled directly from your knowledge base.

**When to USE search:**
- You need documentation for a very recent library/framework (released in last 6 months)
- You're unsure about current API syntax for a specific library
- The request involves bleeding-edge technologies you're not confident about
- You need to verify a specific security vulnerability or recent best practice change
- The user explicitly asks for "latest", "current", or "most recent" approaches

**When to NOT use search (generate directly):
- Standard, well-established patterns (Express.js setup, JWT auth, etc.)
- Common frameworks and libraries (React, Node.js, Python, etc.)
- General programming concepts and algorithms
- Database queries and ORMs (MongoDB, SQL, etc.)
- Authentication patterns, REST APIs, CRUD operations
- File operations, data processing, validation logic
- Testing frameworks and patterns
- Most web development tasks with established patterns

**DEFAULT BEHAVIOR: Generate code directly without search unless you have a specific reason to search.**

RESPONSE FORMAT:
1. **Brief Introduction** (1-2 lines): State what you're creating
2. **Code Implementation**: Complete, working code with comments
3. **Usage Example**: Show how to use the code
4. **Setup Instructions** (if needed): Dependencies, environment setup
5. **Important Notes** (if relevant): Security considerations, limitations, etc.

CODE QUALITY REQUIREMENTS:
- ✅ Complete implementations (not pseudo-code)
- ✅ Proper error handling
- ✅ Input validation
- ✅ Clear variable and function names
- ✅ Inline comments for complex logic
- ✅ Follow DRY principles
- ✅ Modular and maintainable
- ✅ Production-ready (no TODOs or placeholders)

LANGUAGE-SPECIFIC GUIDELINES:
**JavaScript/Node.js:**
- Use ES6+ syntax (const/let, arrow functions, async/await)
- Proper error handling with try-catch
- Use modern libraries and frameworks
- Include JSDoc comments for functions

**Python:**
- Follow PEP 8 style guide
- Use type hints where appropriate
- Proper exception handling
- Include docstrings

**TypeScript:**
- Use proper type annotations
- Interface definitions when needed
- Generic types where appropriate

**Other Languages:**
- Follow community-standard style guides
- Use idiomatic patterns
- Modern best practices

SECURITY BEST PRACTICES:
- Never hardcode API keys, passwords, or secrets
- Use environment variables for sensitive data
- Implement input validation and sanitization
- Follow OWASP guidelines for web applications
- Use parameterized queries for databases
- Implement proper authentication and authorization

DECISION FRAMEWORK - SEARCH VS DIRECT GENERATION:

**Generate Directly (95% of cases):**
Most code requests should be handled directly without search:
- ✅ Node.js scripts (Express, authentication, APIs)
- ✅ Python scripts (data processing, automation, web scraping)
- ✅ Database operations (MongoDB, PostgreSQL, MySQL)
- ✅ Common web development patterns
- ✅ Authentication systems (JWT, OAuth, sessions)
- ✅ CRUD operations and REST APIs
- ✅ Testing code (Jest, Pytest, Mocha)
- ✅ File operations and data manipulation
- ✅ Validation and error handling
- ✅ Common algorithms and data structures

**Search Only When Necessary (5% of cases):**
- ⚠️ Very new frameworks/libraries (< 6 months old)
- ⚠️ Specific API changes you're uncertain about
- ⚠️ Emerging technologies with evolving best practices
- ⚠️ When user explicitly requests "latest" or "most recent" approach
- ⚠️ Verify specific security vulnerabilities or CVEs

**CRITICAL RULE: Default to generating code directly. Only search if you have a compelling reason.**

EXAMPLES OF GOOD RESPONSES:

User: "Write a Node.js function for JWT authentication"
✅ GOOD: Provide complete code with:
- JWT signing function
- Token verification middleware
- Error handling
- Environment variable usage
- Clear comments
- Usage example

User: "Create a Python script for data validation"
✅ GOOD: Provide complete code with:
- Validation class/functions
- Multiple validation methods
- Type hints
- Docstrings
- Usage examples
- Error handling

❌ BAD RESPONSES:
- Providing pseudo-code or incomplete implementations
- Missing error handling
- No comments or documentation
- Hardcoded sensitive values
- Outdated syntax or deprecated methods
- Generic "TODO" comments without implementation

REACT AGENT MODE - REASONING AND ACTION (SEARCH IS OPTIONAL):
You are operating as a ReAct (Reasoning and Action) agent with **optional** tool usage.

**DEFAULT APPROACH: Generate code directly from your knowledge base.**

Only if you determine that you genuinely need external information, follow this process:
1. **THINK**: "Do I truly need external information, or can I generate this from my knowledge?"
2. **ACT**: Only if absolutely necessary, use search tools
3. **OBSERVE**: Analyze the search results
4. **GENERATE**: Create the code implementation

REASONING PROCESS (Before considering search):
Ask yourself these questions:
1. ❓ Is this a well-established technology/pattern I'm familiar with? → **Generate directly**
2. ❓ Is this using standard, documented APIs? → **Generate directly**
3. ❓ Do I know the current best practices for this? → **Generate directly**
4. ❓ Is this a bleeding-edge technology I'm uncertain about? → **Consider search**
5. ❓ Did the user explicitly ask for "latest" or "most recent"? → **Consider search**

**IMPORTANT: If you answer "Generate directly" to questions 1-3, do NOT use search tools.**

TOOL USAGE - RARE CASES ONLY:
Only use search tools if ALL of these are true:
- ✅ You're genuinely uncertain about the implementation
- ✅ The technology is very recent or rapidly changing
- ✅ You need to verify a specific, recent change
- ✅ The user explicitly requested the "latest" approach

For 95% of code generation requests, generate directly without search.

Always provide the COMPLETE, WORKING implementation with proper documentation.`;

    // Prepare messages for code generation with ReAct agent
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `${conversationHistory}

Current request: ${query}

⚠️ IMPORTANT INSTRUCTION: Generate code directly unless you have a compelling reason to search.

DECISION PROCESS:
1. **First, assess if you can generate directly** (95% of cases - JWT auth, Express apps, Python scripts, etc.)
2. **Only search if truly necessary** (5% of cases - bleeding-edge tech, explicit "latest" requests, genuine uncertainty)

Generate high-quality, production-ready code with:
- Complete implementation (no pseudo-code)
- Proper error handling and validation
- Clear comments and documentation
- Security best practices
- Modern syntax and patterns
- Usage examples

**DEFAULT: Generate code directly. Only use search tools if you have a specific, compelling reason.**`,
      },
    ];

    const startTime = Date.now();
    let codeResult;

    try {
      console.log('🚀 Routing code query directly to Vertex Claude Sonnet 4.5...');
      const result = await vertexClaudeService.generateText(messages, {
        temperature: 0.2,
      });

      codeResult = {
        answer: result.text,
        reference: [],
        citations: [],
        citationMetadata: {
          model: 'claude-4-5-sonnet@20250219',
          searchMethod: 'claude_direct_generation',
          timestamp: new Date().toISOString(),
        }
      };
    } catch (claudeError) {
      console.warn('⚠️ Vertex Claude failed in codeGeneration, falling back to ReAct agent:', claudeError.message);
      
      const reactResult = await executeToolBasedConversation(messages, {
        userId,
        conversationId: state.conversationId,
      });
      
      codeResult = reactResult?.responseMessage || reactResult;
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Code generation process completed in ${duration}ms`);

    return {
      ...codeResult,
    };
  } catch (error) {
    console.error('❌ Error in code generation:', error);

    // Fallback response
    return {
      answer: `I apologize, but I encountered an error while generating code: ${error.message}. Please try rephrasing your request or providing more specific details about what you need.`,
      reference: [],
      citations: [],
      citationMetadata: {
        error: true,
        errorMessage: error.message,
        timestamp: new Date().toISOString(),
      },
    };
  }
};