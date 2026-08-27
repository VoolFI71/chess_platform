from .users import router as users_router
from .internal_users import router as internal_users_router
from .ratings import router as ratings_router
from .schools import router as schools_router

__all__ = ["users_router", "internal_users_router", "ratings_router", "schools_router"]


