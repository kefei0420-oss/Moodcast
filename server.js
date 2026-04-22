const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const SAMPLE_PATH = path.join(__dirname, "chinese-pop-playlist.csv");

let playlist = [];
let lastQueue = [];
let lastWeather = null;

const moodTags = {
  focus: ["专注", "安静", "环境", "氛围", "冷感"],
  night: ["夜晚", "温柔", "迷幻", "rnb", "城市"],
  happy: ["开心", "甜", "轻快", "晴朗", "夏天"],
  sad: ["伤感", "怀旧", "温柔", "夜晚", "自省"],
  workout: ["运动", "电子", "跳舞", "摇滚", "力量"],
};

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
    name: "Music Playlist",
    status: "ready",
    description: "当前支持 CSV / JSON 导入。下一步可替换成网易云、Spotify 或 Apple Music 歌单读取。",
  },
  {
    key: "ai_dj",
    name: "AI DJ Brain",
    status: process.env.OPENAI_API_KEY ? "ready" : "todo",
    description: "接 OpenAI 后可以把规则推荐升级成自然语言 DJ、解释和跨歌单推理。",
  },
  {
    key: "weather",
    name: "Open-Meteo",
    status: "ready",
    description: "使用无需 API key 的 Open-Meteo 天气接口，自动识别雨天、晴天、冷热等场景。",
  },
  {
    key: "voice",
    name: "Fish Audio",
    status: process.env.FISH_AUDIO_API_KEY ? "ready" : "todo",
    description: "接语音合成后，DJ 可以在歌与歌之间播报串词。",
  },
  {
    key: "device",
    name: "UPnP / AirPlay",
    status: "todo",
    description: "后续把播放推送到音箱、电视或局域网设备。",
  },
  {
    key: "state",
    name: "Local State",
    status: "ready",
    description: "本地 Node 服务保存当前歌单、队列和推荐上下文。",
  },
];

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

function normalizeSong(raw) {
  const title = String(raw.title || raw.name || "").trim();
  const artist = String(raw.artist || raw.singer || "未知艺人").trim();
  const tagText = Array.isArray(raw.tags) ? raw.tags.join("|") : String(raw.tags || raw.tag || "");
  const tags = tagText.split(/[|/，]/).map((tag) => tag.trim()).filter(Boolean);
  const energy = Number(raw.energy || raw.score || 50);
  const audioUrl = String(raw.audioUrl || raw.previewUrl || raw.url || "").trim();

  if (!title) return null;
  return {
    title,
    artist,
    tags,
    energy: Math.max(0, Math.min(100, Number.isFinite(energy) ? energy : 50)),
    audioUrl,
  };
}

function parsePlaylist(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : data.songs || data.playlist || [];
    return list.map(normalizeSong).filter(Boolean);
  }

  return trimmed
    .split(/\n+/)
    .map((line) => {
      const [title, artist, tags, energy, audioUrl] = line.split(",");
      return normalizeSong({ title, artist, tags, energy, audioUrl });
    })
    .filter(Boolean);
}

function scoreSong(song, preferredTags, targetEnergy, promptText) {
  const searchText = `${song.title}${song.artist}${song.tags.join("")}`.toLowerCase();
  const prompt = String(promptText || "").toLowerCase();
  const tagScore = song.tags.reduce((score, tag) => {
    return score + (preferredTags.includes(tag) || prompt.includes(tag.toLowerCase()) ? 30 : 0);
  }, 0);
  const energyScore = 42 - Math.abs(song.energy - targetEnergy) * 0.55;
  const promptScore = prompt && searchText.includes(prompt) ? 20 : 0;
  const playableBoost = song.audioUrl ? 8 : 0;
  return tagScore + energyScore + promptScore + playableBoost + Math.random() * 4;
}

function getPartOfDay(hour) {
  if (hour < 6) return "深夜";
  if (hour < 11) return "早晨";
  if (hour < 14) return "中午";
  if (hour < 18) return "下午";
  if (hour < 22) return "夜晚";
  return "深夜";
}

async function fetchWeather() {
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
    city: location.name || city,
    summary: `${location.name || city} · ${description} · ${temp}°C · 湿度 ${humidity}%`,
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

async function getNowContext() {
  const now = new Date();
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
  lastWeather = await fetchWeather().catch((error) => ({
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
      playlistCount: playlist.length,
      queueCount: lastQueue.length,
    },
  };
}

function generateRadio({ mood, energy, prompt }) {
  if (!playlist.length) {
    playlist = parsePlaylist(fs.readFileSync(SAMPLE_PATH, "utf8"));
  }

  const targetEnergy = Number(energy || 55);
  const weatherTags = lastWeather?.tags || [];
  const preferredTags = [...(moodTags[mood] || moodTags.focus), ...weatherTags];
  const queue = playlist
    .map((song) => ({ ...song, score: scoreSong(song, preferredTags, targetEnergy, prompt) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ score, ...song }) => song);

  lastQueue = queue;

  return {
    queue,
    reason: `这次优先选择「${preferredTags.slice(0, 5).join("、")}」气质，目标能量 ${targetEnergy}。天气信号：${lastWeather?.summary || "未连接"}。有 audioUrl 的歌会优先靠前，因为它们可以直接播放。`,
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

  if (req.method === "GET" && url.pathname === "/api/sample-playlist") {
    const csv = fs.readFileSync(SAMPLE_PATH, "utf8");
    sendJson(res, 200, { csv, count: parsePlaylist(csv).length });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/connectors") {
    sendJson(res, 200, { connectors });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/now") {
    sendJson(res, 200, await getNowContext());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/weather") {
    sendJson(res, 200, await fetchWeather());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/playlist/import") {
    const body = JSON.parse(await readBody(req));
    playlist = parsePlaylist(body.text || "");
    lastQueue = [];
    sendJson(res, 200, { ok: true, count: playlist.length });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/radio/generate") {
    const body = JSON.parse(await readBody(req));
    sendJson(res, 200, generateRadio(body));
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
  console.log(`private.fm running at http://localhost:${PORT}`);
});
