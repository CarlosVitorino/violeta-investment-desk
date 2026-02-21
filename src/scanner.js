const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { discoverStocks } = require('./news-discovery');
const { analyzeTickerSentiment, extractCatalysts } = require('./sentiment-analyzer');

// Load configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

// API Keys
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || config.apiKeys.alphaVantage;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

console.log('🟣 VIOLETA INVESTMENT DESK - Dynamic News-Driven Scan\n');
console.log(`📅 ${new Date().toLocaleString('en-US', { timeZone: config.schedule.timezone })}\n`);

// Fetch stock technical data from Alpha Vantage
async function fetchStockData(symbol) {
  try {
    // Get quote data
    const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
    const quoteRes = await axios.get(quoteUrl, { timeout: 10000 });
    
    if (quoteRes.data['Error Message'] || quoteRes.data['Note']) {
      return null;
    }
    
    const quote = quoteRes.data['Global Quote'];
    if (!quote || !quote['05. price']) {
      return null;
    }
    
    const currentPrice = parseFloat(quote['05. price']);
    const dailyOpen = parseFloat(quote['02. open']);
    const volume = parseInt(quote['06. volume']);
    const prevClose = parseFloat(quote['08. previous close']);
    
    // Fetch RSI
    const rsi = await fetchRSI(symbol);
    
    // Calculate average volume (approximate from previous close volume)
    const avgVolume = volume; // Simplified - in production, fetch historical data
    
    return {
      symbol,
      price: currentPrice,
      dailyOpen,
      prevClose,
      volume,
      avgVolume,
      rsi,
      change: ((currentPrice - prevClose) / prevClose * 100).toFixed(2),
      timestamp: quote['07. latest trading day']
    };
    
  } catch (error) {
    return null;
  }
}

