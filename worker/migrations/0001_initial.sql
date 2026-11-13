CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  category_group TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  formats TEXT NOT NULL,
  open_points INTEGER,
  tag TEXT NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_group_tier ON questions(category_group,difficulty);
CREATE TABLE IF NOT EXISTS room_codes (
  code TEXT PRIMARY KEY,
  room_id TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS room_codes_expiry ON room_codes(expires_at);
