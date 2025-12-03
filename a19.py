import numpy as np
import matplotlib.pyplot as plt

class NonlinearSystem:
    def __init__(self):
        # Параметры системы
        self.a3 = 4.5
        self.a2 = 5.5
        self.a1 = 9
        self.a0 = 2.0
        self.b2 = 0
        self.b1 = 15
        self.b0 = 0
        self.A = 1.8
        self.B = 0.12  
        self.Tmod = 25
        self.h = 1e-2
        
    def saturation_nonlinearity(self, delta):
        """
        Нелинейность ограничения насыщения
        """
        if delta > self.B:
            return self.B
        elif delta < -self.B:
            return -self.B
        else:
            return delta
    
    def system_equations(self, t, x):
        """
        Система дифференциальных уравнений
        x = [x1, x2, x3]
        """
        x1, x2, x3 = x
        
        # Входное воздействие (единичный ступенчатый сигнал)
        if t >= 0:
            input_signal = self.A
        else:
            input_signal = 0
        
        # Рассчитываем Δ
        delta = input_signal - self.a0*x1 - self.a1*x2 - self.a2*x3
        
        # Применяем нелинейность насыщения
        f_delta = self.saturation_nonlinearity(delta) / self.a3
        
        # Система уравнений
        dx1dt = x2
        dx2dt = x3
        dx3dt = f_delta
        
        return [dx1dt, dx2dt, dx3dt]
    
    def output_equation(self, x):
        """
        Выходная величина системы
        """
        x1, x2, x3 = x
        y = self.b2*x3 + self.b1*x2 + self.b0*x1
        return y

def runge_kutta_2nd_order(system, t_span, y0, h):
    """
    Метод Рунге-Кутты 2-го порядка (L=1)
    """
    t0, tf = t_span
    n_steps = int((tf - t0) / h) + 1
    t_values = np.linspace(t0, tf, n_steps)
    y_values = np.zeros((n_steps, len(y0)))
    y_values[0] = y0
    
    for i in range(1, n_steps):
        t_prev = t_values[i-1]
        y_prev = y_values[i-1]
        
        # Коэффициенты метода Рунге-Кутты 2-го порядка
        k1 = np.array(system.system_equations(t_prev, y_prev))
        k2 = np.array(system.system_equations(t_prev + h, y_prev + h * k1))
        
        # Новая точка
        y_new = y_prev + (h / 2) * (k1 + k2)
        y_values[i] = y_new
    
    return t_values, y_values


def main():
    # Создаем объект системы
    system = NonlinearSystem()
    
    # Начальные условия
    y0 = [0, 0, 0]  # x1(0), x2(0), x3(0)
    t_span = [0, system.Tmod]  # Временной интервал
    
    print("Решение системы дифференциальных уравнений...")
    
    # Решение методом Рунге-Кутты 2-го порядка
    t_rk2, x_rk2 = runge_kutta_2nd_order(system, t_span, y0, system.h)
    
    # Вычисление выходной величины y
    y_rk2 = np.array([system.output_equation(x) for x in x_rk2])
    
    # Создание файла с результатами
    print("Создание файла с результатами...")
    with open('results.txt', 'w', encoding='utf-8') as f:
        f.write("Время\tx1\tx2\tx3\ty\n")
        f.write("----------------------------------------\n")
        for i in range(len(t_rk2)):
            f.write(f"{t_rk2[i]:.4f}\t{x_rk2[i,0]:.6f}\t{x_rk2[i,1]:.6f}\t"
                   f"{x_rk2[i,2]:.6f}\t{y_rk2[i]:.6f}\n")
    
    # Чтение данных из файла для построения графика
    print("Чтение данных из файла...")
    t_data = []
    y_data = []
    with open('results.txt', 'r', encoding='utf-8') as f:
        lines = f.readlines()[2:]  # пропускаем заголовок и разделитель
        for line in lines:
            parts = line.strip().split('\t')
            if len(parts) == 5:
                t_data.append(float(parts[0]))
                y_data.append(float(parts[4]))
    
    # Построение графика по данным из файла
    print("Построение графика...")
    
    plt.figure(figsize=(10, 6))
    plt.plot(t_data, y_data, 'b-', linewidth=2)
    plt.xlabel('Время, с')
    plt.ylabel('y(t)')
    plt.title('Выходная величина системы')
    plt.grid(True)
    plt.savefig('output_y.png', dpi=300, bbox_inches='tight')
    plt.show()
    
    # Вывод информации о системе
    print("\n" + "="*50)
    print("ПАРАМЕТРЫ СИСТЕМЫ:")
    print("="*50)
    print(f"a3 = {system.a3}")
    print(f"a2 = {system.a2}")
    print(f"a1 = {system.a1}")
    print(f"a0 = {system.a0}")
    print(f"b2 = {system.b2}")
    print(f"b1 = {system.b1}")
    print(f"b0 = {system.b0}")
    print(f"A = {system.A}")
    print(f"B = {system.B}")
    print(f"Tmod = {system.Tmod}")
    print(f"h = {system.h}")
    print("="*50)
    
    print(f"\nРезультаты сохранены в файлы:")
    print(f"- results.txt - таблица с данными")
    print(f"- output_y.png - график выходной величины")
    
    # Анализ установившегося значения
    steady_state_y = y_rk2[-100:].mean()  # среднее за последние 100 точек
    print(f"\nУстановившееся значение y(t): {steady_state_y:.6f}")

if __name__ == "__main__":
    main()