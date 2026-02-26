/**
 * 抓取 AI 前沿资讯
 * 数据源: Hugging Face Papers, Reddit MachineLearning, 科技媒体 RSS
 */

const https = require('https');
const xml2js = require('xml2js');

// 使用更稳定的数据源
const SOURCES = [
  {
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/',
    rss: 'https://techcrunch.com/feed/'
  },
  {
    name: 'MIT Tech Review',
    url: 'https://www.technologyreview.com/topic/artificial-intelligence/',
    rss: 'https://www.technologyreview.com/feed/'
  },
  {
    name: 'AI News',
    url: 'https://artificialintelligence-news.com',
    rss: 'https://artificialintelligence-news.com/feed/'
  },
  {
    name: 'OpenAI Blog',
    url: 'https://openai.com/blog',
    rss: 'https://openai.com/blog/rss.xml'
  },
  {
    name: 'DeepMind Blog',
    url: 'https://deepmind.google',
    rss: 'https://deepmind.com/blog/rss.xml'
  },
  {
    name: 'Anthropic News',
    url: 'https://www.anthropic.com/news',
    rss: 'https://www.anthropic.com/news/rss'
  }
];

async function fetchRSS(rssUrl, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const url = new URL(rssUrl);
    
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      timeout: timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI-Daily-Bot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          const parser = new xml2js.Parser();
          const result = await parser.parseStringPromise(data);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

function parseRSSFeed(feed, sourceName) {
  const items = feed.rss?.channel?.[0]?.item || feed.feed?.entry || [];
  
  return items.slice(0, 20).map(item => {
    let link = '';
    if (Array.isArray(item.link)) {
      link = item.link[0];
      if (typeof link === 'object') link = link.$.href || link._;
    } else {
      link = item.link || item.id?.[0] || '';
    }
    
    let summary = item.description?.[0] || item.summary?.[0] || '';
    summary = summary.replace(/<[^>]*>/g, '').substring(0, 200);
    
    return {
      title: item.title?.[0]?._ || item.title?.[0] || 'Untitled',
      link: link,
      published: item.pubDate?.[0] || item.published?.[0] || item.updated?.[0] || new Date().toISOString(),
      summary: summary,
      source: sourceName
    };
  });
}

async function fetchAINews(daysBack = 1) {
  const allNews = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  for (const source of SOURCES) {
    try {
      console.log(`[${source.name}] 正在抓取...`);
      
      const feed = await fetchRSS(source.rss);
      const items = parseRSSFeed(feed, source.name);
      
      // 过滤最近的文章
      const recentItems = items.filter(item => {
        try {
          const pubDate = new Date(item.published);
          return pubDate >= cutoffDate;
        } catch {
          return true; // 日期解析失败，保留
        }
      });
      
      console.log(`[${source.name}] 找到 ${recentItems.length} 条资讯`);
      allNews.push(...recentItems);
      
    } catch (err) {
      console.error(`[${source.name}] 抓取失败:`, err.message);
    }
  }
  
  // 去重
  const uniqueNews = [...new Map(allNews.map(n => [n.link, n])).values()];
  
  // 按日期排序
  uniqueNews.sort((a, b) => new Date(b.published) - new Date(a.published));
  
  return uniqueNews;
}

module.exports = { fetchAINews, SOURCES };

// 直接运行测试
if (require.main === module) {
  fetchAINews(1).then(news => {
    console.log(JSON.stringify(news, null, 2));
  });
}