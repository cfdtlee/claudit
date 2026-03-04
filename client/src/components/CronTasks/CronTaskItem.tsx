import { CronTask } from '../../types';
import { cn } from '../../lib/utils';
import { Clock } from 'lucide-react';

interface Props {
  task: CronTask;
  selected: boolean;
  onSelect: () => void;
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CronTaskItem({ task, selected, onSelect }: Props) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left px-4 py-3 transition-all',
        selected
          ? 'list-item-selected'
          : 'list-item-hover'
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-foreground truncate">{task.name}</span>
        <span className={cn(
          'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md',
          task.enabled
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-secondary text-muted-foreground'
        )}>
          {task.enabled ? 'Active' : 'Paused'}
        </span>
      </div>
      <div className="text-xs text-muted-foreground font-mono">{task.cronExpression}</div>
      <div className="text-xs text-muted-foreground/60 mt-1 flex items-center gap-1">
        <Clock className="w-2.5 h-2.5" /> {timeAgo(task.lastRun)}
      </div>
    </button>
  );
}
