/**
 * 抓取 arXiv 语音相关论文
 * 分类: eess.AS (Audio and Speech Processing), cs.SD (Sound)
 */

const https = require('https');
const xml2js = require('xml2js');

const ARXIV_API = 'http://export.arxiv.org/api/query';
const CATEGORIES = ['eess.AS', 'cs.SD'];

async function fetchArxivPapers(category, maxResults = 20) {
  const query = `cat:${category}`;
  const url = `${ARXIV_API}?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        try {
          const parser = new xml2js.Parser();
          const result = await parser.parseStringPromise(data);
          const entries = result.feed.entry || [];
          
          const papers = entries.map(entry => ({
            id: entry.id[0],
            title: entry.title[0].replace(/\s+/g, ' ').trim(),
            authors: (entry.author || []).map(a => a.name[0]),
            summary: (entry.summary[0] || '').replace(/\s+/g, ' ').trim().substring(0, 300),
            published: entry.published[0],
            updated: entry.updated[0],
            category: category,
            link: entry.id[0],
            pdf: entry.id[0].replace('/abs/', '/pdf/') + '.pdf'
          }));
          
          resolve(papers);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function fetchTodayPapers() {
  const allPapers = [];
  
  for (const category of CATEGORIES) {
    try {
      const papers = await fetchArxivPapers(category, 15);
      
      // 过滤今天的论文
      const today = new Date().toISOString().split('T')[0];
      const todayPapers = papers.filter(p => {
        const pubDate = new Date(p.published).toISOString().split('T')[0];
        return pubDate === today;
      });
      
      allPapers.push(...todayPapers);
      console.log(`[${category}] 找到 ${todayPapers.length} 篇今日论文`);
    } catch (err) {
      console.error(`[${category}] 抓取失败:`, err.message);
    }
  }
  
  // 去重
  const uniquePapers = [...new Map(allPapers.map(p => [p.id, p])).values()];
  return uniquePapers;
}

module.exports = { fetchArxivPapers, fetchTodayPapers };

// 直接运行测试
if (require.main === module) {
  fetchTodayPapers().then(papers => {
    console.log(JSON.stringify(papers, null, 2));
  });
}