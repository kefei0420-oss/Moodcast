let userLocation = null;

const els = {
  apiStatus: document.querySelector("#apiStatus"),
  clock: document.querySelector("#clockText"),
  now: document.querySelector("#nowText"),
  weather: document.querySelector("#weatherText"),
  state: document.querySelector("#stateText"),
  locationButton: document.querySelector("#locationButton"),
  moodInput: document.querySelector("#moodInput"),
  energyInput: document.querySelector("#energyInput"),
  stressInput: document.querySelector("#stressInput"),
  energyValue: document.querySelector("#energyValue"),
  stressValue: document.querySelector("#stressValue"),
  generateButton: document.querySelector("#generateButton"),
  forecastTitle: document.querySelector("#forecastTitle"),
  forecastSummary: document.querySelector("#forecastSummary"),
  weatherIcon: document.querySelector("#weatherIcon"),
  weatherOrb: document.querySelector("#weatherOrb"),
  energyScore: document.querySelector("#energyScore"),
  energyFill: document.querySelector("#energyFill"),
  signalNote: document.querySelector("#signalNote"),
  moodTag: document.querySelector("#moodTag"),
  actionText: document.querySelector("#actionText"),
  careText: document.querySelector("#careText"),
  songList: document.querySelector("#songList"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `API ${response.status}`);
  }

  return response.json();
}

function locationParams() {
  return userLocation ? `?lat=${userLocation.lat}&lon=${userLocation.lon}` : "";
}

async function loadContext() {
  const data = await api(`/api/now${locationParams()}`);
  els.clock.textContent = data.time;
  els.now.textContent = `${data.partOfDay} · ${data.weekday}`;
  els.weather.textContent = data.weather.summary;
  els.state.textContent = "mood engine";
  return data;
}

function renderMoodcast(data) {
  els.forecastTitle.textContent = data.forecast.title;
  els.forecastSummary.textContent = data.forecast.summary;
  els.weatherIcon.textContent = data.forecast.icon;
  els.weatherOrb.dataset.mood = data.forecast.mood;
  els.energyScore.textContent = `${data.energy}/100`;
  els.energyFill.style.width = `${data.energy}%`;
  els.signalNote.textContent = data.note;
  els.moodTag.textContent = data.forecast.mood;
  els.actionText.textContent = data.advice.action;
  els.careText.textContent = data.advice.care;
  els.songList.innerHTML = "";

  data.songs.forEach((song, index) => {
    const item = document.createElement("li");
    item.className = "song-item";
    item.innerHTML = `
      <span class="queue-index">${String(index + 1).padStart(2, "0")}</span>
      <div>
        <p class="queue-title">${song.title}</p>
        <div class="queue-meta">${song.artist} · ${song.lang} · ${song.reason}</div>
      </div>
    `;
    els.songList.appendChild(item);
  });
}

async function generateMoodcast() {
  const context = await loadContext();
  const data = await api("/api/moodcast", {
    method: "POST",
    body: JSON.stringify({
      text: els.moodInput.value,
      energy: Number(els.energyInput.value),
      stress: Number(els.stressInput.value),
      weather: context.weather,
      now: context,
    }),
  });

  renderMoodcast(data);
}

els.energyInput.addEventListener("input", () => {
  els.energyValue.textContent = els.energyInput.value;
});

els.stressInput.addEventListener("input", () => {
  els.stressValue.textContent = els.stressInput.value;
});

els.generateButton.addEventListener("click", generateMoodcast);

els.locationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    els.signalNote.textContent = "这个浏览器不支持定位。可以继续用默认城市天气。";
    return;
  }

  els.locationButton.textContent = "正在获取位置...";
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      userLocation = {
        lat: position.coords.latitude.toFixed(5),
        lon: position.coords.longitude.toFixed(5),
      };
      await loadContext();
      els.locationButton.textContent = "已使用当前位置天气";
    },
    () => {
      els.locationButton.textContent = "使用当前位置天气";
      els.signalNote.textContent = "没有拿到定位权限，先继续使用默认城市天气。";
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
  );
});

async function boot() {
  try {
    await api("/api/health");
    els.apiStatus.textContent = "API online";
    els.apiStatus.classList.add("online");
    await loadContext();
    renderMoodcast(await api("/api/moodcast", {
      method: "POST",
      body: JSON.stringify({
        text: "",
        energy: Number(els.energyInput.value),
        stress: Number(els.stressInput.value),
      }),
    }));
  } catch (error) {
    els.apiStatus.textContent = "API offline";
    els.signalNote.textContent = "后端没有启动。请运行 node server.js，然后打开 http://localhost:3000";
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

boot();
