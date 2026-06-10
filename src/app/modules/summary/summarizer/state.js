/**
 * @typedef {object} SummarizerStateProperty
 * @property {*} value - The current value of the state property.
 */

/**
 * @typedef {object} HistoryStateProperty
 * @property {function(Array<*>, Array<*>): Array<*>} value - A function used to concatenate history items.
 * @property {function(): Array<*>} default - A function that returns the default initial value for history.
 */

/**
 * @typedef {object} SummarizerState
 * @property {SummarizerStateProperty & {value: string | null}} user_input - The URL or user input provided by the user.
 * @property {SummarizerStateProperty & {value: string | null}} content - The text content extracted from the URL or input.
 * @property {SummarizerStateProperty & {value: string | object | null}} summary - The final summary stream or object.
 * @property {HistoryStateProperty} history - Conversation history for context, including a concatenation function and a default initializer.
 * @property {SummarizerStateProperty & {value: boolean | null}} isFilePassed - A flag indicating whether a file was passed for summarization.
 */

/**
 * Creates and returns a new, isolated state object for a summarizer process.
 * This function should be called for each new summarization task to ensure
 * independent state management, preventing race conditions and data corruption
 * in concurrent operations.
 *
 * The original implementation used a single, globally mutable object (`summarizerState`),
 * which would lead to incorrect behavior and data corruption if multiple summarization
 * tasks were run concurrently in a Node.js/Express backend. By providing a factory
 * function, each task can now have its own dedicated state instance.
 *
 * @returns {SummarizerState} A new summarizer state object.
 */
export const summarizerState = {
  user_input: { value: null },
  content: { value: null },
  summary: { value: null },
  history: { value: (x, y) => x.concat(y), default: () => [] },
  isFilePassed: { value: null },
};

export const createSummarizerState = () => ({
  user_input: { value: null },
  content: { value: null },
  summary: { value: null },
  history: { value: (x, y) => x.concat(y), default: () => [] },
  isFilePassed: { value: null },
});