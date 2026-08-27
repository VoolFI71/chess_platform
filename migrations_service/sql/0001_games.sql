CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS games (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    white_id integer REFERENCES users(id) ON DELETE SET NULL,
    black_id integer REFERENCES users(id) ON DELETE SET NULL,
    initial_pos text NOT NULL,
    current_pos text NOT NULL,
    next_turn varchar(1) NOT NULL DEFAULT 'w',
    time_control jsonb,
    move_count integer NOT NULL DEFAULT 0,
    status varchar(20) NOT NULL DEFAULT 'CREATED',
    white_clock_ms bigint NOT NULL DEFAULT 0 CHECK (white_clock_ms >= 0),
    black_clock_ms bigint NOT NULL DEFAULT 0 CHECK (black_clock_ms >= 0),
    result varchar(10),
    termination_reason varchar(50),
    ended_by integer REFERENCES users(id) ON DELETE SET NULL,
    pgn text,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at timestamptz,
    finished_at timestamptz,
    CONSTRAINT chk_games_has_creator CHECK (
        white_id IS NOT NULL OR
        black_id IS NOT NULL OR
        (metadata->>'white_session_id' IS NOT NULL AND metadata->>'white_session_id' <> '') OR
        (metadata->>'black_session_id' IS NOT NULL AND metadata->>'black_session_id' <> '')
    )
);

CREATE INDEX IF NOT EXISTS ix_games_white_id ON games (white_id);
CREATE INDEX IF NOT EXISTS ix_games_black_id ON games (black_id);
CREATE INDEX IF NOT EXISTS ix_games_status ON games (status);

-- Keep the anonymous-game invariant correct for databases created before this migration.
ALTER TABLE games DROP CONSTRAINT IF EXISTS chk_games_has_creator;
ALTER TABLE games ADD CONSTRAINT chk_games_has_creator CHECK (
    white_id IS NOT NULL OR
    black_id IS NOT NULL OR
    (metadata->>'white_session_id' IS NOT NULL AND metadata->>'white_session_id' <> '') OR
    (metadata->>'black_session_id' IS NOT NULL AND metadata->>'black_session_id' <> '')
);

CREATE TABLE IF NOT EXISTS moves (
    id serial PRIMARY KEY,
    game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    move_index integer NOT NULL,
    uci varchar(10) NOT NULL,
    san varchar(20),
    fen_after text NOT NULL,
    player_id integer REFERENCES users(id) ON DELETE SET NULL,
    clocks_after jsonb,
    is_capture boolean NOT NULL DEFAULT false,
    promotion varchar(1),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_moves_game_move_index UNIQUE (game_id, move_index)
);

CREATE INDEX IF NOT EXISTS ix_moves_game_id ON moves (game_id);
CREATE INDEX IF NOT EXISTS ix_moves_player_id ON moves (player_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_moves_game_move_index ON moves (game_id, move_index);
