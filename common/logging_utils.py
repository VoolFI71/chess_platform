from __future__ import annotations

import logging
from typing import Union


def setup_logging(level: Union[int, str] = "INFO") -> None:
    """
    Configure Python logging with a consistent format across services.

    Calling this function multiple times will reconfigure the root logger.
    """
    if isinstance(level, str):
        level = getattr(logging, level.upper(), logging.INFO)

    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        force=True,
    )

