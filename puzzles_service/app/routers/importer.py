import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..schemas import (
	PuzzleBatchUpsertRequest,
	PuzzleImportRequest,
	PuzzleImportResult,
	PuzzleUpsertRequest,
)
from ..security import verify_internal_token
from ..services.importer import PuzzleCsvImporter, row_from_upsert_dict, upsert_puzzles

importer_router = APIRouter(prefix="/puzzles/internal", tags=["puzzles-internal"])


@importer_router.post(
	"/import/upload",
	response_model=PuzzleImportResult,
	summary="Загрузка CSV с клиента (multipart)",
	dependencies=[Depends(verify_internal_token)],
)
async def import_csv_upload(
	file: UploadFile = File(..., description="CSV в формате Lichess Puzzle Database"),
	limit: int | None = Form(default=None),
	chunk_size: int | None = Form(default=None),
	db: AsyncSession = Depends(get_db),
) -> PuzzleImportResult:
	"""Импорт задач из загруженного файла (удобно с ноутбука на сервер без ssh/docker cp)."""
	if not file.filename:
		raise HTTPException(status_code=400, detail="Имя файла не указано")
	if not file.filename.lower().endswith(".csv"):
		raise HTTPException(status_code=400, detail="Ожидается файл с расширением .csv")

	settings = get_settings()
	if chunk_size is not None and (chunk_size <= 0 or chunk_size > 10000):
		raise HTTPException(status_code=400, detail="chunk_size должен быть от 1 до 10000")
	if limit is not None and limit <= 0:
		raise HTTPException(status_code=400, detail="limit должен быть > 0")

	suffix = Path(file.filename).suffix or ".csv"
	tmp_path: str | None = None
	try:
		with tempfile.NamedTemporaryFile(prefix="puzzle_import_", suffix=suffix, delete=False) as tmp:
			tmp_path = tmp.name
			while True:
				chunk = await file.read(1024 * 1024)
				if not chunk:
					break
				tmp.write(chunk)

		importer = PuzzleCsvImporter(db, chunk_size=chunk_size or settings.import_chunk_size)
		return await importer.import_file(file_path=tmp_path, limit=limit)
	finally:
		if tmp_path:
			try:
				os.unlink(tmp_path)
			except OSError:
				pass


@importer_router.post(
	"/import/batch",
	response_model=PuzzleImportResult,
	status_code=201,
	summary="Пакет: JSON с задачами (клиент читает CSV локально)",
	dependencies=[Depends(verify_internal_token)],
)
async def import_batch_json(
	payload: PuzzleBatchUpsertRequest,
	db: AsyncSession = Depends(get_db),
) -> PuzzleImportResult:
	rows = [row_from_upsert_dict(p.model_dump()) for p in payload.puzzles]
	result = await upsert_puzzles(db, rows)
	return PuzzleImportResult(
		total_rows=result["total"],
		imported=result["imported"],
		skipped=result["skipped"],
		updated=result["updated"],
	)


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
	row = row_from_upsert_dict(payload.model_dump())
	result = await upsert_puzzles(db, [row])
	return PuzzleImportResult(
		total_rows=result["total"],
		imported=result["imported"],
		skipped=result["skipped"],
		updated=result["updated"],
	)

