import sys
import math

def normal_cdf(x):
    return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0

def normal_pdf(x):
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)

def main():
    S = 0.0
    K = 0.0
    T = 0.0
    r = 0.0
    sigma = 0.0
    option_type = "call"

    for i, arg in enumerate(sys.argv):
        if arg == "--stock_price" and i + 1 < len(sys.argv):
            S = float(sys.argv[i + 1])
        elif arg == "--strike_price" and i + 1 < len(sys.argv):
            K = float(sys.argv[i + 1])
        elif arg == "--time_to_maturity" and i + 1 < len(sys.argv):
            T = float(sys.argv[i + 1])
        elif arg == "--risk_free_rate" and i + 1 < len(sys.argv):
            r = float(sys.argv[i + 1])
        elif arg == "--volatility" and i + 1 < len(sys.argv):
            sigma = float(sys.argv[i + 1])
        elif arg == "--option_type" and i + 1 < len(sys.argv):
            option_type = sys.argv[i + 1].strip().lower()

    if S <= 0 or K <= 0 or T <= 0 or sigma <= 0:
        print("Error: Option parameters S, K, T, and sigma must be greater than zero.")
        sys.exit(1)

    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)

    price = 0.0
    delta = 0.0
    gamma = 0.0
    theta = 0.0
    vega = 0.0
    rho = 0.0

    gamma = normal_pdf(d1) / (S * sigma * math.sqrt(T))
    vega = S * math.sqrt(T) * normal_pdf(d1)

    if option_type == "call":
        price = S * normal_cdf(d1) - K * math.exp(-r * T) * normal_cdf(d2)
        delta = normal_cdf(d1)
        theta = (- (S * normal_pdf(d1) * sigma) / (2 * math.sqrt(T)) - r * K * math.exp(-r * T) * normal_cdf(d2))
        rho = K * T * math.exp(-r * T) * normal_cdf(d2)
    else:
        price = K * math.exp(-r * T) * normal_cdf(-d2) - S * normal_cdf(-d1)
        delta = normal_cdf(d1) - 1.0
        theta = (- (S * normal_pdf(d1) * sigma) / (2 * math.sqrt(T)) + r * K * math.exp(-r * T) * normal_cdf(-d2))
        rho = -K * T * math.exp(-r * T) * normal_cdf(-d2)

    theta_per_day = theta / 365.0
    vega_1pct = vega / 100.0

    print(f"### 🧮 Option Valuation Engine (Black-Scholes Model)\n")
    print(f"* **Asset price (S)**: ${S:.2f} | **Strike (K)**: ${K:.2f}")
    print(f"* **Maturity (T)**: {T:.4f} years ({int(T*365)} days) | **Risk-Free Rate (r)**: {r*100:.2f}%")
    print(f"* **Implied Volatility (σ)**: {sigma*100:.2f}% | **Option Type**: {option_type.upper()}\n")
    print(f"#### **Theoretical Option Premium**: `${price:.4f}`\n")
    print("| Greek | Symbol | Sensitivity Measure | Value | Interpretation |")
    print("|---|---|---|---|---|")
    print(f"| **Delta** | Δ | Option Price change per $1 Stock change | **{delta:.4f}** | {'Bullish direction' if delta > 0 else 'Bearish direction'} (Equivalent to holding {abs(delta*100):.1f} shares) |")
    print(f"| **Gamma** | Γ | Delta change per $1 Stock change | **{gamma:.4f}** | Rate of acceleration of option sensitivity to S. |")
    print(f"| **Theta (daily)** | Θ | Time decay premium loss per day | **{theta_per_day:.4f}** | Time premium erosion; daily decay of value holding S flat. |")
    print(f"| **Vega (1%)** | ν | Premium change per 1% change in Volatility | **{vega_1pct:.4f}** | Option value sensitivity to market fear / uncertainty index. |")
    print(f"| **Rho** | ρ | Premium change per 1% change in Interest Rate | **{rho/100:.4f}** | Option value sensitivity to macroeconomic interest shifts. |")

if __name__ == \"__main__\":
    main()
