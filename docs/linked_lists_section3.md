# 3. АЛГОРИТМЫ И ОПЕРАЦИИ НАД СВЯЗНЫМИ СПИСКАМИ

Связные списки представляют собой фундаментальную структуру данных, эффективность работы с которой напрямую зависит от правильной реализации базовых и сложных алгоритмов. В данном разделе рассматриваются основные операции над связными списками, начиная с простейших операций обхода и модификации, и заканчивая сложными алгоритмами, такими как обнаружение циклов и сортировка.

## 3.1. Базовые операции

Базовые операции являются основой для работы со связными списками. К ним относятся операции обхода, вставки, удаления и поиска элементов. Каждая из этих операций имеет свои особенности реализации в зависимости от типа связного списка (односвязный, двусвязный, кольцевой).

### 3.1.1. Обход списка (Traversal)

Обход связного списка — это процесс последовательного посещения каждого узла списка, начиная с головного элемента. Данная операция является основой для многих других алгоритмов, таких как поиск, подсчет элементов и вывод содержимого списка.

В односвязном списке обход осуществляется путем последовательного перехода от текущего узла к следующему через указатель `next`. Алгоритм обхода можно представить следующим образом:

```python
def traverse(head):
    """Обход односвязного списка"""
    current = head
    while current is not None:
        # Обработка текущего узла
        print(current.data)
        current = current.next
```

Временная сложность операции обхода составляет O(n), где n — количество элементов в списке, так как необходимо посетить каждый узел ровно один раз. Пространственная сложность равна O(1), поскольку используется только одна дополнительная переменная для хранения текущего узла.

Для двусвязного списка обход может осуществляться как в прямом, так и в обратном направлении:

```python
def traverse_forward(head):
    """Обход двусвязного списка в прямом направлении"""
    current = head
    while current is not None:
        print(current.data)
        current = current.next

def traverse_backward(tail):
    """Обход двусвязного списка в обратном направлении"""
    current = tail
    while current is not None:
        print(current.data)
        current = current.prev
```

В кольцевом связном списке обход требует особой осторожности, чтобы избежать бесконечного цикла. Необходимо использовать условие остановки, например, сравнение текущего узла с начальным:

```python
def traverse_circular(head):
    """Обход кольцевого связного списка"""
    if head is None:
        return
    
    current = head
    while True:
        print(current.data)
        current = current.next
        if current == head:
            break
```

### 3.1.2. Вставка элемента

Операция вставки элемента в связный список может выполняться в различных позициях: в начало списка, в конец, после определенного узла или в произвольную позицию. Каждый вариант имеет свои особенности реализации.

**Вставка в начало списка** является одной из наиболее эффективных операций для связного списка, так как не требует обхода всего списка:

```python
def insert_at_beginning(head, data):
    """Вставка элемента в начало односвязного списка"""
    new_node = Node(data)
    new_node.next = head
    head = new_node
    return head
```

Временная сложность данной операции составляет O(1), так как выполняется фиксированное количество операций независимо от размера списка.

**Вставка в конец списка** требует обхода всего списка до последнего элемента:

```python
def insert_at_end(head, data):
    """Вставка элемента в конец односвязного списка"""
    new_node = Node(data)
    
    if head is None:
        head = new_node
        return head
    
    current = head
    while current.next is not None:
        current = current.next
    
    current.next = new_node
    return head
```

Временная сложность вставки в конец составляет O(n), где n — количество элементов в списке. Однако, если поддерживать указатель на последний элемент (tail), сложность можно снизить до O(1).

**Вставка после определенного узла** выполняется следующим образом:

```python
def insert_after(prev_node, data):
    """Вставка элемента после указанного узла"""
    if prev_node is None:
        return
    
    new_node = Node(data)
    new_node.next = prev_node.next
    prev_node.next = new_node
```

Временная сложность этой операции составляет O(1), если указатель на предыдущий узел уже известен. Если же необходимо сначала найти узел, сложность возрастает до O(n).

Для двусвязного списка вставка требует обновления как указателя `next`, так и указателя `prev`:

