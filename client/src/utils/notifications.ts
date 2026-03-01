import { SessionSummary } from '../types';
import { useUIStore } from '../stores/useUIStore';
import { useSessionStore } from '../stores/useSessionStore';

export function requestNotificationPermission(): void {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function showSessionNotification(session: SessionSummary): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const title = `\u{1F514} ${session.displayName || session.sessionId}`;
  const body = session.lastMessage ? session.lastMessage.slice(0, 120) : 'Session needs your attention';

  const n = new Notification(title, { body, tag: `session-${session.sessionId}` });
  n.onclick = () => {
    window.focus();
    useUIStore.getState().setView('sessions');
    useUIStore.getState().selectSession(session.projectHash, session.sessionId, session.projectPath);
    n.close();
  };
}

// Track previous statuses to detect transitions
const prevStatusMap = new Map<string, string>();

export function checkForAttentionTransitions(groups: { sessions: SessionSummary[] }[]): void {
  for (const g of groups) {
    for (const s of g.sessions) {
      const prev = prevStatusMap.get(s.sessionId);
      if (s.status === 'done' && prev !== undefined && prev !== 'done') {
        showSessionNotification(s);
      }
      prevStatusMap.set(s.sessionId, s.status);
    }
  }
}

export function initPrevStatusMap(groups: { sessions: SessionSummary[] }[]): void {
  for (const g of groups) {
    for (const s of g.sessions) {
      prevStatusMap.set(s.sessionId, s.status);
    }
  }
}
