/**
 * @fileoverview This file contains constants related to creative writing configurations,
 * including model parameters, writing types, styles, tones, intents, system prompts,
 * and response messages for the Inso.Assistant creative writing module.
 * These constants are used to standardize and manage various aspects of the creative
 * writing generation process.
 */

/**
 * @constant {object} CREATIVE_WRITING_CONFIG - Configuration parameters for the creative writing AI model.
 * @property {string} MODEL - The identifier for the AI model to be used for creative writing tasks.
 * @property {number} TEMPERATURE - Controls the randomness of the output. Higher values (e.g., 0.9)
 *   make the output more creative and varied, while lower values make it more deterministic.
 * @property {number} TOP_P - The cumulative probability of tokens to consider for sampling.
 *   It's an alternative to temperature that can also control randomness.
 * @property {number} MAX_OUTPUT_TOKENS - The maximum number of tokens (words/characters) the AI model
 *   is allowed to generate in a single response.
 */
export const CREATIVE_WRITING_CONFIG = {
  // OPTIMIZATION: Updated to a valid and current model version for better performance and features.
  MODEL: 'gemini-3.5-flash',
  TEMPERATURE: 0.9, // Higher temperature for creativity
  TOP_P: 0.95,
  MAX_OUTPUT_TOKENS: 8192,
};

/**
 * @constant {object} WRITING_TYPES - Enumeration of supported creative writing types.
 * Each property represents a distinct genre or form of writing.
 * @property {string} POEM - Represents a poetic composition.
 * @property {string} SHORT_STORY - Represents a brief fictional narrative.
 * @property {string} NOVEL_CHAPTER - Represents a section of a longer fictional work.
 * @property {string} ESSAY - Represents a short piece of writing on a particular subject.
 * @property {string} SCRIPT - Represents a written work for film, television, or theatre.
 * @property {string} SONG_LYRICS - Represents the words of a song.
 * @property {string} DIALOGUE - Represents a conversation between two or more characters.
 * @property {string} FLASH_FICTION - Represents extremely brief fictional stories.
 * @property {string} HAIKU - Represents a Japanese poem of seventeen syllables, in three lines of five, seven, and five.
 * @property {string} SONNET - Represents a poem of fourteen lines using any of a number of formal rhyme schemes.
 * @property {string} FREE_VERSE - Represents poetry that does not rhyme or have a regular meter.
 * @property {string} NARRATIVE - Represents a story or account of events, experiences, or the like.
 * @property {string} DESCRIPTIVE - Represents writing focused on vivid descriptions.
 * @property {string} CREATIVE_NONFICTION - Represents factual writing that uses literary styles and techniques.
 * @property {string} MONOLOGUE - Represents a long speech by one actor in a play or movie.
 * @property {string} LETTER - Represents a written message addressed to a person or organization.
 * @property {string} GENERAL - A general or unspecified writing type, used as a fallback.
 */
export const WRITING_TYPES = {
  POEM: 'poem',
  SHORT_STORY: 'short_story',
  NOVEL_CHAPTER: 'novel_chapter',
  ESSAY: 'essay',
  SCRIPT: 'script',
  SONG_LYRICS: 'song_lyrics',
  DIALOGUE: 'dialogue',
  FLASH_FICTION: 'flash_fiction',
  HAIKU: 'haiku',
  SONNET: 'sonnet',
  FREE_VERSE: 'free_verse',
  NARRATIVE: 'narrative',
  DESCRIPTIVE: 'descriptive',
  CREATIVE_NONFICTION: 'creative_nonfiction',
  MONOLOGUE: 'monologue',
  LETTER: 'letter',
  GENERAL: 'general',
};

