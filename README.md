# MOODCAST 情绪天气站

目标：输入你今天的状态，生成一份“情绪天气”，包括能量值、今日建议和中英文推荐歌曲名。

## 现在做到哪一步

- 单页 Cyber / terminal 风格 App
- 可输入今日状态
- 可调身体能量和压力强度
- 可读取当前时间和 Open-Meteo 免费天气
- 可用浏览器定位获取当前位置天气
- 后端通过 `/api/moodcast` 生成情绪天气
- 推荐歌曲只显示歌名和歌手，不播放、不外链，避开音乐版权问题

## 怎么运行

如果你的电脑有 Node，直接运行：

```bash
node server.js
```

如果你装了 npm，也可以运行：

```bash
npm start
```

然后打开：

```text
http://localhost:3000
```

## 当前 API

- `GET /api/health`
- `GET /api/now`
- `GET /api/weather`
- `POST /api/moodcast`

## 部署

发布步骤看 [DEPLOYMENT.md](/Users/kefei/Desktop/vibe%20coding/DEPLOYMENT.md)。

## 后续可做

1. 接真实 AI，让情绪分析更自然
2. 增加每日记录和历史曲线
3. 生成可分享的情绪天气卡片
4. 增加更多推荐歌曲池
5. 增加本地存储，保留最近 7 天状态
