export class SessionManager {
  // Added optional parameters for maximum conversation entries and history string length
  // to prevent unbounded memory growth for active sessions, which can lead to performance issues
  // and potential Denial of Service (DoS) if not managed.
  // maxConversationEntries: Limits the number of entries in the conversationHistory array.
  // maxHistoryStringLength: Limits the total length of the 'history' string.
  constructor(maxConversationEntries = 50, maxHistoryStringLength = 10000) {
    this.sessions = new Map();
    this.maxConversationEntries = maxConversationEntries;
    this.maxHistoryStringLength = maxHistoryStringLength;
  }

  createSession() {
    // Generates a reasonably unique session ID using timestamp and a random string.
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.sessions.set(sessionId, {
      conversationHistory: [],
      history: '',
      createdAt: new Date(),
    });

    return sessionId;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  deleteSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  sessionExists(sessionId) {
    return this.sessions.has(sessionId);
  }

  addToHistory(sessionId, detail) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Add the detail to the conversation history array.
    session.conversationHistory.push(detail);
    // Enforce the maximum number of conversation entries by removing the oldest if the limit is exceeded.
    if (session.conversationHistory.length > this.maxConversationEntries) {
      session.conversationHistory.shift(); // Removes the first (oldest) element.
    }

    // Construct the new history entry string.
    let newHistoryEntry;
    if (session.history) {
      newHistoryEntry = `\nUser provided: ${detail}`;
    } else {
      newHistoryEntry = `Initial request: ${detail}`;
    }

    // Append the new entry to the history string.
    session.history += newHistoryEntry;
    // Enforce the maximum history string length by truncating from the beginning
    // to retain the most recent parts of the conversation, preventing excessive memory usage.
    if (session.history.length > this.maxHistoryStringLength) {
      session.history = session.history.substring(session.history.length - this.maxHistoryStringLength);
    }

    return true;
  }

  getConversationHistory(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.conversationHistory : null;
  }

  getHistory(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.history : null;
  }

  // Cleans up sessions older than maxAge (default: 1 hour = 3,600,000 milliseconds).
  // This helps manage memory by removing inactive sessions.
  cleanupOldSessions(maxAge = 3600000) {
    const now = new Date();
    const deletedSessions = [];

    // Iterate through sessions and delete expired ones.
    // JavaScript's Map iterators are safe for deletion of the current element during iteration.
    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.createdAt;
      if (age > maxAge) {
        this.sessions.delete(sessionId);
        deletedSessions.push(sessionId);
      }
    }

    return deletedSessions;
  }

  getActiveSessionsCount() {
    return this.sessions.size;
  }
}