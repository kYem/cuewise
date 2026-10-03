import type { GoalViewMode, NotionItem } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { CheckCircle2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useStaleRefresh } from '../hooks/useStaleRefresh';
import type { NotionHost } from '../notion/notion-host';
import { type NotionListBlock, useNotionItemsStore } from '../stores/notion-items-store';
import { type NotionView, useNotionStore } from '../stores/notion-store';
import { AnimatedCheckbox } from './AnimatedCheckbox';

const NOTION_STALE_MS = 5 * 60_000;
// Open rows shown before a "+N more" line; a single extra row is shown rather than folded.
const OPEN_SHOWN = 5;

const BLOCKED_COPY: Record<NotionListBlock, string> = {
  unavailable: 'Your Cuewise sign-in has expired. Sign in again to see your Notion tasks.',
  disconnected: 'Connect Notion to see its tasks here.',
  reauth: 'Notion stopped accepting this connection. Reconnect to keep using it.',
  unselected: 'Choose which Notion table to show.',
  table_unavailable: 'The connected table is no longer shared with Cuewise.',
  schema_unusable: 'The connected table has no Complete status or Done checkbox.',
  failed: "Couldn't load your Notion tasks.",
};

/** What a connection that isn't usable yet means for the list; null when there is a table. */
function blockForView(view: NotionView): NotionListBlock | 'loading' | null {
  switch (view.status) {
    case 'connected':
      return null;
    case 'loading':
    case 'connecting':
      return 'loading';
    case 'picking':
      return 'unselected';
    case 'failed':
    case 'unavailable':
    case 'disconnected':
    case 'reauth':
      return view.status;
  }
}

const BUTTON =
  'rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-surface-variant';
const ON_IMAGE_BUTTON =
  'rounded-full bg-white/20 backdrop-blur-sm px-4 py-2 text-sm font-medium text-white transition-all hover:bg-white/30';

function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
    </div>
  );
}

function NotionRow({
  item,
  saving,
  compact,
  onToggle,
}: {
  item: NotionItem;
  saving: boolean;
  compact: boolean;
  onToggle: () => void;
}) {
  return (
    <li className={cn('flex items-center gap-3 rounded-xl px-3', compact ? 'py-1' : 'py-2')}>
      <button
        type="button"
        onClick={onToggle}
        disabled={saving}
        aria-label={`${item.done ? 'Mark as incomplete' : 'Mark as complete'}: ${item.text}`}
        className="flex-shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
      >
        <AnimatedCheckbox checked={item.done} size={compact ? 'sm' : 'md'} />
      </button>
      <span
        className={cn(
          'min-w-0 flex-1 break-words text-sm',
          item.done ? 'text-tertiary line-through' : 'text-primary'
        )}
      >
        {item.text}
      </span>
    </li>
  );
}

const ON_IMAGE_SHADOW = 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]';

/** Focus mode's one task at a time: the first open row, which the next takes over once ticked. */
function NotionFocusTask({
  next,
  openCount,
  tableName,
  saving,
  onToggle,
}: {
  next: NotionItem | undefined;
  openCount: number;
  tableName: string | null;
  saving: boolean;
  onToggle: () => void;
}) {
  if (next === undefined) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <CheckCircle2 className={cn('w-12 h-12 text-white', ON_IMAGE_SHADOW)} />
        <p className={cn('text-lg font-medium text-white', ON_IMAGE_SHADOW)}>
          Nothing left to do in this table.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <p
        className={cn(
          'text-xs font-medium uppercase tracking-wider text-white/80',
          ON_IMAGE_SHADOW
        )}
      >
        {tableName === null ? 'Next in Notion' : `Next in Notion · ${tableName}`}
      </p>
      <button
        type="button"
        onClick={onToggle}
        disabled={saving}
        aria-label={`Mark as complete: ${next.text}`}
        className="flex items-center gap-4 px-4 py-3 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-wait"
      >
        <AnimatedCheckbox checked={false} size="xl" tone="onImage" />
        <span
          className="text-3xl md:text-4xl text-left font-semibold text-white"
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.4)' }}
        >
          {next.text}
        </span>
      </button>
      <p className={cn('text-sm text-white/70', ON_IMAGE_SHADOW)}>{openCount} open in this table</p>
    </div>
  );
}

interface NotionGoalsListProps {
  host: NotionHost;
  variant: GoalViewMode;
  onOpenIntegrations: () => void;
}

