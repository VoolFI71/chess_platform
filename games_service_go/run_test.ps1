# Быстрый скрипт для тестирования производительности
# Использование: .\run_test.ps1

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Бенчмарк Games Service" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Проверка зависимостей
Write-Host "[1/4] Проверка зависимостей..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✓ Python установлен: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Python не найден. Установите Python 3.8+" -ForegroundColor Red
    exit 1
}

try {
    python -c "import httpx" 2>&1 | Out-Null
    Write-Host "✓ httpx установлен" -ForegroundColor Green
} catch {
    Write-Host "✗ httpx не найден. Устанавливаю..." -ForegroundColor Yellow
    pip install httpx
    Write-Host "✓ httpx установлен" -ForegroundColor Green
}

Write-Host ""
Write-Host "[2/4] Проверка сервиса..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/api/games/" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "✓ Сервис доступен (код: $($response.StatusCode))" -ForegroundColor Green
    } else {
        Write-Host "⚠ Сервис вернул код: $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Сервис недоступен: $_" -ForegroundColor Red
    Write-Host "  Убедитесь, что docker-compose запущен:" -ForegroundColor Yellow
    Write-Host "  docker-compose -f docker-compose.local.yml up -d games" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "[3/4] Выбор теста..." -ForegroundColor Yellow
Write-Host "1. Быстрый тест (500 запросов, ~10 сек)" -ForegroundColor White
Write-Host "2. Средний тест (2000 запросов, ~30 сек)" -ForegroundColor White
Write-Host "3. Нагрузочный тест (5000 запросов, ~1 мин)" -ForegroundColor White
Write-Host "4. Кастомный тест" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Выберите тест (1-4)"

switch ($choice) {
    "1" {
        $requests = 500
        $concurrent = 10
        $saveFile = "results_quick.json"
    }
    "2" {
        $requests = 2000
        $concurrent = 20
        $saveFile = "results_medium.json"
    }
    "3" {
        $requests = 5000
        $concurrent = 50
        $saveFile = "results_stress.json"
    }
    "4" {
        $requests = Read-Host "Количество запросов"
        $concurrent = Read-Host "Параллельных запросов"
        $saveFile = "results_custom.json"
    }
    default {
        Write-Host "Неверный выбор, использую быстрый тест" -ForegroundColor Yellow
        $requests = 500
        $concurrent = 10
        $saveFile = "results_quick.json"
    }
}

Write-Host ""
Write-Host "[4/4] Запуск теста..." -ForegroundColor Yellow
Write-Host "Параметры:" -ForegroundColor White
Write-Host "  Запросов: $requests" -ForegroundColor White
Write-Host "  Параллельных: $concurrent" -ForegroundColor White
Write-Host "  Сохранение: $saveFile" -ForegroundColor White
Write-Host ""

python benchmark_games.py --endpoint /api/games/ --requests $requests --concurrent $concurrent --save $saveFile

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Тест завершен!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Результаты сохранены в: $saveFile" -ForegroundColor White
Write-Host ""

if (Test-Path $saveFile) {
    Write-Host "Просмотр результатов:" -ForegroundColor Yellow
    Write-Host "  Get-Content $saveFile | ConvertFrom-Json | ConvertTo-Json -Depth 10" -ForegroundColor Gray
}

