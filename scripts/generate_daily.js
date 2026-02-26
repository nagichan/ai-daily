/**
 * 生成日报主脚本
 * 整合三个板块：AI前沿、语音论文、博主动态
 */

const fs = require('fs');
const path = require('path');
const { fetchAINews } = require('./fetch_ai_news');
const { fetchBlogPosts } = require('./fetch_blogs');

// arXiv 抓取 - 使用 HTTP 版本
const http = require('http');
const xml2js = require('xml2js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SITE_DIR = path.join(__dirname, '..', 'site');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SITE_DIR)) fs.mkdirSync(SITE_DIR, { recursive: true });

// 简单翻译词典（常见AI术语）
const TRANSLATIONS = {
  // AI/ML 基础术语
  'AI': '人工智能',
  'ML': '机器学习',
  'LLM': '大语言模型',
  'NLP': '自然语言处理',
  'CV': '计算机视觉',
  'ASR': '自动语音识别',
  'TTS': '语音合成',
  'STT': '语音转文字',
  'AR': '增强现实',
  'VR': '虚拟现实',
  
  // 模型架构
  'Transformer': 'Transformer模型',
  'Attention': '注意力机制',
  'GPT': 'GPT模型',
  'BERT': 'BERT模型',
  'MoE': '混合专家模型',
  'Diffusion': '扩散模型',
  'GAN': '生成对抗网络',
  'VAE': '变分自编码器',
  'RNN': '循环神经网络',
  'CNN': '卷积神经网络',
  'LSTM': '长短期记忆网络',
  
  // 语音相关
  'Speech': '语音',
  'Audio': '音频',
  'Voice': '声音',
  'Speech Recognition': '语音识别',
  'Speech Synthesis': '语音合成',
  'Text-to-Speech': '语音合成',
  'Speaker': '说话人',
  'Diarization': '说话人分离',
  'Voice Conversion': '声音转换',
  'Music': '音乐',
  'Sound': '声音',
  'Acoustic': '声学',
  
  // 技术术语
  'Model': '模型',
  'Training': '训练',
  'Fine-tuning': '微调',
  'Pre-training': '预训练',
  'Inference': '推理',
  'Deployment': '部署',
  'Optimization': '优化',
  'Quantization': '量化',
  'Distillation': '蒸馏',
  
  // 研究方向
  'Zero-shot': '零样本',
  'Few-shot': '少样本',
  'Multi-modal': '多模态',
  'Cross-modal': '跨模态',
  'Self-supervised': '自监督',
  'Reinforcement': '强化学习',
  
  // 常见词汇
  'Generation': '生成',
  'Generation': '生成',
  'Recognition': '识别',
  'Detection': '检测',
  'Classification': '分类',
  'Segmentation': '分割',
  'Extraction': '提取',
  'Enhancement': '增强',
  'Separation': '分离',
  'Restoration': '恢复',
  'Reconstruction': '重建',
  'Representation': '表示',
  'Embedding': '嵌入',
  'Encoding': '编码',
  'Decoding': '解码',
  
  // 公司/机构
  'Google': '谷歌',
  'OpenAI': 'OpenAI',
  'Microsoft': '微软',
  'Meta': 'Meta',
  'Nvidia': '英伟达',
  'Anthropic': 'Anthropic',
  'Amazon': '亚马逊',
  'Apple': '苹果',
  'Salesforce': 'Salesforce',
  'Samsung': '三星',
  'Intel': '英特尔',
  'AMD': 'AMD',
  
  // 其他常见词
  'New': '新',
  'System': '系统',
  'Method': '方法',
  'Framework': '框架',
  'Approach': '方法',
  'Algorithm': '算法',
  'Network': '网络',
  'Layer': '层',
  'Dataset': '数据集',
  'Benchmark': '基准测试',
  'Performance': '性能',
  'Efficiency': '效率',
  'Accuracy': '准确率',
  'Learning': '学习',
  'Based': '基于',
  'Using': '使用',
  'With': '具有',
  'For': '用于',
  'From': '来自',
  'Using': '使用',
  'via': '通过',
  'and': '和',
  'with': '具有',
  'for': '用于',
  'based': '基于',
  'using': '使用',
  'through': '通过',
  'a': '',
  'an': '',
  'the': '',
};

// 翻译函数（基于词典替换）
function translateToChinese(text) {
  if (!text) return '';
  
  let translated = text;
  
  // 按长度排序，从长到短替换（避免短词替换影响长词）
  const terms = Object.keys(TRANSLATIONS).sort((a, b) => b.length - a.length);
  
  for (const term of terms) {
    // 替换时注意单词边界
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    translated = translated.replace(regex, TRANSLATIONS[term]);
  }
  
  return translated;
}

// 翻译标题
function translateTitle(title) {
  if (!title) return '';
  
  // 先翻译已知的术语
  let translated = translateToChinese(title);
  
  // 如果翻译后几乎没有变化，说明没有词典里的词，可能需要保留原文
  // 或者尝试调用翻译API（这里先用简单处理）
  return translated;
}

// 抓取 arXiv 论文
async function fetchArxivPapers() {
  const categories = ['eess.AS', 'cs.SD'];
  const allPapers = [];
  const https = require('https');
  
  // 扩大时间范围：最近3天的论文
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const cutoffDate = threeDaysAgo.toISOString().split('T')[0];
  
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
      
      // 过滤最近3天的论文
      const papers = entries
        .map(e => ({
          id: e.id[0],
          title: e.title[0].replace(/\s+/g, ' ').trim(),
          authors: (e.author || []).map(a => a.name[0]).slice(0, 3),
          summary: (e.summary[0] || '').replace(/\s+/g, ' ').trim().substring(0, 300),
          published: e.published[0],
          category: cat,
          link: e.id[0],
          pdf: e.id[0].replace('/abs/', '/pdf/') + '.pdf'
        }))
        .filter(p => {
          const pubDate = p.published.split('T')[0];
          return pubDate >= cutoffDate;
        });
      
      console.log(`[arXiv ${cat}] 找到 ${papers.length} 篇近期论文`);
      allPapers.push(...papers);
    } catch (err) {
      console.error(`[arXiv ${cat}] 抓取失败:`, err.message);
    }
  }
  
  // 去重
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

