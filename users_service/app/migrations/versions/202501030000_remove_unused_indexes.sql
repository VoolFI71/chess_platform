-- Удаление неиспользуемых индексов для оптимизации базы данных

-- Индексы на рейтинги не используются в WHERE или ORDER BY запросах
-- Они могут быть полезны только для сортировки рейтингов, но такой функционал не реализован
DROP INDEX IF EXISTS idx_users_blitz_rating;
DROP INDEX IF EXISTS idx_users_bullet_rating;
DROP INDEX IF EXISTS idx_users_rapid_rating;
DROP INDEX IF EXISTS idx_users_puzzle_rating;

-- Индекс на games_played не используется в запросах
-- Может быть полезен для сортировки по количеству партий, но такой функционал не реализован
DROP INDEX IF EXISTS idx_users_games_played;

-- Удаление дублирующихся индексов
-- PRIMARY KEY уже создает индекс, поэтому index=True на id избыточен
-- UNIQUE уже создает индекс, поэтому index=True на username и email избыточен
-- Но эти индексы создаются SQLAlchemy автоматически, поэтому их нельзя удалить через SQL
-- Они будут удалены при обновлении моделей

