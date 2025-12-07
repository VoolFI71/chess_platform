# План реализации анонимных игр

## Цель
Реализовать возможность игры без регистрации:
- Анонимный vs Анонимный
- Игрок vs Анонимный
- Анонимный vs Игрок

## Текущая структура

### Что уже есть:
1. ✅ `Game.white_id` и `Game.black_id` уже nullable (`int | None`)
2. ✅ WebSocket поддерживает `user_id: int | None` (для viewers)
3. ✅ Модель Move имеет `player_id: int | None`

### Что нужно изменить:
1. ❌ Создание игры требует обязательной аутентификации
2. ❌ WebSocket требует аутентификацию для ходов
3. ❌ Нет системы идентификации анонимных игроков
4. ❌ Фронтенд не поддерживает анонимные игры

---

## Решение: Система сессий для анонимных игроков

### Подход 1: Session-based (Рекомендуется)
- Использовать `session_id` (UUID) для идентификации анонимных игроков
- Хранить в localStorage браузера
- Передавать через WebSocket и API запросы

### Подход 2: Cookie-based
- Использовать HTTP-only cookies
- Более безопасно, но сложнее для WebSocket

**Выбираем Подход 1** - проще реализовать и достаточно для анонимных игр.

---

## План реализации

### Этап 1: Backend - Модель данных

#### 1.1. Обновить модель Game (уже готово)
```python
# games_service/app/models/game.py
# white_id и black_id уже nullable - ничего менять не нужно
```

#### 1.2. Добавить поддержку session_id в Move (опционально)
```python
# games_service/app/models/move.py
# player_id уже nullable - можно добавить session_id для анонимных игроков
# ИЛИ использовать отрицательные ID для анонимных (не рекомендуется)
```

**Решение**: Используем `player_id = None` для анонимных игроков и добавляем поле `session_id` в Move.

#### 1.3. Создать миграцию для добавления session_id
```python
# alembic/versions/XXXX_add_session_id_to_moves.py
def upgrade():
    op.add_column('moves', sa.Column('session_id', sa.String(36), nullable=True))
    op.create_index('ix_moves_session_id', 'moves', ['session_id'])
```

---

### Этап 2: Backend - API изменения

#### 2.1. Сделать создание игры опциональным по аутентификации

**Файл: `games_service/app/routers/games.py`**

```python
@router.post("/", response_model=GameDetail, status_code=status.HTTP_201_CREATED)
async def create_game(
    payload: CreateGameRequest,
    current_user_id: Annotated[int | None, Depends(get_current_user_id_optional)],
    session_id: Annotated[str | None, Header(alias="X-Session-ID")] = None,
    db: AsyncSession = Depends(get_db),
) -> GameDetail:
    """Создать игру. Может быть создана анонимно или авторизованным пользователем."""
    service = GameService(db)
    
    # Определяем creator_id
    creator_id = None
    creator_session_id = None
    
    if current_user_id:
        creator_id = current_user_id
    elif session_id:
        # Валидируем session_id (UUID формат)
        try:
            UUID(session_id)
            creator_session_id = session_id
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid session_id format"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication or session_id required"
        )
    
    try:
        game = await service.create_game(
            creator_id=creator_id,
            creator_session_id=creator_session_id,
            payload=payload
        )
    except GameServiceError as exc:
        raise _handle_error(exc)

    game_detail = await _build_detail(service, game)
    await _broadcast_state(game_detail)
    return game_detail
```

#### 2.2. Обновить GameService.create_game

**Файл: `games_service/app/services/games.py`**

```python
async def create_game(
    self,
    *,
    creator_id: int | None = None,
    creator_session_id: str | None = None,
    payload: CreateGameRequest
) -> Game:
    """Создать игру. Один из creator_id или creator_session_id должен быть указан."""
    
    if creator_id is None and creator_session_id is None:
        raise GameServiceError("Either creator_id or creator_session_id must be provided")
    
    board, initial_pos = _initial_board(payload.initial_fen)
    time_control = payload.time_control.dict() if payload.time_control else None
    
    initial_ms = payload.time_control.initial_ms if payload.time_control else 0
    if time_control:
        time_control["white_finish_ms"] = initial_ms
        time_control["black_finish_ms"] = initial_ms

    if payload.creator_color == "white":
        white_id = creator_id
        white_session_id = creator_session_id
        black_id = None
        black_session_id = None
    else:
        white_id = None
        white_session_id = None
        black_id = creator_id
        black_session_id = creator_session_id

    game = Game(
        white_id=white_id,
        black_id=black_id,
        # Добавляем session_id в metadata для анонимных игроков
        metadata_json={
            **(payload.metadata or {}),
            "white_session_id": white_session_id,
            "black_session_id": black_session_id,
        },
        initial_pos=initial_pos,
        current_pos=board.fen(),
        next_turn=SideToMove.WHITE.value if board.turn == chess.WHITE else SideToMove.BLACK.value,
        time_control=time_control,
        move_count=0,
        white_clock_ms=0,
        black_clock_ms=0,
        metadata_json=payload.metadata,
    )

    self.db.add(game)
    await self.db.commit()
    await self.db.refresh(game)
    return game
```

