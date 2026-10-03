// Wire types of the `/v1/integrations/notion` routes as the clients read them.

/** `GET /v1/integrations/notion`: the connection as the server holds it, read without asking Notion. */
export interface NotionConnection {
  workspace: string | null;
  /** Null until a table is picked. */
  dataSourceId: string | null;
  tableName: string | null;
}

export interface NotionTable {
  id: string;
  name: string;
}

/** `GET /v1/integrations/notion/tables`; `truncated` when the search stopped before Notion ran out. */
export interface NotionTables {
  workspace: string | null;
  tables: NotionTable[];
  truncated: boolean;
}

export interface NotionItem {
  pageId: string;
  text: string;
  done: boolean;
}

/** `GET /v1/integrations/notion/items`, in Notion's order; `truncated` when the read stopped short (500 rows at most). */
export interface NotionItems {
  workspace: string | null;
  items: NotionItem[];
  truncated: boolean;
}
