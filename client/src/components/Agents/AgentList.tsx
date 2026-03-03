import { useState, useEffect, useCallback } from 'react';
import { Agent } from '../../types';
import { fetchAgents, createAgent } from '../../api/agents';

interface Props {
  selectedAgentId: string | null;
  onSelect: (agentId: string) => void;
}

export default function AgentList({ selectedAgentId, onSelect }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSpecialty, setNewSpecialty] = useState('');

  const loadAgents = useCallback(async () => {
    try {
      const data = await fetchAgents();
      setAgents(data);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const agent = await createAgent({
        name: newName.trim(),
        specialty: newSpecialty.trim() || undefined,
      });
      setAgents(prev => [agent, ...prev]);
      setNewName('');
      setNewSpecialty('');
      setShowForm(false);
      onSelect(agent.id);
    } catch (err) {
      console.error('Failed to create agent:', err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-200">Agents</h2>
          <p className="text-xs text-gray-500">Coming soon</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 bg-claude text-white rounded-lg hover:bg-claude-hover transition-colors"
        >
          {showForm ? 'Cancel' : '+ New'}
        </button>
      </div>

      {showForm && (
        <div className="p-4 border-b border-gray-800 bg-gray-900/50 space-y-2">
          <input
            type="text"
            placeholder="Agent name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-claude"
            autoFocus
          />
          <input
            type="text"
            placeholder="Specialty (optional)..."
            value={newSpecialty}
            onChange={(e) => setNewSpecialty(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-claude"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="w-full px-3 py-1.5 bg-claude text-white rounded-lg text-sm hover:bg-claude-hover transition-colors disabled:opacity-50"
          >
            Create Agent
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-gray-500 text-sm">Loading...</div>
        ) : agents.length === 0 ? (
          <div className="p-4 text-gray-500 text-sm text-center">
            No agents yet. Create one to get started.
          </div>
        ) : (
          agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-800/50 transition-colors ${
                agent.id === selectedAgentId ? 'bg-gray-800' : 'hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-claude to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                  {agent.avatar || agent.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200 font-medium truncate">{agent.name}</div>
                  {agent.specialty && (
                    <div className="text-xs text-gray-500 truncate">{agent.specialty}</div>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
