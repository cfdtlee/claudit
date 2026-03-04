import { useState, useEffect } from 'react';
import { ClauditConfig } from '../../types';
import { fetchSettings, updateSettings } from '../../api/settings';
import { cn } from '../../lib/utils';
import {
  Settings, Bell, AlertTriangle, Save, Loader2, CheckCircle2, Trash2,
  Monitor, Shield,
} from 'lucide-react';

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
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all';
  const labelCls = 'block text-sm font-medium text-foreground mb-1.5';

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-muted-foreground" /> Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure your Claudit workspace</p>
        </div>

        {/* General */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Monitor className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">General</h2>
          </div>
          <div className="space-y-5">
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
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Bell className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-semibold text-foreground">Notifications</h2>
          </div>
          <div className="space-y-1">
            {([
              ['notifyOnWaiting', 'Notify on waiting for input', 'When a task needs your response'],
              ['notifyOnDone', 'Notify on task completed', 'When a task finishes successfully'],
              ['notifyOnFailed', 'Notify on task failed', 'When a task encounters an error'],
              ['notifyOnStuck', 'Notify on task stuck', 'When a task appears to be stuck'],
            ] as const).map(([key, label, desc]) => (
              <label
                key={key}
                className="flex items-center justify-between cursor-pointer p-3 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div>
                  <span className="text-sm text-foreground font-medium">{label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() => handleChange(key, !config[key])}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                    config[key] ? 'bg-primary' : 'bg-secondary'
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm',
                    config[key] && 'translate-x-5'
                  )} />
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
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm shadow-primary/20"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4" /> Save Settings</>
            )}
          </button>
          {message && (
            <span className={cn(
              'text-sm flex items-center gap-1 animate-fade-in',
              message.includes('Failed') ? 'text-destructive' : 'text-emerald-400'
            )}>
              {message.includes('Failed') ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {message}
            </span>
          )}
        </div>

        {/* Danger Zone */}
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Shield className="w-4 h-4 text-destructive" />
            <h2 className="text-base font-semibold text-destructive">Danger Zone</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground font-medium">Clear session cache</p>
                <p className="text-xs text-muted-foreground mt-0.5">Removes cached session data. Sessions will be re-scanned.</p>
              </div>
              <button
                onClick={() => {
                  if (confirm('Clear session cache?')) {
                    setMessage('Session cache cleared');
                    setTimeout(() => setMessage(''), 2000);
                  }
                }}
                className="px-3 py-1.5 text-xs bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors flex items-center gap-1 font-medium"
              >
                <Trash2 className="w-3 h-3" /> Clear Cache
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
