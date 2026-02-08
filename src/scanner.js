const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

// API Keys (load from environment or config)
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || config.apiKeys.alphaVantage;
const FINNHUB_KEY = process.env.FINNHUB_KEY || config.apiKeys.finnhub;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

console.log('🟣 VIOLETA INVESTMENT DESK - Daily Scan Starting...\n');

// Helper: Fetch stock data from Alpha Vantage
async function fetchStockData(symbol) {
  try {
    // Get intraday data (15min intervals)
    const intradayUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=15min&apikey=${ALPHA_VANTAGE_KEY}`;
    const intradayRes = await axios.get(intradayUrl, { timeout: 10000 });
    
    if (intradayRes.data['Error Message'] || intradayRes.data['Note']) {
      console.log(`  ⚠️  ${symbol}: API limit or error`);
      return null;
    }
    
    const timeSeries = intradayRes.data['Time Series (15min)'];
    if (!timeSeries) {
      console.log(`  ⚠️  ${symbol}: No intraday data`);
      return null;
    }
    
    const timestamps = Object.keys(timeSeries);
    const latestTime = timestamps[0];
    const latest = timeSeries[latestTime];
    
    const currentPrice = parseFloat(latest['4. close']);
    const volume = parseInt(latest['5. volume']);
    
    // Calculate simple RSI (14-period approximation)
    // Note: For production, use Alpha Vantage's RSI endpoint
    const rsi = await fetchRSI(symbol);
    
    // Get daily open for FOMO check
    const dailyUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
    const dailyRes = await axios.get(dailyUrl, { timeout: 10000 });
    
    let dailyOpen = null;
    let avgVolume = null;
    
    if (dailyRes.data['Time Series (Daily)']) {
      const dailySeries = dailyRes.data['Time Series (Daily)'];
      const today = Object.keys(dailySeries)[0];
      dailyOpen = parseFloat(dailySeries[today]['1. open']);
      
      // Calculate average volume (last 5 days)
      const volumes = Object.values(dailySeries).slice(0, 5).map(d => parseInt(d['5. volume']));
      avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    }
    
    return {
      symbol,
      price: currentPrice,
      dailyOpen,
      volume,
      avgVolume,
      rsi,
      timestamp: latestTime
    };
    
  } catch (error) {
    console.log(`  ✗ ${symbol}: ${error.message}`);
    return null;
  }
}

// Helper: Fetch RSI from Alpha Vantage
async function fetchRSI(symbol) {
  try {
    const url = `https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=15min&time_period=14&series_type=close&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await axios.get(url, { timeout: 10000 });
    
    if (res.data['Technical Analysis: RSI']) {
      const rsiData = res.data['Technical Analysis: RSI'];
      const latestTime = Object.keys(rsiData)[0];
      return parseFloat(rsiData[latestTime]['RSI']);
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Helper: Search news using Brave API
async function searchNews(symbol, companyName) {
  if (!BRAVE_API_KEY) {
    console.log('  ⚠️  No Brave API key - skipping news');
    return [];
  }
  
  try {
    const query = `${symbol} ${companyName} stock news`;
    const url = `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(query)}&count=5&freshness=pd`;
    
    const res = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      },
      timeout: 10000
    });
    
    return res.data.results || [];
  } catch (error) {
    console.log(`  ✗ News search error: ${error.message}`);
    return [];
  }
}

// Helper: Analyze news sentiment
function analyzeSentiment(newsArticles) {
  if (newsArticles.length === 0) return { score: 0, summary: 'No news found' };
  
  let score = 0;
  let events = [];
  
  const bullishKeywords = ['partnership', 'acquisition', 'upgrade', 'beats estimates', 'revenue growth', 'profit', 'breakthrough', 'approval', 'expansion'];
  const bearishKeywords = ['lawsuit', 'downgrade', 'miss', 'decline', 'loss', 'investigation', 'recall', 'bankruptcy'];
  
  newsArticles.forEach(article => {
    const text = `${article.title} ${article.description}`.toLowerCase();
    
    // Check for bullish signals
    bullishKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        score += 0.2;
        events.push(`+ ${keyword}`);
      }
    });
    
    // Check for bearish signals
    bearishKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        score -= 0.2;
        events.push(`- ${keyword}`);
      }
    });
  });
  
  // Normalize score to -1 to +1 range
  score = Math.max(-1, Math.min(1, score));
  
  return {
    score,
    summary: events.slice(0, 3).join(', ') || 'Mixed/neutral sentiment',
    newsCount: newsArticles.length
  };
}

