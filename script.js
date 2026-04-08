const members = [
  { name: "あなた", awake: false },
  { name: "Aoi", awake: true },
  { name: "Ren", awake: true },
  { name: "Mina", awake: false },
  { name: "Sora", awake: true },
  { name: "Yui", awake: false },
];

const checklistItems = [
  { label: "学生証", checked: false },
  { label: "ノート PC", checked: false },
  { label: "水筒", checked: false },
  { label: "イヤホン", checked: false },
];

const KAMIYAMA_COORDINATES = {
  label: "徳島県名西郡神山町",
  lon: 134.397042,
  lat: 33.986798,
};

const PRECIPITATION_UMBRELLA_THRESHOLD = 70;

const DORM_LOCATION = {
  label: "徳島県名西郡神山町神領字西上角175-1",
  lat: 33.972804,
  lon: 134.362465,
  radiusMeters: 75,
};

let audioContext;
let alarmInterval;
let inDorm = false;
let locationLinked = false;
let todayEvents = [];
let eventsExpanded = false;

const memberList = document.querySelector("#member-list");
const wakeCount = document.querySelector("#wake-count");
const questBadge = document.querySelector("#quest-badge");
const questMessage = document.querySelector("#quest-message");
const notification = document.querySelector("#notification");
const checklist = document.querySelector("#checklist");
const bagCount = document.querySelector("#bag-count");
const departureMessage = document.querySelector("#departure-message");
const locationDetail = document.querySelector("#location-detail");
const locationButton = document.querySelector("#toggle-location");
const currentTime = document.querySelector("#current-time");
const weatherSummary = document.querySelector("#weather-summary");
const weatherDetail = document.querySelector("#weather-detail");
const calendarUrl = document.querySelector("#calendar-url");
const nextEvent = document.querySelector("#next-event");
const calendarDetail = document.querySelector("#calendar-detail");
const toggleEventsButton = document.querySelector("#toggle-events");
const todayEventsList = document.querySelector("#today-events");

function renderMembers() {
  memberList.innerHTML = "";
  members.forEach((member) => {
    const item = document.createElement("li");
    item.className = "member";
    item.innerHTML = `
      <strong>${member.name}</strong>
      <span class="status ${member.awake ? "awake" : "sleeping"}">
        ${member.awake ? "起床済み" : "未起床"}
      </span>
    `;
    memberList.appendChild(item);
  });

  const awakeCount = members.filter((member) => member.awake).length;
  wakeCount.textContent = `${awakeCount} / ${members.length}`;
  wakeCount.className = `badge ${awakeCount === members.length ? "" : "badge-warning"}`;
}

function renderChecklist() {
  checklist.innerHTML = "";
  checklistItems.forEach((item, index) => {
    const row = document.createElement("li");
    row.className = "check-item";
    row.innerHTML = `
      <label>
        <input type="checkbox" ${item.checked ? "checked" : ""} data-index="${index}">
        ${item.label}
      </label>
    `;
    checklist.appendChild(row);
  });
  updateBagCount();
}

function updateBagCount() {
  const checkedCount = checklistItems.filter((item) => item.checked).length;
  bagCount.textContent = `${checkedCount} / ${checklistItems.length}`;
  bagCount.className = `badge ${checkedCount === checklistItems.length ? "" : "badge-warning"}`;
}

function weatherCodeLabel(code) {
  const labels = {
    0: "快晴",
    1: "晴れ",
    2: "一部曇り",
    3: "曇り",
    45: "霧",
    48: "霧氷",
    51: "弱い霧雨",
    53: "霧雨",
    55: "強い霧雨",
    61: "弱い雨",
    63: "雨",
    65: "強い雨",
    66: "弱い着氷性の雨",
    67: "強い着氷性の雨",
    71: "弱い雪",
    73: "雪",
    75: "強い雪",
    77: "雪粒",
    80: "弱いにわか雨",
    81: "にわか雨",
    82: "激しいにわか雨",
    85: "弱いにわか雪",
    86: "強いにわか雪",
    95: "雷雨",
    96: "雹を伴う雷雨",
    99: "強い雹を伴う雷雨",
  };
  return labels[code] || "天気不明";
}