**Альтернатива**: Добавить поля `white_session_id` и `black_session_id` в модель Game (требует миграцию).

---

### Этап 3: Backend - WebSocket изменения

#### 3.1. Обновить WebSocket для поддержки session_id

**Файл: `games_service/app/routers/game_ws.py`**

```python
@router.websocket("/ws/games/{game_id}")
async def game_socket(
    game_id: UUID,
    websocket: WebSocket,
    token: Annotated[str | None, Query()] = None,
    session_id: Annotated[str | None, Query()] = None,
) -> None:
    user_id: int | None = None
    player_session_id: str | None = None
    
    # Проверяем аутентификацию
    if token:
        try:
            settings = get_settings()
            current_user = decode_access_token(
                token, settings.jwt_secret, settings.jwt_algorithm
            )
            user_id = current_user.id
        except Exception:
            await websocket.close(code=4401)
            return
    
    # Если нет токена, проверяем session_id
    elif session_id:
        try:
            # Валидируем формат UUID
            UUID(session_id)
            player_session_id = session_id
        except ValueError:
            await websocket.close(code=4400, reason="Invalid session_id")
            return
    else:
        # Разрешаем подключение как viewer (без ходов)
        pass

    async with SessionLocal() as db:
        service = GameService(db)
        try:
            game, moves = await service.get_game_with_moves(game_id, limit=RECENT_MOVES_LIMIT)
        except GameServiceError:
            await websocket.close(code=4404)
            return
        detail = build_game_detail(game, moves=moves)

        # Определяем роль игрока
        role = _resolve_role(game, user_id, player_session_id)
        
        await game_ws_manager.connect(
            game_id,
            ConnectionInfo(
                websocket=websocket,
                user_id=user_id,
                session_id=player_session_id,
                role=role
            ),
        )
        await websocket.send_json(
            WsStatePayload(type="state", game=detail).model_dump(mode="json")
        )

        cached_moves: list[MoveOut] = [await extract_move_data(m) for m in moves] if moves else []

        try:
            while True:
                data = await websocket.receive_json()
                try:
                    payload = MakeMovePayload.model_validate(data)
                except ValidationError:
                    await websocket.send_json(
                        WsErrorPayload(
                            type="error",
                            message="Invalid payload",
                            client_move_id=data.get("client_move_id") if isinstance(data, dict) else None,
                        ).model_dump(mode="json")
                    )
                    continue

                # Проверяем, что игрок может делать ход
                if not user_id and not player_session_id:
                    await websocket.send_json(
                        WsErrorPayload(
                            type="move_rejected",
                            message="Authentication or session required",
                            client_move_id=payload.client_move_id,
                        ).model_dump(mode="json")
                    )
                    continue

                try:
                    game, move = await service.make_move(
                        game_id,
                        player_id=user_id,
                        player_session_id=player_session_id,
                        payload=payload,
                    )
                except GameServiceError as exc:
                    await websocket.send_json(
                        WsErrorPayload(
                            type="move_rejected",
                            message=exc.message,
                            client_move_id=payload.client_move_id,
                        ).model_dump()
                    )
                    continue
                # ... остальной код без изменений
```

#### 3.2. Обновить _resolve_role

```python
def _resolve_role(game: Game, user_id: int | None, session_id: str | None = None) -> str:
    """Определяет роль игрока в партии."""
    if user_id:
        if user_id == game.white_id:
            return "white"
        if user_id == game.black_id:
            return "black"
    
    if session_id:
        metadata = game.metadata_json or {}
        if session_id == metadata.get("white_session_id"):
            return "white"
        if session_id == metadata.get("black_session_id"):
            return "black"
    
    return "viewer"
```

#### 3.3. Обновить GameService.make_move

