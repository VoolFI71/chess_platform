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


get_settings = make_get_settings(Settings)


__all__ = ["Settings", "get_settings"]