function syncUmbrellaChecklist(shouldCarryUmbrella) {
  const umbrellaIndex = checklistItems.findIndex((item) => item.label === "傘" && item.autoAddedByWeather);
  const hasUmbrella = checklistItems.some((item) => item.label === "傘");

  if (shouldCarryUmbrella && !hasUmbrella) {
    checklistItems.push({ label: "傘", checked: false, autoAddedByWeather: true });
  }

  if (!shouldCarryUmbrella && umbrellaIndex !== -1) {
    checklistItems.splice(umbrellaIndex, 1);
  }

  renderChecklist();
}

async function loadWeather() {
  weatherSummary.textContent = "神山町の天気を取得中...";
  weatherDetail.textContent = "Open-Meteo に接続しています。";

  try {
    const params = new URLSearchParams({
      latitude: String(KAMIYAMA_COORDINATES.lat),
      longitude: String(KAMIYAMA_COORDINATES.lon),
      daily: "weather_code,precipitation_probability_max",
      timezone: "Asia/Tokyo",
      forecast_days: "1",
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} で取得に失敗しました。`);
    }

    const payload = await response.json();
    const weatherCode = payload?.daily?.weather_code?.[0];
    const precipitationProbability = payload?.daily?.precipitation_probability_max?.[0];

    if (weatherCode == null || precipitationProbability == null) {
      throw new Error("本日の天気または降水確率がレスポンスに含まれていません。");
    }

    const shouldCarryUmbrella = precipitationProbability >= PRECIPITATION_UMBRELLA_THRESHOLD;
    weatherSummary.textContent = `${KAMIYAMA_COORDINATES.label}: ${weatherCodeLabel(weatherCode)}`;
    weatherDetail.textContent = `本日の最大降水確率は ${precipitationProbability}% です。${shouldCarryUmbrella ? "70%以上のため、持ち物に傘を追加しました。" : "70%未満のため、傘の自動追加は不要です。"}`;
    syncUmbrellaChecklist(shouldCarryUmbrella);
  } catch (error) {
    weatherSummary.textContent = "天気情報を取得できませんでした";
    weatherDetail.textContent = error.message;
  }
}

function normalizeCalendarUrl(value) {
  return value.trim().replace(/^webcal:\/\//i, "https://");
}

function unfoldIcsLines(text) {
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function parseIcsDate(value) {
  if (!value) {
    return undefined;
  }

  if (/^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return new Date(year, month, day);
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!match) {
    return undefined;
  }

  const [, year, month, day, hour, minute, second, utc] = match;
  const args = [Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)];
  return utc ? new Date(Date.UTC(...args)) : new Date(...args);
}

function cleanIcsText(value = "") {
  return value.replace(/\\n/g, " ").replace(/\\,/g, ",").replace(/\\\\/g, "\\").trim();
}

function parseIcsEvents(text) {
  const lines = unfoldIcsLines(text);
  const events = [];
  let event;

  lines.forEach((line) => {
    if (line === "BEGIN:VEVENT") {
      event = {};
      return;
    }

    if (line === "END:VEVENT") {
      if (event?.summary && event.start) {
        events.push(event);
      }
      event = undefined;
      return;
    }

    if (!event) {
      return;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      return;
    }

    const rawKey = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    const key = rawKey.split(";")[0];

    if (key === "SUMMARY") {
      event.summary = cleanIcsText(value);
    }
    if (key === "DTSTART") {
      event.start = parseIcsDate(value);
      event.allDay = /^\d{8}$/.test(value);
    }
    if (key === "DTEND") {
      event.end = parseIcsDate(value);
    }
    if (key === "LOCATION") {
      event.location = cleanIcsText(value);
    }
  });

  return events;
}

function isToday(date) {
  const now = new Date();
  return date?.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function formatEventTime(event) {
  if (event.allDay) {
    return "終日";
  }
  return event.start.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function renderTodayEvents() {
  todayEventsList.innerHTML = "";

  if (!eventsExpanded) {
    todayEventsList.classList.add("hidden");
    return;
  }

  todayEventsList.classList.remove("hidden");

  if (todayEvents.length === 0) {
    const item = document.createElement("li");
    item.className = "event-item";
    item.textContent = "本日の予定はありません。";
    todayEventsList.appendChild(item);
    return;
  }

  todayEvents.forEach((event) => {
    const item = document.createElement("li");
    item.className = "event-item";
    item.innerHTML = `
      <strong>${formatEventTime(event)} ${event.summary}</strong>
      <small>${event.location || "場所未設定"}</small>
    `;
    todayEventsList.appendChild(item);
  });
}

async function connectCalendar() {
  const url = normalizeCalendarUrl(calendarUrl.value);

  if (!url) {
    nextEvent.textContent = "公開 URL を入力してください";
    calendarDetail.textContent = "Google Calendar の iCal 形式 URL を貼り付けてください。";
    return;
  }

  nextEvent.textContent = "カレンダー連携中...";
  calendarDetail.textContent = "公開 iCal URL から予定を取得しています。";

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} で取得に失敗しました。`);
    }

    const icsText = await response.text();
    todayEvents = parseIcsEvents(icsText).filter((event) => isToday(event.start)).sort((a, b) => a.start - b.start);
    const upcoming = todayEvents.find((event) => event.allDay || event.start >= new Date()) || todayEvents[0];

    nextEvent.textContent = upcoming ? `${formatEventTime(upcoming)} ${upcoming.summary}` : "本日の予定はありません";
    calendarDetail.textContent = `連携済み: 本日の予定 ${todayEvents.length} 件`;
    toggleEventsButton.disabled = false;
    toggleEventsButton.textContent = "本日の予定を展開";
    eventsExpanded = false;
    renderTodayEvents();
  } catch (error) {
    nextEvent.textContent = "カレンダーを取得できませんでした";
    calendarDetail.textContent = `公開 URL または CORS 制限を確認してください。本実装ではサーバー側取得を推奨します。${error.message}`;
    toggleEventsButton.disabled = true;
  }
}

