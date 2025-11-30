from common import BaseServiceSettings, make_get_settings


class Settings(BaseServiceSettings):
	app_name: str = "Users Service"
	games_service_url: str | None = None
	games_internal_token: str | None = None
	notifications_service_url: str | None = None
	notifications_internal_token: str | None = None
	auth_internal_token: str | None = None


get_settings = make_get_settings(Settings)



