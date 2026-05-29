---
name: data_analyzer
description: Performs statistical analysis on workspace data files (CSV/JSON), generating beautiful markdown summaries of columns, counts, averages, and distributions.
parameters:
  filepath:
    type: string
    description: "Relative path to the CSV or JSON file in the workspace (e.g. data.csv)"
    required: true
script: data_analyzer.py
---
