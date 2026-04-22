const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

let lastWeather = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const connectors = [
  {
    key: "music",
    name: "Song Name Pool",
    status: "ready",
    description: "当前只展示推荐歌曲名和歌手，不播放、不外链，避免音乐版权问题。",
  },
  {
    key: "mood_engine",
    name: "Mood Engine",
    status: process.env.OPENAI_API_KEY ? "ready" : "todo",
    description: "接 OpenAI 后可以把规则情绪分析升级成更自然的情绪天气、建议和 care 提醒。",
  },
  {
    key: "weather",
    name: "Open-Meteo",
    status: "ready",
    description: "使用无需 API key 的 Open-Meteo 天气接口，自动识别雨天、晴天、冷热等场景。",
  },
  {
    key: "history",
    name: "Mood History",
    status: "todo",
    description: "后续保存最近 7 天状态，生成能量和压力趋势。",
  },
  {
    key: "state",
    name: "Local State",
    status: "ready",
    description: "本地 Node 服务计算当前情绪天气、天气信号和推荐上下文。",
  },
];

const songPool = {
  calm: [
    { title: "红豆", artist: "王菲", lang: "中文", reason: "柔软但不沉重" },
    { title: "慢慢喜欢你", artist: "莫文蔚", lang: "中文", reason: "把节奏放慢" },
    { title: "Weightless", artist: "Marconi Union", lang: "English", reason: "降低噪音感" },
    { title: "Holocene", artist: "Bon Iver", lang: "English", reason: "适合慢慢回神" },
  ],
  low: [
    { title: "消愁", artist: "毛不易", lang: "中文", reason: "允许一点低气压" },
    { title: "走马", artist: "陈粒", lang: "中文", reason: "适合自省时刻" },
    { title: "The Night We Met", artist: "Lord Huron", lang: "English", reason: "温和承接失落" },
    { title: "Skinny Love", artist: "Bon Iver", lang: "English", reason: "不急着振作" },
  ],
  focus: [
    { title: "Intro", artist: "The xx", lang: "English", reason: "冷静、有推进感" },
    { title: "奇妙能力歌", artist: "陈粒", lang: "中文", reason: "轻微抽离现实" },
    { title: "Experience", artist: "Ludovico Einaudi", lang: "Instrumental", reason: "给注意力一点线索" },
    { title: "Night Owl", artist: "Galimatias", lang: "English", reason: "适合夜间专注" },
  ],
  bright: [
    { title: "爱人错过", artist: "告五人", lang: "中文", reason: "轻快但不吵" },
    { title: "晴天", artist: "周杰伦", lang: "中文", reason: "给今天一点阳光感" },
    { title: "New Soul", artist: "Yael Naim", lang: "English", reason: "轻轻把心情抬起来" },
    { title: "Good Life", artist: "OneRepublic", lang: "English", reason: "明亮、好入口" },
  ],
  intense: [
    { title: "倔强", artist: "五月天", lang: "中文", reason: "把压力转成动能" },
    { title: "易燃易爆炸", artist: "陈粒", lang: "中文", reason: "承认情绪有火花" },
    { title: "Blinding Lights", artist: "The Weeknd", lang: "English", reason: "适合提速" },
    { title: "Dog Days Are Over", artist: "Florence + The Machine", lang: "English", reason: "释放压强" },
  ],
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function getPartOfDay(hour) {
  if (hour < 6) return "深夜";
  if (hour < 11) return "早晨";
  if (hour < 14) return "中午";
  if (hour < 18) return "下午";
  if (hour < 22) return "夜晚";
  return "深夜";
}

async function resolveWeatherLocation(url) {
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return {
      name: "当前位置",
      latitude: lat,
      longitude: lon,
      source: "browser-location",
    };
  }

  const city = process.env.WEATHER_CITY || "Shanghai";

  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", city);
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "zh");
  geoUrl.searchParams.set("format", "json");

  const geoResponse = await fetch(geoUrl);
  if (!geoResponse.ok) {
    throw new Error(`Open-Meteo geocoding ${geoResponse.status}`);
  }

  const geoData = await geoResponse.json();
  const location = geoData.results?.[0];
  if (!location) {
    throw new Error(`找不到城市：${city}`);
  }

  return {
    name: location.name || city,
    latitude: location.latitude,
    longitude: location.longitude,
    source: "city",
  };
}

