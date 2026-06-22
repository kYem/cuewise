import { cn } from '@cuewise/ui';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Heart,
  type LucideIcon,
  Plus,
  SkipForward,
} from 'lucide-react';
import type React from 'react';

interface DockBtnProps {
  icon: LucideIcon;
  title: string;
  onClick: () => void;
  active?: boolean;
  /** Tailwind size class, e.g. 'h-9 w-9'. Defaults to the standard 40px. */
  sizeClass?: string;
}

// Ghosted icon button: icon-only, no fill until hover (active = brand-error fill).
const DockBtn: React.FC<DockBtnProps> = ({ icon: Icon, title, onClick, active, sizeClass }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-pressed={active}
    className={cn(
      'inline-flex flex-none items-center justify-center rounded-full transition-colors',
      sizeClass ?? 'h-10 w-10',
      active
        ? 'bg-error/90 text-white'
        : 'text-white/70 hover:bg-white/15 hover:text-white focus-visible:bg-white/15'
    )}
  >
    <Icon className="h-[18px] w-[18px]" />
  </button>
);

// The prominent ring button — the item's main action (reveal / next).
const RingBtn: React.FC<Pick<DockBtnProps, 'icon' | 'title' | 'onClick'>> = ({
  icon: Icon,
  title,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-full border-[1.5px] border-white/40 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
  >
    <Icon className="h-5 w-5" />
  </button>
);

interface ConceptToolbarProps {
  revealed: boolean;
  onReveal: () => void;
  onPrev: () => void;
  onNext: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  /** Cards due now — shown as the filter badge (the funnel itself is deferred). */
  dueCount: number;
  onAdd?: () => void;
}

/**
 * The recall card's bottom-dock control row: nav (prev · reveal/next ring · next)
 * and actions (favorite · due-count · add). The ring reveals the answer, then
 * becomes "next" once revealed.
 */
export const ConceptToolbar: React.FC<ConceptToolbarProps> = ({
  revealed,
  onReveal,
  onPrev,
  onNext,
  isFavorite,
  onToggleFavorite,
  dueCount,
  onAdd,
}) => (
  <div className="mt-6 flex items-center justify-center gap-5">
    <div className="flex items-center gap-1.5">
      <DockBtn icon={ChevronLeft} title="Previous" onClick={onPrev} sizeClass="h-9 w-9" />
      <RingBtn
        icon={revealed ? SkipForward : Eye}
        title={revealed ? 'Next' : 'Reveal answer'}
        onClick={revealed ? onNext : onReveal}
      />
      <DockBtn icon={ChevronRight} title="Next" onClick={onNext} sizeClass="h-9 w-9" />
    </div>

    <span className="h-5 w-px flex-none bg-white/20" />

    <div className="flex items-center gap-1.5">
      <DockBtn
        icon={Heart}
        title={isFavorite ? 'Unfavorite' : 'Favorite'}
        onClick={onToggleFavorite}
        active={isFavorite}
      />
      {/* Filter is badge-only for now (the funnel menu is deferred). */}
      <span
        title={`${dueCount} due`}
        className="relative inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-white/55"
      >
        <Filter className="h-[18px] w-[18px]" />
        {dueCount > 0 && (
          <span className="absolute -right-0.5 top-px inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full border border-white/25 bg-black/60 px-1 text-[9px] font-bold leading-none text-white tabular-nums">
            {dueCount}
          </span>
        )}
      </span>
      {onAdd && <DockBtn icon={Plus} title="Add concept" onClick={onAdd} />}
    </div>
  </div>
);
