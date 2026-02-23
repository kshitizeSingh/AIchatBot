-- Enable UUID support
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── conversations ────────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID         NOT NULL
                            REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      UUID         NOT NULL
                            REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  metadata     JSONB        NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_conversations_org_user
  ON conversations (org_id, user_id, updated_at DESC);

-- ── messages ─────────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID         NOT NULL
                               REFERENCES conversations(id) ON DELETE CASCADE,
  org_id           UUID         NOT NULL,  -- denormalised for fast org-scoping
  role             TEXT         NOT NULL
                               CHECK (role IN ('user', 'assistant', 'system')),
  content          TEXT         NOT NULL,
  sources          JSONB        NOT NULL DEFAULT '[]',
  model            TEXT,
  tokens_used      INT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation
  ON messages (conversation_id, created_at ASC);

CREATE INDEX idx_messages_org
  ON messages (org_id, created_at DESC);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();