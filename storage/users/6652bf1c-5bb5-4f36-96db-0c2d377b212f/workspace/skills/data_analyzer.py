import sys
import os
import json
import csv

def main():
    filepath = ""
    for i, arg in enumerate(sys.argv):
        if arg == "--filepath" and i + 1 < len(sys.argv):
            filepath = sys.argv[i + 1]

    if not filepath:
        print("Error: No filepath provided.")
        sys.exit(1)

    if not os.path.exists(filepath):
        print(f"Error: File not found at path: {filepath}")
        sys.exit(1)

    print(f"### Alti Sandboxed Data Analysis: `{filepath}`\n")
    
    data = []
    if filepath.endswith('.json'):
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
            if not isinstance(data, list):
                data = [data]
        except Exception as e:
            print(f"Failed to parse JSON file: {str(e)}")
            sys.exit(1)
    else:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                data = list(reader)
        except Exception as e:
            print(f"Failed to parse CSV file: {str(e)}")
            sys.exit(1)

    if not data:
        print("Dataset is empty.")
        sys.exit(0)

    row_count = len(data)
    columns = list(data[0].keys())
    print(f"* **Total Rows**: {row_count}")
    print(f"* **Detected Attributes/Columns**: {', '.join(columns)}\n")

    print("| Attribute | Numeric Stats (Mean/Min/Max) | Sample Values |")
    print("|---|---|---|")
    
    for col in columns:
        vals = []
        num_vals = []
        for r in data:
            v = r.get(col)
            if v is not None:
                vals.append(str(v))
                try:
                    num_vals.append(float(v))
                except ValueError:
                    pass
        
        sample = ", ".join(vals[:3])
        if num_vals:
            avg_val = sum(num_vals) / len(num_vals)
            min_val = min(num_vals)
            max_val = max(num_vals)
            stats = f"Mean: {avg_val:.2f}, Range: [{min_val:.2f} to {max_val:.2f}]"
        else:
            stats = "Text / Categorical"
            
        print(f"| **{col}** | {stats} | {sample} |")

if __name__ == "__main__":
    main()
