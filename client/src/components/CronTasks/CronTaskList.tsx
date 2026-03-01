import { useState, useEffect, useCallback } from 'react';
import { CronTask } from '../../types';
import { fetchCronTasks, createCronTask } from '../../api/cron';
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
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-200">Cron Tasks</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 bg-claude text-white rounded-lg hover:bg-claude-hover transition-colors"
        >
          {showForm ? 'Cancel' : '+ New'}
        </button>
      </div>

      {showForm && (
        <div className="p-4 border-b border-gray-800 bg-gray-900/50">
          <CronTaskForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-gray-500 text-sm">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="p-4 text-gray-500 text-sm text-center">
            No cron tasks yet. Create one to get started.
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
