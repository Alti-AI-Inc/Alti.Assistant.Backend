import sys

def main():
    revenue = 0.0
    net_income = 0.0
    total_assets = 0.0
    total_liabilities = 0.0
    operating_cash_flow = 0.0
    capex = 0.0
    share_price = 0.0
    shares_outstanding = 0.0

    for i, arg in enumerate(sys.argv):
        if arg == "--revenue" and i + 1 < len(sys.argv):
            revenue = float(sys.argv[i + 1])
        elif arg == "--net_income" and i + 1 < len(sys.argv):
            net_income = float(sys.argv[i + 1])
        elif arg == "--total_assets" and i + 1 < len(sys.argv):
            total_assets = float(sys.argv[i + 1])
        elif arg == "--total_liabilities" and i + 1 < len(sys.argv):
            total_liabilities = float(sys.argv[i + 1])
        elif arg == "--operating_cash_flow" and i + 1 < len(sys.argv):
            operating_cash_flow = float(sys.argv[i + 1])
        elif arg == "--capex" and i + 1 < len(sys.argv):
            capex = float(sys.argv[i + 1])
        elif arg == "--share_price" and i + 1 < len(sys.argv):
            share_price = float(sys.argv[i + 1])
        elif arg == "--shares_outstanding" and i + 1 < len(sys.argv):
            shares_outstanding = float(sys.argv[i + 1])

    if any(v == 0.0 for v in [revenue, total_assets, share_price, shares_outstanding]):
        print("Error: Missing or invalid essential inputs (revenue, assets, share_price, shares_outstanding cannot be zero).")
        sys.exit(1)

    equity = total_assets - total_liabilities
    market_cap = share_price * shares_outstanding
    fcf = operating_cash_flow - capex

    profit_margin = (net_income / revenue) * 100
    roa = (net_income / total_assets) * 100
    roe = (net_income / equity) * 100 if equity != 0 else 0
    pe_ratio = market_cap / net_income if net_income != 0 else float('inf')
    pb_ratio = market_cap / equity if equity != 0 else float('inf')
    fcf_yield = (fcf / market_cap) * 100 if market_cap != 0 else 0
    debt_to_equity = total_liabilities / equity if equity != 0 else float('inf')
    equity_ratio = (equity / total_assets) * 100

    print("### 📊 Alti Fundamentals & Valuation Audit Report\n")
    print(f"* **Market Capitalization**: ${market_cap:,.2f}")
    print(f"* **Shareholder's Equity (Book Value)**: ${equity:,.2f}")
    print(f"* **Free Cash Flow (FCF)**: ${fcf:,.2f}\n")

    print("| Category | Metric / Ratio | Calculated Value | Swarm Consensus Assessment |")
    print("|---|---|---|---|")
    print(f"| Profitability | **Net Profit Margin** | {profit_margin:.2f}% | {'🟢 Excellent' if profit_margin >= 15 else '🟡 Moderate' if profit_margin >= 5 else '🔴 Thin Margin'} |")
    print(f"| Profitability | **Return on Assets (ROA)** | {roa:.2f}% | {'🟢 Efficient' if roa >= 10 else '🟡 Average' if roa >= 4 else '🔴 Inefficient'} |")
    print(f"| Profitability | **Return on Equity (ROE)** | {roe:.2f}% | {'🟢 Superior' if roe >= 15 else '🟡 Acceptable' if roe >= 8 else '🔴 Underperforming'} |")
    print(f"| Valuation | **Price-to-Earnings (P/E)** | {pe_ratio:.2f}x | {'🟢 Value / Underpriced' if pe_ratio < 15 and pe_ratio > 0 else '🟡 Fairly Valued' if pe_ratio <= 28 else '🔴 Premium Growth / Overvalued'} |")
    print(f"| Valuation | **Price-to-Book (P/B)** | {pb_ratio:.2f}x | {'🟢 Assets Underpriced' if pb_ratio < 1.5 else '🟡 Fairly Priced' if pb_ratio <= 4.0 else '🔴 Asset Light / Premium'} |")
    print(f"| Valuation | **Free Cash Flow Yield** | {fcf_yield:.2f}% | {'🟢 Excellent Cash Generator' if fcf_yield >= 8 else '🟡 Healthy' if fcf_yield >= 4 else '🔴 Cash Constrained'} |")
    print(f"| Solvency | **Debt-to-Equity** | {debt_to_equity:.2f}x | {'🟢 Strong Balance Sheet' if debt_to_equity < 1.0 else '🟡 Balanced' if debt_to_equity <= 2.0 else '🔴 High Leverage Warning'} |")
    print(f"| Liquidity | **Equity / Asset Ratio** | {equity_ratio:.2f}% | {'🟢 Conservative capitalization' if equity_ratio >= 50 else '🟡 Standard capitalization' if equity_ratio >= 30 else '🔴 Fragile capitalization'} |")

    print("\n### 🟢 Swarm Consensus Investment Conclusion")
    score = 0
    if profit_margin >= 10: score += 1
    if roe >= 12: score += 1
    if pe_ratio < 22: score += 1
    if debt_to_equity < 1.5: score += 1
    if fcf_yield >= 5: score += 1

    if score >= 4:
        print("**Swarm Rating**: 🟢 STRONG BUY / BULLISH. Exceptionally robust profit margins, high return on equity, safe leverage levels, and favorable cash yield.")
    elif score >= 2:
        print("**Swarm Rating**: 🟡 NEUTRAL / HOLD. Solid core financials, but valuation multiples or leverage limit immediate upside.")
    else:
        print("**Swarm Rating**: 🔴 AVOID / BEARISH. Low return profile, weak cash generation, high leverage, or highly premium valuation.")

if __name__ == \"__main__\":
    main()