export const NotionGoalsList: React.FC<NotionGoalsListProps> = ({
  host,
  variant,
  onOpenIntegrations,
}) => {
  const compact = variant === 'compact';
  const onImage = variant === 'focus';
  const view = useNotionStore((s) => s.view);
  const list = useNotionItemsStore((s) => s.list);
  const saving = useNotionItemsStore((s) => s.saving);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAllOpen, setShowAllOpen] = useState(false);
  const connectedId = view.status === 'connected' ? view.dataSourceId : null;

  useEffect(() => {
    if (connectedId === null) {
      return;
    }
    const shown = useNotionItemsStore.getState().list;
    if (shown.status === 'ready' && shown.tableId === connectedId) {
      return;
    }
    void useNotionItemsStore.getState().load(host, connectedId);
  }, [host, connectedId]);

  const readyFor = list.status === 'ready' && list.tableId === connectedId ? list : null;
  useStaleRefresh(readyFor?.fetchedAt ?? null, NOTION_STALE_MS, () => {
    if (connectedId !== null) {
      return useNotionItemsStore.getState().load(host, connectedId);
    }
  });

  const card = (reason: NotionListBlock) => (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <p className={cn('text-sm', onImage ? cn('text-white', ON_IMAGE_SHADOW) : 'text-secondary')}>
        {BLOCKED_COPY[reason]}
      </p>
      {reason === 'failed' ? (
        <button
          type="button"
          className={onImage ? ON_IMAGE_BUTTON : BUTTON}
          onClick={() => {
            if (connectedId === null) {
              void useNotionStore.getState().load(host);
              return;
            }
            void useNotionItemsStore.getState().load(host, connectedId);
          }}
        >
          Try again
        </button>
      ) : (
        <button
          type="button"
          className={onImage ? ON_IMAGE_BUTTON : BUTTON}
          onClick={onOpenIntegrations}
        >
          Open Notion settings
        </button>
      )}
    </div>
  );

  const connectionBlock = blockForView(view);
  if (connectionBlock === 'loading') {
    return <Spinner />;
  }
  if (connectionBlock !== null) {
    return card(connectionBlock);
  }
  if (list.status === 'blocked') {
    return card(list.reason);
  }
  if (readyFor === null) {
    return <Spinner />;
  }

  const open = readyFor.items.filter((item) => !item.done);
  const done = readyFor.items.filter((item) => item.done);
  const toggle = (item: NotionItem) => () =>
    void useNotionItemsStore.getState().setDone(host, item.pageId, !item.done);

  if (onImage) {
    const next = open[0];
    return (
      <NotionFocusTask
        next={next}
        openCount={open.length}
        tableName={view.status === 'connected' ? view.tableName : null}
        saving={next !== undefined && saving.has(next.pageId)}
        onToggle={next === undefined ? () => undefined : toggle(next)}
      />
    );
  }
  // Expanded lists scroll inside the card, so a long table never grows the widget.
  const rows = (items: NotionItem[], scroll: boolean) => (
    <ul
      className={cn(
        'space-y-0.5',
        scroll && 'overflow-y-auto',
        scroll && (compact ? 'max-h-40' : 'max-h-60')
      )}
    >
      {items.map((item) => (
        <NotionRow
          key={item.pageId}
          item={item}
          saving={saving.has(item.pageId)}
          compact={compact}
          onToggle={toggle(item)}
        />
      ))}
    </ul>
  );
  const collapsible = open.length > OPEN_SHOWN + 1;
  const hidden = open.length - OPEN_SHOWN;

  let openRows: React.ReactNode = rows(open, false);
  if (open.length === 0) {
    openRows = (
      <p className="py-4 text-center text-sm text-secondary">Nothing left to do in this table.</p>
    );
  } else if (collapsible && !showAllOpen) {
    openRows = (
      <>
        {rows(open.slice(0, OPEN_SHOWN), false)}
        <button
          type="button"
          onClick={() => setShowAllOpen(true)}
          className={cn(
            'self-start px-3 text-sm font-medium text-secondary transition-colors hover:text-primary',
            compact ? 'py-0.5' : 'py-1'
          )}
        >
          +{hidden} more
        </button>
      </>
    );
  } else if (collapsible) {
    openRows = (
      <>
        {rows(open, true)}
        <button
          type="button"
          onClick={() => setShowAllOpen(false)}
          className="self-start px-3 text-xs font-medium text-secondary transition-colors hover:text-primary"
        >
          Show less
        </button>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {openRows}
      {done.length > 0 && (
        <button
          type="button"
          onClick={() => setShowCompleted((shown) => !shown)}
          aria-expanded={showCompleted}
          className="self-start px-3 text-xs font-medium text-secondary transition-colors hover:text-primary"
        >
          {showCompleted ? 'Hide completed' : `Show completed (${done.length})`}
        </button>
      )}
      {showCompleted && rows(done, true)}
      {readyFor.truncated && (
        <p className="px-3 text-xs text-tertiary">Showing the first 500 rows</p>
      )}
      {readyFor.stale && (
        <p className="px-3 text-xs text-tertiary">
          Couldn't refresh from Notion, so this list may be out of date.
        </p>
      )}
    </div>
  );
};