// 生成 Markdown 日报
function generateMarkdown(data) {
  const { date, aiNews, papers, blogs } = data;
  const dateStr = formatDate(date);
  
  let md = `# AI 语音日报 - ${dateStr}\n\n`;
  md += `> 自动生成 | 数据更新时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  md += `---\n\n`;
  
  // AI 前沿资讯
  md += `## 📰 AI 前沿资讯\n\n`;
  if (aiNews.length > 0) {
    aiNews.slice(0, 15).forEach((news, i) => {
      md += `### ${i + 1}. [${translateTitle(news.title)}](${news.link})\n`;
      md += `**来源**: ${news.source}\n`;
      if (news.summary) {
        md += `**摘要**: ${news.summary}\n`;
      }
      md += `\n`;
    });
  } else {
    md += `_暂无_\n`;
  }
  
  md += `\n---\n\n`;
  
  // 语音前沿论文
  md += `## 🎤 语音前沿论文\n\n`;
  md += `*来源: arXiv eess.AS, cs.SD*\n\n`;
  if (papers.length > 0) {
    papers.forEach((paper, i) => {
      md += `### ${i + 1}. [${translateTitle(paper.title)}](${paper.link})\n`;
      md += `**作者**: ${paper.authors.join(', ')}\n`;
      md += `**分类**: ${paper.category}\n`;
      md += `**摘要**: ${paper.summary}\n`;
      md += `**PDF**: [下载](${paper.pdf})\n\n`;
    });
  } else {
    md += `_暂无_\n`;
  }
  
  md += `\n---\n\n`;
  
  // 博主动态
  md += `## 👥 关注博主动态\n\n`;
  if (blogs.length > 0) {
    blogs.forEach((post, i) => {
      md += `### ${i + 1}. [${post.title}](${post.link})\n`;
      md += `**来源**: [${post.source}](${post.sourceUrl})\n`;
      const pubDate = new Date(post.published);
      md += `**时间**: ${pubDate.toLocaleDateString('zh-CN')}\n\n`;
      if (post.summary) {
        md += `${post.summary}...\n\n`;
      }
    });
  } else {
    md += `*近期暂无更新*\n\n`;
  }
  
  md += `---\n\n`;
  md += `*本日报由 AI 自动生成，仅供参考*\n`;
  
  return md;
}

