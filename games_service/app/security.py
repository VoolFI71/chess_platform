from common import (
	CurrentUser,
	bearer_scheme,
	make_get_current_user,
	make_get_current_user_id,
	make_get_current_user_optional,
	make_get_current_user_id_optional,
	make_internal_token_verifier,
)
from .config import get_settings

# Создаем функции для зависимостей FastAPI
get_current_user = make_get_current_user(get_settings)
get_current_user_id = make_get_current_user_id(get_current_user)
get_current_user_optional = make_get_current_user_optional(get_settings)
get_current_user_id_optional = make_get_current_user_id_optional(get_current_user_optional)

# Верификация внутренних токенов
verify_internal_token = make_internal_token_verifier(
	lambda: get_settings().games_internal_token
)

__all__ = [
	"CurrentUser",
	"bearer_scheme",
	"get_current_user",
	"get_current_user_id",
	"get_current_user_optional",
	"get_current_user_id_optional",
	"verify_internal_token",
]

