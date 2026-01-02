import type { Goal } from '@cuewise/shared';
import { useEffect, useRef, useState } from 'react';

interface UseGoalEditingOptions {
  /**
   * Function to find a goal by ID for comparison during save.
   * Returns the goal if found, or undefined.
   */
  findGoalById: (id: string) => Goal | undefined;

  /**
   * Function to update a goal's text. Returns true on success.
   */
  updateTask: (id: string, text: string) => Promise<boolean>;

  /**
   * Function to link a task to a goal. Returns true on success.
   */
  linkTaskToGoal: (taskId: string, goalId: string | null) => Promise<boolean>;
}

interface UseGoalEditingReturn {
  /** ID of the goal currently being edited, or null */
  editingGoalId: string | null;

  /** Current text in the edit input */
  editText: string;

  /** ID of the goal with link picker open, or null */
  linkPickerOpenFor: string | null;

  /** Ref to attach to the edit input */
  inputRef: React.RefObject<HTMLInputElement>;

  /** Ref to attach to the actions container (to prevent blur on action click) */
  actionsRef: React.RefObject<HTMLDivElement>;

  /** Start editing a goal */
  startEditing: (goalId: string, currentText: string) => void;

  /** Save the current edit */
  saveEdit: () => Promise<void>;

  /** Cancel editing without saving */
  cancelEdit: () => void;

  /** Handle blur event on the input */
  handleBlur: (e: React.FocusEvent<HTMLInputElement>) => void;

  /** Handle keydown event on the input (Enter to save, Escape to cancel) */
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;

  /** Update the edit text (for controlled input) */
  setEditText: (text: string) => void;

  /** Open the link picker for a goal */
  openLinkPicker: (goalId: string) => void;

  /** Close the link picker */
  closeLinkPicker: () => void;

  /** Handle linking a task to a goal (or removing link with null) */
  handleLinkToGoal: (taskId: string, goalId: string | null) => Promise<void>;

  /** Check if a specific goal is being edited */
  isEditing: (goalId: string) => boolean;

  /** Check if the link picker is open for a specific goal */
  isLinkPickerOpen: (goalId: string) => boolean;

  /** Clear editing state (useful after delete/transfer) */
  clearEditing: () => void;
}

/**
 * Hook to manage goal editing state and logic.
 * Extracts common editing patterns from GoalsList and AllGoalsList.
 */
export function useGoalEditing({
  findGoalById,
  updateTask,
  linkTaskToGoal,
}: UseGoalEditingOptions): UseGoalEditingReturn {
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [linkPickerOpenFor, setLinkPickerOpenFor] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingGoalId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingGoalId]);

  const startEditing = (goalId: string, currentText: string) => {
    setEditingGoalId(goalId);
    setEditText(currentText);
  };

  const saveEdit = async () => {
    if (editingGoalId && editText.trim()) {
      const currentGoal = findGoalById(editingGoalId);

      if (currentGoal && editText.trim() !== currentGoal.text) {
        const success = await updateTask(editingGoalId, editText.trim());
        if (!success) {
          // Keep edit mode open so user can retry
          return;
        }
      }
    }
    setEditingGoalId(null);
    setEditText('');
  };

  const cancelEdit = () => {
    setEditingGoalId(null);
    setEditText('');
  };

  const clearEditing = () => {
    setEditingGoalId(null);
    setEditText('');
    setLinkPickerOpenFor(null);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Don't save if clicking on an action button (transfer, link, delete)
    if (actionsRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    saveEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const openLinkPicker = (goalId: string) => {
    setLinkPickerOpenFor(goalId);
  };

  const closeLinkPicker = () => {
    setLinkPickerOpenFor(null);
  };

  const handleLinkToGoal = async (taskId: string, goalId: string | null) => {
    await linkTaskToGoal(taskId, goalId);
    setLinkPickerOpenFor(null);
    setEditingGoalId(null);
  };

  const isEditing = (goalId: string) => editingGoalId === goalId;

  const isLinkPickerOpen = (goalId: string) => linkPickerOpenFor === goalId;

  return {
    editingGoalId,
    editText,
    linkPickerOpenFor,
    inputRef,
    actionsRef,
    startEditing,
    saveEdit,
    cancelEdit,
    handleBlur,
    handleKeyDown,
    setEditText,
    openLinkPicker,
    closeLinkPicker,
    handleLinkToGoal,
    isEditing,
    isLinkPickerOpen,
    clearEditing,
  };
}
