import { getLogger } from "./logging/logger.js";

export interface SessionStats {
  sessionId: string;
  agentId: string;
  startTime: string;
  endTime?: string;
  messageCount: number;
  memoryCount: number;
  lastActivity: string;
}

export interface SessionManagerConfig {
  maxSessionHistory?: number;
  sessionTimeoutMinutes?: number;
}

class SessionManager {
  private sessions = new Map<string, SessionStats>();
  private agentSessions = new Map<string, string[]>();
  private logger = getLogger();
  private config: SessionManagerConfig;

  constructor(config: SessionManagerConfig = {}) {
    this.config = {
      maxSessionHistory: config.maxSessionHistory || 100,
      sessionTimeoutMinutes: config.sessionTimeoutMinutes || 30
    };
    this.logger.info("SessionManager initialized", { config: this.config });
  }

  startSession(sessionId: string, agentId: string): SessionStats {
    const now = new Date().toISOString();
    
    const session: SessionStats = {
      sessionId,
      agentId,
      startTime: now,
      messageCount: 0,
      memoryCount: 0,
      lastActivity: now
    };

    this.sessions.set(sessionId, session);
    
    if (!this.agentSessions.has(agentId)) {
      this.agentSessions.set(agentId, []);
    }
    this.agentSessions.get(agentId)!.push(sessionId);
    
    this.cleanupOldSessions(agentId);

    this.logger.debug("Session started", {
      method: "startSession",
      params: { sessionId, agentId },
      returns: "SessionStats",
      data: { sessionCount: this.sessions.size }
    });

    return session;
  }

  endSession(sessionId: string): SessionStats | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn("Session not found", {
        method: "endSession",
        params: { sessionId }
      });
      return null;
    }

    session.endTime = new Date().toISOString();
    this.sessions.set(sessionId, session);

    this.logger.debug("Session ended", {
      method: "endSession",
      params: { sessionId },
      returns: "SessionStats",
      data: {
        duration: this.calculateSessionDuration(session),
        messageCount: session.messageCount,
        memoryCount: session.memoryCount
      }
    });

    return session;
  }

  incrementMessageCount(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn("Session not found for message increment", {
        method: "incrementMessageCount",
        params: { sessionId }
      });
      return 0;
    }

    session.messageCount++;
    session.lastActivity = new Date().toISOString();
    this.sessions.set(sessionId, session);

    return session.messageCount;
  }

  incrementMemoryCount(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn("Session not found for memory increment", {
        method: "incrementMemoryCount",
        params: { sessionId }
      });
      return 0;
    }

    session.memoryCount++;
    session.lastActivity = new Date().toISOString();
    this.sessions.set(sessionId, session);

    return session.memoryCount;
  }

  getSession(sessionId: string): SessionStats | null {
    return this.sessions.get(sessionId) || null;
  }

  getAgentSessions(agentId: string): SessionStats[] {
    const sessionIds = this.agentSessions.get(agentId) || [];
    return sessionIds
      .map(id => this.sessions.get(id))
      .filter((s): s is SessionStats => s !== undefined);
  }

  getTotalSessionCount(agentId?: string): number {
    if (agentId) {
      return this.agentSessions.get(agentId)?.length || 0;
    }
    return this.sessions.size;
  }

  getRecentSessions(limit: number = 10): SessionStats[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
      .slice(0, limit);
  }

  cleanupOldSessions(agentId?: string): void {
    const now = Date.now();
    const timeoutMs = this.config.sessionTimeoutMinutes! * 60 * 1000;
    
    const sessionsToClean: string[] = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (agentId && session.agentId !== agentId) continue;
      
      const lastActivity = new Date(session.lastActivity).getTime();
      if (now - lastActivity > timeoutMs) {
        sessionsToClean.push(sessionId);
      }
    }

    for (const sessionId of sessionsToClean) {
      this.sessions.delete(sessionId);
      
      for (const [agentId, sessionIds] of this.agentSessions.entries()) {
        const index = sessionIds.indexOf(sessionId);
        if (index > -1) {
          sessionIds.splice(index, 1);
          this.agentSessions.set(agentId, sessionIds);
        }
      }
    }

    if (sessionsToClean.length > 0) {
      this.logger.debug("Cleaned up old sessions", {
        method: "cleanupOldSessions",
        params: { agentId },
        data: { cleanedCount: sessionsToClean.length }
      });
    }
  }

  clearAgentSessions(agentId: string): void {
    const sessionIds = this.agentSessions.get(agentId) || [];
    
    for (const sessionId of sessionIds) {
      this.sessions.delete(sessionId);
    }
    
    this.agentSessions.delete(agentId);

    this.logger.debug("Cleared agent sessions", {
      method: "clearAgentSessions",
      params: { agentId },
      data: { clearedCount: sessionIds.length }
    });
  }

  clearAll(): void {
    this.sessions.clear();
    this.agentSessions.clear();

    this.logger.info("All sessions cleared", {
      method: "clearAll",
      returns: "void"
    });
  }

  getStats(): {
    totalSessions: number;
    activeSessions: number;
    byAgent: Record<string, number>;
    recentActivity: SessionStats[];
  } {
    const now = Date.now();
    const timeoutMs = this.config.sessionTimeoutMinutes! * 60 * 1000;
    
    let activeSessions = 0;
    const byAgent: Record<string, number> = {};

    for (const session of this.sessions.values()) {
      const lastActivity = new Date(session.lastActivity).getTime();
      if (now - lastActivity <= timeoutMs) {
        activeSessions++;
      }
      
      byAgent[session.agentId] = (byAgent[session.agentId] || 0) + 1;
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      byAgent,
      recentActivity: this.getRecentSessions(5)
    };
  }

  private calculateSessionDuration(session: SessionStats): number {
    const endTime = session.endTime ? new Date(session.endTime).getTime() : Date.now();
    const startTime = new Date(session.startTime).getTime();
    return Math.floor((endTime - startTime) / 1000);
  }
}

let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(config?: SessionManagerConfig): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager(config);
  }
  return sessionManagerInstance;
}

export function initSessionManager(config: SessionManagerConfig): SessionManager {
  sessionManagerInstance = new SessionManager(config);
  return sessionManagerInstance;
}

export { SessionManager };
