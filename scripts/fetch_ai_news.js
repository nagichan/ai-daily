/**
 * 抓取 AI 前沿资讯
 * 数据源: 机器之心、新智元、量子位
 */

const https = require('https');
const xml2js = require('xml2js');

// 中国AI媒体源（使用RSSHub公共实例）
const SOURCES = [
  {
    name: '机器之心',
    url: 'https://www.jiqizhixin.com',
    // 尝试多个RSSHub实例
    rss: [
      'https://rsshub.app/jiqizhixin',
      'https://rsshub.rssforever.com/jiqizhixin',
    ]
  },
  {
    name: '新智元',
    url: 'https://www.jiqizhixin.com',
    rss: [
      'https://rsshub.app/newzhidian',
      'https://rsshub.rssforever.com/newzhidian',
    ]
  },
  {
    name: '量子位',
    url: 'https://www.qbitai.com',
    rss: [
      'https://rsshub.app/qbitai',
      'https://rsshub.rssforever.com/qbitai',
    ]
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
  
  return items.slice(0, 15).map(item => {
    let link = '';
    if (Array.isArray(item.link)) {
      link = item.link[0];
      if (typeof link === 'object') link = link._ || link.$.href || link;
    } else {
      link = item.link || item.id?.[0] || '';
    }
    
    let summary = item.description?.[0] || item.summary?.[0] || '';
    summary = summary.replace(/<[^>]*>/g, '').substring(0, 200);
    
    return {
      title: item.title?.[0]?._ || item.title?.[0]?.toString() || item.title?.[0] || 'Untitled',
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
    let success = false;
    
    // 尝试多个RSS实例
    for (const rssUrl of source.rss) {
      if (success) break;
      
      try {
        console.log(`[${source.name}] 正在尝试: ${rssUrl}`);
        const feed = await fetchRSS(rssUrl);
        const items = parseRSSFeed(feed, source.name);
        
        // 过滤最近的文章
        const recentItems = items.filter(item => {
          try {
            const pubDate = new Date(item.published);
            return pubDate >= cutoffDate;
          } catch {
            return true;
          }
        });
        
        console.log(`[${source.name}] 找到 ${recentItems.length} 条资讯`);
        allNews.push(...recentItems);
        success = true;
      } catch (err) {
        console.error(`[${source.name}] ${rssUrl} 失败:`, err.message);
      }
    }
    
    if (!success) {
      console.error(`[${source.name}] 所有源都失败`);
    }
  }
  
  // 去重
  const uniqueNews = [...new Map(allNews.map(n => [n.link, n])).values()];
  
  // 按日期排序
  uniqueNews.sort((a, b) => new Date(b.published) - new Date(a.published));
  
  return uniqueNews;
}

module.exports = { fetchAINews, SOURCES };

if (require.main === module) {
  fetchAINews(1).then(news => {
    console.log(JSON.stringify(news, null, 2));
  });
}