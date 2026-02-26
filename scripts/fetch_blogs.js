/**
 * 抓取关注博主的最新文章
 * 使用 RSS 解析
 */

const https = require('https');
const http = require('http');
const xml2js = require('xml2js');

const BLOGS = [
  {
    name: '宝玉的博客',
    url: 'https://baoyu.io/blog',
    rss: 'https://baoyu.io/feed.xml'
  },
  {
    name: '苏剑林的博客',
    url: 'https://kexue.fm/',
    rss: 'https://kexue.fm/feed'
  },
  {
    name: '阮一峰的网络日志',
    url: 'http://www.ruanyifeng.com/blog/',
    rss: 'http://www.ruanyifeng.com/blog/atom.xml'
  }
];

async function fetchRSS(rssUrl) {
  const client = rssUrl.startsWith('https') ? https : http;
  const url = new URL(rssUrl);
  
  return new Promise((resolve, reject) => {
    const req = client.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI-Daily-Bot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
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
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

function parseFeed(feed, blogInfo) {
  // RSS 2.0 格式
  if (feed.rss?.channel?.[0]?.item) {
    const items = feed.rss.channel[0].item;
    return items.map(item => {
      const link = Array.isArray(item.link) ? item.link[0] : item.link;
      return {
        title: item.title?.[0] || item.title || 'Untitled',
        link: typeof link === 'object' ? link?._ || link?.$.href : link,
        published: item.pubDate?.[0] || item.published?.[0] || item.dc?.date?.[0] || new Date().toISOString(),
        summary: (item.description?.[0] || item.summary?.[0] || '').replace(/<[^>]*>/g, '').substring(0, 200),
        source: blogInfo.name,
        sourceUrl: blogInfo.url
      };
    }).filter(item => item.link);
  }
  
  // Atom 格式
  if (feed.feed?.entry) {
    const items = feed.feed.entry;
    return items.map(item => {
      const links = item.link || [];
      const altLink = links.find(l => l.$?.rel === 'alternate' || !l.$?.rel) || links[0];
      const href = altLink?.$.href || altLink?._ || item.id?.[0];
      
      const title = item.title?.[0]?._ || item.title?.[0]?.toString() || item.title?.[0] || 'Untitled';
      
      return {
        title: title,
        link: href,
        published: item.published?.[0] || item.updated?.[0] || new Date().toISOString(),
        summary: (item.summary?.[0]?._ || item.summary?.[0] || item.content?.[0]?._ || '').replace(/<[^>]*>/g, '').substring(0, 200),
        source: blogInfo.name,
        sourceUrl: blogInfo.url
      };
    }).filter(item => item.link);
  }
  
  console.warn(`[${blogInfo.name}] 无法解析 RSS 格式`);
  return [];
}

async function fetchBlogPosts(daysBack = 7) {
  const allPosts = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  for (const blog of BLOGS) {
    try {
      console.log(`[${blog.name}] 正在抓取...`);
      const feed = await fetchRSS(blog.rss);
      const posts = parseFeed(feed, blog);
      
      // 过滤最近的文章
      const recentPosts = posts.filter(post => {
        const pubDate = new Date(post.published);
        return pubDate >= cutoffDate;
      });
      
      console.log(`[${blog.name}] 找到 ${recentPosts.length} 篇近期文章`);
      allPosts.push(...recentPosts);
    } catch (err) {
      console.error(`[${blog.name}] 抓取失败:`, err.message);
    }
  }
  
  // 按日期排序
  allPosts.sort((a, b) => new Date(b.published) - new Date(a.published));
  
  return allPosts;
}

module.exports = { fetchBlogPosts, BLOGS };

// 直接运行测试
if (require.main === module) {
  fetchBlogPosts(7).then(posts => {
    console.log(JSON.stringify(posts, null, 2));
  });
}