async function fetchWeather(url = new URL("http://localhost/api/weather")) {
  const location = await resolveWeatherLocation(url);

  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", String(location.latitude));
  weatherUrl.searchParams.set("longitude", String(location.longitude));
  weatherUrl.searchParams.set("current", "temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m");
  weatherUrl.searchParams.set("timezone", "auto");

  const weatherResponse = await fetch(weatherUrl);
  if (!weatherResponse.ok) {
    throw new Error(`Open-Meteo forecast ${weatherResponse.status}`);
  }

  const data = await weatherResponse.json();
  const current = data.current || {};
  const weatherCode = Number(current.weather_code);
  const temp = Math.round(Number(current.temperature_2m));
  const humidity = Number(current.relative_humidity_2m);
  const precipitation = Number(current.precipitation || 0);
  const cloudCover = Number(current.cloud_cover || 0);
  const description = describeWeatherCode(weatherCode, cloudCover, precipitation);
  const tags = [];

  if (precipitation > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(weatherCode)) tags.push("雨天", "安静", "夜晚");
  if ([0, 1].includes(weatherCode) && cloudCover < 35) tags.push("晴朗", "轻快");
  if (cloudCover >= 70 || [2, 3, 45, 48].includes(weatherCode)) tags.push("阴天", "温柔");
  if (Number.isFinite(temp) && temp <= 10) tags.push("冬天", "温柔");
  if (Number.isFinite(temp) && temp >= 28) tags.push("夏天", "清新");

  return {
    source: "open-meteo",
    city: location.name,
    locationSource: location.source,
    summary: `${location.name} · ${description} · ${temp}°C · 湿度 ${humidity}%`,
    tags,
    raw: {
      weatherCode,
      description,
      temp,
      humidity,
      precipitation,
      cloudCover,
    },
  };
}

function describeWeatherCode(code, cloudCover, precipitation) {
  if (precipitation > 0) return "有降水";
  if ([0].includes(code)) return "晴";
  if ([1].includes(code)) return "大部晴朗";
  if ([2].includes(code)) return "局部多云";
  if ([3].includes(code)) return "阴";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55].includes(code)) return "毛毛雨";
  if ([61, 63, 65].includes(code)) return "雨";
  if ([71, 73, 75, 77].includes(code)) return "雪";
  if ([80, 81, 82].includes(code)) return "阵雨";
  if ([95, 96, 99].includes(code)) return "雷雨";
  if (cloudCover >= 70) return "多云";
  return "天气稳定";
}

function pickMood(text, energy, stress, weatherTags = []) {
  const body = String(text || "").toLowerCase();
  const sadWords = ["累", "丧", "难过", "崩", "焦虑", "emo", "sad", "tired", "down", "孤独"];
  const calmWords = ["平静", "慢", "安静", "休息", "睡", "calm", "quiet", "rest"];
  const focusWords = ["工作", "学习", "专注", "deadline", "focus", "study", "忙"];
  const brightWords = ["开心", "不错", "期待", "轻松", "happy", "good", "sunny"];

  if (stress > 72) return "intense";
  if (sadWords.some((word) => body.includes(word)) || energy < 32) return "low";
  if (focusWords.some((word) => body.includes(word))) return "focus";
  if (brightWords.some((word) => body.includes(word)) || energy > 72) return "bright";
  if (calmWords.some((word) => body.includes(word)) || weatherTags.includes("雨天")) return "calm";
  return stress > 55 ? "focus" : "calm";
}