function ensureAudioContext() {
  audioContext = audioContext || new AudioContext();
  return audioContext;
}

function playWakeAlarm() {
  stopSound();
  const context = ensureAudioContext();
  let step = 0;

  alarmInterval = setInterval(() => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const frequencies = [523.25, 659.25, 783.99, 1046.5];

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequencies[step % frequencies.length], now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.08 + step * 0.01, 0.18), now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.45);
    step += 1;
  }, 520);
}

function playDepartureAlarm() {
  stopSound();
  const context = ensureAudioContext();
  let step = 0;

  alarmInterval = setInterval(() => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(step % 2 === 0 ? 880 : 660, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.26);
    step += 1;
  }, 320);
}

function stopSound() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = undefined;
  }
}

function scanQr() {
  members[0].awake = true;
  questBadge.textContent = "起床済み";
  questBadge.className = "badge";
  questMessage.textContent = "共有スペース QR の読み取りが完了しました。今日の朝クエストは順調です。";
  notification.classList.add("hidden");
  stopSound();
  renderMembers();
}

function checkUnawakeMembers() {
  const sleepingMembers = members.filter((member) => !member.awake);
  currentTime.textContent = "07:05";

  if (sleepingMembers.length === 0) {
    notification.textContent = "全員の起床確認が完了しました。ユニットクエスト達成です。";
    notification.classList.remove("hidden");
    notification.style.background = "#e8f5ef";
    notification.style.color = "#2f9e67";
    return;
  }

  notification.textContent = `未起床メンバーが ${sleepingMembers.length} 人います: ${sleepingMembers.map((member) => member.name).join("、")}。ユニットに通知を送信します。`;
  notification.classList.remove("hidden");
  notification.style.background = "#fff0ec";
  notification.style.color = "#d95040";
}

