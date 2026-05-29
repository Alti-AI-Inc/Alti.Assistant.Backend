---
name: portfolio_optimizer
description: Performs Markowitz Mean-Variance Portfolio Optimization, calculating Sharpe Ratio, Minimum Variance Weights, and saving asset allocations.
parameters:
  tickers:
    type: string
    description: "Comma-separated list of asset tickers (e.g. AAPL,MSFT,GOOG,AMZN)"
    required: true
  expected_returns:
    type: string
    description: "Comma-separated list of expected annual returns in percentages matching tickers (e.g. 15,12,18,14)"
    required: true
  volatilities:
    type: string
    description: "Comma-separated list of annual volatilities in percentages matching tickers (e.g. 22,18,25,20)"
    required: true
  risk_free_rate:
    type: number
    description: "Risk-free rate percentage (e.g. 4.5 for 4.5%)"
    required: true
script: portfolio_optimizer.py
---