function buildMoodcast({ text, energy, stress, weather, now }) {
  const safeEnergy = Math.max(0, Math.min(100, Number(energy || 50)));
  const safeStress = Math.max(0, Math.min(100, Number(stress || 45)));
  const weatherTags = weather?.tags || [];
  const mood = pickMood(text, safeEnergy, safeStress, weatherTags);

  const forecastMap = {
    calm: {
      title: "薄雾，微光",
      icon: "◇",
      summary: "你的状态像低云层后的光，不需要立刻加速，先把呼吸和节奏找回来。",
      action: "挑一个 15 分钟能完成的小任务，完成后就停一下。",
      care: "今天别用高强度自律压自己，温柔地恢复秩序就够了。",
    },
    low: {
      title: "阴天，低压",
      icon: "◆",
      summary: "情绪气压偏低，但这不是失败，只是系统在提醒你减少负载。",
      action: "先喝水、洗脸、整理桌面三选一，不要试图一次解决整天。",
      care: "把今天的目标降一档。你需要的是可完成，不是完美。",
    },
    focus: {
      title: "冷光，稳定风",
      icon: "▣",
      summary: "注意力正在成形，适合进入一段安静、清晰、有边界的工作流。",
      action: "开一个 25 分钟计时器，只做一件事，把其他标签页先关掉。",
      care: "如果开始烦躁，就不是你不行，是环境噪音太多。",
    },
    bright: {
      title: "晴，轻快上升",
      icon: "✦",
      summary: "今天的能量有上扬趋势，适合轻轻推进计划，也适合和人连接。",
      action: "把一个拖延的小事做掉，趁现在的顺风把它送走。",
      care: "别把好状态一次性用光，留一点余裕给晚上。",
    },
    intense: {
      title: "雷雨边缘",
      icon: "⚡",
      summary: "压力电流偏强，情绪不是没有方向，而是需要一个安全出口。",
      action: "先做 3 分钟身体动作：走动、拉伸或下楼买水，让压力离开脑内循环。",
      care: "今天不要在高压时做重大决定，等电流降下来再说。",
    },
  };

  const profile = forecastMap[mood];
  const blendedEnergy = Math.max(5, Math.min(98, Math.round(safeEnergy * 0.72 + (100 - safeStress) * 0.28)));
  const weatherLine = weather?.summary ? `外部天气：${weather.summary}` : "外部天气暂未校准";
  const partOfDay = now?.partOfDay || "此刻";

  return {
    forecast: {
      mood,
      title: profile.title,
      icon: profile.icon,
      summary: `${profile.summary} ${partOfDay}的建议是：慢一点，但别断线。`,
    },
    energy: blendedEnergy,
    advice: {
      action: profile.action,
      care: profile.care,
    },
    note: `${weatherLine}。这是一份情绪天气，不是医疗诊断。`,
    songs: songPool[mood],
  };
}

async function getNowContext(url = new URL("http://localhost/api/now")) {
  const now = new Date();
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
  lastWeather = await fetchWeather(url).catch((error) => ({
    source: "error",
    city: process.env.WEATHER_CITY || "Shanghai",
    summary: `天气 API 暂时失败：${error.message}`,
    tags: [],
  }));

  return {
    iso: now.toISOString(),
    time: now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
    weekday,
    partOfDay: getPartOfDay(now.getHours()),
    weather: lastWeather,
    state: {
      mode: "moodcast",
      songPolicy: "names-only",
    },
  };
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/connectors") {
    sendJson(res, 200, { connectors });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/now") {
    sendJson(res, 200, await getNowContext(url));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/weather") {
    sendJson(res, 200, await fetchWeather(url));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/moodcast") {
    const body = JSON.parse(await readBody(req));
    sendJson(res, 200, buildMoodcast(body));
    return;
  }

  sendJson(res, 404, { error: "API not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
    } else {
      serveStatic(req, res);
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`MOODCAST running at http://localhost:${PORT}`);
});