```python
def insert_after_doubly(prev_node, data):
    """Вставка элемента в двусвязный список"""
    if prev_node is None:
        return
    
    new_node = Node(data)
    new_node.next = prev_node.next
    new_node.prev = prev_node
    
    if prev_node.next is not None:
        prev_node.next.prev = new_node
    
    prev_node.next = new_node
```

### 3.1.3. Удаление элемента

Операция удаления элемента из связного списка также может выполняться в различных позициях. Основная сложность заключается в правильном обновлении связей между узлами.

**Удаление узла по значению** требует сначала найти узел, а затем удалить его:

```python
def delete_node_by_value(head, key):
    """Удаление узла по значению в односвязном списке"""
    # Если удаляемый узел — головной
    if head is not None and head.data == key:
        head = head.next
        return head
    
    # Поиск узла для удаления
    current = head
    while current is not None and current.next is not None:
        if current.next.data == key:
            current.next = current.next.next
            return head
        current = current.next
    
    return head
```

Временная сложность удаления по значению составляет O(n) в худшем случае, так как может потребоваться обход всего списка.

**Удаление узла по указателю** более эффективно, если указатель на удаляемый узел уже известен. Однако в односвязном списке для удаления узла необходимо иметь указатель на предыдущий узел:

```python
def delete_node_by_pointer(head, node_to_delete):
    """Удаление узла по указателю в односвязном списке"""
    if head == node_to_delete:
        head = head.next
        return head
    
    current = head
    while current is not None and current.next != node_to_delete:
        current = current.next
    
    if current is not None:
        current.next = current.next.next
    
    return head
```

В двусвязном списке удаление узла по указателю выполняется более эффективно, так как у каждого узла есть указатель на предыдущий элемент:

```python
def delete_node_doubly(node_to_delete):
    """Удаление узла в двусвязном списке"""
    if node_to_delete is None:
        return
    
    # Обновление указателя следующего узла
    if node_to_delete.next is not None:
        node_to_delete.next.prev = node_to_delete.prev
    
    # Обновление указателя предыдущего узла
    if node_to_delete.prev is not None:
        node_to_delete.prev.next = node_to_delete.next
```

Временная сложность удаления в двусвязном списке составляет O(1), если указатель на удаляемый узел известен, что является значительным преимуществом по сравнению с односвязным списком.

### 3.1.4. Поиск элемента

Операция поиска элемента в связном списке заключается в последовательном обходе узлов и сравнении их значений с искомым значением.

**Линейный поиск** является основным методом поиска в связном списке:

```python
def search(head, key):
    """Поиск элемента в односвязном списке"""
    current = head
    position = 0
    
    while current is not None:
        if current.data == key:
            return position
        current = current.next
        position += 1
    
    return -1  # Элемент не найден
```

Временная сложность линейного поиска составляет O(n) в худшем случае, когда искомый элемент находится в конце списка или отсутствует. В среднем случае сложность также равна O(n), так как в среднем необходимо проверить n/2 элементов.

Для двусвязного списка поиск может осуществляться в обоих направлениях, что может быть полезно, если известно, что элемент находится ближе к концу списка:

```python
def search_doubly(head, tail, key):
    """Поиск элемента в двусвязном списке с двух сторон"""
    current_from_start = head
    current_from_end = tail
    
    while current_from_start != current_from_end:
        if current_from_start.data == key:
            return current_from_start
        if current_from_end.data == key:
            return current_from_end
        
        current_from_start = current_from_start.next
        current_from_end = current_from_end.prev
    
    return None
```

Хотя такой подход не улучшает асимптотическую сложность, он может быть эффективнее на практике, если искомый элемент находится ближе к концу списка.

## 3.2. Сложные алгоритмы

Помимо базовых операций, существуют более сложные алгоритмы, которые решают специфические задачи при работе со связными списками. К таким алгоритмам относятся реверс списка, обнаружение циклов, объединение и разделение списков, а также сортировка.

### 3.2.1. Реверс связного списка

