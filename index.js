const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

app.post('/parse', async (req, res) => {
  try {
    const input = req.body.input;
    if (!input) return res.status(400).json({ error: "缺少 input" });

    const shortUrl = input.match(/https?:\/\/v\.douyin\.com\/[^\s]+/)?.[0];
    if (!shortUrl) return res.status(400).json({ error: "未找到抖音链接" });

    // 获取跳转地址
    const jump = await axios.get(shortUrl, {
      maxRedirects: 0,
      validateStatus: (status) => status === 302,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    });

    const finalUrl = jump.headers.location;
    const videoId = finalUrl.match(/(?:video|note)\/(\d+)/)?.[1];
    if (!videoId) return res.status(400).json({ error: "无法提取 video_id" });

    // 获取视频数据
    const apiRes = await axios.get(`https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://www.douyin.com/'
      }
    });

    const detail = apiRes.data?.aweme_detail;
    if (!detail) return res.status(400).json({ error: "视频数据获取失败" });

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
    res.status(500).json({ error: err.message || "服务器错误" });
  }
});

app.get('/', (req, res) => res.send('OK'));

app.listen(process.env.PORT || 3000);
