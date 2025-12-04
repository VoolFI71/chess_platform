import requests

URL = "https://www.ddxfitness.ru/local/components/custom/checkout/ajax.php"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, */*",
    "Accept-Language": "ru,en;q=0.9",
    "bx-ajax": "true",
    "Origin": "https://www.ddxfitness.ru",
    "Referer": "https://www.ddxfitness.ru/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
}

# Если у вас есть актуальные cookies из браузера, добавьте их сюда
COOKIES = {
    # "PHPSESSID": "ваш_актуальный_phpsessid",
    # "другие_cookies": "если_нужны"
}

PAYLOAD = {
    "sessid": "0ab3ad9777cd6e898214e8d8abe761c1",
    "action": "getPrice",
    "tariff": "241",
    "club": "449539",
    "promocode": "РИМ"
}
TOTAL_REQUESTS = 1

successful = 0
failed = 0

for i in range(1, TOTAL_REQUESTS + 1):
    try:
        response = requests.post(URL, json=PAYLOAD, headers=HEADERS, cookies=COOKIES, timeout=10)
        
        # Проверяем содержимое ответа
        print(f"Status Code: {response.status_code}")
        print(f"Response Text: {response.text}")
        print(f"Response Headers: {dict(response.headers)}")
        
        try:
            data = response.json()
            if data.get("error") == "Промокод не найден":
                failed += 1
                print(f"✗ Ошибка: {data.get('error')}")
            else:
                successful += 1
                print(f"✓ Успех! Ответ: {data}")
        except Exception as e:
            # Если не JSON или другая структура - тоже считаем ошибкой
            failed += 1
            print(f"✗ Ошибка парсинга JSON: {e}")
        
        if i % 100 == 0:
            print(f"{i}/{TOTAL_REQUESTS} | Успешно: {successful} | Ошибок: {failed}")
    except Exception:
        failed += 1

print(f"\nИтого: {successful} успешных, {failed} ошибок")

