import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DB_PATH } from "@/lib/config";

let db: Database.Database | null = null;

export function getDb() {
  if (db) {
    return db;
  }

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      last_success_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS stories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_hash TEXT NOT NULL UNIQUE,
      feed_name TEXT NOT NULL,
      feed_url TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      summary TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      image_url TEXT,
      image_hint TEXT,
      is_saved INTEGER NOT NULL DEFAULT 0
    );
  `);

  const storyColumns = new Set(
    database
      .prepare("PRAGMA table_info(stories)")
      .all()
      .map((column) => String((column as { name: string }).name)),
  );

  if (!storyColumns.has("image_url")) {
    database.exec("ALTER TABLE stories ADD COLUMN image_url TEXT");
  }

  if (!storyColumns.has("image_hint")) {
    database.exec("ALTER TABLE stories ADD COLUMN image_hint TEXT");
  }
}