/**
 * @constant {object} WRITING_STYLES - Enumeration of supported creative writing styles.
 * Each property represents a distinct stylistic approach to writing.
 * @property {string} DRAMATIC - Characterized by strong emotions, conflict, and theatricality.
 * @property {string} ROMANTIC - Emphasizes emotion, individualism, and the glorification of all the past and nature.
 * @property {string} COMEDIC - Intended to amuse or entertain, often using humor and wit.
 * @property {string} TRAGIC - Deals with serious subjects, often involving suffering, sorrow, or disaster.
 * @property {string} SUSPENSEFUL - Creates a feeling of excited or anxious uncertainty about what may happen.
 * @property {string} MYSTERIOUS - Full of mystery, difficult or impossible to understand, explain, or identify.
 * @property {string} INSPIRATIONAL - Providing or showing inspiration.
 * @property {string} DARK - Characterized by gloom, pessimism, or a disturbing quality.
 * @property {string} WHIMSICAL - Playfully quaint or fanciful, especially in an appealing and amusing way.
 * @property {string} REALISTIC - Representing things in a way that is accurate and true to life.
 * @property {string} SURREAL - Marked by the intense irrational reality of a dream.
 * @property {string} MINIMALIST - Characterized by a deliberate lack of ornamentation or detail.
 * @property {string} DESCRIPTIVE - Focused on providing vivid and detailed accounts.
 * @property {string} POETIC - Having an imaginative or sensitively emotional style.
 * @property {string} CONVERSATIONAL - Informal, friendly, and easy to understand.
 * @property {string} FORMAL - Adhering to conventional rules of propriety.
 * @property {string} STREAM_OF_CONSCIOUSNESS - A narrative method that attempts to depict the multitudinous thoughts and feelings which pass through the mind.
 */
export const WRITING_STYLES = {
  DRAMATIC: 'dramatic',
  ROMANTIC: 'romantic',
  COMEDIC: 'comedic',
  TRAGIC: 'tragic',
  SUSPENSEFUL: 'suspenseful',
  MYSTERIOUS: 'mysterious',
  INSPIRATIONAL: 'inspirational',
  DARK: 'dark',
  WHIMSICAL: 'whimsical',
  REALISTIC: 'realistic',
  SURREAL: 'surreal',
  MINIMALIST: 'minimalist',
  DESCRIPTIVE: 'descriptive',
  POETIC: 'poetic',
  CONVERSATIONAL: 'conversational',
  FORMAL: 'formal',
  STREAM_OF_CONSCIOUSNESS: 'stream_of_consciousness',
};

/**
 * @constant {object} WRITING_TONES - Enumeration of supported creative writing tones.
 * Each property represents a distinct emotional or attitudinal quality in writing.
 * @property {string} JOYFUL - Full of joy; very happy.
 * @property {string} MELANCHOLIC - Characterized by a feeling of pensive sadness, typically with no obvious cause.
 * @property {string} HOPEFUL - Feeling or inspiring optimism about a future event.
 * @property {string} NOSTALGIC - Characterized by or exhibiting nostalgia, a sentimental longing or wistful affection for the past.
 * @property {string} ADVENTUROUS - Willing to take risks or to try out new methods, ideas, or experiences.
 * @property {string} CONTEMPLATIVE - Expressing or involving prolonged thought.
 * @property {string} PASSIONATE - Showing or inspired by strong emotion.
 * @property {string} HUMOROUS - Causing laughter and amusement; funny.
 * @property {string} SERIOUS - Demanding or characterized by careful consideration or application.
 * @property {string} PLAYFUL - Fond of games and amusement; lighthearted.
 * @property {string} SOMBER - Dark or dull in color or tone; gloomy.
 * @property {string} UPLIFTING - Inspiring hope or happiness.
 * @property {string} INTENSE - Of extreme force, degree, or strength.
 * @property {string} GENTLE - Having or showing a mild, kind, or tender temperament or character.
 * @property {string} SARCASTIC - Marked by irony in order to mock or convey contempt.
 */
export const WRITING_TONES = {
  JOYFUL: 'joyful',
  MELANCHOLIC: 'melancholic',
  HOPEFUL: 'hopeful',
  NOSTALGIC: 'nostalgic',
  ADVENTUROUS: 'adventurous',
  CONTEMPLATIVE: 'contemplative',
  // BUG FIX: Corrected typo from 'passive' to 'passionate' to match the intent.
  PASSIONATE: 'passionate',
  HUMOROUS: 'humorous',
  SERIOUS: 'serious',
  PLAYFUL: 'playful',
  SOMBER: 'somber',
  UPLIFTING: 'uplifting',
  INTENSE: 'intense',
  GENTLE: 'gentle',
  SARCASTIC: 'sarcastic',
};

