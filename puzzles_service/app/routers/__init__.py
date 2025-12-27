from .puzzles import puzzles_router
from .attempts import attempts_router
from .stats import stats_router
from .importer import importer_router
from .daily_solutions import daily_solutions_router

__all__ = ["puzzles_router", "attempts_router", "stats_router", "importer_router", "daily_solutions_router"]