// 生成 HTML 页面
function generateHTML(data) {
  const { date, aiNews, papers, blogs } = data;
  const dateStr = formatDate(date);
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 语音日报 - ${dateStr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f7fa;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    h1 { font-size: 2em; margin-bottom: 10px; }
    .subtitle { opacity: 0.9; font-size: 0.95em; }
    section {
      background: white;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 25px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    h2 {
      color: #667eea;
      border-bottom: 2px solid #eee;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .item {
      padding: 15px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .item:last-child { border-bottom: none; }
    .item h3 { 
      margin-bottom: 8px;
      font-size: 1.1em;
    }
    .item h3 a {
      color: #333;
      text-decoration: none;
    }
    .item h3 a:hover { color: #667eea; }
    .meta {
      font-size: 0.85em;
      color: #888;
      margin-bottom: 8px;
    }
    .summary {
      color: #666;
      font-size: 0.95em;
    }
    .tag {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75em;
      margin-right: 5px;
    }
    .pdf-link {
      color: #667eea;
      font-size: 0.85em;
    }
    nav {
      background: white;
      border-radius: 12px;
      padding: 15px 25px;
      margin-bottom: 25px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    nav a {
      color: #667eea;
      text-decoration: none;
      margin-right: 20px;
    }
    nav a:hover { text-decoration: underline; }
    footer {
      text-align: center;
      color: #999;
      font-size: 0.85em;
      padding: 20px;
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
      <a href="index.html">📅 历史日报</a>
    </nav>
    
    <section id="ai-news">
      <h2>📰 AI 前沿资讯</h2>
      ${aiNews.length > 0 ? aiNews.slice(0, 15).map(news => `
        <div class="item">
          <h3><a href="${news.link}" target="_blank">${escapeHtml(translateTitle(news.title))}</a></h3>
          <div class="meta">来源: ${news.source}</div>
          ${news.summary ? `<div class="summary">${escapeHtml(news.summary)}</div>` : ''}
        </div>
      `).join('') : '<p>今日暂无更新</p>'}
    </section>
    
    <section id="papers">
      <h2>🎤 语音前沿论文</h2>
      <p style="color:#888;font-size:0.9em;margin-bottom:15px;">来源: arXiv eess.AS, cs.SD | 标签: ${papers.map(p => p.category).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</p>
      ${papers.length > 0 ? papers.slice(0, 20).map(paper => `
        <div class="item">
          <h3><a href="${paper.link}" target="_blank">${escapeHtml(translateTitle(paper.title))}</a></h3>
          <div class="meta">
            <span class="tag">${paper.category}</span>
            作者: ${paper.authors.join(', ')}${paper.authors.length < 3 ? '' : ' 等'}
          </div>
          <div class="summary">📝 ${escapeHtml(translateTitle(paper.summary))}</div>
          <div style="margin-top:8px;">
            <a href="${paper.pdf}" target="_blank" class="pdf-link">📄 PDF</a>
          </div>
        </div>
      `).join('') : '<p>今日暂无新论文</p>'}
    </section>
    
    <section id="blogs">
      <h2>👥 关注博主动态</h2>
      ${blogs.length > 0 ? blogs.map(post => `
        <div class="item">
          <h3><a href="${post.link}" target="_blank">${escapeHtml(post.title)}</a></h3>
          <div class="meta">
            来源: <a href="${post.sourceUrl}" target="_blank">${post.source}</a> · 
            ${new Date(post.published).toLocaleDateString('zh-CN')}
          </div>
          ${post.summary ? `<div class="summary">📝 ${escapeHtml(post.summary)}</div>` : ''}
        </div>
      `).join('') : '<p>近期暂无更新</p>'}
    </section>
    
    <footer>
      <p>本日报由 AI 自动生成，仅供参考</p>
      <p style="margin-top:5px;">数据更新时间: ${new Date().toLocaleString('zh-CN')}</p>
    </footer>
  </div>
</body>
</html>`;
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

// 生成首页（历史列表）
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f7fa;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    h1 { font-size: 2em; margin-bottom: 10px; }
    section {
      background: white;
      border-radius: 12px;
      padding: 25px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    h2 {
      color: #667eea;
      margin-bottom: 20px;
    }
    .day-item {
      padding: 15px;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .day-item:last-child { border-bottom: none; }
    .day-item a {
      color: #333;
      text-decoration: none;
      font-size: 1.1em;
    }
    .day-item a:hover { color: #667eea; }
    .stats { color: #888; font-size: 0.9em; }
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
          <span class="stats">资讯 ${f.aiCount} / 论文 ${f.paperCount} / 博客 ${f.blogCount}</span>
        </div>
      `).join('') : '<p>暂无历史日报</p>'}
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
    data.blogs = await fetchBlogPosts(7);  // 最近7天
    console.log(`✓ 获取 ${data.blogs.length} 篇博文`);
  } catch (err) {
    console.error('✗ 博客抓取失败:', err.message);
  }
  
  // 保存数据
  const dataFile = path.join(DATA_DIR, `${date}.json`);
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  console.log(`\n✓ 数据已保存: ${dataFile}`);
  
  // 生成 Markdown
  const md = generateMarkdown(data);
  const mdFile = path.join(SITE_DIR, `${date}.md`);
  fs.writeFileSync(mdFile, md);
  console.log(`✓ Markdown 已生成: ${mdFile}`);
  
  // 生成 HTML
  const html = generateHTML(data);
  const htmlFile = path.join(SITE_DIR, `${date}.html`);
  fs.writeFileSync(htmlFile, html);
  console.log(`✓ HTML 已生成: ${htmlFile}`);
  
  // 更新首页
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
  
  const indexHtml = generateIndex(historyFiles);
  fs.writeFileSync(path.join(SITE_DIR, 'index.html'), indexHtml);
  console.log('✓ 首页已更新');
  
  console.log('\n' + '='.repeat(50));
  console.log('日报生成完成！');
  console.log('='.repeat(50));
  
  // 返回日报摘要（用于推送）
  return {
    date,
    stats: {
      aiNews: data.aiNews.length,
      papers: data.papers.length,
      blogs: data.blogs.length
    },
    mdFile,
    htmlFile,
    data
  };
}

// 导出
module.exports = { main, generateMarkdown, generateHTML, generateIndex };

// 直接运行
if (require.main === module) {
  main().catch(console.error);
}