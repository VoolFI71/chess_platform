from common import BaseServiceSettings, make_get_settings


class Settings(BaseServiceSettings):
	app_name: str = "Games Service"
	games_internal_token: str | None = None


get_settings = make_get_settings(Settings)

