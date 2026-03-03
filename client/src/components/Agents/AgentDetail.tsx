import { useState, useEffect, useCallback } from 'react';
import { Agent } from '../../types';
import { fetchAgent, updateAgent, deleteAgent } from '../../api/agents';

interface Props {
  agentId: string | null;
  onAgentDeleted: () => void;
  onAgentCreated: (id: string) => void;
}

export default function AgentDetail({ agentId, onAgentDeleted }: Props) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '',
    avatar: '',
    specialty: '',
    systemPrompt: '',
  });

  const loadAgent = useCallback(async () => {
    if (!agentId) {
      setAgent(null);
      return;
    }
    try {
      const data = await fetchAgent(agentId);
      setAgent(data);
      setForm({
        name: data.name,
        avatar: data.avatar ?? '',
        specialty: data.specialty ?? '',
        systemPrompt: data.systemPrompt,
      });
    } catch (err) {
      console.error('Failed to load agent:', err);
    }
  }, [agentId]);

  useEffect(() => { loadAgent(); }, [loadAgent]);

  if (!agentId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>Select an agent or create a new one</p>
      </div>
    );
  }

  if (!agent) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">Loading...</div>;
  }

  const handleSave = async () => {
    try {
      const updated = await updateAgent(agent.id, {
        name: form.name,
        avatar: form.avatar || undefined,
        specialty: form.specialty || undefined,
        systemPrompt: form.systemPrompt,
      });
      setAgent(updated);
      setEditing(false);
    } catch (err) {
      console.error('Failed to update agent:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.name}"?`)) return;
    try {
      await deleteAgent(agent.id);
      onAgentDeleted();
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  };

  const inputCls = 'w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-claude';
  const labelCls = 'block text-xs text-gray-400 mb-1';

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-claude to-purple-600 flex items-center justify-center text-white text-2xl font-medium">
              {agent.avatar || agent.name[0].toUpperCase()}
            </div>
            <div>
              {editing ? (
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                />
              ) : (
                <h2 className="text-xl font-semibold text-gray-100">{agent.name}</h2>
              )}
              {!editing && agent.specialty && (
                <p className="text-sm text-gray-400 mt-1">{agent.specialty}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={handleSave} className="px-3 py-1.5 text-xs bg-claude text-white rounded-lg hover:bg-claude-hover transition-colors">
                  Save
                </button>
                <button onClick={() => { setEditing(false); loadAgent(); }} className="px-3 py-1.5 text-xs bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-xs bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors">
                  Edit
                </button>
                <button onClick={handleDelete} className="px-3 py-1.5 text-xs bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors">
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        {editing && (
          <>
            <div>
              <label className={labelCls}>Avatar (emoji or letter)</label>
              <input type="text" value={form.avatar} onChange={e => setForm(f => ({ ...f, avatar: e.target.value }))} placeholder="e.g. A or emoji" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Specialty</label>
              <input type="text" value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} placeholder="e.g. Frontend, Testing..." className={inputCls} />
            </div>
          </>
        )}

        {/* System Prompt */}
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">System Prompt</h3>
          {editing ? (
            <textarea
              value={form.systemPrompt}
              onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
              className={`${inputCls} min-h-[200px] resize-y font-mono`}
              rows={8}
            />
          ) : (
            <pre className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-800/50 rounded-lg p-4 font-mono">
              {agent.systemPrompt || '(no system prompt)'}
            </pre>
          )}
        </div>

        {/* Recent Summary */}
        {agent.recentSummary && (
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">Recent Summary</h3>
            <p className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-800/50 rounded-lg p-4">{agent.recentSummary}</p>
          </div>
        )}

        {/* Meta */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="text-xs text-gray-500 mb-1">Created</h3>
            <p className="text-gray-300">{new Date(agent.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <h3 className="text-xs text-gray-500 mb-1">Updated</h3>
            <p className="text-gray-300">{new Date(agent.updatedAt).toLocaleString()}</p>
          </div>
          {agent.lastActiveAt && (
            <div>
              <h3 className="text-xs text-gray-500 mb-1">Last Active</h3>
              <p className="text-gray-300">{new Date(agent.lastActiveAt).toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
