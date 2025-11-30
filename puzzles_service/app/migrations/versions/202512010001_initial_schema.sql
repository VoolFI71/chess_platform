-- Создание таблиц пазлов и связанных сущностей
CREATE TABLE IF NOT EXISTS puzzles (
    id BIGSERIAL PRIMARY KEY,
    puzzle_id VARCHAR(16) UNIQUE NOT NULL,
    fen TEXT NOT NULL,
    moves TEXT[] NOT NULL,
    move_count INTEGER NOT NULL DEFAULT 0,
    rating INTEGER NOT NULL,
    rating_deviation INTEGER NOT NULL,
    popularity INTEGER NOT NULL,
    nb_plays INTEGER NOT NULL,
    themes TEXT[] NOT NULL DEFAULT '{}',
    opening_tags TEXT[] NOT NULL DEFAULT '{}',
    game_url VARCHAR(255),
    source VARCHAR(64),
    solved_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_puzzles_rating ON puzzles(rating);
CREATE INDEX IF NOT EXISTS ix_puzzles_popularity ON puzzles(popularity DESC);
CREATE INDEX IF NOT EXISTS ix_puzzles_themes ON puzzles USING GIN (themes);
CREATE INDEX IF NOT EXISTS ix_puzzles_opening_tags ON puzzles USING GIN (opening_tags);
CREATE INDEX IF NOT EXISTS ix_puzzles_solved_count ON puzzles(solved_count DESC);

-- Таблица попыток решений
CREATE TABLE IF NOT EXISTS puzzle_attempts (
    id BIGSERIAL PRIMARY KEY,
    puzzle_id VARCHAR(16) NOT NULL,
    user_id INTEGER NOT NULL,
    mode VARCHAR(20) NOT NULL DEFAULT 'survival',
    status VARCHAR(32) NOT NULL,
    time_spent_ms INTEGER,
    mistake_count INTEGER,
    moves_played INTEGER,
    rating_before INTEGER,
    rating_after INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_puzzle_attempts_puzzle FOREIGN KEY (puzzle_id)
        REFERENCES puzzles(puzzle_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_puzzle_attempts_user_id ON puzzle_attempts(user_id);
CREATE INDEX IF NOT EXISTS ix_puzzle_attempts_puzzle_id ON puzzle_attempts(puzzle_id);
CREATE INDEX IF NOT EXISTS ix_puzzle_attempts_created_at ON puzzle_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_puzzle_attempts_mode_status ON puzzle_attempts(mode, status);
CREATE INDEX IF NOT EXISTS ix_puzzle_attempts_user_puzzle ON puzzle_attempts(user_id, puzzle_id);
CREATE INDEX IF NOT EXISTS ix_puzzle_attempts_user_mode_created ON puzzle_attempts(user_id, mode, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_puzzle_attempts_user_status ON puzzle_attempts(user_id, status)
    WHERE status = 'success';

-- Таблица статистики пользователей по пазлам
CREATE TABLE IF NOT EXISTS puzzle_user_stats (
    user_id INTEGER PRIMARY KEY,
    solved_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    puzzle_rating INTEGER NOT NULL DEFAULT 1200,
    provisional_games INTEGER NOT NULL DEFAULT 0,
    total_time_ms BIGINT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    last_puzzle_id VARCHAR(16),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

