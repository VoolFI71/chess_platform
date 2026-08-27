# Диаграммы C4 — архитектура ChessMint

Документация архитектуры информационной системы ChessMint с использованием модели C4 (Context, Container, Component).

---

## Легенда

| Обозначение | Описание |
|-------------|----------|
| **Person** | Пользователь системы (игрок) |
| **System** | Программная система |
| **System_Ext** | Внешняя система (не под нашим контролем) |
| **Container** | Приложение или сервис (выполняет код) |
| **ContainerDb** | Хранилище данных |
| **Component** | Компонент внутри контейнера |
| **Rel(A, B, label)** | Связь: A взаимодействует с B (label — описание) |
| **Boundary** | Граница системы или подсистемы |

---

## Уровень 1: System Context (Контекст системы)

Система в окружении пользователей и внешних систем.

```mermaid
C4Context
    title Контекст системы ChessMint

    Person(player, "Игрок", "Пользователь платформы: играет в шахматы, решает задачи, смотрит рейтинг")

    System(chessmint, "ChessMint", "Шахматная платформа: онлайн-игры, задачи, игра с компьютером, рейтинги")

    System_Ext(yookassa, "YooKassa", "Платёжный провайдер")
    System_Ext(smtp, "SMTP-сервер", "Отправка email")
    System_Ext(stockfish, "Stockfish", "Движок для игры с компьютером")

    Rel(player, chessmint, "Использует", "HTTPS/WebSocket")
    Rel(chessmint, yookassa, "Приём платежей", "REST API, webhook")
    Rel(chessmint, smtp, "Отправка писем", "SMTP")
    Rel(chessmint, stockfish, "Запрос ходов ИИ", "UCI")
```

---

## Уровень 2: Container (Контейнеры)

Основные приложения и сервисы внутри ChessMint.

```mermaid
C4Container
    title Контейнеры ChessMint

    Person(player, "Игрок", "Пользователь платформы")

    System_Boundary(chessmint, "ChessMint") {
        Container(nginx, "Nginx Gateway", "Nginx", "Маршрутизация, SSL, балансировка")
        Container(backend, "Backend API", "FastAPI", "Шлюз, статика, раздача фронтенда")
        Container(auth, "Auth Service", "Python/FastAPI", "JWT, регистрация, сброс пароля")
        Container(users, "Users Service", "Python/FastAPI", "Профили, рейтинги, статистика")
        Container(games, "Games Service", "Go/Gin", "Онлайн-игры человек vs человек")
        Container(compgames, "Computer Games", "Go/Gin", "Игра против Stockfish")
        Container(puzzles, "Puzzles Service", "Python/FastAPI", "Задачи, дневные пазлы, рейтинг")
        Container(payments, "Payments Service", "Python/FastAPI", "Заказы, YooKassa")
        Container(notifications, "Notifications", "Python/FastAPI", "WebSocket уведомления")
        Container(email, "Email Service", "Go", "Отправка email через SMTP")
        ContainerDb(postgres, "PostgreSQL", "PostgreSQL 16", "Основная БД")
        ContainerDb(minio, "MinIO", "S3-совместимое", "Файлы, изображения")
    }

    System_Ext(yookassa, "YooKassa", "Платёжный провайдер")
    System_Ext(smtp, "SMTP", "Сервер почты")
    System_Ext(stockfish, "Stockfish", "Движок ИИ")

    Rel(player, nginx, "HTTP/WebSocket")
    Rel(nginx, backend, "Маршрутизация")
    Rel(nginx, auth, "/api/auth/*")
    Rel(nginx, users, "/api/users/*")
    Rel(nginx, games, "/api/games/*")
    Rel(nginx, compgames, "/api/computer-games/*")
    Rel(nginx, puzzles, "/api/puzzles/*")
    Rel(nginx, payments, "/api/payments/*")
    Rel(nginx, notifications, "/ws/notifications")
    Rel(auth, users, "Internal Token")
    Rel(auth, email, "Internal Token")
    Rel(games, postgres, "Read/Write")
    Rel(compgames, postgres, "Read/Write")
    Rel(puzzles, postgres, "Read/Write")
    Rel(users, postgres, "Read/Write")
    Rel(auth, postgres, "Read/Write")
    Rel(payments, postgres, "Read/Write")
    Rel(compgames, stockfish, "UCI")
    Rel(payments, yookassa, "REST, webhook")
    Rel(email, smtp, "SMTP")
```

---

## Уровень 3: Component — Games Service (пример)

Компоненты внутри сервиса онлайн-игр.

