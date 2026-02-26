/**
 * 推送日报到飞书
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// 生成飞书推送消息
function generateFeishuMessage(data) {
  const { date, aiNews, papers, blogs } = data;
  
  const dateFormatted = new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });
  
  // 构建消息卡片
  const card = {
    config: {
      wide_screen_mode: true
    },
    header: {
      title: {
        tag: 'plain_text',
        content: `🎤 AI 语音日报 - ${dateFormatted}`
      },
      template: 'blue'
    },
    elements: []
  };
  
  // AI 资讯板块
  card.elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: `**📰 AI 前沿资讯** (${aiNews.length} 条)`
    }
  });
  
  if (aiNews.length > 0) {
    const newsList = aiNews.slice(0, 5).map((news, i) => 
      `${i + 1}. [${truncate(news.title, 50)}](${news.link})`
    ).join('\n');
    
    card.elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: newsList + (aiNews.length > 5 ? `\n_...还有 ${aiNews.length - 5} 条_` : '')
      }
    });
  } else {
    card.elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: '_今日暂无更新_'
      }
    });
  }
  
  card.elements.push({ tag: 'hr' });
  
  // 语音论文板块
  card.elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: `**🎤 语音前沿论文** (${papers.length} 篇)`
    }
  });
  
  if (papers.length > 0) {
    const paperList = papers.slice(0, 5).map((paper, i) => 
      `${i + 1}. [${truncate(paper.title, 50)}](${paper.link})`
    ).join('\n');
    
    card.elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: paperList + (papers.length > 5 ? `\n_...还有 ${papers.length - 5} 篇_` : '')
      }
    });
  } else {
    card.elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: '_今日暂无新论文_'
      }
    });
  }
  
  card.elements.push({ tag: 'hr' });
  
  // 博主动态板块
  card.elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: `**👥 关注博主动态** (${blogs.length} 篇)`
    }
  });
  
  if (blogs.length > 0) {
    const blogList = blogs.slice(0, 5).map((post, i) => 
      `${i + 1}. [${truncate(post.title, 50)}](${post.link}) - ${post.source}`
    ).join('\n');
    
    card.elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: blogList + (blogs.length > 5 ? `\n_...还有 ${blogs.length - 5} 篇_` : '')
      }
    });
  } else {
    card.elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: '_近期暂无更新_'
      }
    });
  }
  
  // 查看完整版按钮
  card.elements.push({ tag: 'hr' });
  card.elements.push({
    tag: 'action',
    actions: [
      {
        tag: 'button',
        text: {
          tag: 'plain_text',
          content: '📖 查看完整日报'
        },
        type: 'primary',
        // 这里需要替换成实际的网站地址
        url: 'https://your-site-url.com'
      }
    ]
  });
  
  return card;
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

// 生成简单的 Markdown 消息（备用）
function generateMarkdownMessage(data) {
  const { date, aiNews, papers, blogs } = data;
  
  let msg = `🎤 **AI 语音日报**\n📅 ${date}\n\n`;
  
  msg += `**📰 AI 资讯** (${aiNews.length} 条)\n`;
  if (aiNews.length > 0) {
    msg += aiNews.slice(0, 3).map((n, i) => `${i + 1}. ${truncate(n.title, 40)}`).join('\n');
    if (aiNews.length > 3) msg += `\n_...还有 ${aiNews.length - 3} 条_`;
  } else {
    msg += '_暂无更新_';
  }
  
  msg += `\n\n**🎤 语音论文** (${papers.length} 篇)\n`;
  if (papers.length > 0) {
    msg += papers.slice(0, 3).map((p, i) => `${i + 1}. ${truncate(p.title, 40)}`).join('\n');
    if (papers.length > 3) msg += `\n_...还有 ${papers.length - 3} 篇_`;
  } else {
    msg += '_暂无新论文_';
  }
  
  msg += `\n\n**👥 博主动态** (${blogs.length} 篇)\n`;
  if (blogs.length > 0) {
    msg += blogs.slice(0, 3).map((b, i) => `${i + 1}. ${truncate(b.title, 40)}`).join('\n');
    if (blogs.length > 3) msg += `\n_...还有 ${blogs.length - 3} 篇_`;
  } else {
    msg += '_暂无更新_';
  }
  
  return msg;
}

// 获取最新日报数据
function getLatestDaily() {
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    return null;
  }
  
  const latestFile = path.join(DATA_DIR, files[0]);
  return JSON.parse(fs.readFileSync(latestFile, 'utf8'));
}

module.exports = { 
  generateFeishuMessage, 
  generateMarkdownMessage,
  getLatestDaily 
};

if (require.main === module) {
  const latest = getLatestDaily();
  if (latest) {
    console.log('=== 飞书卡片消息 ===');
    console.log(JSON.stringify(generateFeishuMessage(latest), null, 2));
    console.log('\n=== Markdown 消息 ===');
    console.log(generateMarkdownMessage(latest));
  } else {
    console.log('暂无日报数据');
  }
}