// Helper: Calculate conviction score
function calculateConviction(data, sentiment) {
  let conviction = 5; // Base score
  
  // Technical factors
  if (data.rsi && data.rsi < config.thresholds.rsiOversold) {
    conviction += 2; // Oversold = opportunity
  }
  if (data.rsi && data.rsi > config.thresholds.rsiBullish && data.rsi < 70) {
    conviction += 1; // Bullish momentum
  }
  
  // Volume confirmation
  if (data.avgVolume && data.volume > data.avgVolume * config.thresholds.volumeMultiplier) {
    conviction += 1;
  }
  
  // Sentiment boost
  if (sentiment.score > config.thresholds.sentimentThreshold) {
    conviction += 2;
  } else if (sentiment.score > 0.4) {
    conviction += 1;
  }
  
  // FOMO penalty
  if (data.dailyOpen && data.price > data.dailyOpen * (1 + config.thresholds.fomoThreshold)) {
    conviction -= 2;
  }
  
  return Math.max(1, Math.min(10, conviction));
}

// Helper: Generate trade plan
function generateTradePlan(data, conviction) {
  const price = data.price;
  
  if (conviction < config.thresholds.minConviction) {
    return {
      action: 'WATCH',
      reason: `Conviction too low (${conviction}/10)`,
      watchPrice: (price * 0.95).toFixed(2)
    };
  }
  
  // FOMO check
  if (data.dailyOpen && price > data.dailyOpen * (1 + config.thresholds.fomoThreshold)) {
    return {
      action: 'WATCH',
      reason: 'Price overextended (>8% above daily open)',
      watchPrice: (data.dailyOpen * 1.02).toFixed(2)
    };
  }
  
  // Generate trade levels
  const stopLoss = (price * 0.97).toFixed(2); // 3% stop loss
  const takeProfit = (price * 1.07).toFixed(2); // 7% take profit
  
  return {
    action: 'TRADE',
    entry: price.toFixed(2),
    stopLoss,
    takeProfit,
    risk: ((price - stopLoss) / price * 100).toFixed(2) + '%',
    reward: ((takeProfit - price) / price * 100).toFixed(2) + '%'
  };
}