/**
 * @constant {object} WRITING_INTENTS - Enumeration of user intents for creative writing tasks.
 * These represent the user's goal or desired action with the AI.
 * @property {string} CREATE_NEW - User wants to generate a completely new piece of writing.
 * @property {string} CONTINUE_STORY - User wants to extend an existing piece of writing.
 * @property {string} REVISE - User wants to make general improvements or changes to existing text.
 * @property {string} EXPAND - User wants to add more detail or length to existing text.
 * @property {string} CHANGE_STYLE - User wants to rewrite text in a different style.
 * @property {string} ADD_DETAILS - User wants to enhance descriptions or add specific elements.
 * @property {string} SHORTEN - User wants to reduce the length of existing text.
 * @property {string} GET_IDEAS - User is looking for suggestions or inspiration.
 * @property {string} BRAINSTORM - User wants to generate multiple ideas or concepts.
 * @property {string} CLARIFICATION - User is asking for more information or explanation.
 * @property {string} UNKNOWN - The user's intent could not be clearly determined.
 */
export const WRITING_INTENTS = {
  CREATE_NEW: 'create_new',
  CONTINUE_STORY: 'continue_story',
  REVISE: 'revise',
  EXPAND: 'expand',
  CHANGE_STYLE: 'change_style',
  ADD_DETAILS: 'add_details',
  SHORTEN: 'shorten',
  GET_IDEAS: 'get_ideas',
  BRAINSTORM: 'brainstorm',
  CLARIFICATION: 'clarification',
  UNKNOWN: 'unknown',
};

/**
 * @constant {string} CONVERSATION_CATEGORY - Defines the category for the current conversation context.
 * This helps in routing and contextualizing AI interactions.
 */
export const CONVERSATION_CATEGORY = 'creative_writing';

/**
 * @constant {string} CONVERSATION_MODEL - Specifies the AI model to be used for general conversation
 * within the creative writing module.
 */
export const CONVERSATION_MODEL = 'gemini-3.5-flash';

/**
 * @constant {object} DEFAULT_PARAMS - Default parameters for creative writing requests.
 * These values are used when specific parameters are not provided by the user.
 * @property {string} writingType - The default type of writing, falling back to general.
 * @property {string | null} writingStyle - The default writing style, initially null.
 * @property {string | null} tone - The default writing tone, initially null.
 * @property {number | null} wordCount - The default target word count, initially null.
 * @property {number} temperature - The default temperature for AI model generation, influencing creativity.
 */
export const DEFAULT_PARAMS = {
  writingType: WRITING_TYPES.GENERAL,
  writingStyle: null,
  tone: null,
  wordCount: null,
  temperature: 0.9,
};

/**
 * @constant {object.<string, string>} SYSTEM_PROMPTS - A collection of system prompts tailored for different writing types.
 * These prompts guide the AI's persona and capabilities for specific creative tasks.
 * Each key corresponds to a value from {@link WRITING_TYPES}.
 * OPTIMIZATION: Added a standardized instruction to each prompt to ensure the AI respects user-provided constraints,
 * improving prompt execution reliability and user satisfaction.
 */
const PROMPT_SUFFIX = `Pay close attention to any user-specified constraints such as style, tone, length, or specific keywords.`;

