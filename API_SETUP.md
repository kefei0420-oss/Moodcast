# API 接入路线

原则：浏览器只负责界面，所有 API 密钥和 OAuth token 都放在 `server.js` 后端。

## 第一步：统一歌曲格式

不管接哪个平台，最后都转成同一种结构：

```json
{
  "title": "夜曲",
  "artist": "周杰伦",
  "tags": ["华语", "夜晚", "安静"],
  "energy": 58,
  "audioUrl": ""
}
```

这样前端不用关心歌来自 Spotify、Apple Music、网易云还是本地文件。

## Spotify API

适合：读取用户歌单、歌曲名、歌手、专辑封面、部分 preview url。

需要：

```text
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
SPOTIFY_REDIRECT_URI
```

后端要做：

1. `GET /auth/spotify`：跳到 Spotify 授权页
2. `GET /auth/spotify/callback`：接收 code，换 access token
3. `GET /api/spotify/playlists`：读取用户歌单
4. `GET /api/spotify/playlists/:id/tracks`：读取歌单歌曲
5. 转换成统一歌曲格式

注意：Spotify 的完整播放通常需要 Spotify 自己的播放 SDK 和用户账号权限，不等于你可以随便拿 mp3 链接。我们的播放器能直接播的是 `audioUrl`，如果平台不给音频直链，就只能展示、推荐，或跳转平台播放。

## Apple Music API

适合：Apple Music 用户的资料库、歌单、推荐。

需要：

```text
APPLE_TEAM_ID
APPLE_KEY_ID
APPLE_PRIVATE_KEY
```

还需要前端拿 Music User Token，后端拿 Developer Token。

## 网易云音乐

适合：华语歌单。

问题：网易云没有像 Spotify 那样稳定开放的官方个人歌单 API。常见做法是：

1. 使用第三方网易云 API 项目
2. 自己导出歌单 CSV
3. 用歌单分享页做半自动解析

建议项目早期先用 CSV / 手动导入，等产品逻辑跑通后再接网易云。

## Open-Meteo

适合：让 DJ 知道晴天、雨天、温度、城市。

不需要 API key。当前项目使用 Open-Meteo：

```text
WEATHER_CITY
```

当前项目已经支持：

```text
GET /api/weather
GET /api/now
```

然后把天气加入 `/api/radio/generate` 的推荐参数。

你只需要在 Render 里添加环境变量：

```text
WEATHER_CITY=Shanghai
```

保存并重新部署后，页面里的“今天的场景信号”会显示真实天气，推荐理由里也会加入天气标签。

Open-Meteo 官方说明：非商业/原型阶段可以免费使用，不需要 API key。城市名会先通过 Geocoding API 转成经纬度，再调用 Forecast API。

如果以后做正式商业产品，再评估它们的商业授权或换成付费天气服务。

## OpenWeather

OpenWeather 也能用，但你已经看到它可能要求付费或绑卡。所以当前项目先不用它。

如果未来要换回 OpenWeather，再添加：

```text
OPENWEATHER_API_KEY=你的 OpenWeather key
WEATHER_CITY=Shanghai
```

## AI DJ

适合：让推荐理由和串词更像人。

需要：

```text
OPENAI_API_KEY
```

后端可以做：

```text
POST /api/dj/curate
```

输入：

- 歌单
- 当前天气
- 当前时间
- 用户心情
- 用户的一句话提示

输出：

- 推荐队列
- 推荐理由
- 每首歌之间的 DJ 串词

## 语音 TTS

适合：把 DJ 串词读出来。

候选：

- Fish Audio
- OpenAI TTS

流程：

1. AI DJ 生成串词
2. TTS API 生成音频
3. 把串词音频插入播放队列

## 推荐接入顺序

1. OpenWeather：最简单，马上让推荐更聪明
2. AI DJ：最有产品感
3. Spotify：OAuth 稍复杂，但文档正规
4. 网易云：华语体验好，但接口稳定性要谨慎
5. TTS：等推荐逻辑稳定后再做
