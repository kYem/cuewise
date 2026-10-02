import { Blocks } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useSyncSignedIn } from '../../hooks/useSyncSignedIn';
import type { NotionHost } from '../../notion/notion-host';
import { type NotionView, useNotionStore } from '../../stores/notion-store';
import { SelectControl, SettingRow } from './SettingControls';
import type { SettingsSection } from './SettingsSections';
import type { SettingsSectionProps } from './settings-types';

const LABEL = 'Notion';
const KEYWORDS = 'integrations notion connect table database tasks disconnect';
const BUTTON =
  'rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50';

function helpFor(view: NotionView): string {
  switch (view.status) {
    case 'loading':
      return 'Checking your Notion connection…';
    case 'failed':
      return "Couldn't check your Notion connection.";
    case 'unavailable':
      return 'Your Cuewise sign-in has expired. Sign in again under Cloud Sync.';
    case 'disconnected':
      return 'Show the tasks from one Notion table in Cuewise.';
    case 'connecting':
      return 'Finish connecting in the Notion window.';
    case 'picking':
      if (view.tables.length === 0) {
        return "No tables are shared with Cuewise. Reconnect and tick one in Notion's page picker.";
      }
      return view.truncated
        ? 'Choose the table to show. Only the first tables Notion returned are listed.'
        : 'Choose the table to show.';
    case 'connected':
      return `Connected to ${view.workspace ?? 'your workspace'} · ${view.tableName ?? 'a table'}`;
    case 'reauth':
      return 'Notion stopped accepting this connection. Reconnect to keep using it.';
  }
}

const NotionSettings: React.FC<{ host: NotionHost; filter: string }> = ({ host, filter }) => {
  const signedIn = useSyncSignedIn();
  const view = useNotionStore((s) => s.view);
  const busy = useNotionStore((s) => s.busy);
  const [chosenId, setChosenId] = useState<string | null>(null);

  // A remount mid-action must not reload over it: a connect's consent window may still be open.
  useEffect(() => {
    if (signedIn && !useNotionStore.getState().busy) {
      void useNotionStore.getState().load(host);
    }
  }, [host, signedIn]);

  const { load, connect, pick, disconnect, changeTable } = useNotionStore.getState();

  if (!signedIn) {
    return (
      <SettingRow
        label={LABEL}
        help="Turn on Cloud Sync to connect Notion."
        keywords={KEYWORDS}
        filter={filter}
      >
        {null}
      </SettingRow>
    );
  }

  const tables = view.status === 'picking' ? view.tables : [];
  const currentId = view.status === 'picking' ? view.currentId : null;
  const chosen =
    tables.find((table) => table.id === chosenId) ??
    tables.find((table) => table.id === currentId) ??
    tables[0];
  const disconnectButton = (
    <button type="button" className={BUTTON} disabled={busy} onClick={() => void disconnect(host)}>
      Disconnect
    </button>
  );

  let controls: React.ReactNode = null;
  if (view.status === 'failed') {
    controls = (
      <button type="button" className={BUTTON} disabled={busy} onClick={() => void load(host)}>
        Retry
      </button>
    );
  } else if (view.status === 'disconnected' || view.status === 'connecting') {
    controls = (
      <button type="button" className={BUTTON} disabled={busy} onClick={() => void connect(host)}>
        {view.status === 'connecting' ? 'Connecting…' : 'Connect Notion'}
      </button>
    );
  } else if (view.status === 'reauth') {
    controls = (
      <div className="flex gap-2">
        <button type="button" className={BUTTON} disabled={busy} onClick={() => void connect(host)}>
          Reconnect
        </button>
        {disconnectButton}
      </div>
    );
  } else if (view.status === 'connected') {
    controls = (
      <div className="flex gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={busy}
          onClick={() => void changeTable(host)}
        >
          Change table
        </button>
        {disconnectButton}
      </div>
    );
  } else if (view.status === 'picking') {
    controls = (
      <div className="flex flex-wrap items-center gap-2">
        {chosen === undefined ? (
          <button
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={() => void connect(host)}
          >
            Reconnect
          </button>
        ) : (
          <>
            <SelectControl
              label="Notion table"
              value={chosen.id}
              options={tables.map((table) => ({ value: table.id, label: table.name }))}
              onChange={setChosenId}
            />
            <button
              type="button"
              className={BUTTON}
              disabled={busy}
              onClick={() => void pick(host, chosen)}
            >
              Use this table
            </button>
          </>
        )}
        {view.currentId !== null && (
          <button type="button" className={BUTTON} disabled={busy} onClick={() => void load(host)}>
            Cancel
          </button>
        )}
        {disconnectButton}
      </div>
    );
  }

  return (
    <SettingRow
      label={LABEL}
      help={helpFor(view)}
      keywords={KEYWORDS}
      filter={filter}
      stack={view.status === 'picking'}
    >
      {controls}
    </SettingRow>
  );
};

/** Built once per host, at startup: a section made per render would remount and reload each time. */
export function createNotionSettingsSection(host: NotionHost): SettingsSection {
  const Section: React.FC<SettingsSectionProps> = ({ filter }) => (
    <NotionSettings host={host} filter={filter} />
  );
  return {
    id: 'integrations',
    label: 'Integrations',
    icon: Blocks,
    component: Section,
    terms: KEYWORDS,
  };
}
