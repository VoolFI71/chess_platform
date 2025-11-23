-- Добавление поля games_played для подсчета сыгранных партий
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS games_played INTEGER NOT NULL DEFAULT 0;

-- Создание индекса для быстрого поиска (опционально, если нужна сортировка по количеству партий)
CREATE INDEX IF NOT EXISTS idx_users_games_played ON users(games_played);

-- Обновление существующих пользователей: подсчет завершенных партий
UPDATE users 
SET games_played = (
    SELECT COUNT(*) 
    FROM games 
    WHERE (games.white_id = users.id OR games.black_id = users.id) 
    AND games.status = 'FINISHED'
);

