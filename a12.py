import numpy as np
import matplotlib.pyplot as plt
import pandas as pd

class NonlinearSystem:
    def __init__(self, T1, T2, k1, k2, k, B, Tmod, h):
        self.T1 = T1
        self.T2 = T2
        self.k1 = k1
        self.k2 = k2
        self.k = k  # Коэффициент для расчета Δ 
        self.B = B
        self.Tmod = Tmod
        self.h = h
        
    def saturation_nonlinearity(self, delta):
        """
        Нелинейность насыщения f(Δ):
        - Если -B ≤ Δ ≤ B: f(Δ) = Δ (линейная часть)
        - Если Δ > B: f(Δ) = B (насыщение сверху)
        - Если Δ < -B: f(Δ) = -B (насыщение снизу)
        """
        if delta > self.B:
            return self.B
        elif delta < -self.B:
            return -self.B
        return delta
    
    def system_equations(self, t, x):
        x1, x2, x3 = x
        # Входной сигнал 1(t) - единичная функция Хевисайда
        input_signal = 1.0 if t >= 0 else 0.0
        
        # Вычисление Δ (delta) - для системы уравнений 3
        # Δ = k(x₁ - x₃)
        delta = self.k * (x1 - x3)
        
        f_delta = self.saturation_nonlinearity(delta)
        
        # Система уравнений 3:
        # ẋ₁ = (1/T₁) * (k₁ * 1(t) - x₁)
        # ẋ₂ = (1/T₂) * (k₂ * f(Δ) - x₂)
        # ẋ₃ = x₂
        dx1dt = (1.0 / self.T1) * (self.k1 * input_signal - x1)
        dx2dt = (1.0 / self.T2) * (self.k2 * f_delta - x2)
        dx3dt = x2
        
        return [dx1dt, dx2dt, dx3dt]
    
    def output_y(self, x):
        x1, x2, x3 = x
        # Для системы уравнений 3: y = x₃
        return x3

def runge_kutta_2nd_order(system, t_span, initial_conditions, h):
    """
    Метод Рунге-Кутты 2-го порядка 
    """
    t0, tf = t_span
    n_steps = int((tf - t0) / h) + 1
    t_values = np.linspace(t0, tf, n_steps)
    
    x_values = np.zeros((n_steps, 3))
    x_values[0] = initial_conditions
    y_values = np.zeros(n_steps)
    y_values[0] = system.output_y(initial_conditions)
    
    for i in range(1, n_steps):
        x_current = x_values[i-1]
        t_current = t_values[i-1]
        
        # Метод Рунге-Кутты 2-го порядка
        k1 = np.array(system.system_equations(t_current, x_current))
        k2 = np.array(system.system_equations(t_current + h, x_current + h * k1))
        
        x_new = x_current + (h / 2.0) * (k1 + k2)
        x_values[i] = x_new
        y_values[i] = system.output_y(x_new)
    
    return t_values, x_values, y_values

def save_to_file(t_values, x_values, y_values, filename="results.txt"):
    with open(filename, 'w') as f:
        f.write("Время\tx1\tx2\tx3\ty\n")
        for i in range(len(t_values)):
            f.write(f"{t_values[i]:.6f}\t{x_values[i,0]:.6f}\t{x_values[i,1]:.6f}\t{x_values[i,2]:.6f}\t{y_values[i]:.6f}\n")
    
    df = pd.DataFrame({
        'Time': t_values,
        'x1': x_values[:,0],
        'x2': x_values[:,1],
        'x3': x_values[:,2],
        'y': y_values
    })
    df.to_csv('results.csv', index=False)
    print(f"Результаты сохранены в файлы: {filename} и results.csv")

def plot_results_from_file(csv_filename="results.csv"):
    """
    Строит график изменения выходной величины во времени
    на основании данных, записанных в файле
    """
    # Читаем данные из CSV файла
    data = pd.read_csv(csv_filename)
    
    time = data['Time'].values
    y = data['y'].values
    
    # Строим график изменения выходной величины во времени
    plt.figure(figsize=(10, 6))
    plt.plot(time, y, 'b-', linewidth=2)
    plt.xlabel('Время')
    plt.ylabel('Выходная величина y')
    plt.title('Изменение выходной величины во времени')
    plt.grid(True)
    plt.tight_layout()
    plt.savefig('output_plot.png', dpi=300)
    plt.show()
    
    print(f"График построен на основе данных из файла {csv_filename}")



def main():
    # Вариант 12: система "в", система уравнений 3
    # Параметры: 19, ±26, 9.5, 1.7, 0.0012, 0.016, –, 0.8, 10-4
    T1 = 19.0
    T2 = 9.5
    k1 = 0.0012  # Из параметров варианта 12
    k2 = 1.7
    k = 0.016  # Коэффициент для расчета Δ = k(x₁ - x₃)
    B = 26.0  # ±26 означает симметричное ограничение
    Tmod = 0.8
    h = 10**-4
    
    print("Параметры системы (Вариант 12):")
    print(f"T₁ = {T1}")
    print(f"T₂ = {T2}")
    print(f"k₁ = {k1}")
    print(f"k₂ = {k2}")
    print(f"k = {k} (коэффициент для Δ = k(x₁ - x₃))")
    print(f"B = ±{B}")
    print(f"Tmod = {Tmod}")
    print(f"h = {h}")
    
    system = NonlinearSystem(T1, T2, k1, k2, k, B, Tmod, h) 
    initial_conditions = [0, 0, 0]
    t_span = (0, Tmod)
    
    print("\nРешение системы дифференциальных уравнений методом Рунге-Кутты 2-го порядка...")
    t_values, x_values, y_values = runge_kutta_2nd_order(system, t_span, initial_conditions, h)
    print("Решение завершено!")
    
    save_to_file(t_values, x_values, y_values)
    print(f"\nКоличество шагов интегрирования: {len(t_values)}")
    print(f"Временной диапазон: {t_values[0]:.6f} - {t_values[-1]:.6f}")
    print(f"Конечное значение y: {y_values[-1]:.6f}")
    
    print("\nПостроение графика изменения выходной величины во времени...")
    print("(на основе данных из файла results.csv)")
    plot_results_from_file("results.csv")

if __name__ == "__main__":
    main()
