const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

app.post('/parse', async (req, res) => {
  try {
    const input = req.body.input;
    if (!input) return res.status(400).json({ error: "缺少 input" });

    // 1. 提取短链接
    const shortUrlMatch = input.match(/https?:\/\/v\.douyin\.com\/\S+/);
    if (!shortUrlMatch) {
      return res.status(400).json({ error: "未找到抖音短链接", debug: input });
    }
    const shortUrl = shortUrlMatch[0].replace(/[!"'！。.,，、？?；;：:\]\[]+$/, '');

    // 2. 获取跳转URL（关键：添加完整请求头）
    const jumpRes = await axios.get(shortUrl, {
      maxRedirects: 0, // 手动处理跳转
      validateStatus: (status) => status === 302,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G960U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    // 3. 从跳转头提取URL
    const finalUrl = jumpRes.headers.location;
    if (!finalUrl) {
      return res.status(400).json({ 
        error: "跳转失败", 
        debug: jumpRes.headers 
      });
    }

    // 4. 提取video_id
    const videoId = 
      finalUrl.match(/video\/(\d+)/)?.[1] || 
      finalUrl.match(/note\/(\d+)/)?.[1] || 
      new URL(finalUrl).searchParams.get('modal_id');

    if (!videoId) {
      return res.status(400).json({ 
        error: "无法提取 video_id", 
        debug: finalUrl 
      });
    }

    // 5. 请求抖音API（关键：添加Referer）
    const apiRes = await axios.get(`https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G960U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36',
        'Referer': `https://www.douyin.com/video/${videoId}`
      },
      timeout: 15000
    });

    const detail = apiRes.data?.aweme_detail;
    if (!detail) {
      return res.status(400).json({ 
        error: "视频数据获取失败", 
        debug: "API返回空数据" 
      });
    }

    // 6. 返回结果
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
    console.error("服务错误:", err.message);
    res.status(500).json({ 
      error: err.message, 
      debug: err.response?.data ? "API响应被截断" : err.message 
    });
  }
});

app.get('/', (req, res) => res.send('抖音解析服务 OK'));
app.listen(process.env.PORT || 3000, () => {
  console.log('服务启动成功');
});
