import { useState, useEffect } from 'react';
import { TodoItem, SessionSummary } from '../../types';

interface Props {
  initial?: TodoItem;
  sessions?: SessionSummary[];
  prefillSessionId?: string;
  onSubmit: (data: {
    title: string;
    description?: string;
    priority: 'low' | 'medium' | 'high';
    sessionId?: string;
    sessionLabel?: string;
  }) => void;
  onCancel: () => void;
  onCreateSession?: () => void;
}

export default function TodoForm({ initial, sessions, prefillSessionId, onSubmit, onCancel, onCreateSession }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(initial?.priority ?? 'medium');
  const [selectedSessionId, setSelectedSessionId] = useState(initial?.sessionId ?? prefillSessionId ?? '');

  // When prefillSessionId changes (e.g. from session→todo flow), update selection
  useEffect(() => {
    if (prefillSessionId) {
      setSelectedSessionId(prefillSessionId);
    }
  }, [prefillSessionId]);

  const handleSessionChange = (value: string) => {
    if (value === '__new__') {
      onCreateSession?.();
      return;
    }
    setSelectedSessionId(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let sessionId: string | undefined;
    let sessionLabel: string | undefined;

    if (selectedSessionId && sessions) {
      const session = sessions.find(s => s.sessionId === selectedSessionId);
      if (session) {
        sessionId = session.sessionId;
        sessionLabel = session.displayName || session.lastMessage;
      }
    } else if (selectedSessionId) {
      sessionId = selectedSessionId;
    }

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      sessionId,
      sessionLabel,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Title *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-claude"
          placeholder="What needs to be done?"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-claude resize-none"
          placeholder="Optional details..."
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Priority</label>
        <div className="flex gap-2">
          {(['low', 'medium', 'high'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${
                priority === p
                  ? p === 'high' ? 'bg-red-900/50 text-red-400'
                    : p === 'medium' ? 'bg-yellow-900/50 text-yellow-400'
                    : 'bg-gray-700 text-gray-300'
                  : 'bg-gray-800 text-gray-500 hover:text-gray-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Linked Session</label>
        {sessions ? (
          <select
            value={selectedSessionId}
            onChange={e => handleSessionChange(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-claude"
          >
            <option value="">(No session)</option>
            {sessions.map(s => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.displayName || s.lastMessage || s.sessionId.slice(0, 8)}
              </option>
            ))}
            {onCreateSession && (
              <option value="__new__">+ New Session...</option>
            )}
          </select>
        ) : (
          <input
            type="text"
            value={selectedSessionId}
            onChange={e => setSelectedSessionId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-claude"
            placeholder="Session ID"
          />
        )}
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="text-xs px-3 py-1.5 bg-claude text-white rounded-lg hover:bg-claude-hover transition-colors disabled:opacity-50"
        >
          {initial ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
}