Реверс связного списка — это операция изменения порядка элементов списка на противоположный. Данная операция имеет несколько вариантов реализации, различающихся по сложности и использованию дополнительной памяти.

**Итеративный подход** к реверсу односвязного списка:

```python
def reverse_iterative(head):
    """Итеративный реверс односвязного списка"""
    prev = None
    current = head
    
    while current is not None:
        next_node = current.next  # Сохраняем следующий узел
        current.next = prev       # Меняем направление связи
        prev = current            # Перемещаем prev вперед
        current = next_node       # Перемещаем current вперед
    
    return prev  # prev теперь указывает на новую голову
```

Временная сложность итеративного реверса составляет O(n), где n — количество элементов в списке. Пространственная сложность равна O(1), так как используется только фиксированное количество дополнительных переменных.

**Рекурсивный подход** к реверсу списка:

```python
def reverse_recursive(head):
    """Рекурсивный реверс односвязного списка"""
    if head is None or head.next is None:
        return head
    
    # Рекурсивно реверсим остальную часть списка
    rest = reverse_recursive(head.next)
    
    # Меняем связи
    head.next.next = head
    head.next = None
    
    return rest
```

Временная сложность рекурсивного подхода также составляет O(n), однако пространственная сложность равна O(n) из-за использования стека вызовов рекурсии.

Для двусвязного списка реверс требует обновления как указателей `next`, так и `prev`:

```python
def reverse_doubly(head):
    """Реверс двусвязного списка"""
    current = head
    temp = None
    
    # Меняем местами next и prev для всех узлов
    while current is not None:
        temp = current.prev
        current.prev = current.next
        current.next = temp
        current = current.prev
    
    # Обновляем голову
    if temp is not None:
        head = temp.prev
    
    return head
```

### 3.2.2. Обнаружение цикла в списке (Floyd's Cycle Detection)

Обнаружение цикла в связном списке — важная задача, которая может возникнуть при работе с кольцевыми списками или при обнаружении ошибок в структуре данных. Алгоритм Флойда (также известный как алгоритм "черепахи и зайца") является наиболее эффективным решением данной задачи.

**Алгоритм Флойда** использует два указателя, движущихся с разной скоростью:

```python
def has_cycle(head):
    """Обнаружение цикла в списке с помощью алгоритма Флойда"""
    if head is None or head.next is None:
        return False
    
    slow = head      # Медленный указатель (черепаха)
    fast = head.next # Быстрый указатель (заяц)
    
    while fast is not None and fast.next is not None:
        if slow == fast:
            return True  # Обнаружен цикл
        
        slow = slow.next      # Движется на 1 шаг
        fast = fast.next.next # Движется на 2 шага
    
    return False  # Цикл не обнаружен
```

Принцип работы алгоритма основан на том, что если в списке существует цикл, то быстрый указатель рано или поздно догонит медленный. Если цикла нет, быстрый указатель достигнет конца списка.

Временная сложность алгоритма Флойда составляет O(n), где n — количество узлов в списке. Пространственная сложность равна O(1), что делает данный алгоритм очень эффективным.

**Определение точки входа в цикл** также может быть выполнено с использованием алгоритма Флойда:

```python
def find_cycle_start(head):
    """Нахождение точки входа в цикл"""
    if head is None or head.next is None:
        return None
    
    # Первый этап: обнаружение цикла
    slow = head
    fast = head
    
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
        
        if slow == fast:
            break
    
    if slow != fast:
        return None  # Цикл не обнаружен
    
    # Второй этап: нахождение точки входа
    slow = head
    while slow != fast:
        slow = slow.next
        fast = fast.next
    
    return slow
```

### 3.2.3. Объединение и разделение списков

Операции объединения и разделения связных списков часто используются при работе с большими объемами данных и при реализации различных алгоритмов сортировки.

**Объединение двух отсортированных списков** является важной операцией, используемой в алгоритме сортировки слиянием:

