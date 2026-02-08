// Sentiment analysis module
// This will be called by Kimi sub-agent for bulk news processing

// Bullish keywords and their weights
const BULLISH_SIGNALS = {
  strong: ['breakthrough', 'surges', 'soars', 'record high', 'beats estimates', 'exceeds', 'partnership', 'acquisition', 'expansion', 'approved', 'breakthrough'],
  medium: ['gains', 'rises', 'growth', 'increase', 'positive', 'upgrade', 'buy rating', 'demand', 'revenue'],
  weak: ['stable', 'maintains', 'holds', 'steady']
};

// Bearish keywords and their weights
const BEARISH_SIGNALS = {
  strong: ['plunges', 'crashes', 'scandal', 'fraud', 'bankruptcy', 'lawsuit', 'recall', 'investigation', 'suspended'],
  medium: ['falls', 'drops', 'declines', 'miss', 'downgrade', 'sell rating', 'loss', 'cuts'],
  weak: ['weakness', 'concerns', 'uncertainty', 'cautious']
};

// Calculate sentiment score from text
function calculateSentiment(text) {
  const lowerText = text.toLowerCase();
  let score = 0;
  let signals = [];
  
  // Check bullish signals
  Object.entries(BULLISH_SIGNALS).forEach(([weight, keywords]) => {
    keywords.forEach(keyword => {
      if (lowerText.includes(keyword)) {
        const value = weight === 'strong' ? 0.3 : weight === 'medium' ? 0.15 : 0.05;
        score += value;
        signals.push(`+${keyword}`);
      }
    });
  });
  
  // Check bearish signals
  Object.entries(BEARISH_SIGNALS).forEach(([weight, keywords]) => {
    keywords.forEach(keyword => {
      if (lowerText.includes(keyword)) {
        const value = weight === 'strong' ? -0.3 : weight === 'medium' ? -0.15 : -0.05;
        score += value;
        signals.push(`-${keyword}`);
      }
    });
  });
  
  // Normalize to -1 to +1 range
  score = Math.max(-1, Math.min(1, score));
  
  return {
    score,
    signals: signals.slice(0, 5),
    confidence: signals.length > 0 ? 'high' : 'low'
  };
}

// Analyze multiple articles for a ticker
function analyzeTickerSentiment(articles) {
  if (!articles || articles.length === 0) {
    return {
      score: 0,
      confidence: 'none',
      summary: 'No articles found'
    };
  }
  
  let totalScore = 0;
  let allSignals = [];
  
  articles.forEach(article => {
    const text = `${article.title} ${article.description || ''}`;
    const sentiment = calculateSentiment(text);
    totalScore += sentiment.score;
    allSignals.push(...sentiment.signals);
  });
  
  const avgScore = totalScore / articles.length;
  
  // Get most common signals
  const signalCounts = {};
  allSignals.forEach(signal => {
    signalCounts[signal] = (signalCounts[signal] || 0) + 1;
  });
  
  const topSignals = Object.entries(signalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([signal]) => signal);
  
  return {
    score: avgScore,
    confidence: articles.length >= 3 ? 'high' : articles.length >= 2 ? 'medium' : 'low',
    summary: topSignals.join(', ') || 'Mixed sentiment',
    articleCount: articles.length
  };
}

// Identify key catalysts from articles
function extractCatalysts(articles) {
  const catalysts = [];
  
  const catalystPatterns = [
    { pattern: /partnership|collaboration|deal/i, type: 'Partnership' },
    { pattern: /acquisition|acquires|bought/i, type: 'Acquisition' },
    { pattern: /earnings|revenue|profit/i, type: 'Earnings' },
    { pattern: /product|launch|release/i, type: 'Product Launch' },
    { pattern: /upgrade|rating/i, type: 'Analyst Upgrade' },
    { pattern: /contract|wins|awarded/i, type: 'Contract Win' },
    { pattern: /regulation|approval|cleared/i, type: 'Regulatory Approval' },
    { pattern: /demand|orders|sales/i, type: 'Demand Increase' }
  ];
  
  articles.forEach(article => {
    const text = `${article.title} ${article.description || ''}`;
    
    catalystPatterns.forEach(({ pattern, type }) => {
      if (pattern.test(text)) {
        catalysts.push({
          type,
          headline: article.title,
          url: article.url
        });
      }
    });
  });
  
  // Deduplicate by type
  const uniqueCatalysts = {};
  catalysts.forEach(cat => {
    if (!uniqueCatalysts[cat.type]) {
      uniqueCatalysts[cat.type] = cat;
    }
  });
  
  return Object.values(uniqueCatalysts);
}

module.exports = {
  calculateSentiment,
  analyzeTickerSentiment,
  extractCatalysts
};
