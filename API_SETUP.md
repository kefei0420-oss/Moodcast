# MOODCAST API 接入路线

原则：浏览器只负责界面，所有 API 密钥和 OAuth token 都放在 `server.js` 后端。

## 第一步：统一推荐歌曲格式

MOODCAST 只显示推荐歌曲名和歌手，不播放、不外链。无论歌曲来自手动维护、CSV、公开榜单还是未来 AI 生成，最后都转成同一种结构：

```json
{
  "title": "夜曲",
  "artist": "周杰伦",
  "tags": ["华语", "夜晚", "安静"],
  "energy": 58,
  "reason": "给今天一点阳光感"
}
```

这样前端不用关心推荐来自哪里，也不会触碰音乐播放版权问题。

## 歌曲数据来源

早期建议继续使用本地歌曲池或 CSV，字段只保留歌名、歌手、语言、标签、推荐理由。

如果未来要接 Spotify、Apple Music 或网易云，适合读取用户歌单、歌曲名、歌手、标签和封面参考，但不要直接在 MOODCAST 内播放音乐，也不要依赖音频直链。

### Spotify API

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

注意：Spotify 的完整播放通常需要 Spotify 自己的播放 SDK 和用户账号权限，不等于你可以随便拿 mp3 链接。MOODCAST 当前定位是展示和推荐，不在站内播放。

### Apple Music API

适合：Apple Music 用户的资料库、歌单、推荐。

需要：

```text
APPLE_TEAM_ID
APPLE_KEY_ID
APPLE_PRIVATE_KEY
```

还需要前端拿 Music User Token，后端拿 Developer Token。

### 网易云音乐

适合：华语歌单。

问题：网易云没有像 Spotify 那样稳定开放的官方个人歌单 API。常见做法是：

1. 使用第三方网易云 API 项目
2. 自己导出歌单 CSV
3. 用歌单分享页做半自动解析

建议项目早期先用 CSV / 手动导入，等产品逻辑跑通后再接网易云。

## Open-Meteo

适合：让情绪天气站知道晴天、雨天、温度、城市。

不需要 API key。当前项目使用 Open-Meteo：

```text
WEATHER_CITY
```

当前项目已经支持：

```text
GET /api/weather
GET /api/weather?lat=31.2304&lon=121.4737
GET /api/now
GET /api/now?lat=31.2304&lon=121.4737
```

然后把天气加入 `/api/moodcast` 的生成参数。

你只需要在 Render 里添加环境变量：

```text
WEATHER_CITY=Shanghai
```

保存并重新部署后，页面会显示真实天气，情绪天气和推荐理由里也会加入天气标签。

页面里也有“使用当前位置天气”按钮。用户同意浏览器定位后，前端会把经纬度传给后端，后端用经纬度查天气；如果用户拒绝定位，就继续使用 `WEATHER_CITY`。

Open-Meteo 官方说明：非商业/原型阶段可以免费使用，不需要 API key。城市名会先通过 Geocoding API 转成经纬度，再调用 Forecast API。

如果以后做正式商业产品，再评估它们的商业授权或换成付费天气服务。

## OpenWeather

OpenWeather 也能用，但你已经看到它可能要求付费或绑卡。所以当前项目先不用它。

如果未来要换回 OpenWeather，再添加：

```text
OPENWEATHER_API_KEY=你的 OpenWeather key
WEATHER_CITY=Shanghai
```

## AI 情绪引擎

适合：让情绪天气、今日建议、care 提醒和推荐理由更自然。

需要：

```text
OPENAI_API_KEY
```

后端可以做：

```text
POST /api/moodcast
```

输入：

- 当前天气
- 当前时间
- 用户今日状态
- 身体能量
- 压力强度
- 推荐歌曲池

输出：

- 情绪天气
- 能量值
- 今日建议
- care 提醒
- 中英文推荐歌曲名
- 推荐理由

## 推荐接入顺序

1. Open-Meteo：已经接入，继续稳定天气信号
2. AI 情绪引擎：最能提升产品感
3. 本地 7 天记录：让用户看到情绪天气趋势
4. 分享卡片：适合传播
5. 歌曲池扩充：优先手动精选，后续再考虑平台 API
