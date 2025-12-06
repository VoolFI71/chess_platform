#!/usr/bin/env python3
"""
Скрипт для создания favicon.png (120x120) из favicon.svg
Требует установки: pip install cairosvg pillow
"""

try:
    import cairosvg
    from PIL import Image
    import io
    
    # Конвертируем SVG в PNG
    print("Конвертируем favicon.svg в favicon.png (120x120)...")
    
    # Сначала конвертируем в высокое разрешение для лучшего качества
    png_data = cairosvg.svg2png(url='favicon.svg', output_width=240, output_height=240)
    
    # Открываем изображение
    img = Image.open(io.BytesIO(png_data))
    
    # Изменяем размер до 120x120
    img_resized = img.resize((120, 120), Image.Resampling.LANCZOS)
    
    # Сохраняем
    img_resized.save('favicon.png', 'PNG')
    
    print("✅ favicon.png успешно создан!")
    print("Размер: 120x120 пикселей")
    
except ImportError:
    print("Ошибка: требуется установить библиотеки:")
    print("pip install cairosvg pillow")
    print("\nИли используйте онлайн конвертер:")
    print("1. Откройте https://convertio.co/ru/svg-png/")
    print("2. Загрузите favicon.svg")
    print("3. Установите размер 120x120")
    print("4. Скачайте и сохраните как favicon.png в backend/web/")

