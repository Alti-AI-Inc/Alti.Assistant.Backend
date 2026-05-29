import sys
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def main():
    title = "Chart"
    x_label = "X"
    y_label = "Y"
    x_data = []
    y_data = []

    for i, arg in enumerate(sys.argv):
        if arg == "--title" and i + 1 < len(sys.argv):
            title = sys.argv[i + 1]
        elif arg == "--x_label" and i + 1 < len(sys.argv):
            x_label = sys.argv[i + 1]
        elif arg == "--y_label" and i + 1 < len(sys.argv):
            y_label = sys.argv[i + 1]
        elif arg == "--x_data" and i + 1 < len(sys.argv):
            x_data = sys.argv[i + 1].split(',')
        elif arg == "--y_data" and i + 1 < len(sys.argv):
            y_data = [float(x) for x in sys.argv[i + 1].split(',')]

    if not x_data or not y_data:
        print("Error: Missing required data series.")
        sys.exit(1)

    plt.figure(figsize=(8, 5))
    plt.bar(x_data, y_data, color='#3b82f6', edgecolor='#1d4ed8')
    plt.title(title, fontsize=14, fontweight='bold', pad=15)
    plt.xlabel(x_label, fontsize=11, labelpad=10)
    plt.ylabel(y_label, fontsize=11, labelpad=10)
    plt.grid(axis='y', linestyle='--', alpha=0.5)
    plt.tight_layout()

    output_path = "output_chart.png"
    plt.savefig(output_path, dpi=150)
    plt.close()

    print(f"### [SUCCESS] Sandboxed Chart Generation Complete\n")
    print(f"* **Saved To**: `{output_path}`")
    print(f"* **Dimensions**: 1200 x 750 pixels")
    print(f"* **Data Points Plotted**: {len(x_data)}")

if __name__ == "__main__":
    main()