// Main scan function
async function scanMarket() {
  console.log(`📊 Scanning ${config.watchlist.length} stocks...\n`);
  
  const signals = [];
  
  for (const stock of config.watchlist) {
    console.log(`🔍 ${stock.symbol} - ${stock.name}`);
    
    // Fetch technical data
    const data = await fetchStockData(stock.symbol);
    
    if (!data) {
      console.log('');
      continue;
    }
    
    console.log(`  Price: $${data.price} | RSI: ${data.rsi ? data.rsi.toFixed(2) : 'N/A'} | Volume: ${data.volume.toLocaleString()}`);
    
    // Fetch news
    const news = await searchNews(stock.symbol, stock.name);
    const sentiment = analyzeSentiment(news);
    
    console.log(`  Sentiment: ${sentiment.score > 0 ? '+' : ''}${sentiment.score.toFixed(2)} | News: ${sentiment.newsCount} articles`);
    
    // Calculate conviction
    const conviction = calculateConviction(data, sentiment);
    
    console.log(`  Conviction: ${conviction}/10`);
    
    // Generate trade plan
    const tradePlan = generateTradePlan(data, conviction);
    
    console.log(`  Action: ${tradePlan.action}`);
    
    if (conviction >= config.thresholds.minConviction || tradePlan.action === 'TRADE') {
      signals.push({
        stock,
        data,
        sentiment,
        conviction,
        tradePlan,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('');
    
    // Rate limiting: wait 12 seconds between calls (Alpha Vantage limit: 5 calls/min)
    await new Promise(resolve => setTimeout(resolve, 12000));
  }
  
  return signals;
}

// Generate report
function generateReport(signals) {
  const date = new Date().toISOString().split('T')[0];
  
  let report = `# 🟣 VIOLETA DAILY SIGNAL: ${date}\n\n`;
  report += `**Scan Time:** ${new Date().toLocaleString('en-US', { timeZone: config.schedule.timezone })}\n\n`;
  
  if (signals.length === 0) {
    report += `## No High-Conviction Signals Today\n\n`;
    report += `All ${config.watchlist.length} stocks scanned. No assets met the minimum conviction threshold (${config.thresholds.minConviction}/10).\n\n`;
    report += `**Market Conditions:** Neutral - Continue monitoring.\n`;
  } else {
    report += `## ${signals.length} Signal${signals.length > 1 ? 's' : ''} Identified\n\n`;
    
    signals.forEach((signal, index) => {
      report += `### ${index + 1}. ${signal.stock.symbol} - ${signal.stock.name}\n\n`;
      report += `**CONVICTION:** ${signal.conviction}/10 | **SENTIMENT:** ${signal.sentiment.score > 0 ? '+' : ''}${signal.sentiment.score.toFixed(2)}\n\n`;
      report += `**THE TRIGGER:**\n`;
      report += `- **Technical:** RSI ${signal.data.rsi ? signal.data.rsi.toFixed(2) : 'N/A'}`;
      
      if (signal.data.rsi < config.thresholds.rsiOversold) {
        report += ` (Oversold)`;
      } else if (signal.data.rsi > config.thresholds.rsiBullish) {
        report += ` (Bullish Momentum)`;
      }
      
      report += `\n`;
      report += `- **Volume:** ${(signal.data.volume / signal.data.avgVolume * 100).toFixed(0)}% of average\n`;
      report += `- **News:** ${signal.sentiment.summary}\n\n`;
      
      report += `**ACTION PLAN:**\n`;
      
      if (signal.tradePlan.action === 'TRADE') {
        report += `- [x] **TRADE**\n`;
        report += `  - Entry: $${signal.tradePlan.entry}\n`;
        report += `  - Stop Loss: $${signal.tradePlan.stopLoss}\n`;
        report += `  - Take Profit: $${signal.tradePlan.takeProfit}\n`;
        report += `  - Risk/Reward: ${signal.tradePlan.risk} / ${signal.tradePlan.reward}\n`;
      } else {
        report += `- [ ] **WATCH**\n`;
        report += `  - Reason: ${signal.tradePlan.reason}\n`;
        report += `  - Watch for dip to: $${signal.tradePlan.watchPrice}\n`;
      }
      
      report += `\n`;
    });
  }
  
  report += `\n---\n\n`;
  report += `**⚠️ DISCLAIMER:** This is an automated analysis tool. Not financial advice. You assume all trading risk.\n`;
  
  return report;
}

// Save report to file
function saveReport(report) {
  const date = new Date().toISOString().split('T')[0];
  const reportsDir = path.join(__dirname, '..', 'reports');
  
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir);
  }
  
  const reportPath = path.join(reportsDir, `${date}.md`);
  fs.writeFileSync(reportPath, report);
  
  console.log(`📄 Report saved: reports/${date}.md`);
  
  return reportPath;
}

// Main execution
(async () => {
  try {
    // Check API keys
    if (ALPHA_VANTAGE_KEY === 'YOUR_ALPHA_VANTAGE_KEY') {
      console.error('❌ Please set ALPHA_VANTAGE_KEY in config.json or environment');
      process.exit(1);
    }
    
    // Run scan
    const signals = await scanMarket();
    
    // Generate report
    const report = generateReport(signals);
    
    // Save report
    saveReport(report);
    
    // Print report to console
    console.log('\n' + '='.repeat(80));
    console.log(report);
    console.log('='.repeat(80));
    
    console.log(`\n✅ Scan complete! Found ${signals.length} signal(s).`);
    
  } catch (error) {
    console.error('❌ Error during scan:', error.message);
    process.exit(1);
  }
})();
