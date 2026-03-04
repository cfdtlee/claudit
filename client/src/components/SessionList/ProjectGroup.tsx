import { memo } from 'react';
import { ProjectGroup as ProjectGroupType } from '../../types';
import { useSessionStore } from '../../stores/useSessionStore';
import { cn } from '../../lib/utils';
import { ChevronRight, FolderOpen } from 'lucide-react';
import SessionItem from './SessionItem';

interface Props {
  group: ProjectGroupType;
  isArchived?: boolean;
  selectedIds?: Set<string>;
  onSessionClick?: (e: React.MouseEvent, sessionId: string) => void;
  onSessionContextMenu?: (e: React.MouseEvent, sessionId: string) => void;
}

function shortProjectName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.slice(-2).join('/');
}

function ProjectGroup({ group, isArchived, selectedIds, onSessionClick, onSessionContextMenu }: Props) {
  const expandedSet = useSessionStore(s => s.expandedSet);
  const archivedGroupExpanded = useSessionStore(s => s.archivedGroupExpanded);
  const toggleGroup = useSessionStore(s => s.toggleGroup);
  const toggleArchivedGroup = useSessionStore(s => s.toggleArchivedGroup);

  const expanded = isArchived
    ? archivedGroupExpanded.has(group.projectHash)
    : expandedSet.has(group.projectHash);

  const handleToggle = () => {
    if (isArchived) {
      toggleArchivedGroup(group.projectHash);
    } else {
      toggleGroup(group.projectHash);
    }
  };

  return (
    <div className="animate-fade-in">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/50
                   text-xs font-medium text-muted-foreground tracking-wide transition-colors"
      >
        <ChevronRight className={cn(
          'w-3 h-3 transition-transform duration-150',
          expanded && 'rotate-90'
        )} />
        <FolderOpen className="w-3 h-3 text-muted-foreground/70" />
        <span className="truncate">{shortProjectName(group.projectPath)}</span>
        <span className="ml-auto text-muted-foreground/50 tabular-nums">{group.sessions.length}</span>
      </button>
      {expanded && (
        <div className="animate-slide-in">
          {group.sessions.map(s => (
            <SessionItem
              key={s.sessionId}
              session={s}
              projectHash={group.projectHash}
              isArchived={isArchived}
              multiSelected={selectedIds?.has(s.sessionId)}
              onMultiClick={onSessionClick}
              onContextMenu={onSessionContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(ProjectGroup);