```python
def merge_sorted_lists(list1, list2):
    """Объединение двух отсортированных односвязных списков"""
    # Создаем фиктивный узел для упрощения кода
    dummy = Node(0)
    current = dummy
    
    while list1 is not None and list2 is not None:
        if list1.data <= list2.data:
            current.next = list1
            list1 = list1.next
        else:
            current.next = list2
            list2 = list2.next
        current = current.next
    
    # Добавляем оставшиеся элементы
    if list1 is not None:
        current.next = list1
    if list2 is not None:
        current.next = list2
    
    return dummy.next
```

Временная сложность объединения двух отсортированных списков составляет O(n + m), где n и m — размеры объединяемых списков.

**Разделение списка** может выполняться по различным критериям, например, по значению (разделение на элементы меньше и больше определенного значения):

```python
def partition_list(head, x):
    """Разделение списка на элементы меньше и больше x"""
    before_head = Node(0)
    after_head = Node(0)
    
    before = before_head
    after = after_head
    
    current = head
    
    while current is not None:
        if current.data < x:
            before.next = current
            before = before.next
        else:
            after.next = current
            after = after.next
        
        current = current.next
    
    after.next = None
    before.next = after_head.next
    
    return before_head.next
```

Временная сложность разделения списка составляет O(n), где n — количество элементов в списке.

### 3.2.4. Сортировка связного списка

Сортировка связного списка представляет собой более сложную задачу по сравнению с сортировкой массивов, так как отсутствует возможность прямого доступа к элементам по индексу. Наиболее эффективными алгоритмами сортировки для связных списков являются сортировка слиянием и быстрая сортировка.

**Сортировка слиянием (Merge Sort)** является предпочтительным алгоритмом для связных списков, так как не требует дополнительной памяти для перемещения элементов:

```python
def merge_sort(head):
    """Сортировка односвязного списка методом слияния"""
    if head is None or head.next is None:
        return head
    
    # Разделение списка на две части
    middle = get_middle(head)
    next_to_middle = middle.next
    middle.next = None
    
    # Рекурсивная сортировка обеих частей
    left = merge_sort(head)
    right = merge_sort(next_to_middle)
    
    # Объединение отсортированных частей
    sorted_list = merge_sorted_lists(left, right)
    
    return sorted_list

def get_middle(head):
    """Нахождение середины списка с помощью двух указателей"""
    if head is None:
        return head
    
    slow = head
    fast = head
    
    while fast.next is not None and fast.next.next is not None:
        slow = slow.next
        fast = fast.next.next
    
    return slow
```

Временная сложность сортировки слиянием составляет O(n log n), а пространственная сложность равна O(log n) из-за рекурсивных вызовов.

**Быстрая сортировка (Quick Sort)** также может быть адаптирована для связных списков:

```python
def quick_sort(head, tail):
    """Быстрая сортировка связного списка"""
    if head is None or head == tail or head.next == tail:
        return head
    
    # Разделение списка
    pivot = partition(head, tail)
    
    # Рекурсивная сортировка частей
    if pivot != head:
        # Сортировка левой части
        current = head
        while current.next != pivot:
            current = current.next
        current.next = None
        head = quick_sort(head, current)
        current = get_tail(head)
        current.next = pivot
    
    # Сортировка правой части
    pivot.next = quick_sort(pivot.next, tail)
    
    return head

def partition(head, tail):
    """Разделение списка относительно последнего элемента"""
    pivot = tail
    prev = None
    current = head
    
    while current != pivot:
        if current.data <= pivot.data:
            if prev is None:
                head = current
            else:
                prev.next = current
            prev = current
        current = current.next
    
    if prev is None:
        head = pivot
    else:
        prev.next = pivot
    
    pivot.next = None
    return pivot
```

Временная сложность быстрой сортировки в среднем случае составляет O(n log n), однако в худшем случае может достигать O(n²). Пространственная сложность равна O(log n) в среднем случае.

## Заключение раздела

Рассмотренные алгоритмы и операции над связными списками демонстрируют широкий спектр возможностей данной структуры данных. Базовые операции обеспечивают фундамент для работы со списками, в то время как сложные алгоритмы решают специфические задачи эффективно. Выбор конкретного алгоритма зависит от требований к производительности, доступной памяти и особенностей решаемой задачи.
