/**
 * 生成日报主脚本
 * 整合三个板块：AI前沿、语音论文、博主动态
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { fetchAINews } = require('./fetch_ai_news');
const { fetchBlogPosts } = require('./fetch_blogs');
const xml2js = require('xml2js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SITE_DIR = path.join(__dirname, '..', 'site');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SITE_DIR)) fs.mkdirSync(SITE_DIR, { recursive: true });

// 使用 MyMemory 翻译 API（免费）
async function translateToChinese(text) {
  if (!text || text.length < 2) return text;
  
  // 如果已经是中文为主，直接返回
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  if (chineseChars.length > text.length * 0.3) return text;
  
  return new Promise((resolve) => {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.substring(0, 500))}&langpair=en|zh`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.responseStatus === 200 && result.responseData?.translatedText) {
            resolve(result.responseData.translatedText);
          } else {
            resolve(text);
          }
        } catch {
          resolve(text);
        }
      });
    }).on('error', () => resolve(text));
  });
}

// 生成简短摘要（完整句子，不截断）
function generateShortSummary(text, maxLen = 200) {
  if (!text) return '';
  
  // 清理文本
  let summary = text.replace(/\s+/g, ' ').trim();
  
  // 如果已经很短，直接返回
  if (summary.length <= maxLen) return summary;
  
  // 找到合适的截断点（句子结束）
  const truncated = summary.substring(0, maxLen);
  const lastPeriod = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('！'),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf('？')
  );
  
  if (lastPeriod > maxLen * 0.5) {
    return truncated.substring(0, lastPeriod + 1);
  }
  
  // 如果没有合适的句子结束符，在单词边界截断
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.5) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

// 抓取 arXiv 论文
async function fetchArxivPapers() {
  const categories = ['eess.AS', 'cs.SD'];
  const allPapers = [];
  
  // 只获取今天的论文
  const today = new Date().toISOString().split('T')[0];
  
  for (const cat of categories) {
    try {
      const query = `cat:${cat}`;
      const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=30`;
      
      const data = await new Promise((resolve, reject) => {
        https.get(url, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(body));
        }).on('error', reject);
      });
      
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(data);
      const entries = result?.feed?.entry || [];
      
      const papers = entries
        .map(e => ({
          id: e.id[0],
          title: e.title[0].replace(/\s+/g, ' ').trim(),
          authors: (e.author || []).map(a => a.name[0]).slice(0, 3),
          summary: (e.summary[0] || '').replace(/\s+/g, ' ').trim().substring(0, 500),
          published: e.published[0],
          category: cat,
          link: e.id[0],
          pdf: e.id[0].replace('/abs/', '/pdf/') + '.pdf'
        }))
        .filter(p => {
          const pubDate = p.published.split('T')[0];
          return pubDate === today;
        });
      
      console.log(`[arXiv ${cat}] 找到 ${papers.length} 篇今日论文`);
      allPapers.push(...papers);
    } catch (err) {
      console.error(`[arXiv ${cat}] 抓取失败:`, err.message);
    }
  }
  
  return [...new Map(allPapers.map(p => [p.id, p])).values()];
}

// 格式化日期
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    weekday: 'long'
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 生成 HTML 页面
async function generateHTML(data, historyDates = []) {
  const { date, aiNews, papers, blogs } = data;
  const dateStr = formatDate(date);
  
  // 获取历史日期列表（用于侧边栏）
  const historyForSidebar = historyDates.map(h => ({
    filename: h.filename,
    dateShort: h.date
  }));
  
  // 翻译新闻摘要
  console.log('翻译 AI 资讯摘要...');
  const translatedNews = [];
  for (const news of aiNews.slice(0, 15)) {
    const translatedTitle = await translateToChinese(news.title);
    const translatedSummary = await translateToChinese(generateShortSummary(news.summary));
    translatedNews.push({
      ...news,
      translatedTitle,
      translatedSummary
    });
  }
  
  // 翻译论文摘要
  console.log('翻译论文摘要...');
  const translatedPapers = [];
  for (const paper of papers.slice(0, 15)) {
    const translatedSummary = await translateToChinese(generateShortSummary(paper.summary));
    translatedPapers.push({
      ...paper,
      translatedSummary
    });
  }
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 语音日报 - ${dateStr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
      line-height: 1.8;
      color: #333;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      min-height: 100vh;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 50px 30px;
      text-align: center;
      border-radius: 20px;
      margin-bottom: 30px;
      box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);
    }
    h1 { font-size: 2.2em; margin-bottom: 10px; }
    .subtitle { opacity: 0.9; font-size: 1em; }
    
    section {
      background: white;
      border-radius: 16px;
      padding: 30px;
      margin-bottom: 25px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }
    
    h2 {
      color: #333;
      font-size: 1.4em;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 3px solid #667eea;
      display: inline-block;
    }
    
    .item {
      padding: 18px 0;
      border-bottom: 1px solid #eee;
    }
    .item:last-child { border-bottom: none; }
    
    .item h3 { 
      margin-bottom: 10px;
      font-size: 1.05em;
      font-weight: 600;
      line-height: 1.5;
    }
    .item h3 a {
      color: #333;
      text-decoration: none;
      transition: color 0.2s;
    }
    .item h3 a:hover { color: #667eea; }
    
    .meta {
      font-size: 0.85em;
      color: #888;
      margin-bottom: 10px;
    }
    
    .summary {
      color: #555;
      font-size: 0.95em;
      line-height: 1.7;
      background: #f8f9fa;
      padding: 12px 15px;
      border-radius: 8px;
      margin-top: 10px;
    }
    
    .tag {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 0.75em;
      margin-right: 8px;
    }
    
    .pdf-link {
      display: inline-block;
      color: #667eea;
      font-size: 0.85em;
      margin-top: 8px;
      text-decoration: none;
      padding: 5px 12px;
      background: #f0f3ff;
      border-radius: 6px;
      transition: all 0.2s;
    }
    .pdf-link:hover {
      background: #667eea;
      color: white;
    }
    
    nav {
      background: white;
      border-radius: 12px;
      padding: 15px 25px;
      margin-bottom: 25px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      text-align: center;
    }
    nav a {
      color: #667eea;
      text-decoration: none;
      margin: 0 15px;
      font-weight: 500;
      transition: color 0.2s;
    }
    nav a:hover { color: #764ba2; }
    
    /* 侧边栏日期导航 */
    .sidebar {
      position: fixed;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      background: white;
      border-radius: 12px;
      padding: 15px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      max-height: 60vh;
      overflow-y: auto;
      z-index: 100;
      min-width: 140px;
    }
    .sidebar h4 {
      color: #667eea;
      font-size: 0.9em;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px solid #eee;
    }
    .sidebar a {
      display: block;
      color: #666;
      text-decoration: none;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 0.85em;
      margin: 3px 0;
      transition: all 0.2s;
    }
    .sidebar a:hover {
      background: #f0f3ff;
      color: #667eea;
    }
    .sidebar a.active {
      background: #667eea;
      color: white;
    }
    .sidebar a.today {
      color: #667eea;
      font-weight: 600;
    }
    
    @media (max-width: 1200px) {
      .sidebar { display: none; }
    }
    
    footer {
      text-align: center;
      color: #888;
      font-size: 0.85em;
      padding: 30px;
    }
    
    .count {
      background: #667eea;
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.8em;
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🎤 AI 语音日报</h1>
      <p class="subtitle">${dateStr}</p>
    </header>
    
    <nav>
      <a href="#ai-news">📰 AI资讯</a>
      <a href="#papers">🎤 语音论文</a>
      <a href="#blogs">👥 博主动态</a>
      <a href="index.html">📅 历史</a>
    </nav>
    
    <section id="ai-news">
      <h2>📰 AI 前沿资讯 <span class="count">${translatedNews.length}</span></h2>
      ${translatedNews.length > 0 ? translatedNews.map(news => `
        <div class="item">
          <h3><a href="${news.link}" target="_blank">${escapeHtml(news.translatedTitle)}</a></h3>
          <div class="meta">📌 ${news.source}</div>
          ${news.translatedSummary ? `<div class="summary">${escapeHtml(news.translatedSummary)}</div>` : ''}
        </div>
      `).join('') : '<p style="color:#888;text-align:center;padding:20px;">暂无更新</p>'}
    </section>
    
    <section id="papers">
      <h2>🎤 语音前沿论文 <span class="count">${translatedPapers.length}</span></h2>
      <p style="color:#888;font-size:0.9em;margin-bottom:15px;">来源: arXiv eess.AS, cs.SD（标题保留英文原文）</p>
      ${translatedPapers.length > 0 ? translatedPapers.map(paper => `
        <div class="item">
          <h3><a href="${paper.link}" target="_blank">${escapeHtml(paper.title)}</a></h3>
          <div class="meta">
            <span class="tag">${paper.category}</span>
            👤 ${paper.authors.join(', ')}
          </div>
          ${paper.translatedSummary ? `<div class="summary">${escapeHtml(paper.translatedSummary)}</div>` : ''}
          <a href="${paper.pdf}" target="_blank" class="pdf-link">📄 下载 PDF</a>
        </div>
      `).join('') : '<p style="color:#888;text-align:center;padding:20px;">暂无新论文</p>'}
    </section>
    
    <section id="blogs">
      <h2>👥 关注博主动态 <span class="count">${blogs.length}</span></h2>
      ${blogs.length > 0 ? blogs.map(post => `
        <div class="item">
          <h3><a href="${post.link}" target="_blank">${escapeHtml(post.title)}</a></h3>
          <div class="meta">
            ✍️ ${post.source} · 
            📅 ${new Date(post.published).toLocaleDateString('zh-CN')}
          </div>
          ${post.summary ? `<div class="summary">${escapeHtml(post.summary)}</div>` : ''}
        </div>
      `).join('') : '<p style="color:#888;text-align:center;padding:20px;">暂无更新</p>'}
    </section>
    
    <footer>
      <p>🤖 本日报由 AI 自动生成，仅供参考</p>
      <p style="margin-top:8px;color:#aaa;">更新时间: ${new Date().toLocaleString('zh-CN')}</p>
    </footer>
  </div>
  
  <!-- 侧边栏日期导航 -->
  ${historyForSidebar.length > 0 ? `
  <div class="sidebar">
    <h4>📅 历史日报</h4>
    ${historyForSidebar.slice(0, 10).map(d => `
      <a href="${d.filename}" class="${d.filename === `${date}.html` ? 'active' : ''}">${d.dateShort}</a>
    `).join('')}
  </div>
  ` : ''}
</body>
</html>`;
}

// 生成首页
function generateIndex(historyFiles) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 语音日报 - 历史存档</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
      line-height: 1.6;
      color: #333;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      min-height: 100vh;
    }
    .container { max-width: 700px; margin: 0 auto; padding: 20px; }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 50px 30px;
      text-align: center;
      border-radius: 20px;
      margin-bottom: 30px;
      box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);
    }
    h1 { font-size: 2em; margin-bottom: 10px; }
    section {
      background: white;
      border-radius: 16px;
      padding: 30px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }
    h2 { color: #667eea; margin-bottom: 20px; }
    .day-item {
      padding: 18px;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: background 0.2s;
    }
    .day-item:hover { background: #f8f9fa; }
    .day-item:last-child { border-bottom: none; }
    .day-item a {
      color: #333;
      text-decoration: none;
      font-size: 1.1em;
      font-weight: 500;
    }
    .day-item a:hover { color: #667eea; }
    .stats { color: #888; font-size: 0.9em; }
    .stats span { margin-left: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🎤 AI 语音日报</h1>
      <p>历史存档</p>
    </header>
    <section>
      <h2>📅 历史日报</h2>
      ${historyFiles.length > 0 ? historyFiles.map(f => `
        <div class="day-item">
          <a href="${f.filename}">${f.date}</a>
          <div class="stats">
            <span>📰 ${f.aiCount}</span>
            <span>📄 ${f.paperCount}</span>
            <span>📝 ${f.blogCount}</span>
          </div>
        </div>
      `).join('') : '<p style="color:#888;text-align:center;padding:20px;">暂无历史日报</p>'}
    </section>
  </div>
</body>
</html>`;
}

