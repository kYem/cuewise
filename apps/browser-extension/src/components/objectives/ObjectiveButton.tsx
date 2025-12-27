import { Flag, Plus } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGoalStore } from '../../stores/goal-store';
import { Modal } from '../Modal';
import { ObjectiveDetailView } from './ObjectiveDetailView';
import { ObjectiveForm } from './ObjectiveForm';

interface ObjectiveButtonProps {
  className?: string;
}

export const ObjectiveButton: React.FC<ObjectiveButtonProps> = ({ className = '' }) => {
  const getActiveObjectives = useGoalStore((state) => state.getActiveObjectives);
  const getObjectiveProgress = useGoalStore((state) => state.getObjectiveProgress);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeObjectives = getActiveObjectives();
  const objectiveCount = activeObjectives.length;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTrigger = triggerRef.current?.contains(target);
      const clickedDropdown = dropdownRef.current?.contains(target);

      if (!clickedTrigger && !clickedDropdown) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleObjectiveClick = (objectiveId: string) => {
    setSelectedObjectiveId(objectiveId);
    setIsOpen(false);
  };

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowForm(true);
    setIsOpen(false);
  };

  const handleCloseDetail = () => {
    setSelectedObjectiveId(null);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
  };

  return (
    <>
      <div className="relative" ref={triggerRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`group flex items-center gap-2 px-4 py-2.5 bg-surface/80 backdrop-blur-sm text-primary rounded-full shadow-md hover:shadow-lg hover:scale-105 transition-all ${className}`}
          title={
            objectiveCount > 0
              ? `${objectiveCount} active goal${objectiveCount > 1 ? 's' : ''}`
              : 'Goals'
          }
        >
          <Flag className="w-5 h-5 text-primary-600" />
          {objectiveCount > 0 ? (
            <span className="hidden sm:inline text-sm font-medium text-primary">
              {objectiveCount} Goal{objectiveCount > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="hidden sm:inline text-sm font-medium text-primary">Goals</span>
          )}
        </button>

        {/* Compact Dropdown */}
        {isOpen &&
          createPortal(
            <div
              ref={dropdownRef}
              className="fixed z-[100] min-w-[200px] bg-surface rounded-xl shadow-xl border border-border overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
              style={{
                top: (triggerRef.current?.getBoundingClientRect().bottom ?? 0) + 8,
                left: triggerRef.current?.getBoundingClientRect().left ?? 0,
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-primary-600" />
                  <span className="text-sm font-medium text-primary">Goals</span>
                </div>
                <button
                  type="button"
                  onClick={handleAddClick}
                  className="p-1 hover:bg-surface-variant rounded transition-colors"
                  title="Add goal"
                >
                  <Plus className="w-4 h-4 text-secondary hover:text-primary" />
                </button>
              </div>

              {/* List */}
              <div className="py-1 max-h-[280px] overflow-y-auto">
                {activeObjectives.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-sm text-secondary">No goals yet</p>
                    <button
                      type="button"
                      onClick={handleAddClick}
                      className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Create one
                    </button>
                  </div>
                ) : (
                  activeObjectives.map((obj) => {
                    const progress = getObjectiveProgress(obj.id);
                    const percent = progress?.percent ?? 0;

                    return (
                      <button
                        key={obj.id}
                        type="button"
                        onClick={() => handleObjectiveClick(obj.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-variant transition-colors"
                      >
                        <Flag className="w-4 h-4 text-primary-600 flex-shrink-0" />
                        <span className="flex-1 text-sm text-primary truncate">{obj.text}</span>
                        <span className="text-xs text-secondary flex-shrink-0">{percent}%</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body
          )}
      </div>

      {/* Detail View Modal */}
      {selectedObjectiveId && (
        <Modal isOpen={true} onClose={handleCloseDetail}>
          <ObjectiveDetailView objectiveId={selectedObjectiveId} onClose={handleCloseDetail} />
        </Modal>
      )}

      {/* Form Modal */}
      {showForm && (
        <Modal isOpen={true} onClose={() => setShowForm(false)} title="New Goal">
          <ObjectiveForm onCancel={() => setShowForm(false)} onSuccess={handleFormSuccess} />
        </Modal>
      )}
    </>
  );
};