export const SYSTEM_PROMPTS = {
  [WRITING_TYPES.POEM]: `You are a talented poet with a gift for crafting beautiful, evocative poetry. You understand various poetic forms, devices, and techniques. Create poems that resonate emotionally with readers through vivid imagery, metaphor, and rhythm. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.SHORT_STORY]: `You are a skilled short story writer. You excel at creating compelling narratives with well-developed characters, engaging plots, and meaningful themes. Your stories have clear beginnings, middles, and ends, with satisfying arcs and emotional depth. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.NOVEL_CHAPTER]: `You are an experienced novelist. You craft chapters that advance the plot, develop characters, maintain narrative tension, and keep readers engaged. Your writing shows mastery of pacing, dialogue, and descriptive prose. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.ESSAY]: `You are a creative essayist who blends personal reflection with compelling narratives. You explore ideas deeply while maintaining an engaging, literary voice. Your essays are thoughtful, well-structured, and insightful. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.SCRIPT]: `You are a professional screenwriter and playwright. You write scripts with natural dialogue, clear stage directions, and strong dramatic structure. You understand character development, scene construction, and visual storytelling. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.SONG_LYRICS]: `You are a gifted lyricist. You create song lyrics with memorable hooks, evocative imagery, and emotional resonance. You understand rhythm, rhyme schemes, verse-chorus structure, and how to tell stories through music. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.DIALOGUE]: `You are an expert at writing natural, engaging dialogue. You create conversations that reveal character, advance plot, and sound authentic. Each character has a distinct voice and speaking style. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.FLASH_FICTION]: `You are a master of flash fiction and micro-stories. You can tell complete, impactful stories in very few words, with each word carefully chosen for maximum effect. Your brief narratives pack emotional punches and leave lasting impressions. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.HAIKU]: `You are a haiku master. You craft traditional and modern haiku that capture moments, emotions, and observations with economy and precision. Your haiku follow proper syllable structure (5-7-5) and evoke vivid imagery. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.SONNET]: `You are skilled in writing sonnets. You craft 14-line poems with proper meter (usually iambic pentameter) and rhyme schemes (Shakespearean or Petrarchan). Your sonnets explore themes of love, time, nature, and the human condition. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.FREE_VERSE]: `You are a free verse poet. You create poetry that breaks traditional rules while maintaining poetic qualities through imagery, metaphor, and emotional resonance. Your poems flow naturally and express deep feelings and ideas. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.NARRATIVE]: `You are a narrative writer. You excel at telling stories with strong plot development, character arcs, and engaging storytelling techniques. You create narratives that draw readers in and keep them invested. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.DESCRIPTIVE]: `You are a descriptive writer with a gift for vivid, sensory language. You paint pictures with words, making readers see, hear, smell, taste, and feel what you describe. Your descriptions are rich, immersive, and evocative. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.CREATIVE_NONFICTION]: `You are a creative nonfiction writer. You tell true stories using literary techniques—vivid description, scene-setting, character development, and narrative arc. You make real events come alive on the page. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.MONOLOGUE]: `You are skilled at writing dramatic monologues. You create powerful, character-revealing speeches that expose inner thoughts, motivations, and emotions. Your monologues are theatrical, emotional, and authentic. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.LETTER]: `You are an expert at writing creative letters. You craft correspondence that feels personal, authentic, and emotionally resonant. Whether formal or informal, your letters have a distinct voice and purpose. ${PROMPT_SUFFIX}`,

  [WRITING_TYPES.GENERAL]: `You are a versatile creative writer with expertise across many forms and styles. You adapt your writing to match the user's needs, creating engaging, original content that captures their vision. ${PROMPT_SUFFIX}`,
};

/**
 * @constant {object.<string, string>} RESPONSE_MESSAGES - Standardized response messages for the creative writing assistant.
 * These messages provide consistent feedback and guidance to the user.
 * @property {string} GREETING - Initial welcome message to the user.
 * @property {string} CLARIFICATION_NEEDED - Message prompting the user for more details.
 * @property {string} WRITING_COMPLETE - Message indicating that the writing task is finished.
 * @property {string} READY_TO_CREATE - Message confirming readiness and informing the user that generation has started.
 * @property {string} CONTINUE_PROMPT - Prompt asking the user for further action after a writing piece.
 * @property {string} IDEAS_PROVIDED - Message indicating that ideas have been generated.
 * @property {string} REVISION_COMPLETE - Message confirming that a revision has been applied.
 * @property {string} ERROR - A more helpful, user-friendly error message for writing tasks.
 */
export const RESPONSE_MESSAGES = {
  GREETING:
    "Hello! I'm your creative writing assistant. What would you like to write today? I can help you with poems, stories, scripts, song lyrics, and much more!",
  CLARIFICATION_NEEDED:
    "Could you tell me more about what you'd like to write? What type of creative writing are you interested in?",
  WRITING_COMPLETE: "Here's what I've written for you:",
  // OPTIMIZATION: Improved message to provide feedback that the request is being processed, managing user expectations.
  READY_TO_CREATE:
    "Great! I'm starting on that for you now. This may take a moment...",
  CONTINUE_PROMPT:
    'Would you like me to continue, revise, or try a different approach?',
  IDEAS_PROVIDED: 'Here are some ideas to get you started:',
  REVISION_COMPLETE: "I've revised the text based on your feedback.",
  // OPTIMIZATION: Error message is more conversational and provides actionable suggestions.
  ERROR:
    "I'm sorry, I encountered an unexpected issue. Could you please try rephrasing your request or try again in a moment?",
};

