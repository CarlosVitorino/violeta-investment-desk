# 🟣 Violeta Investment Desk

**Autonomous Stock Market Analysis & Daily Signals**

## Mission

Scan international stock markets daily to identify high-conviction "Strong Buy" opportunities 30 minutes before market close, using a convergence of:
- Technical analysis (RSI, volume, price action)
- News sentiment from trusted sources
- Performance tracking & learning loop

## Strategy: Dynamic News-First Discovery

### Phase 1: News Intelligence
- **Scan Major Sources:** Bloomberg, Reuters, WSJ, Financial Times
- **Extract Trending Stocks:** Identify tickers mentioned in breaking news
- **Sector Analysis:** Track hot sectors (AI, semiconductors, energy, biotech, defense)
- **Geopolitical Monitor:** Wars, sanctions, trade deals → affected sectors

### Phase 2: Technical Validation
- **RSI Filter:** Identify oversold (<35) or bullish momentum (>55)
- **Volume Confirmation:** Require volume >150% of average
- **Anti-FOMO Check:** Flag assets >8% above daily open
- **Price Action:** Validate with current trends

### Phase 3: Multi-Model Analysis
- **Kimi (Bulk Processing):** News sentiment, trend identification ($0 cost)
- **Claude (Final Decision):** Conviction scoring, trade plans (~$0.05/day)

### Output Criteria
- **Sentiment Threshold:** > +0.7 for high conviction
- **Minimum Conviction:** 6/10 to generate signal
- **Action Types:** TRADE (high conviction) or WATCH (potential setup)

### Performance Tracking
- Log every signal with entry price, stop loss, take profit
- Daily audit: Compare yesterday's signals with current prices
- Calculate accuracy % and refine conviction scores

## Dynamic Discovery (No Fixed Watchlist!)

Unlike traditional scanners with fixed watchlists, Violeta discovers opportunities **dynamically from news**:

**Discovery Process:**
1. Scan 50+ financial articles daily
2. Extract 20-30 most-mentioned tickers
3. Identify hot sectors from trending topics
4. Validate technically (RSI, volume, price action)
5. Generate signals for top opportunities

**Example Discoveries:**
- "Flash memory demand surge" → WDC, MU discovered automatically
- "Defense spending increase" → LMT, NOC, RTX identified
- "AI chip shortage" → NVDA, AMD, TSM surfaced

**Sectors Monitored:**
- Technology (semiconductors, AI, cloud)
- Energy (oil, renewables)
- Healthcare (biotech, pharma)
- Defense (aerospace, weapons)
- Finance (fintech, payments)
- Retail (e-commerce, consumer)

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
