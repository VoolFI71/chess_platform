from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..schemas import PuzzleImportRequest, PuzzleImportResult, PuzzleUpsertRequest
from ..security import verify_internal_token
from ..services.importer import PuzzleCsvImporter, upsert_puzzles

importer_router = APIRouter(prefix="/puzzles/internal", tags=["puzzles-internal"])


@importer_router.post("/import", response_model=PuzzleImportResult, dependencies=[Depends(verify_internal_token)])
async def import_from_csv(
	request: PuzzleImportRequest,
	db: AsyncSession = Depends(get_db),
) -> PuzzleImportResult:
	settings = get_settings()
	file_path = request.file_path or settings.csv_file_path
	if not file_path:
		raise HTTPException(status_code=400, detail="Не указан путь к CSV файлу")

	importer = PuzzleCsvImporter(db, chunk_size=request.chunk_size or settings.import_chunk_size)
	return await importer.import_file(file_path=file_path, limit=request.limit)


@importer_router.post(
	"/puzzle",
	response_model=PuzzleImportResult,
	status_code=201,
	dependencies=[Depends(verify_internal_token)],
)
async def upsert_single_puzzle(
	payload: PuzzleUpsertRequest,
	db: AsyncSession = Depends(get_db),
) -> PuzzleImportResult:
	data = payload.model_dump()
	row: dict[str, Any] = {
		"puzzle_id": data["puzzle_id"],
		"fen": data["fen"],
		"moves": data["moves"],
		"move_count": len(data["moves"]),
		"rating": data["rating"],
		"rating_deviation": data["rating_deviation"],
		"popularity": data["popularity"],
		"nb_plays": data["nb_plays"],
		"themes": data["themes"],
		"opening_tags": data["opening_tags"],
		"game_url": data["game_url"],
		"source": data["source"],
	}
	if data.get("solved_count") is not None:
		row["solved_count"] = data["solved_count"]

	result = await upsert_puzzles(db, [row])
	return PuzzleImportResult(
		total_rows=result["total"],
		imported=result["imported"],
		skipped=result["skipped"],
		updated=result["updated"],
	)

