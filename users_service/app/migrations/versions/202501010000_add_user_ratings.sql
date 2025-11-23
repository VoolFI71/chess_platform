-- Добавление полей рейтингов для пользователей
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS blitz_rating INTEGER NOT NULL DEFAULT 1200,
ADD COLUMN IF NOT EXISTS bullet_rating INTEGER NOT NULL DEFAULT 1200,
ADD COLUMN IF NOT EXISTS rapid_rating INTEGER NOT NULL DEFAULT 1200,
ADD COLUMN IF NOT EXISTS puzzle_rating INTEGER NOT NULL DEFAULT 1200;

-- Создание индексов для быстрого поиска по рейтингам
CREATE INDEX IF NOT EXISTS idx_users_blitz_rating ON users(blitz_rating);
CREATE INDEX IF NOT EXISTS idx_users_bullet_rating ON users(bullet_rating);
CREATE INDEX IF NOT EXISTS idx_users_rapid_rating ON users(rapid_rating);
CREATE INDEX IF NOT EXISTS idx_users_puzzle_rating ON users(puzzle_rating);

