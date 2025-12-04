import numpy as np
import matplotlib.pyplot as plt
import pandas as pd

class NonlinearSystem:
    def __init__(self, T1, T2, k1, k2, k, B, Tmod, h):
        self.T1 = T1
        self.T2 = T2
        self.k1 = k1
        self.k2 = k2
        self.k = k
        self.B = B
        self.Tmod = Tmod
        self.h = h
        
    def dead_zone_nonlinearity(self, delta):
        # f(Δ) = -1 при Δ < -B, 0 при -B ≤ Δ ≤ B, 1 при Δ > B
        if delta < -self.B:
            return -1.0
        elif delta > self.B:
            return 1.0
        else:
            return 0.0
    
    def system_equations(self, t, x):
        x1, x2, x3 = x
        input_signal = 1.0 if t >= 0 else 0.0
        delta = self.k * (input_signal - x3)
        f_delta = self.dead_zone_nonlinearity(delta)
        
        dx1dt = (1.0 / self.T1) * (self.k1 * f_delta - x1)
        dx2dt = (1.0 / self.T2) * (self.k2 * x1 - x2)
        dx3dt = x2
        
        return [dx1dt, dx2dt, dx3dt]
    
    def output_y(self, x):
        return x[2]  # y = x₃

def runge_kutta_4th_order(system, t_span, initial_conditions, h):
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
        
        k1 = np.array(system.system_equations(t_current, x_current))
        k2 = np.array(system.system_equations(t_current + h/2, x_current + h*k1/2))
        k3 = np.array(system.system_equations(t_current + h/2, x_current + h*k2/2))
        k4 = np.array(system.system_equations(t_current + h, x_current + h*k3))
        
        x_new = x_current + (h / 6.0) * (k1 + 2*k2 + 2*k3 + k4)
        x_values[i] = x_new
        y_values[i] = system.output_y(x_new)
    
    return t_values, x_values, y_values

def save_to_file(t_values, x_values, y_values, filename="results.txt"):
    with open(filename, 'w', encoding='utf-8') as f:
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
    data = pd.read_csv(csv_filename)
    time = data['Time'].values
    y = data['y'].values
    
    plt.figure(figsize=(10, 6))
    plt.plot(time, y, 'b-', linewidth=2)
    plt.xlabel('Время, с')
    plt.ylabel('Выходная величина y')
    plt.title('Изменение выходной величины во времени')
    plt.grid(True)
    plt.tight_layout()
    plt.savefig('output_plot.png', dpi=300)
    plt.show()
    
    print(f"График сохранен в файл output_plot.png")



def main():
    T1 = 2.7
    T2 = 5.8
    k1 = 0.025
    k2 = 0.05
    k = 14.0
    B = 0.2
    Tmod = 5.0
    h = 10**-3
    
    print("Параметры системы (Вариант 9):")
    print(f"T₁ = {T1}, T₂ = {T2}, k₁ = {k1}, k₂ = {k2}, k = {k}, B = ±{B}")
    print(f"Tmod = {Tmod}, h = {h}, Метод: Рунге-Кутты 4-го порядка\n")
    
    system = NonlinearSystem(T1, T2, k1, k2, k, B, Tmod, h) 
    initial_conditions = [0, 0, 0]
    t_span = (0, Tmod)
    
    print("Решение системы дифференциальных уравнений...")
    t_values, x_values, y_values = runge_kutta_4th_order(system, t_span, initial_conditions, h)
    print("Решение завершено!\n")
    
    save_to_file(t_values, x_values, y_values)
    print(f"\nШагов интегрирования: {len(t_values)}")
    print(f"Временной диапазон: {t_values[0]:.2f} - {t_values[-1]:.2f} с")
    print(f"Конечное значение y: {y_values[-1]:.6f}\n")
    
    plot_results_from_file("results.csv")

if __name__ == "__main__":
    main()

