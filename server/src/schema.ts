export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'learner' CHECK (role IN ('admin','learner')),
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  used_by    TEXT REFERENCES users(id),
  used_at    INTEGER
);

CREATE TABLE IF NOT EXISTS books (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  author            TEXT,
  format            TEXT NOT NULL CHECK (format IN ('epub','pdf')),
  original_filename TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  storage_path      TEXT NOT NULL,
  cover_path        TEXT,
  owner_id          TEXT NOT NULL REFERENCES users(id),
  visibility        TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  uploaded_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id    TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  locator    TEXT NOT NULL,
  percent    REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_book ON progress(book_id);
`
