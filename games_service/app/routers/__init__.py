from .games import router as games_router
from .game_ws import router as games_ws_router
from .internal import router as internal_router

__all__ = ["games_router", "games_ws_router", "internal_router"]

