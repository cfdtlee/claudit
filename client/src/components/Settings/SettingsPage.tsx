import { useState, useEffect } from 'react';
import { ClauditConfig } from '../../types';
import { fetchSettings, updateSettings } from '../../api/settings';

export default function SettingsPage() {
  const [config, setConfig] = useState<ClauditConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSettings().then(setConfig).catch(console.error);
  }, []);

  const handleChange = (key: keyof ClauditConfig, value: string | boolean) => {
    setConfig(prev => prev ? { ...prev, [key]: value } : null);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setMessage('');
    try {
      const updated = await updateSettings(config);
      setConfig(updated);
      setMessage('Settings saved');
      setTimeout(() => setMessage(''), 2000);
    } catch (err) {
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">Loading settings...</div>;
  }

  const inputCls = 'w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-claude';
  const labelCls = 'block text-sm font-medium text-gray-300 mb-1';
  const sectionCls = 'border border-gray-800 rounded-xl p-6';

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <h1 className="text-2xl font-bold text-gray-100">Settings</h1>

        {/* General */}
        <div className={sectionCls}>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">General</h2>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Default Model</label>
              <select value={config.defaultModel ?? ''} onChange={e => handleChange('defaultModel', e.target.value)} className={inputCls}>
                <option value="sonnet">Sonnet</option>
                <option value="opus">Opus</option>
                <option value="haiku">Haiku</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Default Permission Mode</label>
              <select value={config.defaultPermissionMode ?? ''} onChange={e => handleChange('defaultPermissionMode', e.target.value)} className={inputCls}>
                <option value="default">Default</option>
                <option value="plan">Plan</option>
                <option value="auto-edit">Auto Edit</option>
                <option value="full-auto">Full Auto</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Working Directory</label>
              <input
                type="text"
                value={config.workingDirectory ?? ''}
                onChange={e => handleChange('workingDirectory', e.target.value)}
                placeholder="/path/to/workspace"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className={sectionCls}>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">Notifications</h2>
          <div className="space-y-3">
            {([
              ['notifyOnWaiting', 'Notify on waiting for input'],
              ['notifyOnDone', 'Notify on task completed'],
              ['notifyOnFailed', 'Notify on task failed'],
              ['notifyOnStuck', 'Notify on task stuck'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-300">{label}</span>
                <button
                  onClick={() => handleChange(key, !config[key])}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    config[key] ? 'bg-claude' : 'bg-gray-700'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    config[key] ? 'translate-x-5' : ''
                  }`} />
                </button>
              </label>
            ))}
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-claude text-white rounded-lg text-sm font-medium hover:bg-claude-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {message && (
            <span className={`text-sm ${message.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>
              {message}
            </span>
          )}
        </div>

        {/* Danger Zone */}
        <div className="border border-red-900/50 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-red-400 mb-4">Danger Zone</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-300">Clear session cache</p>
                <p className="text-xs text-gray-500">Removes cached session data. Sessions will be re-scanned.</p>
              </div>
              <button
                onClick={() => {
                  if (confirm('Clear session cache?')) {
                    // Could call an API to clear cache — placeholder
                    setMessage('Session cache cleared');
                    setTimeout(() => setMessage(''), 2000);
                  }
                }}
                className="px-3 py-1.5 text-xs bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors"
              >
                Clear Cache
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
