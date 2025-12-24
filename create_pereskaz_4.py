#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Скрипт для создания пересказа лекции 4 на основе извлеченного текста"""

import os
import glob

def find_lecture_file():
    """Находит файл с текстом лекции 4"""
    patterns = [
        'лекция_4_текст.txt',
        '*4*текст*.txt',
        '*лекция*4*.txt'
    ]
    
    for pattern in patterns:
        files = glob.glob(pattern)
        for f in files:
            if os.path.exists(f):
                return f
    return None

def read_file_with_encodings(filename):
    """Пытается прочитать файл с разными кодировками"""
    encodings = ['utf-8', 'cp1251', 'cp866', 'latin-1']
    
    for enc in encodings:
        try:
            with open(filename, 'r', encoding=enc, errors='ignore') as f:
                content = f.read()
                if len(content) > 100:  # Если файл не пустой
                    return content
        except:
            continue
    
    # Если не получилось, пробуем бинарный режим
    try:
        with open(filename, 'rb') as f:
            content = f.read()
            for enc in encodings:
                try:
                    text = content.decode(enc, errors='ignore')
                    if len(text) > 100:
                        return text
                except:
                    continue
    except:
        pass
    
    return None

if __name__ == "__main__":
    # Пытаемся найти файл
    file = find_lecture_file()
    if file:
        print(f"Найден файл: {file}")
        content = read_file_with_encodings(file)
        if content:
            print(f"Длина содержимого: {len(content)} символов")
            print("\nПервые 2000 символов:")
            print(content[:2000])
            print("\n" + "="*80)
            print("Последние 500 символов:")
            print(content[-500:])
        else:
            print("Не удалось прочитать файл")
    else:
        print("Файл с текстом лекции 4 не найден")
        print("Попытка извлечь текст из PPT...")
        
        # Пытаемся извлечь из PPT
        ppt_file = "Право_Лекция_4_Основы_конституционного_права.ppt"
        if os.path.exists(ppt_file):
            print(f"Найден PPT файл: {ppt_file}")
            print("Запустите extract_ppt_text.py для извлечения текста")
        else:
            print(f"PPT файл не найден: {ppt_file}")
