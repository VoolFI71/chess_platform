from common import BaseServiceSettings, make_get_settings


class Settings(BaseServiceSettings):
	app_name: str = "Auth Service"
	access_token_expire_minutes: int = 15
	refresh_token_expire_days: int = 30
	auth_internal_token: str | None = None
	users_service_url: str | None = None
	users_internal_token: str | None = None
	email_service_url: str | None = None
	email_internal_token: str | None = None
	kafka_broker_url: str | None = None

	# Mail.ru OAuth settings
	mailru_oauth_client_id: str | None = None
	mailru_oauth_client_secret: str | None = None
	mailru_oauth_redirect_uri: str | None = None  # e.g., https://yourdomain.com/api/auth/mailru/callback
	mailru_oauth_authorization_url: str = "https://oauth.mail.ru/login"
	mailru_oauth_token_url: str = "https://oauth.mail.ru/token"
	mailru_oauth_userinfo_url: str = "https://oauth.mail.ru/userinfo"
	
	# Google OAuth settings
	google_oauth_client_id: str | None = None
	google_oauth_client_secret: str | None = None
	google_oauth_redirect_uri: str | None = None  # e.g., https://yourdomain.com/api/auth/google/callback
	google_oauth_authorization_url: str = "https://accounts.google.com/o/oauth2/v2/auth"
	google_oauth_token_url: str = "https://oauth2.googleapis.com/token"
	google_oauth_userinfo_url: str = "https://www.googleapis.com/oauth2/v3/userinfo"


get_settings = make_get_settings(Settings)