function toggleLocation() {
  inDorm = !inDorm;
  locationLinked = true;
  departureMessage.textContent = `現在の状態: ${inDorm ? "寮付近にいる" : "外出済み"}`;
  locationDetail.textContent = "手動で状態を切り替えました。実機では位置情報の補助操作として使います。";
  locationButton.textContent = inDorm ? "外出済みにする" : "寮に戻す";
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(from, to) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("このブラウザでは位置情報を利用できません。"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 10_000,
      },
    );
  });
}

function applyDormLocation(current) {
  const distance = Math.round(distanceMeters(current, DORM_LOCATION));

  locationLinked = true;
  inDorm = distance <= DORM_LOCATION.radiusMeters;
  departureMessage.textContent = `現在の状態: ${inDorm ? "寮付近にいる" : "寮付近の外にいる"}`;
  locationDetail.textContent = `${DORM_LOCATION.label} から約 ${distance}m。判定半径は ${DORM_LOCATION.radiusMeters}m です。`;
  locationButton.textContent = inDorm ? "外出済みにする" : "寮に戻す";

  return { distance, inDorm };
}

async function checkDeparture() {
  currentTime.textContent = "08:50";
  departureMessage.textContent = "8:50 になったため、位置情報を自動取得しています...";
  locationDetail.textContent = "位置情報権限は許可済み前提で判定します。";

  try {
    const result = applyDormLocation(await getCurrentLocation());

    if (result.inDorm) {
      departureMessage.textContent = "8:50 時点で神山町神領字西上角175-1 付近にいます。出発アラームを再生しています。";
      playDepartureAlarm();
      return;
    }

    departureMessage.textContent = "8:50 時点で寮付近の外にいます。追加アラームは不要です。";
    stopSound();
  } catch (error) {
    locationLinked = false;
    departureMessage.textContent = "8:50 の位置情報自動取得に失敗しました。";
    locationDetail.textContent = `ブラウザ権限、HTTPS/localhost、端末の位置情報設定を確認してください。${error.message}`;
    stopSound();
  }
}

async function connectLocation() {
  if (!navigator.geolocation) {
    departureMessage.textContent = "このブラウザでは位置情報を利用できません。";
    locationDetail.textContent = "手動の外出済み切り替えを使って確認してください。";
    return;
  }

  departureMessage.textContent = "位置情報を取得中...";
  locationDetail.textContent = "現在地確認用です。8:50 チェック時は自動で位置情報を取得します。";

  try {
    applyDormLocation(await getCurrentLocation());
  } catch (error) {
    locationLinked = false;
    departureMessage.textContent = "位置情報を取得できませんでした。";
    locationDetail.textContent = `ブラウザ権限、HTTPS/localhost、端末の位置情報設定を確認してください。${error.message}`;
  }
}

document.querySelector("#alarm-7").addEventListener("click", () => {
  currentTime.textContent = "07:00";
  questBadge.textContent = "アラーム中";
  questBadge.className = "badge badge-danger";
  questMessage.textContent = "段階的に明るいチャイムを鳴らしています。共有スペースに移動して QR を読み取ってください。";
  playWakeAlarm();
});

document.querySelector("#scan-qr").addEventListener("click", scanQr);
document.querySelector("#check-705").addEventListener("click", checkUnawakeMembers);
document.querySelector("#connect-location").addEventListener("click", connectLocation);
document.querySelector("#toggle-location").addEventListener("click", toggleLocation);
document.querySelector("#alarm-850").addEventListener("click", checkDeparture);
document.querySelector("#stop-sound").addEventListener("click", stopSound);
document.querySelector("#load-weather").addEventListener("click", loadWeather);
document.querySelector("#connect-calendar").addEventListener("click", connectCalendar);
toggleEventsButton.addEventListener("click", () => {
  eventsExpanded = !eventsExpanded;
  toggleEventsButton.textContent = eventsExpanded ? "本日の予定を閉じる" : "本日の予定を展開";
  renderTodayEvents();
});

checklist.addEventListener("change", (event) => {
  const index = Number(event.target.dataset.index);
  checklistItems[index].checked = event.target.checked;
  updateBagCount();
});

renderMembers();
renderChecklist();
loadWeather();
