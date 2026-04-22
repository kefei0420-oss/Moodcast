# 发布到网上

这个项目现在是 Node 服务，不是纯静态网站。发布时要选择能运行 `node server.js` 的平台。

## 最推荐的小白路线：Render

1. 把项目放到 GitHub 仓库
2. 打开 Render
3. 新建 Web Service
4. 连接你的 GitHub 仓库
5. 如果 Render 识别到 `render.yaml`，可以直接按它的配置部署
6. 如果要手动设置，填写：

```text
Runtime: Node
Build Command: 留空或 npm install
Start Command: node server.js
```

Render 会给你一个公开网址。

## 也可以用 Railway

1. 把项目放到 GitHub 仓库
2. 打开 Railway
3. New Project
4. Deploy from GitHub repo
5. 设置启动命令：

```text
node server.js
```

## 环境变量

API key 不要写进前端代码，也不要提交到 GitHub。

以后接 API 时，在部署平台的 Variables / Environment 里添加：

```text
OPENAI_API_KEY=...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=...
WEATHER_CITY=Shanghai
FISH_AUDIO_API_KEY=...
```

本地开发可以新建 `.env`，但现在项目还没引入 dotenv，所以第一阶段先用平台环境变量。

## 为什么不能只丢到 GitHub Pages

GitHub Pages 只能托管静态文件。我们的项目需要后端接口：

- `/api/playlist/import`
- `/api/radio/generate`
- `/api/now`

所以它需要 Render、Railway、Fly.io、VPS 这类能跑 Node 的平台。

## 发布前检查

本地先跑：

```bash
node server.js
```

打开：

```text
http://localhost:3000
```

如果本地能打开，部署平台通常也能跑。
