-- Основная таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(32) NOT NULL UNIQUE,
    email VARCHAR(320) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    blitz_rating INTEGER NOT NULL DEFAULT 1200,
    bullet_rating INTEGER NOT NULL DEFAULT 1200,
    rapid_rating INTEGER NOT NULL DEFAULT 1200,
    puzzle_rating INTEGER NOT NULL DEFAULT 1200,
    games_played INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_users_blitz_rating ON users(blitz_rating);
CREATE INDEX IF NOT EXISTS ix_users_bullet_rating ON users(bullet_rating);
CREATE INDEX IF NOT EXISTS ix_users_rapid_rating ON users(rapid_rating);
CREATE INDEX IF NOT EXISTS ix_users_puzzle_rating ON users(puzzle_rating);

-- Дружбы между пользователями
CREATE TABLE IF NOT EXISTS friendships (
    id BIGSERIAL PRIMARY KEY,
    requester_id INTEGER NOT NULL,
    addressee_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_friendships_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_friendships_addressee FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_friendships_pair UNIQUE (requester_id, addressee_id),
    CONSTRAINT ck_friendships_not_self CHECK (requester_id <> addressee_id)
);

CREATE INDEX IF NOT EXISTS ix_friendships_requester_id ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS ix_friendships_addressee_id ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS ix_friendships_status ON friendships(status);

