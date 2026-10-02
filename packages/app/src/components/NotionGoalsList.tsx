import type { NotionItem } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useStaleRefresh } from '../hooks/useStaleRefresh';
import type { NotionHost } from '../notion/notion-host';
import { type NotionListBlock, useNotionItemsStore } from '../stores/notion-items-store';
import { type NotionView, useNotionStore } from '../stores/notion-store';
import { AnimatedCheckbox } from './AnimatedCheckbox';

const NOTION_STALE_MS = 5 * 60_000;

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

interface NotionGoalsListProps {
  host: NotionHost;
  compact: boolean;
  onOpenIntegrations: () => void;
}

export const NotionGoalsList: React.FC<NotionGoalsListProps> = ({
  host,
  compact,
  onOpenIntegrations,
}) => {
  const view = useNotionStore((s) => s.view);
  const list = useNotionItemsStore((s) => s.list);
  const saving = useNotionItemsStore((s) => s.saving);
  const [showCompleted, setShowCompleted] = useState(false);
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
      <p className="text-sm text-secondary">{BLOCKED_COPY[reason]}</p>
      {reason === 'failed' ? (
        <button
          type="button"
          className={BUTTON}
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
        <button type="button" className={BUTTON} onClick={onOpenIntegrations}>
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
  const rows = (items: NotionItem[]) => (
    <ul className="space-y-0.5">
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

  return (
    <div className="flex flex-col gap-2">
      {open.length === 0 ? (
        <p className="py-4 text-center text-sm text-secondary">Nothing left to do in this table.</p>
      ) : (
        rows(open)
      )}
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
      {showCompleted && rows(done)}
      {readyFor.truncated && (
        <p className="px-3 text-xs text-tertiary">Showing the first 500 rows</p>
      )}
      {readyFor.stale && (
        <p className="px-3 text-xs text-tertiary">
          Notion isn't responding, so this list may be out of date.
        </p>
      )}
    </div>
  );
};