```mermaid
C4Component
    title Компоненты Games Service (Go)

    Container_Boundary(games, "Games Service") {
        Component(handlers, "HTTP Handlers", "Gin", "REST API: создание игры, ходы, статус")
        Component(matchmaker, "Matchmaker", "Go", "Поиск соперника, создание пар")
        Component(game_logic, "Game Logic", "Go", "Валидация ходов, завершение партии")
        Component(ws_hub, "WebSocket Hub", "Go", "Real-time: ходы, уведомления")
        Component(repo, "Game Repository", "GORM", "Работа с БД: games, moves")
    }

    ContainerDb(postgres, "PostgreSQL", "БД")

    Rel(handlers, matchmaker, "Создать игру")
    Rel(handlers, game_logic, "Сделать ход")
    Rel(handlers, ws_hub, "Подписка на игру")
    Rel(handlers, repo, "CRUD")
    Rel(matchmaker, repo, "Создать игру")
    Rel(game_logic, repo, "Сохранить ход")
    Rel(ws_hub, game_logic, "Уведомить о ходе")
    Rel(repo, postgres, "SQL")
```

---

## Уровень 3: Component — Puzzles Service (пример)

Компоненты внутри сервиса задач.

```mermaid
C4Component
    title Компоненты Puzzles Service

    Container_Boundary(puzzles, "Puzzles Service") {
        Component(api, "REST API", "FastAPI", "Эндпоинты: /puzzles, /daily, /stats")
        Component(cache, "Puzzle Cache", "Python", "Stale-while-revalidate, выборка по рейтингу")
        Component(solver, "Solver Service", "Python", "Проверка решения, учёт статистики")
        Component(repo, "Puzzle Repository", "SQLAlchemy", "Доступ к puzzles, puzzle_attempts")
    }

    ContainerDb(postgres, "PostgreSQL", "БД")

    Rel(api, cache, "Получить задачу")
    Rel(api, solver, "Проверить решение")
    Rel(api, repo, "Статистика")
    Rel(cache, repo, "TABLESAMPLE, выборка")
    Rel(solver, repo, "Сохранить попытку")
    Rel(repo, postgres, "SQL")
```

---

## Поведение: сценарий «Создание онлайн-игры»

```mermaid
sequenceDiagram
    participant P as Игрок
    participant N as Nginx
    participant G as Games Service
    participant DB as PostgreSQL

    P->>N: POST /api/games (создать игру)
    N->>G: Маршрутизация
    G->>G: Matchmaker: поиск соперника
    G->>DB: INSERT game
    G->>P: 201 {game_id}
    Note over P,G: WebSocket: /ws/games/{id}
    P->>N: WS: подключение
    N->>G: Прокси WebSocket
    G->>P: Подписка на игру
    P->>G: Ход (через WS)
    G->>G: Валидация хода
    G->>DB: INSERT move
    G->>P: Broadcast: ход соперника
```

---

## Альтернатива: упрощённая схема (если C4 не поддерживается)

Если C4-диаграммы не отображаются в вашей среде, можно использовать обычный Mermaid flowchart:

```mermaid
flowchart TB
    subgraph Users
        P[Игрок]
    end

    subgraph ChessMint["ChessMint"]
        subgraph Gateway
            N[Nginx]
        end
        subgraph Services
            B[Backend]
            A[Auth]
            U[Users]
            G[Games]
            CG[Computer Games]
            PZ[Puzzles]
            PM[Payments]
            NO[Notifications]
            E[Email]
        end
        subgraph Data
            PG[(PostgreSQL)]
            MI[(MinIO)]
        end
    end

    subgraph External["Внешние системы"]
        YK[YooKassa]
        SMTP[SMTP]
        SF[Stockfish]
    end

    P -->|HTTPS/WS| N
    N --> B
    N --> A
    N --> U
    N --> G
    N --> CG
    N --> PZ
    N --> PM
    N --> NO
    A --> U
    A --> E
    G --> PG
    CG --> PG
    CG --> SF
    PZ --> PG
    U --> PG
    PM --> PG
    PM --> YK
    E --> SMTP
```

---

## Примечания

- **Mermaid C4** — экспериментальный синтаксис (Mermaid 10+). Если диаграммы не отображаются, используйте упрощённую схему выше или [PlantUML](https://www.plantuml.com/plantuml) с [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML).
- **Мониторинг** (Prometheus, Grafana, Loki) на диаграммах не показан — это операционная инфраструктура.
- **Internal tokens** — аутентификация между сервисами (Auth → Users, Auth → Email).
