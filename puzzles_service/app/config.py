from common import BaseServiceSettings, make_get_settings


class Settings(BaseServiceSettings):
	app_name: str = "Puzzles Service"
	puzzles_internal_token: str | None = None
	import_chunk_size: int = 2000
	random_pool_size: int = 15000  # Оптимальный размер для базы с 1 млн задач: обеспечивает хорошее разнообразие (1.5% от общего количества) и баланс между производительностью и памятью
	max_moves_return: int = 12
	default_page_size: int = 20
	max_page_size: int = 100
	csv_file_path: str | None = None
	# Путь к CSV файлу для автоматического импорта при старте
	# Можно установить через переменную окружения PUZZLES_CSV_FILE_PATH

	# Увеличенный пул соединений для высокой нагрузки
	# Базовый размер: 50, overflow: 100, итого до 150 соединений
	db_pool_size: int = 50
	db_max_overflow: int = 100
	db_pool_timeout: int = 30  # Таймаут ожидания свободного соединения (секунды)
	db_pool_recycle: int = 3600  # Пересоздание соединений через 1 час


get_settings = make_get_settings(Settings)


__all__ = ["Settings", "get_settings"]

