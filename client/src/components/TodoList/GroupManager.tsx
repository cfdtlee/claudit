import { useState } from 'react';
import { TodoGroup } from '../../types';
import { createGroup, updateGroup, deleteGroup } from '../../api/groups';

interface Props {
  groups: TodoGroup[];
  onGroupsChanged: () => void;
}

export default function GroupManager({ groups, onGroupsChanged }: Props) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createGroup(newName.trim());
      setNewName('');
      onGroupsChanged();
    } catch (err) {
      console.error('Failed to create group:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await updateGroup(id, { name: editName.trim() });
      setEditingId(null);
      onGroupsChanged();
    } catch (err) {
      console.error('Failed to rename group:', err);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete group "${name}"? Todos in this group will become ungrouped.`)) return;
    try {
      await deleteGroup(id);
      onGroupsChanged();
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          placeholder="New group name..."
          className="flex-1 text-xs bg-gray-800 text-gray-200 px-2 py-1 rounded border border-gray-600 outline-none focus:border-claude"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="text-xs px-2 py-1 bg-claude text-white rounded hover:bg-claude-hover disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {groups.map(g => (
        <div key={g.id} className="flex items-center gap-2 text-xs">
          {editingId === g.id ? (
            <>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename(g.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
                className="flex-1 bg-gray-800 text-gray-200 px-2 py-1 rounded border border-gray-600 outline-none focus:border-claude"
              />
              <button onClick={() => handleRename(g.id)} className="text-claude hover:text-blue-300">Save</button>
              <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-300">Cancel</button>
            </>
          ) : (
            <>
              <span className="flex-1 text-gray-300 truncate">{g.name}</span>
              <button
                onClick={() => { setEditingId(g.id); setEditName(g.name); }}
                className="text-gray-500 hover:text-gray-300"
              >
                Rename
              </button>
              <button
                onClick={() => handleDelete(g.id, g.name)}
                className="text-red-500 hover:text-red-400"
              >
                Delete
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
