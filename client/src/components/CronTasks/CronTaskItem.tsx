import { CronTask } from '../../types';
import { StatusBadge } from '../StatusDot';

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
      className={`w-full text-left px-4 py-3 border-b border-gray-800 transition-colors ${
        selected ? 'bg-claude/10' : 'hover:bg-gray-800/50'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-200 truncate">{task.name}</span>
        <StatusBadge status={task.enabled ? 'enabled' : 'disabled'} />
      </div>
      <div className="text-xs text-gray-500 font-mono">{task.cronExpression}</div>
      <div className="text-xs text-gray-600 mt-1">Last run: {timeAgo(task.lastRun)}</div>
    </button>
  );
}
