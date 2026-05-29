---
name: black_scholes_calculator
description: Calculates Black-Scholes European Option Pricing (Call/Put), Implied Volatility, and Option Greeks (Delta, Gamma, Theta, Vega, Rho).
parameters:
  stock_price:
    type: number
    description: "Current trading price of the stock (S)"
    required: true
  strike_price:
    type: number
    description: "Option strike price (K)"
    required: true
  time_to_maturity:
    type: number
    description: "Time to expiration in years or decimal fraction (T, e.g. 0.25 for 3 months)"
    required: true
  risk_free_rate:
    type: number
    description: "Annual risk-free interest rate as a decimal (r, e.g. 0.045 for 4.5%)"
    required: true
  volatility:
    type: number
    description: "Implied volatility as a decimal (sigma, e.g. 0.25 for 25%)"
    required: true
  option_type:
    type: string
    description: "Option type: 'call' or 'put'"
    required: true
script: black_scholes_calculator.py
---
