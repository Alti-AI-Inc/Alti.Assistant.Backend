import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionManager } from './sessionManager';

describe('SessionManager', () => {
  let sessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(sessionManager.sessions).toBeInstanceOf(Map);
      expect(sessionManager.sessions.size).toBe(0);
      expect(sessionManager.maxConversationEntries).toBe(50);
      expect(sessionManager.maxHistoryStringLength).toBe(10000);
    });

    it('should initialize with custom values', () => {
      const customManager = new SessionManager(10, 500);
      expect(customManager.maxConversationEntries).toBe(10);
      expect(customManager.maxHistoryStringLength).toBe(500);
    });
  });

  describe('createSession', () => {
    it('should create a new session and return a session ID', () => {
      const sessionId = sessionManager.createSession();
      expect(sessionId).toBeTypeOf('string');
      expect(sessionId).toContain('session_');
      expect(sessionManager.sessionExists(sessionId)).toBe(true);
    });

    it('should initialize the new session with correct properties', () => {
      const sessionId = sessionManager.createSession();
      const session = sessionManager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session.conversationHistory).toEqual([]);
      expect(session.history).toBe('');
      expect(session.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('getSession', () => {
    it('should return the session object for a valid session ID', () => {
      const sessionId = sessionManager.createSession();
      const session = sessionManager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session.history).toBe('');
    });

    it('should return undefined for an invalid session ID', () => {
      const session = sessionManager.getSession('invalid-session-id');
      expect(session).toBeUndefined();
    });
  });

  describe('deleteSession', () => {
    it('should delete an existing session and return true', () => {
      const sessionId = sessionManager.createSession();
      expect(sessionManager.sessionExists(sessionId)).toBe(true);
      const result = sessionManager.deleteSession(sessionId);
      expect(result).toBe(true);
      expect(sessionManager.sessionExists(sessionId)).toBe(false);
    });

    it('should return false for a non-existent session ID', () => {
      const result = sessionManager.deleteSession('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('sessionExists', () => {
    it('should return true for an existing session', () => {
      const sessionId = sessionManager.createSession();
      expect(sessionManager.sessionExists(sessionId)).toBe(true);
    });

    it('should return false for a non-existent session', () => {
      expect(sessionManager.sessionExists('non-existent-id')).toBe(false);
    });
  });

  describe('addToHistory', () => {
    let sessionId;

    beforeEach(() => {
      sessionId = sessionManager.createSession();
    });

    it('should return false for a non-existent session', () => {
      const result = sessionManager.addToHistory('invalid-id', 'some detail');
      expect(result).toBe(false);
    });

    it('should add the first detail correctly', () => {
      const detail = 'First detail';
      const result = sessionManager.addToHistory(sessionId, detail);
      const session = sessionManager.getSession(sessionId);

      expect(result).toBe(true);
      expect(session.conversationHistory).toEqual([detail]);
      expect(session.history).toBe(`Initial request: ${detail}`);
    });

    it('should add subsequent details correctly', () => {
      sessionManager.addToHistory(sessionId, 'First detail');
      const secondDetail = 'Second detail';
      sessionManager.addToHistory(sessionId, secondDetail);
      const session = sessionManager.getSession(sessionId);

      expect(session.conversationHistory).toEqual(['First detail', secondDetail]);
      expect(session.history).toBe(`Initial request: First detail\nUser provided: ${secondDetail}`);
    });

    it('should enforce maxConversationEntries limit', () => {
      const limitedManager = new SessionManager(2);
      const limitedSessionId = limitedManager.createSession();

      limitedManager.addToHistory(limitedSessionId, 'entry 1');
      limitedManager.addToHistory(limitedSessionId, 'entry 2');
      limitedManager.addToHistory(limitedSessionId, 'entry 3');

      const history = limitedManager.getConversationHistory(limitedSessionId);
      expect(history.length).toBe(2);
      expect(history).toEqual(['entry 2', 'entry 3']);
    });

    it('should enforce maxHistoryStringLength limit', () => {
      const limitedManager = new SessionManager(50, 20);
      const limitedSessionId = limitedManager.createSession();

      limitedManager.addToHistory(limitedSessionId, 'This is a very long initial detail that will be truncated');
      const history = limitedManager.getHistory(limitedSessionId);

      expect(history.length).toBe(20);
      expect(history).toBe('l be truncated'); // "Initial request: " is 17 chars, so 3 chars from the detail are kept
    });

    it('should truncate from the beginning when history exceeds max length', () => {
        const limitedManager = new SessionManager(50, 40);
        const limitedSessionId = limitedManager.createSession();
        
        limitedManager.addToHistory(limitedSessionId, 'short'); // "Initial request: short" (22 chars)
        limitedManager.addToHistory(limitedSessionId, 'another very long entry'); // adds "\nUser provided: another very long entry" (36 chars)
        // Total length = 22 + 36 = 58, which is > 40
        
        const history = limitedManager.getHistory(limitedSessionId);
        expect(history.length).toBe(40);
        expect(history).toBe('vided: another very long entry');
    });
  });

  describe('getConversationHistory', () => {
    it('should return the conversation history array for a valid session', () => {
      const sessionId = sessionManager.createSession();
      sessionManager.addToHistory(sessionId, 'detail 1');
      sessionManager.addToHistory(sessionId, 'detail 2');
      expect(sessionManager.getConversationHistory(sessionId)).toEqual(['detail 1', 'detail 2']);
    });

    it('should return null for a non-existent session', () => {
      expect(sessionManager.getConversationHistory('invalid-id')).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('should return the history string for a valid session', () => {
      const sessionId = sessionManager.createSession();
      sessionManager.addToHistory(sessionId, 'detail 1');
      expect(sessionManager.getHistory(sessionId)).toBe('Initial request: detail 1');
    });

    it('should return null for a non-existent session', () => {
      expect(sessionManager.getHistory('invalid-id')).toBeNull();
    });
  });

  describe('cleanupOldSessions', () => {
    it('should remove sessions older than the maxAge', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const oldSessionId = sessionManager.createSession();
      
      // Advance time by 2 hours (default maxAge is 1 hour)
      vi.setSystemTime(now + 2 * 60 * 60 * 1000);
      const newSessionId = sessionManager.createSession();

      const deletedSessions = sessionManager.cleanupOldSessions();

      expect(deletedSessions).toEqual([oldSessionId]);
      expect(sessionManager.sessionExists(oldSessionId)).toBe(false);
      expect(sessionManager.sessionExists(newSessionId)).toBe(true);
      expect(sessionManager.getActiveSessionsCount()).toBe(1);
    });

    it('should not remove sessions younger than the maxAge', () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);
  
        const youngSessionId = sessionManager.createSession();
        
        // Advance time by 30 minutes (less than default 1 hour)
        vi.setSystemTime(now + 30 * 60 * 1000);
  
        const deletedSessions = sessionManager.cleanupOldSessions();
  
        expect(deletedSessions).toEqual([]);
        expect(sessionManager.sessionExists(youngSessionId)).toBe(true);
        expect(sessionManager.getActiveSessionsCount()).toBe(1);
    });

    it('should use a custom maxAge for cleanup', () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);
  
        const oldSessionId = sessionManager.createSession();
        
        // Advance time by 10 seconds
        vi.setSystemTime(now + 10 * 1000);
        const newSessionId = sessionManager.createSession();

        // Cleanup sessions older than 5 seconds
        const deletedSessions = sessionManager.cleanupOldSessions(5000);
  
        expect(deletedSessions).toEqual([oldSessionId]);
        expect(sessionManager.sessionExists(oldSessionId)).toBe(false);
        expect(sessionManager.sessionExists(newSessionId)).toBe(true);
    });

    it('should return an empty array if no sessions are cleaned up', () => {
        sessionManager.createSession();
        const deletedSessions = sessionManager.cleanupOldSessions();
        expect(deletedSessions).toEqual([]);
        expect(sessionManager.getActiveSessionsCount()).toBe(1);
    });
  });

  describe('getActiveSessionsCount', () => {
    it('should return the correct number of active sessions', () => {
      expect(sessionManager.getActiveSessionsCount()).toBe(0);
      const id1 = sessionManager.createSession();
      expect(sessionManager.getActiveSessionsCount()).toBe(1);
      const id2 = sessionManager.createSession();
      expect(sessionManager.getActiveSessionsCount()).toBe(2);
      sessionManager.deleteSession(id1);
      expect(sessionManager.getActiveSessionsCount()).toBe(1);
      sessionManager.deleteSession(id2);
      expect(sessionManager.getActiveSessionsCount()).toBe(0);
    });
  });
});