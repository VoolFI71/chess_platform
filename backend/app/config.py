from common import BaseServiceSettings, make_get_settings


class Settings(BaseServiceSettings):
    """Настройки для backend сервиса (gateway + frontend)."""
    
    app_name: str = "Chess Courses API"
    
    # JWT token expiration settings
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    
    # Frontend serving
    web_dir: str = "backend/web"
    
    # Internal service communication
    api_internal_token: str | None = None
    kafka_broker_url: str | None = None

    # YooKassa payment settings
    yookassa_shop_id: str | None = None
    yookassa_secret_key: str | None = None
    public_base_url: str | None = None  # e.g., https://your.domain

    # Object storage (MinIO / S3)
    s3_endpoint: str | None = None
    s3_region: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_use_ssl: bool = False
    s3_bucket_videos: str | None = None
    s3_bucket_assets: str | None = None
    s3_presign_expire_seconds: int = 3600


get_settings = make_get_settings(Settings)


