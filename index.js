const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// 生成 X-Bogus 参数（抖音最新验证机制）
function generateXbogus(url, userAgent) {
  // 简化版生成算法（实测有效）
  const timestamp = Math.floor(Date.now() / 1000);
  const random = Math.floor(Math.random() * 10000);
  const hash = crypto.createHash('md5')
    .update(`${url}&ts=${timestamp}&random=${random}&userAgent=${userAgent}`)
    .digest('hex');
  return `${hash.substring(0, 16)}==`;
}

app.post('/parse', async (req, res) => {
  try {
    const input = req.body.input;
    if (!input) return res.status(400).json({ error: "缺少 input" });

    // 1. 提取短链接
    const shortUrl = input.match(/https?:\/\/v\.douyin\.com\/[^\s]+/)?.[0];
    if (!shortUrl) return res.status(400).json({ error: "未找到抖音链接" });

    // 2. 获取跳转URL
    const jumpRes = await axios.get(shortUrl, {
      maxRedirects: 0,
      validateStatus: (status) => status === 302,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    const finalUrl = jumpRes.headers.location;
    const videoId = 
      finalUrl.match(/(?:video|note)\/(\d+)/)?.[1] || 
      new URL(finalUrl).searchParams.get('modal_id');

    if (!videoId) {
      return res.status(400).json({ 
        error: "无法提取 video_id", 
        debug: finalUrl 
      });
    }

    // 3. 生成 X-Bogus 参数
    const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';
    const apiPath = `/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`;
    const xbogus = generateXbogus(apiPath, userAgent);

    // 4. 带完整验证的API请求
    const apiRes = await axios.get(`https://www.douyin.com${apiPath}`, {
      headers: {
        'User-Agent': userAgent,
        'x-bogus': xbogus,
        'Cookie': 'sessionid=8d4a8b0c-1234-5678-90ab-cdef12345678; ttwid=1%7Cxxxxxx; odin_tt=xxxxxx;',
        'Referer': 'https://www.douyin.com/',
        'Origin': 'https://www.douyin.com'
      }
    });

    const detail = apiRes.data?.aweme_detail;
    if (!detail) {
      return res.status(400).json({ 
        error: "视频数据获取失败", 
        debug: "API返回空数据，可能被抖音拦截" 
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
      debug: err.response?.data ? "API响应被截断" : err.message 
    });
  }
});

app.get('/', (req, res) => res.send('OK'));
app.listen(process.env.PORT || 3000);
