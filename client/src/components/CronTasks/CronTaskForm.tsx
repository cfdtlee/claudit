import { useState } from 'react';
import { CronTask } from '../../types';
import FolderBrowser from '../FolderBrowser';
import CronExpressionBuilder from './CronExpressionBuilder';

interface Props {
  initial?: CronTask;
  onSubmit: (data: { name: string; cronExpression: string; prompt: string; projectPath?: string; enabled: boolean }) => void;
  onCancel: () => void;
}

export default function CronTaskForm({ initial, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [cronExpression, setCronExpression] = useState(initial?.cronExpression ?? '*/30 * * * *');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [projectPath, setProjectPath] = useState(initial?.projectPath ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [showBrowser, setShowBrowser] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      cronExpression: cronExpression.trim(),
      prompt: prompt.trim(),
      projectPath: projectPath.trim() || undefined,
      enabled,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Task Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-claude"
          placeholder="e.g. Daily code review"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Schedule</label>
        <CronExpressionBuilder value={cronExpression} onChange={setCronExpression} />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Prompt</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          required
          rows={5}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-claude resize-none"
          placeholder="The prompt to send to Claude..."
        />
        <p className="text-xs text-gray-600 mt-1">Use <code className="text-gray-500 bg-gray-800 px-1 rounded">{'{{todos}}'}</code> to inject pending todo list into the prompt</p>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Project Path (optional)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={projectPath}
            onChange={e => setProjectPath(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-claude"
            placeholder="/path/to/project"
          />
          <button
            type="button"
            onClick={() => setShowBrowser(!showBrowser)}
            className={`px-3 py-2 text-sm rounded-lg transition-colors ${showBrowser ? 'bg-claude text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            Browse
          </button>
        </div>
        {showBrowser && (
          <div className="mt-2 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
            <FolderBrowser onPathChange={(path) => {
              setProjectPath(path);
            }} />
            <button
              type="button"
              onClick={() => {
                setShowBrowser(false);
                if (projectPath) {
                  try { localStorage.setItem('claudit:lastBrowserPath', projectPath); } catch {}
                }
              }}
              className="mt-2 text-xs text-claude hover:text-blue-300"
            >
              Done
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
          id="task-enabled"
          className="rounded"
        />
        <label htmlFor="task-enabled" className="text-sm text-gray-300">Enabled</label>
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="px-4 py-2 bg-claude text-white text-sm rounded-lg hover:bg-claude-hover transition-colors"
        >
          {initial ? 'Save Changes' : 'Create Task'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