/**
 * @constant {object.<string, string[]>} INTENT_KEYWORDS - Keywords used for detecting user intent.
 * Each key corresponds to a value from {@link WRITING_INTENTS}, and its value is an array of
 * strings that suggest that particular intent.
 * OPTIMIZATION: Expanded keyword lists for more accurate intent detection.
 */
export const INTENT_KEYWORDS = {
  [WRITING_INTENTS.CREATE_NEW]: [
    'write',
    'create',
    'make',
    'compose',
    'craft',
    'generate',
    'produce',
    'new',
    'fresh',
    'start',
    'begin',
    'I want',
    'I need',
    'can you write',
    'draft',
    'outline',
  ],
  [WRITING_INTENTS.CONTINUE_STORY]: [
    'continue',
    'keep going',
    'what happens next',
    "what's next",
    'and then',
    'more',
    'extend',
    'carry on',
    'go on',
    'keep writing',
    'add more',
    'next part',
  ],
  [WRITING_INTENTS.REVISE]: [
    'revise',
    'improve',
    'better',
    'fix',
    'change',
    'modify',
    'edit',
    'rewrite',
    'rework',
    'enhance',
    'polish',
    'refine',
    'tweak',
    'adjust',
    'rephrase',
  ],
  [WRITING_INTENTS.EXPAND]: [
    'expand',
    'elaborate',
    'add more',
    'make longer',
    'develop',
    'flesh out',
    'more details',
    'add more detail',
    'extend',
    'lengthen',
  ],
  [WRITING_INTENTS.CHANGE_STYLE]: [
    'change style',
    'different style',
    'another style',
    'rewrite in',
    'make it more',
    'convert to',
    'transform',
  ],
  [WRITING_INTENTS.ADD_DETAILS]: [
    'add details',
    'more descriptive',
    'more vivid',
    'describe',
    'imagery',
    'sensory',
    'paint a picture',
  ],
  [WRITING_INTENTS.SHORTEN]: [
    'shorten',
    'make shorter',
    'condense',
    'brief',
    'concise',
    'cut down',
    'reduce',
    'trim',
    'shorter version',
    'summarize',
  ],
  [WRITING_INTENTS.GET_IDEAS]: [
    'ideas',
    'suggestions',
    'help me think',
    'what should',
    'inspire me',
    'inspiration',
    'brainstorm',
    'topics',
    'themes',
    'prompts',
  ],
  [WRITING_INTENTS.BRAINSTORM]: [
    'brainstorm',
    'think of',
    'come up with',
    'generate ideas',
    'creative ideas',
    'possibilities',
    'options',
  ],
};

/**
 * @constant {object.<string, string[]>} TYPE_KEYWORDS - Keywords used for detecting the desired writing type.
 * Each key corresponds to a value from {@link WRITING_TYPES}, and its value is an array of
 * strings that suggest that particular writing type.
 * OPTIMIZATION: Expanded keyword lists for more accurate writing type detection.
 */
export const TYPE_KEYWORDS = {
  [WRITING_TYPES.POEM]: ['poem', 'poetry', 'verse', 'rhyme', 'stanza', 'limerick', 'ode'],
  [WRITING_TYPES.SHORT_STORY]: ['story', 'short story', 'tale', 'narrative', 'fiction', 'fable'],
  [WRITING_TYPES.NOVEL_CHAPTER]: ['chapter', 'novel', 'book chapter'],
  [WRITING_TYPES.ESSAY]: ['essay', 'personal essay', 'reflective essay', 'article', 'piece', 'commentary'],
  [WRITING_TYPES.SCRIPT]: ['script', 'screenplay', 'play', 'scene', 'teleplay', 'stage play'],
  [WRITING_TYPES.SONG_LYRICS]: ['lyrics', 'song', 'song lyrics', 'music'],
  [WRITING_TYPES.DIALOGUE]: ['dialogue', 'conversation', 'exchange'],
  [WRITING_TYPES.FLASH_FICTION]: [
    'flash fiction',
    'micro story',
    'very short story',
  ],
  [WRITING_TYPES.HAIKU]: ['haiku'],
  [WRITING_TYPES.SONNET]: ['sonnet'],
  [WRITING_TYPES.FREE_VERSE]: ['free verse'],
  [WRITING_TYPES.MONOLOGUE]: ['monologue', 'soliloquy'],
  [WRITING_TYPES.LETTER]: ['letter', 'correspondence', 'email', 'note'],
};