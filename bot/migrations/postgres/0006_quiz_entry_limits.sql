-- Network identifiers are keyed hashes; no raw client IP addresses are stored.
CREATE TABLE IF NOT EXISTS quiz_entry_limits (
    client_key TEXT PRIMARY KEY CHECK(length(client_key) = 64),
    window_start BIGINT NOT NULL,
    request_count BIGINT NOT NULL DEFAULT 0 CHECK(request_count >= 0),
    pin_codes TEXT NOT NULL DEFAULT '[]' CHECK(length(pin_codes) <= 9001),
    new_participants BIGINT NOT NULL DEFAULT 0 CHECK(new_participants >= 0),
    expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quiz_entry_limits_expires_at ON quiz_entry_limits(expires_at);
