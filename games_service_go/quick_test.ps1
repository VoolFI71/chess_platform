# Быстрый скрипт для тестирования производительности
# Использование: .\quick_test.ps1

Write-Host "========================================"
Write-Host "Бенчмарк Games Service"
Write-Host "========================================"
Write-Host ""

# Проверка зависимостей
Write-Host "[1/4] Проверка зависимостей..."
try {
    $null = python --version
    Write-Host "✓ Python установлен"
} catch {
    Write-Host "✗ Python не найден. Установите Python 3.8+"
    exit 1
}

try {
    python -c "import httpx" 2>$null
    Write-Host "✓ httpx установлен"
} catch {
    Write-Host "✗ httpx не найден. Устанавливаю..."
    pip install httpx
    Write-Host "✓ httpx установлен"
}

Write-Host ""
Write-Host "[2/4] Проверка сервиса..."
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/api/games/" -Method GET -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✓ Сервис доступен (код: $($response.StatusCode))"
    } else {
        Write-Host "⚠ Сервис вернул код: $($response.StatusCode)"
    }
} catch {
    Write-Host "✗ Сервис недоступен: $_"
    Write-Host "  Убедитесь, что docker-compose запущен: docker-compose -f docker-compose.local.yml up -d"
    exit 1
}

Write-Host ""
Write-Host "[3/4] Выбор теста..."
Write-Host "1. Быстрый тест (500 запросов, ~10 сек)"
Write-Host "2. Средний тест (2000 запросов, ~30 сек)"
Write-Host "3. Нагрузочный тест (5000 запросов, ~1 мин)"
Write-Host "4. Кастомный тест"
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
        Write-Host "Неверный выбор, использую быстрый тест"
        $requests = 500
        $concurrent = 10
        $saveFile = "results_quick.json"
    }
}

Write-Host ""
Write-Host "[4/4] Запуск теста..."
Write-Host "Параметры:"
Write-Host "  Запросов: $requests"
Write-Host "  Параллельных: $concurrent"
Write-Host "  Сохранение: $saveFile"
Write-Host ""

python benchmark_games.py --endpoint /api/games/ --requests $requests --concurrent $concurrent --save $saveFile

Write-Host ""
Write-Host "========================================"
Write-Host "Тест завершен!"
Write-Host "========================================"
Write-Host "Результаты сохранены в: $saveFile"
Write-Host ""

if (Test-Path $saveFile) {
    Write-Host "Просмотр результатов:"
    Write-Host "  Get-Content $saveFile | ConvertFrom-Json | ConvertTo-Json -Depth 10"
}

