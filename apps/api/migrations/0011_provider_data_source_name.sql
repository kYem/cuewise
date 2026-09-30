-- ENG-147. The picked table's name, so every device's settings can show it without asking Notion.
ALTER TABLE provider_tokens ADD COLUMN data_source_name TEXT;
