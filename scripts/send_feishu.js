/**
 * 发送日报到飞书
 * 使用 OpenClaw 的 message 工具
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');

function getLatestDaily() {
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) return null;
  
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[0]), 'utf8'));
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    weekday: 'long'
  });
}

function truncate(str, maxLen = 50) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function buildFeishuCard(data) {
  const { date, aiNews, papers, blogs } = data;
  const dateStr = formatDate(date);
  const siteUrl = 'https://nagichan.github.io/ai-daily/';
  
  const elements = [];
  
  // AI 资讯
  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: `**📰 AI 前沿资讯** (${aiNews.length} 条)` }
  });
  
  if (aiNews.length > 0) {
    const newsList = aiNews.slice(0, 5).map((n, i) => 
      `${i + 1}. [${truncate(n.title, 40)}](${n.link})`
    ).join('\n');
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: newsList + (aiNews.length > 5 ? `\n_...还有 ${aiNews.length - 5} 条_` : '') }
    });
  } else {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '_今日暂无更新_' } });
  }
  
  elements.push({ tag: 'hr' });
  
  // 语音论文
  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: `**🎤 语音前沿论文** (${papers.length} 篇)` }
  });
  
  if (papers.length > 0) {
    const paperList = papers.slice(0, 5).map((p, i) => 
      `${i + 1}. [${truncate(p.title, 40)}](${p.link})`
    ).join('\n');
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: paperList + (papers.length > 5 ? `\n_...还有 ${papers.length - 5} 篇_` : '') }
    });
  } else {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '_今日暂无新论文_' } });
  }
  
  elements.push({ tag: 'hr' });
  
  // 博主动态
  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: `**👥 关注博主动态** (${blogs.length} 篇)` }
  });
  
  if (blogs.length > 0) {
    const blogList = blogs.slice(0, 5).map((b, i) => 
      `${i + 1}. [${truncate(b.title, 40)}](${b.link}) - ${b.source}`
    ).join('\n');
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: blogList + (blogs.length > 5 ? `\n_...还有 ${blogs.length - 5} 篇_` : '') }
    });
  } else {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '_近期暂无更新_' } });
  }
  
  elements.push({ tag: 'hr' });
  
  // 按钮
  elements.push({
    tag: 'action',
    actions: [{
      tag: 'button',
      text: { tag: 'plain_text', content: '📖 查看完整日报' },
      type: 'primary',
      url: siteUrl
    }]
  });
  
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: `🎤 AI 语音日报 - ${dateStr}` },
      template: 'blue'
    },
    elements
  };
}

async function sendToFeishu(card) {
  // 使用 openclaw 命令发送消息
  const cardJson = JSON.stringify(card);
  
  return new Promise((resolve, reject) => {
    const proc = spawn('openclaw', [
      'message', 'send',
      '--channel', 'feishu',
      '--card', cardJson
    ], {
      env: { ...process.env }
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', data => stdout += data);
    proc.stderr.on('data', data => stderr += data);
    
    proc.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `Exit code ${code}`));
    });
  });
}

async function main() {
  console.log('获取最新日报数据...');
  const data = getLatestDaily();
  
  if (!data) {
    console.error('没有找到日报数据');
    process.exit(1);
  }
  
  console.log(`日期: ${data.date}`);
  console.log(`AI资讯: ${data.aiNews.length} 条`);
  console.log(`论文: ${data.papers.length} 篇`);
  console.log(`博客: ${data.blogs.length} 篇`);
  
  const card = buildFeishuCard(data);
  console.log('\n飞书卡片已生成');
  
  // 直接输出卡片 JSON，让外部调用
  console.log('\n--- CARD_JSON ---');
  console.log(JSON.stringify(card));
  console.log('--- END_CARD ---');
}

main().catch(console.error);