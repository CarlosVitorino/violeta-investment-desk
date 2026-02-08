# 🟣 Violeta Investment Desk

**Autonomous Stock Market Analysis & Daily Signals**

## Mission

Scan international stock markets daily to identify high-conviction "Strong Buy" opportunities 30 minutes before market close, using a convergence of:
- Technical analysis (RSI, volume, price action)
- News sentiment from trusted sources
- Performance tracking & learning loop

## Strategy

### Technical Analysis
- **RSI Filter:** Identify oversold (<35) or bullish momentum (>55) on 15m/1h charts
- **Volume Confirmation:** Require current 1h volume >150% of 24h average
- **Anti-FOMO Check:** Flag assets >8% above daily open as "Caution: Overextended"

### News Alpha Engine
- **Priority Sources:** Bloomberg, Reuters, SEC filings, official announcements
- **Sentiment Scoring:** -1 (Bearish) to +1 (Bullish)
- **Action Threshold:** Only recommend if Sentiment > +0.7
- **Factual Events Only:** Partnerships, upgrades, regulatory shifts (no price predictions)

### Performance Tracking
- Log every signal with entry price, stop loss, take profit
- Daily audit: Compare yesterday's signals with current prices
- Calculate accuracy % and refine conviction scores

## Watchlist (15 International Stocks)

**US Tech:**
- AAPL, MSFT, GOOGL, NVDA, META, TSLA, AMZN

**Finance:**
- JPM, V, MA

**International:**
- TSM (Taiwan), ASML (Netherlands), NVO (Denmark), SAP (Germany)

**ETFs:**
- SPY, QQQ

## Data Sources

- **Alpha Vantage** - Technical indicators (RSI, volume, price)
- **Finnhub** - Real-time news & sentiment
- **Brave Search** - Supplementary news scanning

## Daily Workflow

**Trigger:** 23:30 CET (30 min before 00:00 UTC daily close)

1. Fetch technical data for all watchlist assets
2. Scan news from past 24h for high-authority sources
3. Calculate conviction scores (1-10)
4. Review yesterday's signals & calculate P/L
5. Generate daily report & commit to GitHub
6. Send signal summary to Telegram

## Output Format

```markdown
### 🟣 VIOLETA DAILY SIGNAL: 2026-02-08

**ASSET:** NVDA
**CONVICTION:** 8/10 | SENTIMENT: +0.85
**THE TRIGGER:** 
- News: Partnership with major cloud provider announced
- Technical: RSI 38 (oversold), volume spike 210% of average

**ACTION PLAN:**
- [x] TRADE
  - Entry: $142.50
  - Stop Loss: $138.00
  - Take Profit: $152.00
  
**PAST PERFORMANCE:**
- Yesterday's Accuracy: 75% (3/4 signals profitable)
- 7-Day Win Rate: 68%
```

## Setup

1. Sign up for free API keys:
   - Alpha Vantage: https://www.alphavantage.co/support/#api-key
   - Finnhub: https://finnhub.io/register

2. Add API keys to `config.json`

3. Install dependencies: `npm install`

4. Run manual scan: `npm run scan`

5. Automated via OpenClaw cron (daily at 23:30 CET)

## Performance Log

All signals and results tracked in `performance.json` and daily reports in `reports/`

---

**⚠️ DISCLAIMER:** This is an automated analysis tool. Not financial advice. You assume all trading risk.

**Created by:** Violeta 💜 (OpenClaw AI Assistant)
