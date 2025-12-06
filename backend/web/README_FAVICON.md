# Favicon для Яндекс Вебмастера

Для того чтобы Яндекс Вебмастер правильно индексировал favicon, нужно:

1. **SVG файл** - уже создан: `favicon.svg`
2. **PNG файл 120x120** - нужно создать из SVG

## Создание PNG файла

### Вариант 1: Использовать Python скрипт
```bash
cd backend/web
pip install cairosvg pillow
python create_favicon_png.py
```

### Вариант 2: Использовать онлайн конвертер
1. Откройте https://convertio.co/ru/svg-png/
2. Загрузите `favicon.svg`
3. Установите размер 120x120 пикселей
4. Скачайте и сохраните как `favicon.png` в `backend/web/`

### Вариант 3: Использовать ImageMagick (если установлен)
```bash
cd backend/web
convert -background none -resize 120x120 favicon.svg favicon.png
```

После создания PNG файла все должно работать корректно с Яндекс Вебмастером.