```python
async def make_move(
    self,
    game_id: UUID,
    *,
    player_id: int | None = None,
    player_session_id: str | None = None,
    payload: MakeMovePayload,
) -> tuple[Game, Move]:
    """Сделать ход. Один из player_id или player_session_id должен быть указан."""
    
    if player_id is None and player_session_id is None:
        raise GameServiceError("Either player_id or player_session_id must be provided")
    
    self.db.expire_all()
    game = await self._lock_game(game_id)
    
    if game.status == GameStatus.FINISHED.value:
        raise GameServiceError("Партия уже завершена", status.HTTP_409_CONFLICT)
    
    if not game.white_id and not (game.metadata_json or {}).get("white_session_id"):
        raise GameServiceError("Нельзя начать, пока не присоединился второй игрок")
    if not game.black_id and not (game.metadata_json or {}).get("black_session_id"):
        raise GameServiceError("Нельзя начать, пока не присоединился второй игрок")

    # Определяем ожидаемого игрока
    metadata = game.metadata_json or {}
    if game.next_turn == SideToMove.WHITE.value:
        expected_user_id = game.white_id
        expected_session_id = metadata.get("white_session_id")
    else:
        expected_user_id = game.black_id
        expected_session_id = metadata.get("black_session_id")
    
    # Проверяем, что это ход правильного игрока
    if player_id and player_id != expected_user_id:
        raise GameServiceError("Не ваш ход", status.HTTP_403_FORBIDDEN)
    if player_session_id and player_session_id != expected_session_id:
        raise GameServiceError("Не ваш ход", status.HTTP_403_FORBIDDEN)
    
    # ... остальная логика хода без изменений
    
    # При создании Move
    move = Move(
        game_id=game_id,
        move_index=game.move_count + 1,
        uci=payload.uci,
        san=san,
        fen_after=new_fen,
        player_id=player_id,  # None для анонимных
        session_id=player_session_id,  # Новое поле
        clocks_after=clocks_after,
        is_capture=is_capture,
        promotion=payload.promotion,
    )
```

---

### Этап 4: Backend - Join game для анонимных

#### 4.1. Обновить join_game endpoint

```python
@router.post("/{game_id}/join", response_model=JoinGameResponse)
async def join_game(
    game_id: UUID,
    current_user_id: Annotated[int | None, Depends(get_current_user_id_optional)],
    session_id: Annotated[str | None, Header(alias="X-Session-ID")] = None,
    db: AsyncSession = Depends(get_db),
) -> JoinGameResponse:
    """Присоединиться к игре. Может быть анонимно или авторизованным пользователем."""
    service = GameService(db)
    
    player_id = None
    player_session_id = None
    
    if current_user_id:
        player_id = current_user_id
    elif session_id:
        try:
            UUID(session_id)
            player_session_id = session_id
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid session_id format"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication or session_id required"
        )
    
    try:
        game = await service.join_game(
            game_id,
            player_id=player_id,
            player_session_id=player_session_id
        )
    except GameServiceError as exc:
        raise _handle_error(exc)
    
    detail = await _build_detail(service, game)
    await _broadcast_state(detail)
    return detail
```

#### 4.2. Обновить GameService.join_game

```python
async def join_game(
    self,
    game_id: UUID,
    *,
    player_id: int | None = None,
    player_session_id: str | None = None,
) -> Game:
    """Присоединиться к игре."""
    
    if player_id is None and player_session_id is None:
        raise GameServiceError("Either player_id or player_session_id must be provided")
    
    game = await self._lock_game(game_id)
    
    if game.status != GameStatus.CREATED.value:
        raise GameServiceError("Партия не открыта для присоединения", status.HTTP_409_CONFLICT)
    
    metadata = game.metadata_json or {}
    
    # Проверяем, не участвует ли уже игрок
    if player_id:
        if player_id in {game.white_id, game.black_id}:
            raise GameServiceError("Вы уже участвуете в этой партии", status.HTTP_400_BAD_REQUEST)
    if player_session_id:
        if player_session_id in {metadata.get("white_session_id"), metadata.get("black_session_id")}:
            raise GameServiceError("Вы уже участвуете в этой партии", status.HTTP_400_BAD_REQUEST)
    
    # Проверяем, есть ли свободное место
    has_white = game.white_id is not None or metadata.get("white_session_id")
    has_black = game.black_id is not None or metadata.get("black_session_id")
    
    if has_white and has_black:
        raise GameServiceError("В партии уже два игрока", status.HTTP_409_CONFLICT)
    
    # Присоединяемся к свободной стороне
    if not has_white:
        if player_id:
            game.white_id = player_id
        else:
            if not metadata:
                metadata = {}
            metadata["white_session_id"] = player_session_id
            game.metadata_json = metadata
    else:
        if player_id:
            game.black_id = player_id
        else:
            if not metadata:
                metadata = {}
            metadata["black_session_id"] = player_session_id
            game.metadata_json = metadata
    
    # Если оба игрока присоединились, начинаем партию
    has_white_after = game.white_id is not None or (game.metadata_json or {}).get("white_session_id")
    has_black_after = game.black_id is not None or (game.metadata_json or {}).get("black_session_id")
    
    if has_white_after and has_black_after:
        game.status = GameStatus.ACTIVE.value
        game.started_at = _utcnow()
    
    await self.db.commit()
    await self.db.refresh(game)
    return game
```

---

