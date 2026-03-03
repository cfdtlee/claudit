import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type View = 'dashboard' | 'sessions' | 'cron' | 'tasks' | 'agents' | 'settings';

interface SelectedSession {
  projectHash: string;
  sessionId: string;
  projectPath: string;
  isNew?: boolean;
  slug?: string;
  slugSessionIds?: string[];
}

interface PendingTaskPrompt {
  sessionId: string;
  prompt: string;
}

export interface SessionDraft {
  prompt: string;
  projectPath: string;
  useWorktree: boolean;
  branchName: string;
}

export interface TaskDraft {
  title: string;
  description: string;
  priority: number;
  selectedSessionId: string;
}

interface UIState {
  view: View;
  selected: SelectedSession | null;
  selectedCronTaskId: string | null;
  selectedTaskId: string | null;
  selectedAgentId: string | null;
  selectedProjectId: string | null;
  showNewModal: boolean;
  pendingTaskPrompt: PendingTaskPrompt | null;
  editingTaskId: string | null;
  editingCronTaskId: string | null;
  sessionDraft: SessionDraft | null;
  taskDraft: TaskDraft | null;

  setView: (view: View) => void;
  selectSession: (projectHash: string, sessionId: string, projectPath: string, isNew?: boolean, slug?: string, slugSessionIds?: string[]) => void;
  clearSelected: () => void;
  setSelectedCronTaskId: (id: string | null) => void;
  setSelectedTaskId: (id: string | null) => void;
  setSelectedAgentId: (id: string | null) => void;
  setSelectedProjectId: (id: string | null) => void;
  setShowNewModal: (show: boolean) => void;
  setPendingTaskPrompt: (data: PendingTaskPrompt | null) => void;
  setEditingTaskId: (id: string | null) => void;
  setEditingCronTaskId: (id: string | null) => void;
  setSessionDraft: (draft: SessionDraft | null) => void;
  setTaskDraft: (draft: TaskDraft | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      view: 'sessions',
      selected: null,
      selectedCronTaskId: null,
      selectedTaskId: null,
      selectedAgentId: null,
      selectedProjectId: null,
      showNewModal: false,
      pendingTaskPrompt: null,
      editingTaskId: null,
      editingCronTaskId: null,
      sessionDraft: null,
      taskDraft: null,

      setView: (view) => set({ view }),
      selectSession: (projectHash, sessionId, projectPath, isNew, slug, slugSessionIds) =>
        set({ selected: { projectHash, sessionId, projectPath, isNew, slug, slugSessionIds } }),
      clearSelected: () => set({ selected: null }),
      setSelectedCronTaskId: (id) => set({ selectedCronTaskId: id }),
      setSelectedTaskId: (id) => set({ selectedTaskId: id }),
      setSelectedAgentId: (id) => set({ selectedAgentId: id }),
      setSelectedProjectId: (id) => set({ selectedProjectId: id }),
      setShowNewModal: (show) => set({ showNewModal: show }),
      setPendingTaskPrompt: (data) => set({ pendingTaskPrompt: data }),
      setEditingTaskId: (id) => set({ editingTaskId: id }),
      setEditingCronTaskId: (id) => set({ editingCronTaskId: id }),
      setSessionDraft: (draft) => set({ sessionDraft: draft }),
      setTaskDraft: (draft) => set({ taskDraft: draft }),
    }),
    {
      name: 'claudit:ui-state',
      partialize: (state) => ({
        view: state.view,
        selected: state.selected,
        selectedCronTaskId: state.selectedCronTaskId,
        selectedTaskId: state.selectedTaskId,
        selectedAgentId: state.selectedAgentId,
        selectedProjectId: state.selectedProjectId,
        editingTaskId: state.editingTaskId,
        editingCronTaskId: state.editingCronTaskId,
        sessionDraft: state.sessionDraft,
        taskDraft: state.taskDraft,
      }),
    },
  ),
);
