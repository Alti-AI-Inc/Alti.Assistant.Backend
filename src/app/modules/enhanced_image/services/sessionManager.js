import { randomUUID } from 'crypto';

export class SessionManager {
  // Added optional parameters for maximum conversation entries and history string length
  // to prevent unbounded memory growth for active sessions, which can lead to performance issues
  // and potential Denial of Service (DoS) if not managed.
  // maxConversationEntries: Limits the number of entries in the conversationHistory array.
  // maxHistoryStringLength: Limits the total length of the generated 'history' string.
  // maxActiveSessions: Sets a hard limit on the total number of concurrent sessions to prevent
  // memory exhaustion from a flood of new session requests (DoS protection).
  constructor(maxConversationEntries = 50, maxHistoryStringLength = 10000, maxActiveSessions = 10000) {
    this.sessions = new Map();
    this.maxConversationEntries = maxConversationEntries;
    this.maxHistoryStringLength = maxHistoryStringLength;
    this.maxActiveSessions = maxActiveSessions;
    this.cleanupInterval = null;
  }

  createSession() {
    // Enforce a hard limit on the total number of active sessions to prevent DoS attacks
    // via memory exhaustion. This acts as a crucial server-wide safeguard against abuse.
    if (this.sessions.size >= this.maxActiveSessions) {
      // In a production environment, this event should be logged to alert on potential attacks.
      // e.g., logger.warn('Maximum active sessions reached. Rejecting new session creation.');
      throw new Error('Server is currently at capacity. Please try again later.');
    }

    // Use cryptographically secure UUIDs for session IDs to prevent collisions and make them non-guessable.
    const sessionId = randomUUID();

    this.sessions.set(sessionId, {
      // The conversationHistory array is the single source of truth for the session's content.
      conversationHistory: [],
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
    // This maintains a rolling window of the conversation.
    if (session.conversationHistory.length > this.maxConversationEntries) {
      session.conversationHistory.shift(); // Removes the first (oldest) element.
    }

    return true;
  }

  getConversationHistory(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.conversationHistory : null;
  }

  getHistory(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Generate the formatted history string on-demand from the conversationHistory array.
    // This avoids storing redundant data and ensures a single source of truth.
    const fullHistoryString = session.conversationHistory
      .map((detail, index) => {
        const prefix = index === 0 ? 'Initial request: ' : '\nUser provided: ';
        return `${prefix}${detail}`;
      })
      .join('');

    // Enforce the maximum history string length by truncating from the beginning,
    // retaining the most recent parts of the conversation.
    if (fullHistoryString.length > this.maxHistoryStringLength) {
      return fullHistoryString.substring(fullHistoryString.length - this.maxHistoryStringLength);
    }

    return fullHistoryString;
  }

  // Periodically cleans up old sessions to prevent memory leaks from inactive sessions.
  // This should be called once when the session manager is initialized in the application.
  startCleanupInterval(period = 60000, maxAge = 3600000) {
    if (this.cleanupInterval) {
      console.warn('Cleanup interval is already running.');
      return;
    }
    // Set up a recurring job to call cleanupOldSessions.
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSessions(maxAge);
    }, period);
  }

  // Stops the periodic cleanup. Useful for graceful shutdown of the application.
  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Cleans up sessions older than maxAge (default: 1 hour = 3,600,000 milliseconds).
  // This is typically called by the interval set up by startCleanupInterval.
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

    // In a production environment, you might log the cleanup event.
    // e.g., if (deletedSessions.length > 0) logger.info(`Cleaned up ${deletedSessions.length} old sessions.`);

    return deletedSessions;
  }

  getActiveSessionsCount() {
    return this.sessions.size;
  }
}