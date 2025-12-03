import numpy as np
import matplotlib.pyplot as plt
import pandas as pd

class NonlinearSystem:
    def __init__(self, a3, a2, a1, a0, b2, b1, b0, A, B, Tmod, h):
        self.a3 = a3
        self.a2 = a2
        self.a1 = a1
        self.a0 = a0
        self.b2 = b2
        self.b1 = b1
        self.b0 = b0
        self.A = A
        self.B = B
        self.Tmod = Tmod
        self.h = h
        
    def saturation_nonlinearity(self, delta):
        # ограничение насыщения
        if delta > self.B:
            return self.B
        elif delta < -self.B:
            return -self.B
        return delta
    
    def system_equations(self, t, x):
        x1, x2, x3 = x
        input_signal = self.A if t >= 0 else 0
        delta = (1 / self.a3) * (input_signal - self.a0*x1 - self.a1*x2 - self.a2*x3)
        f_delta = self.saturation_nonlinearity(delta)
        
        dx1dt = x2
        dx2dt = x3
        dx3dt = f_delta
        
        return [dx1dt, dx2dt, dx3dt]
    
    def output_y(self, x):
        x1, x2, x3 = x
        return self.b2*x3 + self.b1*x2 + self.b0*x1

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
        
        x_new = x_current + (h/6) * (k1 + 2*k2 + 2*k3 + k4)
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
    a3 = 5.5
    a2 = 4.5
    a1 = 7.5
    a0 = 1.6
    b2 = 6
    b1 = 1.4
    b0 = 16
    A = 2.5
    B = 0.15
    Tmod = 25
    h = 10**-2
    
    print("Параметры системы:")
    print(f"a3 = {a3}, a2 = {a2}, a1 = {a1}, a0 = {a0}")
    print(f"b2 = {b2}, b1 = {b1}, b0 = {b0}")
    print(f"A = {A}, B = {B}, Tmod = {Tmod}, h = {h}")
    
    system = NonlinearSystem(a3, a2, a1, a0, b2, b1, b0, A, B, Tmod, h) 
    initial_conditions = [0, 0, 0]
    t_span = (0, Tmod)
    
    print("\nРешение системы дифференциальных уравнений...")
    t_values, x_values, y_values = runge_kutta_4th_order(system, t_span, initial_conditions, h)
    print("Решение завершено!")
    
    save_to_file(t_values, x_values, y_values)
    print(f"\nКоличество шагов интегрирования: {len(t_values)}")
    print(f"Временной диапазон: {t_values[0]:.2f} - {t_values[-1]:.2f}")
    print(f"Конечное значение y: {y_values[-1]:.6f}")
    
    print("\nПостроение графика изменения выходной величины во времени...")
    print("(на основе данных из файла results.csv)")
    plot_results_from_file("results.csv")

if __name__ == "__main__":
    main()
