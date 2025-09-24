const express = require('express');
const axios = require('axios');
const { JSDOM } = require('jsdom');

const app = express();
app.use(express.json());

// 新增：从 HTML 提取 x_bogus
function extractXbogus(html) {
  const match = html.match(/x-bogus="([a-zA-Z0-9=]+)/);
  return match ? match[1] : null;
}

app.post('/parse', async (req, res) => {
  try {
    const input = req.body.input;
    if (!input) return res.status(400).json({ error: "缺少 input" });

    // 1. 提取短链接
    const shortUrl = input.match(/https?:\/\/v\.douyin\.com\/[^\s]+/)?.[0];
    if (!shortUrl) return res.status(400).json({ error: "未找到抖音链接" });

    // 2. 获取跳转页面（关键：获取 x_bogus）
    const htmlRes = await axios.get(shortUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    // 3. 从 HTML 提取 x_bogus 和 aweme_id
    const xbogus = extractXbogus(htmlRes.data);
    const awemeId = htmlRes.request.res.responseUrl.match(/modal_id=(\d+)/)?.[1] || 
                   htmlRes.request.res.responseUrl.match(/video\/(\d+)/)?.[1];

    if (!awemeId) {
      return res.status(400).json({ 
        error: "无法提取 aweme_id", 
        debug: htmlRes.request.res.responseUrl 
      });
    }

    // 4. 使用 x_bogus 请求真实 API
    const apiRes = await axios.get(`https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'x-bogus': xbogus,
        'Referer': shortUrl
      }
    });

    const detail = apiRes.data?.aweme_detail;
    if (!detail) {
      return res.status(400).json({ 
        error: "视频数据获取失败", 
        debug: apiRes.data 
      });
    }

    // 5. 返回结果
    const d = new Date(detail.create_time * 1000);
    res.json({
      success: true,
      video_url: detail.video.play_addr.url_list[0],
      desc: detail.desc,
      author: detail.author.nickname,
      create_time: `${d.getMonth() + 1}.${d.getDate()}`,
      like_count: detail.statistics.digg_count,
      comment_count: detail.statistics.comment_count,
      collect_count: detail.statistics.collect_count,
      share_count: detail.statistics.share_count
    });
  } catch (err) {
    res.status(500).json({ 
      error: err.message, 
      debug: err.response?.data || "无详细错误" 
    });
  }
});

app.get('/', (req, res) => res.send('OK'));
app.listen(process.env.PORT || 3000);
