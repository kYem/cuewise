import { logger, type NotionTable, type NotionTables } from '@cuewise/shared';
import { create } from 'zustand';
import type { NotionHost } from '../notion/notion-host';
import { computeCodeChallenge, generateCodeVerifier } from '../utils/pkce';
import { useToastStore } from './toast-store';

export type NotionView =
  | { status: 'loading' }
  /** The connection could not be read at all; the section offers a retry. */
  | { status: 'failed' }
  /** The Cuewise session is gone, and every Notion call needs one. */
  | { status: 'unavailable' }
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | {
      status: 'picking';
      workspace: string | null;
      tables: NotionTable[];
      truncated: boolean;
      /** The id of the table still stored while the user changes it; null on a first pick. */
      currentId: string | null;
    }
  | {
      status: 'connected';
      workspace: string | null;
      dataSourceId: string;
      tableName: string | null;
    }
  | { status: 'reauth' };

interface NotionStore {
  view: NotionView;
  /** An action is in flight; the settings controls wait for it. */
  busy: boolean;
  load: (host: NotionHost) => Promise<void>;
  connect: (host: NotionHost) => Promise<void>;
  pick: (host: NotionHost, table: NotionTable) => Promise<void>;
  changeTable: (host: NotionHost) => Promise<void>;
  disconnect: (host: NotionHost) => Promise<void>;
}

const NOTION_UNREACHABLE = "Notion isn't responding right now. Try again in a moment.";

/** The problem code an `ApiError` carries, read structurally since this package cannot import it. */
function problemCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** Faults that change what the section shows; anything else keeps the view and says what failed. */
function viewForFault(error: unknown): NotionView | null {
  const code = problemCode(error);
  if (code === 'invalid_token' || code === 'unauthorized') {
    return { status: 'unavailable' };
  }
  if (code === 'provider_reauth_required') {
    return { status: 'reauth' };
  }
  if (code === 'provider_not_connected') {
    return { status: 'disconnected' };
  }
  return null;
}

function picking(found: NotionTables, currentId: string | null): NotionView {
  return {
    status: 'picking',
    workspace: found.workspace,
    tables: found.tables,
    truncated: found.truncated,
    currentId,
  };
}

function storedTableId(view: NotionView): string | null {
  if (view.status === 'connected') {
    return view.dataSourceId;
  }
  if (view.status === 'picking') {
    return view.currentId;
  }
  return null;
}

export const useNotionStore = create<NotionStore>((set, get) => {
  const fail = (error: unknown, message: string, restore: NotionView): void => {
    const next = viewForFault(error);
    if (next !== null) {
      logger.warn(`${message} (${problemCode(error)})`);
      set({ view: next, busy: false });
      return;
    }
    logger.error(message, error);
    useToastStore
      .getState()
      .error(problemCode(error) === 'upstream_unavailable' ? NOTION_UNREACHABLE : message);
    set({ view: restore, busy: false });
  };

  return {
    view: { status: 'loading' },
    busy: false,

    load: async (host) => {
      set({ view: { status: 'loading' }, busy: true });
      try {
        const connection = await host.api.getNotionConnection();
        if (connection === null) {
          set({ view: { status: 'disconnected' }, busy: false });
          return;
        }
        if (connection.dataSourceId !== null) {
          set({
            view: {
              status: 'connected',
              workspace: connection.workspace,
              dataSourceId: connection.dataSourceId,
              tableName: connection.tableName,
            },
            busy: false,
          });
          return;
        }
        set({ view: picking(await host.api.listNotionTables(), null), busy: false });
      } catch (error) {
        const next = viewForFault(error);
        if (next !== null) {
          set({ view: next, busy: false });
          return;
        }
        logger.error('Failed to read the Notion connection', error);
        set({ view: { status: 'failed' }, busy: false });
      }
    },

    connect: async (host) => {
      const previous = get().view;
      set({ view: { status: 'connecting' }, busy: true });
      const verifier = generateCodeVerifier();
      try {
        const redirect = await host.authorize(async (returnUri) =>
          host.api.startNotion(returnUri, await computeCodeChallenge(verifier))
        );
        if (redirect === null) {
          useToastStore.getState().warning("Connecting Notion didn't complete.");
          set({ view: previous, busy: false });
          return;
        }
        const params = new URL(redirect).searchParams;
        const denied = params.get('error');
        if (denied === 'access_denied') {
          set({ view: previous, busy: false });
          return;
        }
        const returned = params.get('code');
        if (denied !== null || returned === null) {
          // The Worker only ever returns its own sanitized vocabulary here, so it is safe to log.
          logger.warn('Notion connect returned no code', { error: denied });
          useToastStore.getState().error("Couldn't connect Notion. Please try again.");
          set({ view: previous, busy: false });
          return;
        }
        await host.api.claimNotion(returned, verifier);
      } catch (error) {
        fail(error, "Couldn't connect Notion.", previous);
        return;
      }
      await get().load(host);
      const view = get().view;
      const only =
        view.status === 'picking' && !view.truncated && view.tables.length === 1
          ? view.tables[0]
          : undefined;
      if (only !== undefined) {
        await get().pick(host, only);
      }
    },

    pick: async (host, table) => {
      const previous = get().view;
      if (previous.status !== 'picking') {
        return;
      }
      set({ busy: true });
      try {
        await host.api.selectNotionTable(table.id, table.name);
        set({
          view: {
            status: 'connected',
            workspace: previous.workspace,
            dataSourceId: table.id,
            tableName: table.name,
          },
          busy: false,
        });
      } catch (error) {
        if (problemCode(error) === 'provider_schema_unusable') {
          useToastStore
            .getState()
            .error(`“${table.name}” has no Complete status or Done checkbox to mark tasks with.`);
          set({ busy: false });
          return;
        }
        if (problemCode(error) === 'provider_table_unavailable') {
          useToastStore.getState().error(`“${table.name}” is no longer shared with Cuewise.`);
          set({ busy: false });
          await get().changeTable(host);
          return;
        }
        fail(error, "Couldn't save the table.", previous);
      }
    },

    changeTable: async (host) => {
      const previous = get().view;
      set({ busy: true });
      try {
        const found = await host.api.listNotionTables();
        set({ view: picking(found, storedTableId(previous)), busy: false });
      } catch (error) {
        fail(error, "Couldn't list your Notion tables.", previous);
      }
    },

    disconnect: async (host) => {
      const previous = get().view;
      set({ busy: true });
      try {
        await host.api.disconnectNotion();
        set({ view: { status: 'disconnected' }, busy: false });
      } catch (error) {
        fail(error, "Couldn't disconnect Notion.", previous);
      }
    },
  };
});
