ALTER TABLE games
    ADD COLUMN IF NOT EXISTS turn_deadline_at timestamptz;

CREATE INDEX IF NOT EXISTS ix_games_active_turn_deadline
    ON games (turn_deadline_at)
    WHERE status = 'ACTIVE' AND turn_deadline_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_games_status_created_at
    ON games (status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_games_active_empty_started_at
    ON games (started_at)
    WHERE status = 'ACTIVE' AND move_count = 0 AND started_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_games_finished_white_id
    ON games (white_id)
    WHERE status = 'FINISHED';

CREATE INDEX IF NOT EXISTS ix_games_finished_black_id
    ON games (black_id)
    WHERE status = 'FINISHED';
