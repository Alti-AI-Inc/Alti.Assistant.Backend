export class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  createSession() {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.sessions.set(sessionId, {
      conversationHistory: [],
      history: "",
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

    session.conversationHistory.push(detail);
    if (session.history) {
      session.history += `\nUser provided: ${detail}`;
    } else {
      session.history = `Initial request: ${detail}`;
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

  cleanupOldSessions(maxAge = 3600000) {
    const now = new Date();
    const deletedSessions = [];

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