### Этап 5: Frontend - Генерация и управление session_id

#### 5.1. Создать утилиту для session_id

**Файл: `backend/web/scripts/session.js`**

```javascript
// Утилита для управления анонимными сессиями

const SESSION_KEY = 'anonymous_session_id';

/**
 * Получить или создать session_id для анонимного игрока
 */
function getOrCreateSessionId() {
    let sessionId = localStorage.getItem(SESSION_KEY);
    
    if (!sessionId) {
        // Генерируем UUID v4
        sessionId = generateUUID();
        localStorage.setItem(SESSION_KEY, sessionId);
    }
    
    return sessionId;
}

/**
 * Генерировать UUID v4
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Получить заголовки для анонимных запросов
 */
function getAnonymousHeaders() {
    const sessionId = getOrCreateSessionId();
    return {
        'X-Session-ID': sessionId
    };
}

/**
 * Проверить, авторизован ли пользователь
 */
function isAuthenticated() {
    return typeof window.apiFetch === 'function' && 
           localStorage.getItem('access_token') !== null;
}
```

#### 5.2. Обновить создание игры

**Файл: `backend/web/scripts/games.js`**

```javascript
async function createGame(payload) {
    const url = '/api/games/';
    
    let headers = { 'Content-Type': 'application/json' };
    let body = JSON.stringify(payload);
    
    // Если пользователь авторизован, используем обычный запрос
    if (isAuthenticated() && typeof window.apiFetch === 'function') {
        const res = await window.apiFetch(url, {
            method: 'POST',
            headers,
            body
        });
        return await res.json();
    }
    
    // Иначе используем анонимный запрос с session_id
    const sessionHeaders = getAnonymousHeaders();
    headers = { ...headers, ...sessionHeaders };
    
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body
    });
    
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Failed to create game');
    }
    
    return await res.json();
}
```

#### 5.3. Обновить WebSocket подключение

**Файл: `backend/web/scripts/match/match.js`**

```javascript
function connectWebSocket(gameId) {
    let wsUrl = `/ws/games/${gameId}`;
    const params = new URLSearchParams();
    
    // Если пользователь авторизован, используем токен
    const token = localStorage.getItem('access_token');
    if (token) {
        params.append('token', token);
    } else {
        // Иначе используем session_id
        const sessionId = getOrCreateSessionId();
        params.append('session_id', sessionId);
    }
    
    wsUrl += '?' + params.toString();
    
    const ws = new WebSocket(`ws://${window.location.host}${wsUrl}`);
    // ... остальной код
}
```

---

### Этап 6: Миграция базы данных

#### 6.1. Добавить session_id в Move (опционально)

```python
# alembic/versions/XXXX_add_session_id_to_moves.py
"""Add session_id to moves for anonymous players

Revision ID: xxxx
Revises: previous
Create Date: 2024-XX-XX
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.add_column('moves', sa.Column('session_id', sa.String(36), nullable=True))
    op.create_index('ix_moves_session_id', 'moves', ['session_id'])

def downgrade():
    op.drop_index('ix_moves_session_id', table_name='moves')
    op.drop_column('moves', 'session_id')
```

**Альтернатива**: Хранить session_id в metadata игры (не требует миграции Move).

---

## Рекомендации по реализации

### Вариант A: Session в metadata (Проще, быстрее)
- ✅ Не требует миграции Move
- ✅ Быстрее реализовать
- ❌ Менее нормализовано

### Вариант B: Session в Move (Правильнее)
- ✅ Нормализованная структура
- ✅ Легче анализировать ходы анонимных игроков
- ❌ Требует миграцию

**Рекомендация**: Начать с Варианта A (metadata), затем при необходимости перейти к Варианту B.

---

## Тестирование

### Сценарии:
1. ✅ Анонимный создает игру → Анонимный присоединяется
2. ✅ Авторизованный создает игру → Анонимный присоединяется
3. ✅ Анонимный создает игру → Авторизованный присоединяется
4. ✅ Оба делают ходы через WebSocket
5. ✅ Проверка, что нельзя делать ход за другого игрока

---

## Дополнительные улучшения

1. **Ограничение анонимных игр**: Максимум N игр с одного IP
2. **Временные ограничения**: Удалять старые анонимные игры
3. **Статистика**: Отслеживать количество анонимных игр
4. **Приглашение**: Анонимный может пригласить друга по ссылке

---

## Порядок реализации

1. ✅ Создать утилиту session.js
2. ✅ Обновить create_game (опциональная аутентификация)
3. ✅ Обновить join_game (опциональная аутентификация)
4. ✅ Обновить WebSocket (поддержка session_id)
5. ✅ Обновить make_move (проверка session_id)
6. ✅ Обновить фронтенд (использование session_id)
7. ✅ Тестирование

