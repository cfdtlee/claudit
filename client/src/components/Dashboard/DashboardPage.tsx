import { useState, useEffect, useCallback } from 'react';
import { DashboardData } from '../../types';
import { fetchDashboard } from '../../api/dashboard';
import { useUIStore } from '../../stores/useUIStore';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const setView = useUIStore(s => s.setView);

  const load = useCallback(async () => {
    try {
      const d = await fetchDashboard();
      setData(d);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading || !data) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">Loading dashboard...</div>;
  }

  const statCards = [
    {
      label: 'Running',
      value: data.running,
      color: 'text-blue-400',
      bg: 'bg-blue-900/20 border-blue-800/50',
    },
    {
      label: 'Waiting',
      value: data.waiting,
      color: 'text-red-400',
      bg: data.waiting > 0 ? 'bg-red-900/30 border-red-600/70 animate-pulse' : 'bg-red-900/20 border-red-800/50',
      onClick: data.waiting > 0 ? () => setView('tasks') : undefined,
    },
    {
      label: 'Done Today',
      value: data.doneToday,
      color: 'text-green-400',
      bg: 'bg-green-900/20 border-green-800/50',
    },
    {
      label: 'Failed',
      value: data.failed,
      color: data.failed > 0 ? 'text-red-400' : 'text-gray-400',
      bg: 'bg-gray-800/50 border-gray-700/50',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
        <p className="text-sm text-gray-500">Coming soon</p>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-4">
          {statCards.map(card => (
            <button
              key={card.label}
              onClick={card.onClick}
              disabled={!card.onClick}
              className={`border rounded-xl p-4 text-left transition-colors ${card.bg} ${card.onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            >
              <div className={`text-3xl font-bold ${card.color}`}>{card.value}</div>
              <div className="text-sm text-gray-400 mt-1">{card.label}</div>
            </button>
          ))}
        </div>

        {/* Token usage */}
        <div className="border border-gray-800 rounded-xl p-4">
          <div className="text-sm text-gray-400">Token Usage Today</div>
          <div className="text-2xl font-semibold text-gray-200 mt-1">
            {data.tokenUsageToday.toLocaleString()}
          </div>
        </div>

        {/* System status */}
        <div className="border border-gray-800 rounded-xl p-4">
          <h2 className="text-lg font-semibold text-gray-200 mb-3">System Status</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${data.systemStatus.mayorOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
              <span className="text-sm text-gray-300">Mayor</span>
              <span className={`text-xs ${data.systemStatus.mayorOnline ? 'text-green-400' : 'text-gray-500'}`}>
                {data.systemStatus.mayorOnline ? 'Online' : 'Offline'}
              </span>
              <button
                onClick={async () => {
                  try {
                    await fetch(`/api/dashboard/mayor/${data.systemStatus.mayorOnline ? 'stop' : 'start'}`, { method: 'POST' });
                    load();
                  } catch {}
                }}
                className={`text-xs px-2 py-0.5 rounded border ${
                  data.systemStatus.mayorOnline
                    ? 'border-red-700 text-red-400 hover:bg-red-900/30'
                    : 'border-green-700 text-green-400 hover:bg-green-900/30'
                }`}
              >
                {data.systemStatus.mayorOnline ? 'Stop' : 'Start'}
              </button>
              {data.systemStatus.mayorOnline && data.systemStatus.mayorSessionId && (
                <button
                  onClick={() => {
                    useUIStore.getState().selectSession('mayor', data.systemStatus.mayorSessionId!, data.systemStatus.mayorProjectPath || '/');
                    useUIStore.getState().setView('sessions');
                  }}
                  className="text-xs px-2 py-0.5 rounded border border-blue-700 text-blue-400 hover:bg-blue-900/30"
                >
                  Chat
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${data.systemStatus.witnessRunning ? 'bg-green-400' : 'bg-gray-600'}`} />
              <span className="text-sm text-gray-300">Witness</span>
              <span className={`text-xs ${data.systemStatus.witnessRunning ? 'text-green-400' : 'text-gray-500'}`}>
                {data.systemStatus.witnessRunning ? 'Active' : 'Stopped'}
              </span>
            </div>
            {data.systemStatus.witnessLastCheck && (
              <div className="text-xs text-gray-500">
                Last check: {new Date(data.systemStatus.witnessLastCheck).toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>

        {/* Active Agents */}
        {data.activeAgents.length > 0 && (
          <div className="border border-gray-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold text-gray-200 mb-3">Active Agents</h2>
            <div className="space-y-2">
              {data.activeAgents.map(({ agent, runningSessions, waitingSessions }) => (
                <div key={agent.id} className="flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-claude to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                      {agent.avatar || agent.name[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm text-gray-200 font-medium">{agent.name}</div>
                      {agent.specialty && <div className="text-xs text-gray-500">{agent.specialty}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {runningSessions > 0 && (
                      <span className="text-xs text-blue-400">{runningSessions} running</span>
                    )}
                    {waitingSessions > 0 && (
                      <span className="text-xs text-red-400 font-medium">{waitingSessions} waiting</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Tasks */}
        <div className="border border-gray-800 rounded-xl p-4">
          <h2 className="text-lg font-semibold text-gray-200 mb-3">Recent Tasks</h2>
          {data.recentTasks.length === 0 ? (
            <p className="text-sm text-gray-500">No tasks yet.</p>
          ) : (
            <div className="space-y-1">
              {data.recentTasks.map(task => (
                <div key={task.id} className="flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs px-1.5 py-0.5 rounded text-white ${
                      task.status === 'running' ? 'bg-blue-600' :
                      task.status === 'waiting' ? 'bg-red-600' :
                      task.status === 'done' ? 'bg-green-600' :
                      task.status === 'failed' ? 'bg-red-600' :
                      task.status === 'draft' ? 'bg-purple-600' :
                      'bg-gray-600'
                    }`}>
                      {task.status}
                    </span>
                    <span className="text-sm text-gray-300 truncate">{task.title}</span>
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                    {new Date(task.updatedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
