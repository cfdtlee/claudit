import { useState, useEffect, useCallback } from 'react';
import { Agent } from '../../types';
import { fetchAgent, updateAgent, deleteAgent } from '../../api/agents';
import { cn } from '../../lib/utils';
import { Edit3, Trash2, Save, X, Loader2, Clock, Bot, Code2, Shield } from 'lucide-react';

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
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Bot className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground">Select an agent or create a new one</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
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

  const inputCls = 'w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all';
  const labelCls = 'block text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider';

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white text-2xl font-semibold shadow-xl shadow-primary/20">
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
                <h2 className="text-xl font-bold text-foreground">{agent.name}</h2>
              )}
              {!editing && agent.specialty && (
                <p className="text-sm text-muted-foreground mt-1">{agent.specialty}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {agent.isSystem ? (
              <span className="px-2.5 py-1 text-xs bg-primary/10 text-primary rounded-lg flex items-center gap-1 font-medium">
                <Shield className="w-3 h-3" /> System
              </span>
            ) : editing ? (
              <>
                <button onClick={handleSave} className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-medium flex items-center gap-1">
                  <Save className="w-3 h-3" /> Save
                </button>
                <button onClick={() => { setEditing(false); loadAgent(); }} className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-1">
                  <X className="w-3 h-3" /> Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-1">
                  <Edit3 className="w-3 h-3" /> Edit
                </button>
                <button onClick={handleDelete} className="px-3 py-1.5 text-xs bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </>
            )}
          </div>
        </div>

        {editing && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Avatar (emoji or letter)</label>
              <input type="text" value={form.avatar} onChange={e => setForm(f => ({ ...f, avatar: e.target.value }))} placeholder="e.g. A or emoji" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Specialty</label>
              <input type="text" value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} placeholder="e.g. Frontend, Testing..." className={inputCls} />
            </div>
          </div>
        )}

        {/* System Prompt */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Code2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">System Prompt</h3>
          </div>
          {editing ? (
            <textarea
              value={form.systemPrompt}
              onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
              className={cn(inputCls, 'min-h-[200px] resize-y font-mono')}
              rows={8}
            />
          ) : (
            <pre className="text-sm text-secondary-foreground whitespace-pre-wrap bg-secondary/30 rounded-lg p-4 font-mono border border-border/30">
              {agent.systemPrompt || '(no system prompt)'}
            </pre>
          )}
        </div>

        {/* Recent Summary */}
        {agent.recentSummary && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Recent Summary</h3>
            <p className="text-sm text-secondary-foreground whitespace-pre-wrap bg-secondary/30 rounded-lg p-4 border border-border/30">{agent.recentSummary}</p>
          </div>
        )}

        {/* Meta */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-secondary/20 rounded-lg p-3 border border-border/20">
            <h3 className="text-xs text-muted-foreground mb-1 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" /> Created
            </h3>
            <p className="text-sm text-foreground">{new Date(agent.createdAt).toLocaleString()}</p>
          </div>
          <div className="bg-secondary/20 rounded-lg p-3 border border-border/20">
            <h3 className="text-xs text-muted-foreground mb-1 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" /> Updated
            </h3>
            <p className="text-sm text-foreground">{new Date(agent.updatedAt).toLocaleString()}</p>
          </div>
          {agent.lastActiveAt && (
            <div className="bg-secondary/20 rounded-lg p-3 border border-border/20">
              <h3 className="text-xs text-muted-foreground mb-1 font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" /> Last Active
              </h3>
              <p className="text-sm text-foreground">{new Date(agent.lastActiveAt).toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