// 主函数
async function main() {
  console.log('='.repeat(50));
  console.log('开始生成日报...');
  console.log('='.repeat(50));
  
  const date = new Date().toISOString().split('T')[0];
  const data = {
    date,
    aiNews: [],
    papers: [],
    blogs: []
  };
  
  // 抓取数据
  console.log('\n[1/3] 抓取 AI 前沿资讯...');
  try {
    data.aiNews = await fetchAINews(1);
    console.log(`✓ 获取 ${data.aiNews.length} 条资讯`);
  } catch (err) {
    console.error('✗ AI 资讯抓取失败:', err.message);
  }
  
  console.log('\n[2/3] 抓取 arXiv 语音论文...');
  try {
    data.papers = await fetchArxivPapers();
    console.log(`✓ 获取 ${data.papers.length} 篇论文`);
  } catch (err) {
    console.error('✗ 论文抓取失败:', err.message);
  }
  
  console.log('\n[3/3] 抓取博主动态...');
  try {
    data.blogs = await fetchBlogPosts();
    console.log(`✓ 获取 ${data.blogs.length} 篇博文`);
  } catch (err) {
    console.error('✗ 博客抓取失败:', err.message);
  }
  
  // 保存原始数据
  const dataFile = path.join(DATA_DIR, `${date}.json`);
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  console.log(`\n✓ 数据已保存: ${dataFile}`);
  
  // 生成 HTML
  console.log('\n生成 HTML 页面（含翻译）...');
  
  // 准备历史日期列表
  const historyFiles = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f)));
      return {
        filename: f.replace('.json', '.html'),
        date: formatDate(f.replace('.json', '')),
        aiCount: d.aiNews?.length || 0,
        paperCount: d.papers?.length || 0,
        blogCount: d.blogs?.length || 0
      };
    })
    .sort((a, b) => b.filename.localeCompare(a.filename));
  
  const html = await generateHTML(data, historyFiles);
  const htmlFile = path.join(SITE_DIR, `${date}.html`);
  fs.writeFileSync(htmlFile, html);
  console.log(`✓ HTML 已生成: ${htmlFile}`);
  
  // 更新首页
  const indexHtml = generateIndex(historyFiles);
  fs.writeFileSync(path.join(SITE_DIR, 'index.html'), indexHtml);
  console.log('✓ 首页已更新');
  
  console.log('\n' + '='.repeat(50));
  console.log('日报生成完成！');
  console.log('='.repeat(50));
  
  return {
    date,
    stats: {
      aiNews: data.aiNews.length,
      papers: data.papers.length,
      blogs: data.blogs.length
    },
    htmlFile,
    data
  };
}

module.exports = { main, generateHTML, generateIndex, translateToChinese };

if (require.main === module) {
  main().catch(console.error);
}