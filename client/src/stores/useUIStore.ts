import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type View = 'todo' | 'sessions' | 'cron';

interface SelectedSession {
  projectHash: string;
  sessionId: string;
  projectPath: string;
  isNew?: boolean;
}

interface TodoSessionPrefill {
  sessionId: string;
  sessionLabel: string;
  projectPath: string;
}

interface PendingTodoPrompt {
  sessionId: string;
  prompt: string;
}

export interface SessionDraft {
  prompt: string;
  projectPath: string;
  useWorktree: boolean;
  branchName: string;
}

export interface TodoDraft {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  selectedSessionId: string;
}

interface UIState {
  view: View;
  selected: SelectedSession | null;
  selectedCronTaskId: string | null;
  selectedTodoId: string | null;
  showNewModal: boolean;
  todoSessionPrefill: TodoSessionPrefill | null;
  pendingTodoPrompt: PendingTodoPrompt | null;
  editingTodoId: string | null;
  editingCronTaskId: string | null;
  sessionDraft: SessionDraft | null;
  todoDraft: TodoDraft | null;

  setView: (view: View) => void;
  selectSession: (projectHash: string, sessionId: string, projectPath: string, isNew?: boolean) => void;
  clearSelected: () => void;
  setSelectedCronTaskId: (id: string | null) => void;
  setSelectedTodoId: (id: string | null) => void;
  setShowNewModal: (show: boolean) => void;
  setTodoSessionPrefill: (prefill: TodoSessionPrefill | null) => void;
  setPendingTodoPrompt: (data: PendingTodoPrompt | null) => void;
  setEditingTodoId: (id: string | null) => void;
  setEditingCronTaskId: (id: string | null) => void;
  setSessionDraft: (draft: SessionDraft | null) => void;
  setTodoDraft: (draft: TodoDraft | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      view: 'sessions',
      selected: null,
      selectedCronTaskId: null,
      selectedTodoId: null,
      showNewModal: false,
      todoSessionPrefill: null,
      pendingTodoPrompt: null,
      editingTodoId: null,
      editingCronTaskId: null,
      sessionDraft: null,
      todoDraft: null,

      setView: (view) => set({ view }),
      selectSession: (projectHash, sessionId, projectPath, isNew) =>
        set({ selected: { projectHash, sessionId, projectPath, isNew } }),
      clearSelected: () => set({ selected: null }),
      setSelectedCronTaskId: (id) => set({ selectedCronTaskId: id }),
      setSelectedTodoId: (id) => set({ selectedTodoId: id }),
      setShowNewModal: (show) => set({ showNewModal: show }),
      setTodoSessionPrefill: (prefill) => set({ todoSessionPrefill: prefill }),
      setPendingTodoPrompt: (data) => set({ pendingTodoPrompt: data }),
      setEditingTodoId: (id) => set({ editingTodoId: id }),
      setEditingCronTaskId: (id) => set({ editingCronTaskId: id }),
      setSessionDraft: (draft) => set({ sessionDraft: draft }),
      setTodoDraft: (draft) => set({ todoDraft: draft }),
    }),
    {
      name: 'claudit:ui-state',
      partialize: (state) => ({
        view: state.view,
        selected: state.selected,
        selectedTodoId: state.selectedTodoId,
        selectedCronTaskId: state.selectedCronTaskId,
        editingTodoId: state.editingTodoId,
        editingCronTaskId: state.editingCronTaskId,
        sessionDraft: state.sessionDraft,
        todoDraft: state.todoDraft,
      }),
    },
  ),
);
