from common import (
	CurrentUser,
	bearer_scheme,
	make_get_current_user,
	make_get_current_user_id,
	make_get_current_user_optional,
	make_get_current_user_id_optional,
)
from .config import get_settings

# Создаем функции для зависимостей FastAPI
get_current_user = make_get_current_user(get_settings)
get_current_user_id = make_get_current_user_id(get_current_user)
get_current_user_optional = make_get_current_user_optional(get_settings)
get_current_user_id_optional = make_get_current_user_id_optional(get_current_user_optional)

__all__ = [
	"CurrentUser",
	"bearer_scheme",
	"get_current_user",
	"get_current_user_id",
	"get_current_user_optional",
	"get_current_user_id_optional",
]

