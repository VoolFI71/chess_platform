from common import BaseServiceSettings, make_get_settings


class Settings(BaseServiceSettings):
	app_name: str = "Notifications Service"
	# URL для внутренних вызовов из других сервисов (опционально)
	internal_token: str | None = None


get_settings = make_get_settings(Settings)

