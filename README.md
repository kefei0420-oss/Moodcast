# 私人 DJ 电台

目标：网页读取你的音乐歌单，根据心情、能量和场景生成私人 DJ 播放队列。

## 现在做到哪一步

- 有高端一点的播放器界面
- 有 Node 后端 API，不再只是纯静态页面
- 前端通过 `/api/playlist/import` 上传歌单
- 后端通过 `/api/radio/generate` 生成推荐队列
- 播放器已经接了真实 `<audio>`，只要歌曲数据里有 `audioUrl` 就能播放
- 没有 `audioUrl` 的歌只能推荐，不能播放
- 天气场景使用 Open-Meteo，不需要 API key

整体架构看 [ARCHITECTURE.md](/Users/kefei/Desktop/vibe%20coding/ARCHITECTURE.md)。那份文档对应“播放器界面 / 本地服务 / 几个 API”的施工思路，页面本身不照着架构图排版。

发布步骤看 [DEPLOYMENT.md](/Users/kefei/Desktop/vibe%20coding/DEPLOYMENT.md)。

API 接入路线看 [API_SETUP.md](/Users/kefei/Desktop/vibe%20coding/API_SETUP.md)。

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

## CSV 格式

```csv
歌名,歌手,标签1|标签2|标签3,能量分,audioUrl
晴天,周杰伦,华语|怀旧|晴朗,64,
```

最后一列 `audioUrl` 可以为空。为空就不能播放，只能展示和推荐。

## API 接入思路

真正接平台时，不是让前端直接连音乐平台，而是：

1. 前端点“连接 Spotify / 网易云 / Apple Music”
2. 后端处理登录、token、密钥
3. 后端读取平台歌单
4. 后端把平台数据统一转换成：

```json
{
  "title": "歌名",
  "artist": "歌手",
  "tags": ["华语", "夜晚"],
  "energy": 58,
  "audioUrl": "试听链接或你自己的音频文件 URL"
}
```

## 部署到网上

这个项目现在已经可以部署成非静态服务。最简单的选择：

1. Render / Railway / Fly.io：直接运行 `npm start`
2. VPS：安装 Node，上传项目，运行 `npm start`
3. Vercel：需要把 `server.js` 改成 serverless API 结构

如果要做成真正产品，推荐下一步换成：

- 前端：React / Next.js
- 后端：Node.js + Express 或 Next.js API Routes
- 数据库：Postgres / Supabase
- 登录：OAuth
- 音乐数据：Spotify API / Apple Music API / 网易云第三方方案
