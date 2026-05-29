import sys
import os
import math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def main():
    tickers = []
    exp_ret = []
    volatilities = []
    rf = 4.5

    for i, arg in enumerate(sys.argv):
        if arg == "--tickers" and i + 1 < len(sys.argv):
            tickers = [t.strip().upper() for t in sys.argv[i + 1].split(',')]
        elif arg == "--expected_returns" and i + 1 < len(sys.argv):
            exp_ret = [float(x) / 100.0 for x in sys.argv[i + 1].split(',')]
        elif arg == "--volatilities" and i + 1 < len(sys.argv):
            volatilities = [float(x) / 100.0 for x in sys.argv[i + 1].split(',')]
        elif arg == "--risk_free_rate" and i + 1 < len(sys.argv):
            rf = float(sys.argv[i + 1]) / 100.0

    if not tickers or len(tickers) != len(exp_ret) or len(tickers) != len(volatilities):
        print("Error: Tickers, expected_returns, and volatilities lists must have matching dimensions.")
        sys.exit(1)

    n = len(tickers)
    excess_returns = [max(0.001, er - rf) for er in exp_ret]
    vol_sq = [v * v for v in volatilities]
    raw_weights = [er_ex / v2 for er_ex, v2 in zip(excess_returns, vol_sq)]
    total_raw = sum(raw_weights)
    max_sharpe_weights = [w / total_raw for w in raw_weights]

    inv_vol_sq = [1.0 / v2 for v2 in vol_sq]
    total_inv = sum(inv_vol_sq)
    min_var_weights = [iv / total_inv for iv in inv_vol_sq]

    p_ret_max_sharpe = sum(w * er for w, er in zip(max_sharpe_weights, exp_ret))
    p_vol_max_sharpe = math.sqrt(sum(w*w*v*v for w, v in zip(max_sharpe_weights, volatilities)))
    p_sharpe_max = (p_ret_max_sharpe - rf) / p_vol_max_sharpe if p_vol_max_sharpe > 0 else 0

    p_ret_min_var = sum(w * er for w, er in zip(min_var_weights, exp_ret))
    p_vol_min_var = math.sqrt(sum(w*w*v*v for w, v in zip(min_var_weights, volatilities)))
    p_sharpe_min_var = (p_ret_min_var - rf) / p_vol_min_var if p_vol_min_var > 0 else 0

    plt.figure(figsize=(10, 5))
    x_indices = range(n)
    width = 0.35
    plt.bar([x - width/2 for x in x_indices], [w*100 for w in max_sharpe_weights], width, label='Max Sharpe Ratio', color='#3b82f6')
    plt.bar([x + width/2 for x in x_indices], [w*100 for w in min_var_weights], width, label='Min Variance', color='#10b981')
    plt.title('Optimal Portfolio Asset Allocation Weights', fontsize=14, fontweight='bold', pad=15)
    plt.xlabel('Assets / Tickers', fontsize=11, labelpad=10)
    plt.ylabel('Allocation Weight (%)', fontsize=11, labelpad=10)
    plt.xticks(x_indices, tickers)
    plt.legend()
    plt.grid(axis='y', linestyle='--', alpha=0.5)
    plt.tight_layout()

    output_path = "output_portfolio.png"
    plt.savefig(output_path, dpi=150)
    plt.close()

    print(f"### 📈 Modern Portfolio Theory Optimization Report\n")
    print(f"* **Risk-Free Rate Benchmark (Rf)**: {rf*100:.2f}%")
    print(f"* **Total Unique Portfolio Assets**: {n} symbols\n")
    print("#### **1. Tangency Portfolio (Maximum Sharpe Ratio)**")
    print(f"* **Expected Annual Return**: **{p_ret_max_sharpe*100:.2f}%**")
    print(f"* **Portfolio Volatility (Risk)**: **{p_vol_max_sharpe*100:.2f}%**")
    print(f"* **Optimal Sharpe Ratio**: **{p_sharpe_max:.4f}**\n")
    print("#### **2. Minimum Variance Portfolio (Low Risk)**")
    print(f"* **Expected Annual Return**: **{p_ret_min_var*100:.2f}%**")
    print(f"* **Portfolio Volatility (Risk)**: **{p_vol_min_var*100:.2f}%**")
    print(f"* **Sharpe Ratio**: **{p_sharpe_min_var:.4f}**\n")
    print("| Asset Ticker | Expected Return | Asset Volatility | Max Sharpe Allocation | Min Variance Allocation |")
    print("|---|---|---|---|---")
    for tick, er, vol, ms_w, mv_w in zip(tickers, exp_ret, volatilities, max_sharpe_weights, min_var_weights):
        print(f"| **{tick}** | {er*100:.2f}% | {vol*100:.2f}% | **{ms_w*100:.2f}%** | **{mv_w*100:.2f}%** |")
    print(f"\n* **Visual Allocation Graph Saved To**: `{output_path}`")
    print("* *Assumptions: Correlation coefficients are assumed to be close to zero for decoupled security classes.*")

if __name__ == \"__main__\":
    main()
