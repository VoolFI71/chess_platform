import random
import time
import matplotlib.pyplot as plt

def merge(left, right):
    result = []
    i = j = 0
    
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    
    while i < len(left):
        result.append(left[i])
        i += 1
    
    while j < len(right):
        result.append(right[j])
        j += 1
    
    return result

def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    
    return merge(left, right)

n = int(input("Введите размер массива (N): "))
arr = [random.randint(1, 1000) for _ in range(n)]
print(f"Исходный массив: {arr[:20]}...")

sorted_arr = merge_sort(arr)
print(f"Отсортированный массив: {sorted_arr[:20]}...")
print(f"Корректность: {sorted_arr == sorted(arr)}")

strings = ["Иван", "Анна", "Петр", "Мария", "Олег"]
sorted_strings = merge_sort(strings)
print(f"\nСтроки до сортировки: {strings}")
print(f"Строки после сортировки: {sorted_strings}")

sizes = [100, 500, 1000, 2000, 5000, 10000, 20000, 50000]
times = []

for size in sizes:
    arr = [random.randint(1, 1000) for _ in range(size)]
    start_time = time.time()
    merge_sort(arr)
    end_time = time.time()
    times.append(end_time - start_time)
    print(f"Размер: {size}, Время: {end_time - start_time:.6f} сек")

plt.plot(sizes, times, marker='o')
plt.xlabel('Размер массива (N)')
plt.ylabel('Время выполнения (секунды)')
plt.title('Зависимость времени выполнения Merge Sort от размера массива')
plt.grid(True)
plt.savefig('merge_sort_performance.png')
plt.show()
