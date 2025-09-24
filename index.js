const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

app.post('/parse', async (req, res) => {
  try {
    const input = req.body.input;
    if (!input) return res.status(400).json({ error: "缺少 input" });

    // 1. 提取短链接（简化版）
    const shortUrlMatch = input.match(/https?:\/\/v\.douyin\.com\/\S+/);
    if (!shortUrlMatch) {
      return res.status(400).json({ 
        error: "未找到抖音短链接", 
        debug: input 
      });
    }
    const shortUrl = shortUrlMatch[0].replace(/[!"'！。.,，、？?；;：:\]\[]+$/, '');

    // 2. 获取跳转URL（关键：简化请求头）
    const jumpRes = await axios.get(shortUrl, {
      maxRedirects: 5,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36'
      }
    });

    // 3. 从最终URL提取video_id
    const finalUrl = jumpRes.request.res.responseUrl;
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

    // 4. 请求抖音API（简化版）
    const apiRes = await axios.get(`https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36'
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
