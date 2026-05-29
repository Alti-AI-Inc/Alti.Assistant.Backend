---
name: financial_ratios_analyzer
description: Computes critical valuation, profitability, leverage, and liquidity ratios from stock fundamentals, producing a structured investment assessment.
parameters:
  revenue:
    type: number
    description: "Total annual revenue in dollars (e.g. 150000000)"
    required: true
  net_income:
    type: number
    description: "Total annual net income in dollars (e.g. 25000000)"
    required: true
  total_assets:
    type: number
    description: "Total assets on balance sheet in dollars (e.g. 200000000)"
    required: true
  total_liabilities:
    type: number
    description: "Total liabilities on balance sheet in dollars (e.g. 80000000)"
    required: true
  operating_cash_flow:
    type: number
    description: "Cash flow from operations in dollars (e.g. 35000000)"
    required: true
  capex:
    type: number
    description: "Capital expenditures in dollars (e.g. 10000000)"
    required: true
  share_price:
    type: number
    description: "Current trading share price in dollars (e.g. 45.50)"
    required: true
  shares_outstanding:
    type: number
    description: "Total shares outstanding (e.g. 10000000)"
    required: true
script: financial_ratios_analyzer.py
---
