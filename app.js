let userLocation = null;
let soundEngine = null;

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
  soundStatus: document.querySelector("#soundStatus"),
  soundToggle: document.querySelector("#soundToggle"),
  soundModes: document.querySelectorAll(".sound-mode"),
  soundVolume: document.querySelector("#soundVolume"),
  soundVolumeValue: document.querySelector("#soundVolumeValue"),
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

function createNoiseBuffer(audioContext) {
  const duration = 2;
  const frameCount = audioContext.sampleRate * duration;
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;

  for (let index = 0; index < frameCount; index += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.84 + white * 0.16;
    data[index] = previous;
  }

  return buffer;
}

function createSoundEngine() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  const audioContext = new AudioContext();
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  source.buffer = createNoiseBuffer(audioContext);
  source.loop = true;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  gain.gain.value = 0;
  source.start();

  return {
    audioContext,
    filter,
    gain,
    mode: "rain",
    active: false,
  };
}

function configureSound(mode) {
  if (!soundEngine) return;

  const { audioContext, filter, gain } = soundEngine;
  soundEngine.mode = mode;

  const settings = {
    rain: { type: "bandpass", frequency: 1800, q: 0.75 },
    wind: { type: "lowpass", frequency: 520, q: 0.4 },
    fan: { type: "lowpass", frequency: 220, q: 1.2 },
  }[mode];

  filter.type = settings.type;
  filter.frequency.setTargetAtTime(settings.frequency, audioContext.currentTime, 0.08);
  filter.Q.setTargetAtTime(settings.q, audioContext.currentTime, 0.08);
  gain.gain.setTargetAtTime(soundEngine.active ? Number(els.soundVolume.value) / 100 : 0, audioContext.currentTime, 0.08);
}

function updateSoundUi() {
  const active = Boolean(soundEngine?.active);
  els.soundToggle.textContent = active ? "暂停环境声" : "启动白噪音";
  els.soundToggle.setAttribute("aria-pressed", String(active));
  els.soundStatus.textContent = active ? soundEngine.mode : "muted";
  els.soundVolumeValue.textContent = els.soundVolume.value;
}

async function toggleSound() {
  if (!soundEngine) {
    soundEngine = createSoundEngine();
    if (!soundEngine) {
      els.signalNote.textContent = "这个浏览器暂时不支持 Web Audio 环境声。";
      return;
    }
    configureSound(soundEngine.mode);
  }

  if (soundEngine.audioContext.state === "suspended") {
    await soundEngine.audioContext.resume();
  }

  soundEngine.active = !soundEngine.active;
  configureSound(soundEngine.mode);
  updateSoundUi();
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

els.soundToggle.addEventListener("click", toggleSound);

els.soundVolume.addEventListener("input", () => {
  els.soundVolumeValue.textContent = els.soundVolume.value;
  if (soundEngine) configureSound(soundEngine.mode);
});

els.soundModes.forEach((button) => {
  button.addEventListener("click", () => {
    els.soundModes.forEach((modeButton) => modeButton.classList.remove("active"));
    button.classList.add("active");
    if (!soundEngine) {
      soundEngine = createSoundEngine();
    }
    configureSound(button.dataset.sound);
    updateSoundUi();
  });
});

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
