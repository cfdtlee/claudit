import { EventEmitter } from 'events';

export interface SessionEvent {
  type: 'session:created' | 'session:updated' | 'session:deleted' | 'session:archived';
  sessionId: string;
}

export interface ClauditEvent {
  type: string;
  [key: string]: unknown;
}

class EventBus extends EventEmitter {
  emitSessionEvent(event: SessionEvent) {
    this.emit('session', event);
  }

  onSessionEvent(handler: (event: SessionEvent) => void): () => void {
    this.on('session', handler);
    return () => this.off('session', handler);
  }

  /** Emit a generic claudit event (task:updated, agent:session_started, etc.) */
  emitEvent(event: ClauditEvent) {
    this.emit('claudit', event);
  }

  onEvent(handler: (event: ClauditEvent) => void): () => void {
    this.on('claudit', handler);
    return () => this.off('claudit', handler);
  }
}

export const eventBus = new EventBus();
