import { useState, useEffect, useCallback } from 'react';
import { DashboardData } from '../../types';
import { fetchDashboard } from '../../api/dashboard';
import { useUIStore } from '../../stores/useUIStore';
import { cn } from '../../lib/utils';
import {
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  CircleDot,
  Eye,
  Play,
  Square,
  MessageSquare,
  Loader2,
  Bot,
  Layers,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';

function StatRing({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
        <circle
          cx="44" cy="44" r={r} fill="none"
          stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold text-foreground">{pct}%</span>
      </div>
    </div>
  );
}

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
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const totalTasks = data.running + data.waiting + data.doneToday + data.failed;
  const completionRate = totalTasks > 0 ? Math.round((data.doneToday / totalTasks) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Overview of your Claude workspace</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Bento grid — row 1 */}
        <div className="grid grid-cols-12 gap-3">

          {/* Task Progress — spans 5 cols */}
          <div className="col-span-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">Task progress</h2>
                <span className="text-xs text-muted-foreground">{data.doneToday}/{totalTasks} completed</span>
              </div>
              <button
                onClick={() => setView('tasks')}
                className="w-8 h-8 rounded-lg bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors"
              >
                <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Running */}
              <div className={cn(
                'rounded-lg border p-4 transition-all',
                data.running > 0
                  ? 'border-blue-500/20 bg-blue-500/5'
                  : 'border-border/50 bg-secondary/20'
              )}>
                <div className="text-xs text-muted-foreground mb-1">Running</div>
                <div className={cn('text-3xl font-bold tracking-tight', data.running > 0 ? 'text-blue-400' : 'text-muted-foreground')}>
                  {data.running}
                </div>
              </div>

              {/* Waiting */}
              <button
                onClick={() => data.waiting > 0 ? setView('tasks') : undefined}
                className={cn(
                  'rounded-lg border p-4 text-left transition-all',
                  data.waiting > 0
                    ? 'border-primary/30 bg-primary/5 hover:bg-primary/10 cursor-pointer'
                    : 'border-border/50 bg-secondary/20 cursor-default'
                )}
              >
                <div className="text-xs text-muted-foreground mb-1">Waiting</div>
                <div className={cn(
                  'text-3xl font-bold tracking-tight',
                  data.waiting > 0 ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {data.waiting}
                </div>
                {data.waiting > 0 && (
                  <div className="text-[10px] text-primary mt-1 font-medium">Needs attention</div>
                )}
              </button>

              {/* Done */}
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="text-xs text-muted-foreground mb-1">Done today</div>
                <div className="text-3xl font-bold tracking-tight text-emerald-400">{data.doneToday}</div>
              </div>

              {/* Failed */}
              <div className={cn(
                'rounded-lg border p-4',
                data.failed > 0
                  ? 'border-red-500/20 bg-red-500/5'
                  : 'border-border/50 bg-secondary/20'
              )}>
                <div className="text-xs text-muted-foreground mb-1">Failed</div>
                <div className={cn('text-3xl font-bold tracking-tight', data.failed > 0 ? 'text-red-400' : 'text-muted-foreground')}>
                  {data.failed}
                </div>
              </div>
            </div>
          </div>

          {/* Performance ring — spans 3 cols */}
          <div className="col-span-3 rounded-xl border border-border bg-card p-5 flex flex-col items-center justify-center">
            <div className="text-xs text-muted-foreground mb-4 font-medium self-start">Completion rate</div>
            <StatRing
              value={data.doneToday}
              max={totalTasks || 1}
              color="hsl(var(--primary))"
            />
            <div className="mt-3 text-center">
              <div className="text-xs text-muted-foreground">
                {data.doneToday} of {totalTasks} tasks
              </div>
            </div>
          </div>

          {/* Token usage + System — spans 4 cols */}
          <div className="col-span-4 flex flex-col gap-3">
            {/* Token card */}
            <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-5 flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium">Tokens today</span>
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div className="text-3xl font-bold text-foreground tracking-tight">
                {data.tokenUsageToday >= 1000
                  ? `${(data.tokenUsageToday / 1000).toFixed(1)}k`
                  : data.tokenUsageToday.toLocaleString()}
              </div>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-3 h-3 text-primary" />
                <span className="text-[11px] text-primary font-medium">Active usage</span>
              </div>
            </div>

            {/* System status */}
            <div className="rounded-xl border border-border bg-card p-4 flex-1">
              <div className="flex items-center gap-2 mb-3">
                <CircleDot className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-muted-foreground font-medium">System</span>
              </div>
              <div className="space-y-2.5">
                {/* Mayor */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      data.systemStatus.mayorOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-muted-foreground/30'
                    )} />
                    <span className="text-xs text-foreground font-medium">Mayor</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={async () => {
                        try {
                          await fetch(`/api/dashboard/mayor/${data.systemStatus.mayorOnline ? 'stop' : 'start'}`, { method: 'POST' });
                          load();
                        } catch {}
                      }}
                      className={cn(
                        'text-[10px] px-2 py-0.5 rounded-md font-medium transition-all flex items-center gap-1',
                        data.systemStatus.mayorOnline
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      )}
                    >
                      {data.systemStatus.mayorOnline ? <><Square className="w-2.5 h-2.5" /> Stop</> : <><Play className="w-2.5 h-2.5" /> Start</>}
                    </button>
                    {data.systemStatus.mayorOnline && data.systemStatus.mayorSessionId && (
                      <button
                        onClick={() => {
                          useUIStore.getState().selectSession('mayor', data.systemStatus.mayorSessionId!, data.systemStatus.mayorProjectPath || '/');
                          useUIStore.getState().setView('sessions');
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-all font-medium flex items-center gap-1"
                      >
                        <MessageSquare className="w-2.5 h-2.5" /> Chat
                      </button>
                    )}
                  </div>
                </div>
                {/* Witness */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      data.systemStatus.witnessRunning ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-muted-foreground/30'
                    )} />
                    <span className="text-xs text-foreground font-medium">Witness</span>
                  </div>
                  {data.systemStatus.witnessLastCheck && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Eye className="w-2.5 h-2.5" />
                      {new Date(data.systemStatus.witnessLastCheck).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2 — Active Agents + Recent Tasks */}
        <div className="grid grid-cols-12 gap-3">
          {/* Active Agents */}
          <div className={cn(
            'rounded-xl border border-border bg-card p-5',
            data.activeAgents.length > 0 ? 'col-span-5' : 'col-span-0 hidden'
          )}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-foreground">Active Agents</span>
              </div>
              <button
                onClick={() => setView('agents')}
                className="w-7 h-7 rounded-lg bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-2">
              {data.activeAgents.map(({ agent, runningSessions, waitingSessions }) => (
                <div key={agent.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                      {agent.avatar || agent.name[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm text-foreground font-medium">{agent.name}</div>
                      {agent.specialty && <div className="text-[11px] text-muted-foreground">{agent.specialty}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {runningSessions > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 font-medium">
                        {runningSessions} running
                      </span>
                    )}
                    {waitingSessions > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 font-medium animate-pulse-soft">
                        {waitingSessions} waiting
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Tasks */}
          <div className={cn(
            'rounded-xl border border-border bg-card p-5',
            data.activeAgents.length > 0 ? 'col-span-7' : 'col-span-12'
          )}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Recent Tasks</span>
              </div>
              <button
                onClick={() => setView('tasks')}
                className="w-7 h-7 rounded-lg bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            {data.recentTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No tasks yet.</p>
            ) : (
              <div className="space-y-1.5">
                {data.recentTasks.map(task => {
                  const statusStyle =
                    task.status === 'running' ? 'bg-blue-500/15 text-blue-400' :
                    task.status === 'waiting' ? 'bg-red-500/15 text-red-400' :
                    task.status === 'done' ? 'bg-emerald-500/15 text-emerald-400' :
                    task.status === 'failed' ? 'bg-red-500/15 text-red-400' :
                    task.status === 'draft' ? 'bg-purple-500/15 text-purple-400' :
                    'bg-secondary text-muted-foreground';

                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors cursor-pointer group"
                      onClick={() => {
                        useUIStore.getState().setSelectedTaskId(task.id);
                        setView('tasks');
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={cn(
                          'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md flex-shrink-0',
                          statusStyle
                        )}>
                          {task.status}
                        </span>
                        <span className="text-sm text-foreground truncate">{task.title}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(task.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
