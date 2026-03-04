import { useState, useEffect, useCallback } from 'react';
import { CronTask } from '../../types';
import { fetchCronTasks, createCronTask } from '../../api/cron';
import { cn } from '../../lib/utils';
import { Plus, Loader2, Workflow } from 'lucide-react';
import CronTaskItem from './CronTaskItem';
import CronTaskForm from './CronTaskForm';

interface Props {
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
}

export default function CronTaskList({ selectedTaskId, onSelect }: Props) {
  const [tasks, setTasks] = useState<CronTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      const data = await fetchCronTasks();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load cron tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 10000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  const handleCreate = async (data: {
    name: string;
    cronExpression: string;
    prompt: string;
    projectPath?: string;
    enabled: boolean;
  }) => {
    try {
      const task = await createCronTask(data);
      setTasks(prev => [...prev, task]);
      setShowForm(false);
      onSelect(task.id);
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Cron Tasks</h2>
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
        <div className="p-4 border-b border-border/50 bg-card/50 animate-slide-in">
          <CronTaskForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="flex-1 sidebar-scroll">
        {loading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-6 text-center">
            <Workflow className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No cron tasks yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Create one to get started</p>
          </div>
        ) : (
          tasks.map(task => (
            <CronTaskItem
              key={task.id}
              task={task}
              selected={task.id === selectedTaskId}
              onSelect={() => onSelect(task.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
