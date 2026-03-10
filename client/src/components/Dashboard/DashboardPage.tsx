import { useState, useEffect, useCallback } from 'react';
import { DashboardData, Project, Task } from '../../types';
import { fetchDashboard } from '../../api/dashboard';
import { fetchProjects, createProject } from '../../api/projects';
import { fetchTasks } from '../../api/tasks';
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
  FolderOpen,
  Plus,
  Settings,
} from 'lucide-react';
import FolderBrowser from '../FolderBrowser';

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [projectTaskCounts, setProjectTaskCounts] = useState<Record<string, number>>({});
  const [showAddProject, setShowAddProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [addingProject, setAddingProject] = useState(false);
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

  const loadProjects = useCallback(() => {
    fetchProjects().then(p => {
      setProjects(p);
      Promise.all(p.map(proj => fetchTasks({ projectId: proj.id }).then(tasks => ({ id: proj.id, count: tasks.length }))))
        .then(counts => {
          const map: Record<string, number> = {};
          counts.forEach(c => { map[c.id] = c.count; });
          setProjectTaskCounts(map);
        });
    }).catch(console.error);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleAddProject = async () => {
    if (!newProjectName.trim() || !newProjectPath.trim() || addingProject) return;
    setAddingProject(true);
    try {
      await createProject({ name: newProjectName.trim(), repoPath: newProjectPath.trim() });
      setNewProjectName('');
      setNewProjectPath('');
      setShowAddProject(false);
      loadProjects();
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setAddingProject(false);
    }
  };

  // Load filtered tasks when a project is selected
  useEffect(() => {
    if (!selectedProjectId) {
      setProjectTasks([]);
      return;
    }
    fetchTasks({ projectId: selectedProjectId })
      .then(tasks => setProjectTasks(tasks.slice(0, 10)))
      .catch(console.error);
  }, [selectedProjectId]);

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
                {data.tokenUsageToday >= 1_000_000
                  ? `${(data.tokenUsageToday / 1_000_000).toFixed(1)}M`
                  : data.tokenUsageToday >= 1000
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

        {/* Project Folders */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Projects</span>
            </div>
            {projects.length > 0 && !showAddProject && (
              <button
                onClick={() => setShowAddProject(true)}
                className="text-xs px-2 py-1 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            )}
          </div>

          {projects.length === 0 && !showAddProject ? (
            <button
              onClick={() => setShowAddProject(true)}
              className="w-full rounded-2xl border border-dashed border-border hover:border-primary/30 bg-card/50 hover:bg-primary/5 p-8 transition-all group flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl bg-secondary/60 group-hover:bg-primary/15 flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Add your first project</div>
                <div className="text-xs text-muted-foreground mt-0.5">Link a repository to organize tasks by project</div>
              </div>
            </button>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {projects.map(project => {
                const isSelected = selectedProjectId === project.id;
                const taskCount = projectTaskCounts[project.id] ?? 0;
                const pathShort = project.repoPath.split('/').slice(-2).join('/');
                return (
                  <button
                    key={project.id}
                    onClick={() => setSelectedProjectId(isSelected ? null : project.id)}
                    className={cn(
                      'text-left transition-all duration-200 relative group aspect-square overflow-hidden',
                      isSelected
                        ? 'shadow-lg shadow-orange-500/25 ring-1 ring-orange-400/40'
                        : 'hover:shadow-lg hover:shadow-orange-500/15'
                    )}
                    style={{ borderRadius: '22px' }}
                  >
                    {/* Full card background — warm orange matching #DA7756 */}
                    <div className="absolute inset-0" style={{
                      background: isSelected
                        ? '#DA7756'
                        : '#C4623F',
                      borderRadius: '22px',
                    }} />

                    {/* Documents peeking out — positioned in top 45% */}
                    <div className="absolute inset-x-0 top-0 bottom-[55%] overflow-visible z-[1]">
                      {/* Back document */}
                      <div
                        className="absolute rounded-lg"
                        style={{
                          width: '52%', height: '80%',
                          top: '15%', left: '14%',
                          transform: 'rotate(-7deg)',
                          background: 'rgba(255,255,255,0.78)',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        }}
                      >
                        <div className="mt-[16%] mx-[12%] space-y-[5px]">
                          <div className="h-[3px] w-[75%] rounded-full" style={{ background: 'rgba(0,0,0,0.09)' }} />
                          <div className="h-[3px] w-[55%] rounded-full" style={{ background: 'rgba(0,0,0,0.07)' }} />
                          <div className="h-[3px] w-[65%] rounded-full" style={{ background: 'rgba(0,0,0,0.05)' }} />
                        </div>
                      </div>
                      {/* Front document */}
                      <div
                        className="absolute rounded-lg"
                        style={{
                          width: '52%', height: '80%',
                          top: '8%', left: '30%',
                          transform: 'rotate(4deg)',
                          background: 'rgba(255,255,255,0.9)',
                          boxShadow: '0 3px 12px rgba(0,0,0,0.10)',
                        }}
                      >
                        <div className="mt-[16%] mx-[12%] space-y-[5px]">
                          <div className="h-[3px] w-[82%] rounded-full" style={{ background: 'rgba(0,0,0,0.11)' }} />
                          <div className="h-[3px] w-[60%] rounded-full" style={{ background: 'rgba(0,0,0,0.08)' }} />
                          <div className="h-[3px] w-[72%] rounded-full" style={{ background: 'rgba(0,0,0,0.06)' }} />
                          <div className="h-[3px] w-[48%] rounded-full" style={{ background: 'rgba(0,0,0,0.04)' }} />
                        </div>
                      </div>
                    </div>

                    {/* Folder pocket — single SVG shape, seamless */}
                    <svg
                      className="absolute inset-x-0 bottom-0 w-full z-[2]"
                      viewBox="0 0 200 120"
                      preserveAspectRatio="none"
                      style={{ height: '62%' }}
                    >
                      <defs>
                        <linearGradient id={`pocket-${project.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={isSelected ? '#E8A88C' : '#D99575'} />
                          <stop offset="100%" stopColor={isSelected ? '#E09070' : '#D08060'} />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0,20 Q50,0 100,10 Q150,20 200,5 L200,120 L0,120 Z"
                        fill={`url(#pocket-${project.id})`}
                      />
                    </svg>

                    {/* Pocket content — text + icons */}
                    <div className="absolute inset-x-0 bottom-0 z-[3] flex flex-col justify-end px-[14%] pb-[12%]" style={{ height: '42%' }}>
                      {taskCount > 0 && (
                        <span className="absolute top-0 right-[10%] text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/20 text-white/90 tabular-nums">
                          {taskCount}
                        </span>
                      )}
                      <Settings className="absolute bottom-[14%] right-[10%] text-white/35 group-hover:text-white/55 transition-colors" size={14} />
                      <div className="text-[13px] font-semibold text-white truncate">{project.name}</div>
                      <div className="text-[10px] text-white/50 mt-0.5 truncate">{pathShort}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Inline add project form */}
          {showAddProject && (
            <div className="mt-3 rounded-xl border border-primary/20 bg-card p-4 space-y-3">
              <input
                type="text"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="Project name"
                autoFocus
                className="w-full bg-background/80 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-all"
                onKeyDown={e => { if (e.key === 'Enter' && newProjectName && newProjectPath) handleAddProject(); }}
              />
              <FolderBrowser onPathChange={(path) => setNewProjectPath(path)} />
              {newProjectPath && (
                <div className="text-xs text-muted-foreground font-mono truncate" title={newProjectPath}>
                  {newProjectPath}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowAddProject(false); setNewProjectName(''); setNewProjectPath(''); }}
                  className="text-xs px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddProject}
                  disabled={!newProjectName.trim() || !newProjectPath.trim() || addingProject}
                  className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 font-medium flex items-center gap-1.5"
                >
                  {addingProject ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Create Project
                </button>
              </div>
            </div>
          )}
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
                <span className="text-sm font-semibold text-foreground">
                  {selectedProjectId
                    ? `${projects.find(p => p.id === selectedProjectId)?.name ?? 'Project'} Tasks`
                    : 'Recent Tasks'}
                </span>
                {selectedProjectId && (
                  <button
                    onClick={() => setSelectedProjectId(null)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Show all
                  </button>
                )}
              </div>
              <button
                onClick={() => setView('tasks')}
                className="w-7 h-7 rounded-lg bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            {(() => {
              const displayTasks = selectedProjectId ? projectTasks : data.recentTasks;
              if (displayTasks.length === 0) {
                return <p className="text-sm text-muted-foreground py-8 text-center">
                  {selectedProjectId ? 'No tasks in this project.' : 'No tasks yet.'}
                </p>;
              }
              return (
                <div className="space-y-1.5">
                  {displayTasks.map(task => {
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
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
