---
name: chart_generator
description: Generates high-fidelity visual plots and data charts (bar charts, line plots, scatter plots) from data series and saves them to the workspace.
parameters:
  title:
    type: string
    description: "The chart title"
    required: true
  x_label:
    type: string
    description: "Label for the X axis"
    required: true
  y_label:
    type: string
    description: "Label for the Y axis"
    required: true
  x_data:
    type: string
    description: "Comma-separated list of X data elements (e.g. Q1,Q2,Q3,Q4)"
    required: true
  y_data:
    type: string
    description: "Comma-separated list of numeric Y data values (e.g. 150,220,180,310)"
    required: true
script: chart_generator.py
---
