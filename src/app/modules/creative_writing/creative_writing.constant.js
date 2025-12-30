// Creative Writing Configuration
export const CREATIVE_WRITING_CONFIG = {
  MODEL: 'gemini-3-flash-preview',
  TEMPERATURE: 0.9, // Higher temperature for creativity
  MAX_OUTPUT_TOKENS: 8192,
};

// Writing types
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

// Writing styles
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

// Writing tones
export const WRITING_TONES = {
  JOYFUL: 'joyful',
  MELANCHOLIC: 'melancholic',
  HOPEFUL: 'hopeful',
  NOSTALGIC: 'nostalgic',
  ADVENTUROUS: 'adventurous',
  CONTEMPLATIVE: 'contemplative',
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

// Writing intents
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

// Conversation configuration
export const CONVERSATION_CATEGORY = 'creative_writing';
export const CONVERSATION_MODEL = 'gemini-2.5-flash';

// Default parameters
export const DEFAULT_PARAMS = {
  writingType: WRITING_TYPES.GENERAL,
  writingStyle: null,
  tone: null,
  wordCount: null,
  temperature: 0.9,
};

// System prompts for different writing types
export const SYSTEM_PROMPTS = {
  [WRITING_TYPES.POEM]: `You are a talented poet with a gift for crafting beautiful, evocative poetry. You understand various poetic forms, devices, and techniques. Create poems that resonate emotionally with readers through vivid imagery, metaphor, and rhythm.`,

  [WRITING_TYPES.SHORT_STORY]: `You are a skilled short story writer. You excel at creating compelling narratives with well-developed characters, engaging plots, and meaningful themes. Your stories have clear beginnings, middles, and ends, with satisfying arcs and emotional depth.`,

  [WRITING_TYPES.NOVEL_CHAPTER]: `You are an experienced novelist. You craft chapters that advance the plot, develop characters, maintain narrative tension, and keep readers engaged. Your writing shows mastery of pacing, dialogue, and descriptive prose.`,

  [WRITING_TYPES.ESSAY]: `You are a creative essayist who blends personal reflection with compelling narratives. You explore ideas deeply while maintaining an engaging, literary voice. Your essays are thoughtful, well-structured, and insightful.`,

  [WRITING_TYPES.SCRIPT]: `You are a professional screenwriter and playwright. You write scripts with natural dialogue, clear stage directions, and strong dramatic structure. You understand character development, scene construction, and visual storytelling.`,

  [WRITING_TYPES.SONG_LYRICS]: `You are a gifted lyricist. You create song lyrics with memorable hooks, evocative imagery, and emotional resonance. You understand rhythm, rhyme schemes, verse-chorus structure, and how to tell stories through music.`,

  [WRITING_TYPES.DIALOGUE]: `You are an expert at writing natural, engaging dialogue. You create conversations that reveal character, advance plot, and sound authentic. Each character has a distinct voice and speaking style.`,

  [WRITING_TYPES.FLASH_FICTION]: `You are a master of flash fiction and micro-stories. You can tell complete, impactful stories in very few words, with each word carefully chosen for maximum effect. Your brief narratives pack emotional punches and leave lasting impressions.`,

  [WRITING_TYPES.HAIKU]: `You are a haiku master. You craft traditional and modern haiku that capture moments, emotions, and observations with economy and precision. Your haiku follow proper syllable structure (5-7-5) and evoke vivid imagery.`,

  [WRITING_TYPES.SONNET]: `You are skilled in writing sonnets. You craft 14-line poems with proper meter (usually iambic pentameter) and rhyme schemes (Shakespearean or Petrarchan). Your sonnets explore themes of love, time, nature, and the human condition.`,

  [WRITING_TYPES.FREE_VERSE]: `You are a free verse poet. You create poetry that breaks traditional rules while maintaining poetic qualities through imagery, metaphor, and emotional resonance. Your poems flow naturally and express deep feelings and ideas.`,

  [WRITING_TYPES.NARRATIVE]: `You are a narrative writer. You excel at telling stories with strong plot development, character arcs, and engaging storytelling techniques. You create narratives that draw readers in and keep them invested.`,

  [WRITING_TYPES.DESCRIPTIVE]: `You are a descriptive writer with a gift for vivid, sensory language. You paint pictures with words, making readers see, hear, smell, taste, and feel what you describe. Your descriptions are rich, immersive, and evocative.`,

  [WRITING_TYPES.CREATIVE_NONFICTION]: `You are a creative nonfiction writer. You tell true stories using literary techniques—vivid description, scene-setting, character development, and narrative arc. You make real events come alive on the page.`,

  [WRITING_TYPES.MONOLOGUE]: `You are skilled at writing dramatic monologues. You create powerful, character-revealing speeches that expose inner thoughts, motivations, and emotions. Your monologues are theatrical, emotional, and authentic.`,

  [WRITING_TYPES.LETTER]: `You are an expert at writing creative letters. You craft correspondence that feels personal, authentic, and emotionally resonant. Whether formal or informal, your letters have a distinct voice and purpose.`,

  [WRITING_TYPES.GENERAL]: `You are a versatile creative writer with expertise across many forms and styles. You adapt your writing to match the user's needs, creating engaging, original content that captures their vision.`,
};

// Response templates
export const RESPONSE_MESSAGES = {
  GREETING: 'Hello! I\'m your creative writing assistant. What would you like to write today? I can help you with poems, stories, scripts, song lyrics, and much more!',
  CLARIFICATION_NEEDED: 'Could you tell me more about what you\'d like to write? What type of creative writing are you interested in?',
  WRITING_COMPLETE: 'Here\'s what I\'ve written for you:',
  READY_TO_CREATE: 'Great! I\'m ready to create that for you. Let me work on it.',
  CONTINUE_PROMPT: 'Would you like me to continue, revise, or try a different approach?',
  IDEAS_PROVIDED: 'Here are some ideas to get you started:',
  REVISION_COMPLETE: 'I\'ve revised the text based on your feedback.',
  ERROR: 'I encountered an error while creating your writing. Please try again.',
};

// Intent detection keywords
export const INTENT_KEYWORDS = {
  [WRITING_INTENTS.CREATE_NEW]: [
    'write', 'create', 'make', 'compose', 'craft', 'generate', 'produce',
    'new', 'fresh', 'start', 'begin', 'I want', 'I need', 'can you write'
  ],
  [WRITING_INTENTS.CONTINUE_STORY]: [
    'continue', 'keep going', 'what happens next', 'more', 'extend',
    'carry on', 'go on', 'keep writing', 'add more', 'next part'
  ],
  [WRITING_INTENTS.REVISE]: [
    'revise', 'improve', 'better', 'fix', 'change', 'modify', 'edit',
    'rewrite', 'rework', 'enhance', 'polish', 'refine'
  ],
  [WRITING_INTENTS.EXPAND]: [
    'expand', 'elaborate', 'add more', 'make longer', 'develop',
    'flesh out', 'more details', 'extend', 'lengthen'
  ],
  [WRITING_INTENTS.CHANGE_STYLE]: [
    'change style', 'different style', 'another style', 'rewrite in',
    'make it more', 'convert to', 'transform'
  ],
  [WRITING_INTENTS.ADD_DETAILS]: [
    'add details', 'more descriptive', 'more vivid', 'describe',
    'imagery', 'sensory', 'paint a picture'
  ],
  [WRITING_INTENTS.SHORTEN]: [
    'shorten', 'make shorter', 'condense', 'brief', 'concise',
    'cut down', 'reduce', 'trim', 'shorter version'
  ],
  [WRITING_INTENTS.GET_IDEAS]: [
    'ideas', 'suggestions', 'help me think', 'what should',
    'inspire me', 'brainstorm', 'topics', 'themes'
  ],
  [WRITING_INTENTS.BRAINSTORM]: [
    'brainstorm', 'think of', 'come up with', 'generate ideas',
    'creative ideas', 'possibilities', 'options'
  ],
};

// Type detection keywords
export const TYPE_KEYWORDS = {
  [WRITING_TYPES.POEM]: ['poem', 'poetry', 'verse', 'rhyme', 'stanza'],
  [WRITING_TYPES.SHORT_STORY]: ['story', 'short story', 'tale', 'narrative'],
  [WRITING_TYPES.NOVEL_CHAPTER]: ['chapter', 'novel', 'book chapter'],
  [WRITING_TYPES.ESSAY]: ['essay', 'personal essay', 'reflective essay'],
  [WRITING_TYPES.SCRIPT]: ['script', 'screenplay', 'play', 'scene'],
  [WRITING_TYPES.SONG_LYRICS]: ['lyrics', 'song', 'song lyrics', 'music'],
  [WRITING_TYPES.DIALOGUE]: ['dialogue', 'conversation', 'exchange'],
  [WRITING_TYPES.FLASH_FICTION]: ['flash fiction', 'micro story', 'very short story'],
  [WRITING_TYPES.HAIKU]: ['haiku'],
  [WRITING_TYPES.SONNET]: ['sonnet'],
  [WRITING_TYPES.FREE_VERSE]: ['free verse'],
  [WRITING_TYPES.MONOLOGUE]: ['monologue', 'soliloquy'],
  [WRITING_TYPES.LETTER]: ['letter', 'correspondence'],
};
