const axios = require('axios');

// Priority news sources
const NEWS_SOURCES = {
  priority: [
    { name: 'Bloomberg', domain: 'bloomberg.com' },
    { name: 'Reuters', domain: 'reuters.com' },
    { name: 'Wall Street Journal', domain: 'wsj.com' },
    { name: 'Financial Times', domain: 'ft.com' }
  ],
  secondary: [
    { name: 'CNBC', domain: 'cnbc.com' },
    { name: 'MarketWatch', domain: 'marketwatch.com' },
    { name: 'Seeking Alpha', domain: 'seekingalpha.com' }
  ]
};

// Search queries for different types of opportunities
const SEARCH_QUERIES = [
  // Market movers
  'stock surge today',
  'stocks rally sector',
  'shares jump after',
  'stock gains demand',
  
  // Sector trends
  'semiconductor stocks AI',
  'energy stocks demand',
  'biotech breakthrough',
  'defense stocks geopolitical',
  
  // Geopolitical
  'sanctions impact stocks',
  'trade deal stocks benefit',
  'war stocks affected',
  
  // Corporate events
  'earnings beat stocks',
  'partnership announced stocks',
  'acquisition target stocks'
];

// Extract ticker symbols from text
function extractTickers(text) {
  // Match patterns like: AAPL, MSFT, $NVDA, (TSLA), etc.
  // More strict patterns to avoid false positives
  const patterns = [
    // Explicit ticker markers (highest confidence)
    /\$([A-Z]{3,5})\b/g,                                    // $AAPL, $MSFT
    /\(([A-Z]{3,5})\)/g,                                    // (TSLA), (NVDA)
    /\bNYSE:\s*([A-Z]{3,5})\b/g,                            // NYSE: AAPL
    /\bNASDAQ:\s*([A-Z]{3,5})\b/g,                          // NASDAQ: MSFT
    
    // Contextual patterns (medium confidence - only 3-5 chars)
    /\b([A-Z]{3,5})\b(?=\s+(?:stock|shares|rose|fell|gained|dropped|surged|jumped|rallied))/g,
    /(?:stock|shares)\s+([A-Z]{3,5})\b/g,                  // "stock AAPL", "shares TSLA"
    /\b([A-Z]{3,5})\s+\([A-Z]{3,5}\)/g                      // Apple AAPL (AAPL)
  ];
  
  const tickers = new Set();
  
  patterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      // Extract ticker from capture group or full match
      let ticker = match[1] || match[0];
      // Clean up
      ticker = ticker.replace(/[$()NYSE:NASDAQ:\s]/g, '');
      // Only accept 3-5 character tickers (filters out AI, US, etc.)
      if (ticker.length >= 3 && ticker.length <= 5) {
        tickers.add(ticker);
      }
    }
  });
  
  return Array.from(tickers);
}

// Search news using Brave API
async function searchNews(query, braveApiKey) {
  if (!braveApiKey) {
    console.log('  ⚠️  No Brave API key');
    return [];
  }
  
  try {
    const url = `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(query)}&count=10&freshness=pd`;
    
    const res = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': braveApiKey
      },
      timeout: 10000
    });
    
    return res.data.results || [];
  } catch (error) {
    console.log(`  ✗ Search error: ${error.message}`);
    return [];
  }
}

// Discover trending stocks from news
async function discoverStocks(braveApiKey) {
  console.log('🔍 Discovering stocks from financial news...\n');
  
  const allArticles = [];
  const tickerMentions = {};
  const sectorMentions = {};
  
  // Search for each query
  for (const query of SEARCH_QUERIES) {
    console.log(`  Searching: "${query}"`);
    const articles = await searchNews(query, braveApiKey);
    console.log(`    Found: ${articles.length} articles`);
    
    allArticles.push(...articles);
    
    // Extract tickers from articles
    articles.forEach(article => {
      const text = `${article.title} ${article.description}`.toUpperCase();
      const tickers = extractTickers(text);
      
      tickers.forEach(ticker => {
        if (!tickerMentions[ticker]) {
          tickerMentions[ticker] = {
            count: 0,
            articles: [],
            sentiment: []
          };
        }
        tickerMentions[ticker].count++;
        tickerMentions[ticker].articles.push({
          title: article.title,
          url: article.url,
          published: article.age || article.published_at
        });
      });
      
      // Track sector mentions
      const sectors = {
        'semiconductor': /semiconductor|chip|AI|artificial intelligence|GPU|processor/i,
        'energy': /energy|oil|gas|renewable|solar|wind/i,
        'biotech': /biotech|pharma|drug|medical|healthcare/i,
        'defense': /defense|military|weapon|aerospace/i,
        'finance': /bank|financial|fintech|payment/i,
        'retail': /retail|consumer|ecommerce/i
      };
      
      Object.entries(sectors).forEach(([sector, pattern]) => {
        if (pattern.test(text)) {
          sectorMentions[sector] = (sectorMentions[sector] || 0) + 1;
        }
      });
    });
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n📊 Discovery Results:`);
  console.log(`  Total articles: ${allArticles.length}`);
  console.log(`  Unique tickers found: ${Object.keys(tickerMentions).length}`);
  
  // Sort by mention count
  const rankedTickers = Object.entries(tickerMentions)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 30) // Top 30
    .map(([ticker, data]) => ({
      ticker,
      mentions: data.count,
      articles: data.articles
    }));
  
  console.log(`\n🔥 Top Trending Tickers:`);
  rankedTickers.slice(0, 10).forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.ticker} - ${item.mentions} mentions`);
  });
  
  console.log(`\n📈 Hot Sectors:`);
  Object.entries(sectorMentions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([sector, count]) => {
      console.log(`  ${sector}: ${count} mentions`);
    });
  
  return {
    tickers: rankedTickers,
    sectors: sectorMentions,
    articles: allArticles
  };
}

module.exports = {
  discoverStocks,
  extractTickers,
  searchNews
};
