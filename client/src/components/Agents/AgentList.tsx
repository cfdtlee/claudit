import { useState, useEffect, useCallback } from 'react';
import { Agent } from '../../types';
import { fetchAgents, createAgent } from '../../api/agents';
import { cn } from '../../lib/utils';
import { Plus, Loader2, Bot } from 'lucide-react';

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
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Agents</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className={cn(
            'text-xs px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1',
            showForm
              ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20'
          )}
        >
          {showForm ? 'Cancel' : <><Plus className="w-3 h-3" /> New</>}
        </button>
      </div>

      {showForm && (
        <div className="p-4 border-b border-border/50 bg-card/50 space-y-2 animate-slide-in">
          <input
            type="text"
            placeholder="Agent name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            autoFocus
          />
          <input
            type="text"
            placeholder="Specialty (optional)..."
            value={newSpecialty}
            onChange={(e) => setNewSpecialty(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="w-full px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            Create Agent
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : agents.length === 0 ? (
          <div className="p-6 text-center">
            <Bot className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No agents yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Create one to get started</p>
          </div>
        ) : (
          agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              className={cn(
                'w-full text-left px-4 py-3 transition-all',
                agent.id === selectedAgentId
                  ? 'list-item-selected'
                  : 'list-item-hover'
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white text-sm font-semibold shadow-lg">
                  {agent.avatar || agent.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground font-medium truncate">{agent.name}</div>
                  {agent.specialty && (
                    <div className="text-xs text-muted-foreground truncate">{agent.specialty}</div>
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