// Fetch RSI from Alpha Vantage
async function fetchRSI(symbol) {
  try {
    const url = `https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${ALPHA_VANTAGE_KEY}`;
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

// Fetch company information from Alpha Vantage
async function fetchCompanyInfo(symbol) {
  try {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await axios.get(url, { timeout: 10000 });
    
    if (res.data['Error Message'] || res.data['Note'] || !res.data['Name']) {
      return null;
    }
    
    return {
      name: res.data['Name'],
      isin: res.data['ISIN'] || 'N/A',
      sector: res.data['Sector'] || 'N/A',
      industry: res.data['Industry'] || 'N/A',
      country: res.data['Country'] || 'N/A',
      description: res.data['Description'] || ''
    };
  } catch (error) {
    console.log(`  ⚠️ Could not fetch company info for ${symbol}`);
    return null;
  }
}

// Validate ticker symbol
function isValidTicker(ticker) {
  // Must be at least 3 characters (filters out "I", "AI", "ML", etc.)
  if (!ticker || ticker.length < 3) return false;
  
  // Must be uppercase
  if (ticker !== ticker.toUpperCase()) return false;
  
  // Filter out common non-ticker words
  const commonWords = ['CEO', 'CFO', 'COO', 'CTO', 'CIO', 'USA', 'GDP', 'IPO', 'EPS', 'P/E', 'AI', 'ML', 'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'HAD', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'DAD', 'EYE', 'MOM', 'SHE', 'USE', 'DUE', 'FED', 'TAX', 'BUY', 'SELL', 'PUT', 'CALL', 'USD', 'EUR', 'GBP', 'JPY', 'ETF'];
  if (commonWords.includes(ticker)) return false;
  
  return true;
}

// Calculate conviction score
function calculateConviction(technicalData, sentiment, mentions) {
  let conviction = 5; // Base score
  
  // News momentum (mentions)
  if (mentions >= 10) conviction += 2;
  else if (mentions >= 5) conviction += 1;
  
  // Sentiment boost
  if (sentiment.score > 0.7) conviction += 2;
  else if (sentiment.score > 0.4) conviction += 1;
  else if (sentiment.score < -0.4) conviction -= 1;
  
  // Technical factors
  if (technicalData.rsi) {
    if (technicalData.rsi < config.thresholds.rsiOversold) {
      conviction += 2; // Oversold opportunity
    } else if (technicalData.rsi > config.thresholds.rsiBullish && technicalData.rsi < 70) {
      conviction += 1; // Bullish momentum
    } else if (technicalData.rsi > 75) {
      conviction -= 1; // Overbought
    }
  }
  
  // Volume confirmation
  if (technicalData.volume && technicalData.avgVolume) {
    const volumeRatio = technicalData.volume / technicalData.avgVolume;
    if (volumeRatio > 1.5) conviction += 1;
  }
  
  // FOMO penalty
  if (technicalData.dailyOpen && technicalData.price > technicalData.dailyOpen * (1 + config.thresholds.fomoThreshold)) {
    conviction -= 2;
  }
  
  return Math.max(1, Math.min(10, conviction));
}

// Generate trade plan
function generateTradePlan(data, conviction, sentiment) {
  const price = data.price;
  
  // Check if conviction meets threshold
  if (conviction < config.thresholds.minConviction) {
    return {
      action: 'WATCH',
      reason: `Conviction below threshold (${conviction}/${config.thresholds.minConviction})`,
      watchPrice: (price * 0.97).toFixed(2)
    };
  }
  
  // FOMO check
  if (data.dailyOpen && price > data.dailyOpen * (1 + config.thresholds.fomoThreshold)) {
    return {
      action: 'WATCH',
      reason: `Price overextended (+${((price / data.dailyOpen - 1) * 100).toFixed(1)}% from open)`,
      watchPrice: (data.dailyOpen * 1.02).toFixed(2)
    };
  }
  
  // Bearish sentiment check
  if (sentiment.score < 0) {
    return {
      action: 'WATCH',
      reason: 'Negative sentiment detected',
      watchPrice: (price * 0.95).toFixed(2)
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
    riskPercent: '3%',
    rewardPercent: '7%',
    riskReward: '1:2.3'
  };
}

// Main scan function
async function scanMarket() {
  console.log('═'.repeat(80));
  console.log('PHASE 1: NEWS DISCOVERY');
  console.log('═'.repeat(80) + '\n');
  
  // Discover stocks from news
  const discovery = await discoverStocks(BRAVE_API_KEY);
  
  if (discovery.tickers.length === 0) {
    console.log('\n⚠️  No trending stocks discovered. Market might be quiet.\n');
    return {
      signals: [],
      discovery: { tickers: [], sectors: {}, articles: [] }
    };
  }
  
  // Filter valid tickers
  console.log(`\n📊 Filtered ${discovery.tickers.length} tickers for valid symbols...`);
  const validTickers = discovery.tickers.filter(t => isValidTicker(t.ticker));
  console.log(`✅ ${validTickers.length} valid tickers remaining\n`);
  
  console.log('\n' + '═'.repeat(80));
  console.log('PHASE 2: TECHNICAL VALIDATION');
  console.log('═'.repeat(80) + '\n');
  
  const signals = [];
  const topTickers = validTickers.slice(0, 15); // Analyze top 15 valid tickers
  
  for (const tickerData of topTickers) {
    console.log(`\n🔍 ${tickerData.ticker} (${tickerData.mentions} mentions)`);
    
    // Fetch company info
    console.log('  📋 Fetching company information...');
    const companyInfo = await fetchCompanyInfo(tickerData.ticker);
    
    if (companyInfo) {
      console.log(`  🏢 ${companyInfo.name}`);
      console.log(`     ISIN: ${companyInfo.isin} | ${companyInfo.sector}`);
    } else {
      console.log('  ⚠️ Company info unavailable');
    }
    
    // Fetch technical data
    const technical = await fetchStockData(tickerData.ticker);
    
    if (!technical) {
      console.log('  ✗ Could not fetch technical data');
      await new Promise(resolve => setTimeout(resolve, 12000));
      continue;
    }
    
    console.log(`  Price: $${technical.price} (${technical.change > 0 ? '+' : ''}${technical.change}%)`);
    console.log(`  RSI: ${technical.rsi ? technical.rsi.toFixed(2) : 'N/A'}`);
    console.log(`  Volume: ${technical.volume.toLocaleString()}`);
    
    // Analyze sentiment from articles
    const sentiment = analyzeTickerSentiment(tickerData.articles);
    const catalysts = extractCatalysts(tickerData.articles);
    
    console.log(`  Sentiment: ${sentiment.score > 0 ? '+' : ''}${sentiment.score.toFixed(2)} (${sentiment.confidence})`);
    console.log(`  Catalysts: ${catalysts.map(c => c.type).join(', ') || 'None identified'}`);
    
    // Calculate conviction
    const conviction = calculateConviction(technical, sentiment, tickerData.mentions);
    console.log(`  Conviction: ${conviction}/10`);
    
    // Generate trade plan
    const tradePlan = generateTradePlan(technical, conviction, sentiment);
    console.log(`  Action: ${tradePlan.action}`);
    
    // Save ALL analyzed signals (even low conviction)
    signals.push({
      ticker: tickerData.ticker,
      company: companyInfo,
      mentions: tickerData.mentions,
      technical,
      sentiment,
      catalysts,
      conviction,
      tradePlan,
      timestamp: new Date().toISOString()
    });
    
    // Rate limiting (Alpha Vantage: 5 calls/min, but we make 6 calls per ticker)
    // Global quote (1) + RSI (1) + Company info (1) = 3 calls, but company info is separate endpoint
    // Actually: Global quote, RSI, and Company info = 3 calls per ticker
    // But company info is also limited, so we need 15s minimum
    await new Promise(resolve => setTimeout(resolve, 15000)); // 15s = 4 calls/min, safe buffer
  }
  
  return {
    signals: signals.sort((a, b) => b.conviction - a.conviction),
    discovery
  };
}

// Generate markdown report
function generateReport(scanResults) {
  const date = new Date().toISOString().split('T')[0];
  const time = new Date().toLocaleString('en-US', { timeZone: config.schedule.timezone });
  
  let report = `# 🟣 VIOLETA DAILY SIGNAL: ${date}\n\n`;
  report += `**Scan Time:** ${time}\n`;
  report += `**Strategy:** Dynamic News-Driven Discovery\n\n`;
  
  report += `---\n\n`;
  
  // Market intelligence section
  report += `## 📰 MARKET INTELLIGENCE\n\n`;
  
  const topSectors = Object.entries(scanResults.discovery.sectors || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  if (topSectors.length > 0) {
    report += `**Hot Sectors:**\n`;
    topSectors.forEach(([sector, count]) => {
      report += `- ${sector.charAt(0).toUpperCase() + sector.slice(1)}: ${count} mentions\n`;
    });
  }
  
  const totalAnalyzed = scanResults.signals.length;
  const highConviction = scanResults.signals.filter(s => s.conviction >= config.thresholds.minConviction).length;
  
  report += `\n**Articles Analyzed:** ${scanResults.discovery.articles.length}\n`;
  report += `**Tickers Discovered:** ${scanResults.discovery.tickers.length}\n`;
  report += `**Tickers Analyzed:** ${totalAnalyzed}\n`;
  report += `**High-Conviction Signals:** ${highConviction}\n\n`;
  
  report += `---\n\n`;
  
  // Signals section
  const highConvictionSignals = scanResults.signals.filter(s => s.conviction >= config.thresholds.minConviction);
  
  if (highConvictionSignals.length === 0 && scanResults.signals.length === 0) {
    report += `## ⚠️ NO SIGNALS ANALYZED TODAY\n\n`;
    report += `Market conditions analyzed, but no valid tickers discovered.\n`;
    report += `**Action:** Continue monitoring. New opportunities often emerge after consolidation.\n`;
  } else if (highConvictionSignals.length === 0) {
    // Show top 5 signals even if below threshold
    const topSignals = scanResults.signals.slice(0, 5);
    report += `## 📊 MARKET SCAN (No high-conviction signals today)\n\n`;
    report += `⚠️ **All signals below ${config.thresholds.minConviction}/10 conviction threshold. Showing top ${topSignals.length} for reference only.**\n\n`;
    report += `**Action:** WATCH ONLY - Do not trade without additional confirmation.\n\n`;
    
    // Use topSignals instead of full list
    scanResults.signals = topSignals;
    report += `## 🔍 TOP WATCH LIST (${topSignals.length} tickers)\n\n`;
  } else {
    report += `## 🎯 TOP SIGNALS (${highConvictionSignals.length} found)\n\n`;
    // Only show high-conviction signals for trading
    scanResults.signals = highConvictionSignals;
  }
  
  // Show signal details (if any exist)
  if (scanResults.signals.length > 0) {
    scanResults.signals.forEach((signal, index) => {
      const companyName = signal.company?.name || signal.ticker;
      const isin = signal.company?.isin || 'N/A';
      const sector = signal.company?.sector || 'N/A';
      
      report += `### ${index + 1}. ${companyName} (${signal.ticker})\n\n`;
      report += `**ISIN:** ${isin} | **Sector:** ${sector}\n\n`;
      report += `**CONVICTION: ${signal.conviction}/10** | **SENTIMENT: ${signal.sentiment.score > 0 ? '+' : ''}${signal.sentiment.score.toFixed(2)}**\n\n`;
      
      report += `**THE CATALYST:**\n`;
      report += `- **News Momentum:** ${signal.mentions} mentions across major sources\n`;
      if (signal.catalysts.length > 0) {
        report += `- **Key Events:** ${signal.catalysts.map(c => c.type).join(', ')}\n`;
      }
      report += `- **Technical:** `;
      if (signal.technical.rsi) {
        report += `RSI ${signal.technical.rsi.toFixed(2)}`;
        if (signal.technical.rsi < 35) report += ` (oversold)`;
        else if (signal.technical.rsi > 55 && signal.technical.rsi < 70) report += ` (bullish momentum)`;
      }
      report += `\n`;
      report += `- **Price Action:** $${signal.technical.price} (${signal.technical.change}% today)\n`;
      report += `- **Sentiment Summary:** ${signal.sentiment.summary}\n\n`;
      
      report += `**ACTION PLAN:**\n`;
      
      if (signal.tradePlan.action === 'TRADE') {
        report += `- [x] **TRADE**\n`;
        report += `  - Entry: $${signal.tradePlan.entry}\n`;
        report += `  - Stop Loss: $${signal.tradePlan.stopLoss} (${signal.tradePlan.riskPercent})\n`;
        report += `  - Take Profit: $${signal.tradePlan.takeProfit} (${signal.tradePlan.rewardPercent})\n`;
        report += `  - Risk/Reward: ${signal.tradePlan.riskReward}\n`;
      } else {
        report += `- [ ] **WATCH**\n`;
        report += `  - Reason: ${signal.tradePlan.reason}\n`;
        report += `  - Entry Target: $${signal.tradePlan.watchPrice}\n`;
      }
      
      // Add news sources
      if (signal.catalysts.length > 0) {
        report += `\n**Sources:**\n`;
        signal.catalysts.slice(0, 2).forEach(cat => {
          report += `- [${cat.type}](${cat.url})\n`;
        });
      }
      
      report += `\n`;
    });
  }
  
  report += `---\n\n`;
  report += `**⚠️ DISCLAIMER:** Automated analysis tool. Not financial advice. You assume all trading risk.\n`;
  report += `**💜 Generated by:** Violeta Investment Desk\n`;
  
  return report;
}

// Generate Telegram summary
function generateTelegramSummary(scanResults) {
  const date = new Date().toISOString().split('T')[0];
  const highConvictionSignals = scanResults.signals.filter(s => s.conviction >= config.thresholds.minConviction);
  
  let summary = `🟣 VIOLETA INVESTMENT SIGNAL\n`;
  summary += `📅 ${date}\n\n`;
  
  if (highConvictionSignals.length === 0 && scanResults.signals.length === 0) {
    summary += `⚠️ No high-conviction signals today\n\n`;
    summary += `Analyzed ${scanResults.discovery.tickers.length} trending stocks\n`;
    summary += `Market conditions: Neutral\n`;
  } else if (highConvictionSignals.length === 0) {
    // Show top analyzed tickers even though conviction is low
    summary += `📊 Market Scan (no high-conviction signals)\n\n`;
    summary += `Analyzed ${scanResults.signals.length} tickers\n`;
    summary += `Top watch (below ${config.thresholds.minConviction}/10 threshold):\n\n`;
    
    scanResults.signals.slice(0, 3).forEach(signal => {
      const companyName = signal.company?.name || signal.ticker;
      summary += `🔍 ${companyName} ($${signal.ticker})\n`;
      summary += `   Conviction: ${signal.conviction}/10 | Sentiment: ${signal.sentiment.score > 0 ? '+' : ''}${signal.sentiment.score.toFixed(2)}\n`;
      summary += `   Price: $${signal.technical.price} (${signal.technical.change}%)\n`;
      if (signal.catalysts.length > 0) {
        summary += `   Catalyst: ${signal.catalysts[0].type}\n`;
      }
      summary += `\n`;
    });
  } else {
    const tradeSignals = highConvictionSignals.filter(s => s.tradePlan.action === 'TRADE');
    const watchSignals = highConvictionSignals.filter(s => s.tradePlan.action === 'WATCH');
    
    summary += `${tradeSignals.length} TRADE signal${tradeSignals.length !== 1 ? 's' : ''} | ${watchSignals.length} WATCH\n\n`;
    
    // Show top 3 high-conviction signals
    highConvictionSignals.slice(0, 3).forEach(signal => {
      const icon = signal.tradePlan.action === 'TRADE' ? '🟢' : '🟡';
      const companyName = signal.company?.name || signal.ticker;
      summary += `${icon} ${companyName} (${signal.ticker})\n`;
      summary += `   ISIN: ${signal.company?.isin || 'N/A'}\n`;
      summary += `   Conviction: ${signal.conviction}/10\n`;
      if (signal.catalysts.length > 0) {
        summary += `   ${signal.catalysts[0].type}\n`;
      }
      if (signal.tradePlan.action === 'TRADE') {
        summary += `   Entry/SL/TP: $${signal.tradePlan.entry}/$${signal.tradePlan.stopLoss}/$${signal.tradePlan.takeProfit}\n`;
      } else {
        summary += `   ${signal.tradePlan.reason}\n`;
      }
      summary += `\n`;
    });
  }
  
  summary += `📊 Full report: github.com/CarlosVitorino/violeta-investment-desk\n`;
  
  return summary;
}

// Save report
function saveReport(report) {
  const date = new Date().toISOString().split('T')[0];
  const reportsDir = path.join(__dirname, '..', 'reports');
  
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir);
  }
  
  const reportPath = path.join(reportsDir, `${date}.md`);
  fs.writeFileSync(reportPath, report);
  
  console.log(`\n📄 Report saved: reports/${date}.md`);
  
  return reportPath;
}

// Main execution
(async () => {
  try {
    // Validate API keys
    if (ALPHA_VANTAGE_KEY === 'YOUR_ALPHA_VANTAGE_KEY') {
      console.error('❌ Please set ALPHA_VANTAGE_KEY in config.json');
      process.exit(1);
    }
    
    if (!BRAVE_API_KEY) {
      console.error('❌ Please set BRAVE_API_KEY environment variable');
      process.exit(1);
    }
    
    // Run scan
    const scanResults = await scanMarket();
    
    // Generate outputs
    const report = generateReport(scanResults);
    const telegramSummary = generateTelegramSummary(scanResults);
    
    // Save report
    saveReport(report);
    
    // Print outputs
    console.log('\n' + '═'.repeat(80));
    console.log('FINAL REPORT');
    console.log('═'.repeat(80) + '\n');
    console.log(report);
    
    console.log('\n' + '═'.repeat(80));
    console.log('TELEGRAM SUMMARY');
    console.log('═'.repeat(80) + '\n');
    console.log(telegramSummary);
    
    console.log('\n✅ Scan complete! Found ' + scanResults.signals.length + ' signal(s).');
    
    // Return data for cron job to send via Telegram
    process.stdout.write('\n__TELEGRAM_SUMMARY__\n' + telegramSummary + '\n__END_TELEGRAM_SUMMARY__\n');
    
  } catch (error) {
    console.error('❌ Error during scan:', error);
    process.exit(1);
  }
})();
