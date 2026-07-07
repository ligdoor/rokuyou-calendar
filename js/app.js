/**
 * app.js
 * カレンダー描画・日付詳細・メモ・通知・設定・バックアップなど
 * アプリ全体のUIロジックをまとめたファイルです。
 */

// ---------- ユーティリティ ----------
function pad2(n) { return String(n).padStart(2, "0"); }
function keyOf(y, m, d) { return `${y}-${m}-${d}`; } // m,dは1始まり
function keyOfDate(date) { return keyOf(date.getFullYear(), date.getMonth() + 1, date.getDate()); }
function toUTCDate(y, m, d) { return new Date(Date.UTC(y, m - 1, d)); }

const MOON_ICONS = ["🌑","🌒","🌒","🌓","🌓","🌔","🌔","🌕","🌕","🌖","🌖","🌗","🌗","🌘","🌘"];
function moonIconForAge(age) {
  // age: 0〜29.53 → 0〜14の適当なインデックスに丸める
  const idx = Math.round((age / 29.530588853) * 14) % 15;
  return MOON_ICONS[idx];
}

// ---------- データ保存（メモ・設定） ----------
const Store = {
  KEYS: { memos: "rokuyou_memos_v1", settings: "rokuyou_settings_v1" },
  getMemos() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.memos) || "{}"); }
    catch { return {}; }
  },
  saveMemos(memos) { localStorage.setItem(this.KEYS.memos, JSON.stringify(memos)); },
  getSettings() {
    const defaults = { theme: "auto", notify: false, notifyTime: "07:30" };
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(this.KEYS.settings) || "{}") }; }
    catch { return defaults; }
  },
  saveSettings(s) { localStorage.setItem(this.KEYS.settings, JSON.stringify(s)); },
};

// ---------- 旧暦・節気・雑節・祝日のキャッシュ ----------
const LunarCache = {
  _months: new Map(), // year -> buildLunarMonths結果
  _sekki: new Map(),  // year -> 24節気配列
  _zassetsu: new Map(), // year -> Map
  _holidays: new Map(), // year -> Map

  getMonthsForYear(year) {
    if (!this._months.has(year)) {
      const jdStart = Astro.toJulianDay(toUTCDate(year - 1, 10, 1));
      const jdEnd = Astro.toJulianDay(toUTCDate(year + 1, 2, 28));
      this._months.set(year, Lunar.buildLunarMonths(jdStart, jdEnd));
    }
    return this._months.get(year);
  },
  getSekkiForYear(year) {
    if (!this._sekki.has(year)) {
      const jdStart = Astro.toJulianDay(toUTCDate(year, 1, 1));
      const jdEnd = Astro.toJulianDay(toUTCDate(year, 12, 31));
      this._sekki.set(year, Lunar.get24Sekki(jdStart - 20, jdEnd + 20));
    }
    return this._sekki.get(year);
  },
  getZassetsuForYear(year) {
    if (!this._zassetsu.has(year)) this._zassetsu.set(year, Zassetsu.getZassetsuForYear(year));
    return this._zassetsu.get(year);
  },
  getHolidaysForYear(year) {
    if (!this._holidays.has(year)) this._holidays.set(year, Holidays.getHolidaysForYear(year));
    return this._holidays.get(year);
  },

  getLunarDateFor(date) {
    const year = date.getFullYear();
    const jd = Math.floor(Astro.toJulianDay(date));
    let months = this.getMonthsForYear(year);
    let m = months.find((mo) => jd >= mo.startJD && jd < mo.endJD);
    if (!m) {
      // 年境界付近は隣接年のデータも見る
      const alt = this.getMonthsForYear(year + 1).concat(this.getMonthsForYear(year - 1));
      m = alt.find((mo) => jd >= mo.startJD && jd < mo.endJD);
    }
    if (!m) return null;
    return { month: m.month, day: jd - m.startJD + 1, isLeap: m.isLeap };
  },

  getCurrentSekki(date) {
    const year = date.getFullYear();
    const jd = Astro.toJulianDay(date);
    const list = this.getSekkiForYear(year).concat(this.getSekkiForYear(year - 1), this.getSekkiForYear(year + 1));
    list.sort((a, b) => a.jd - b.jd);
    let current = null;
    for (const s of list) { if (s.jd <= jd) current = s; else break; }
    return current ? current.name : null;
  },
};

function getDayInfo(date) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const lunar = LunarCache.getLunarDateFor(date);
  const rokuyou = lunar ? Lunar.getRokuyou(lunar.month, lunar.day) : null;
  const dayK = Kanshi.dayKanshi(date);
  const yearK = Kanshi.yearKanshi(y);
  const age = Astro.moonAge(date);
  const holidayMap = LunarCache.getHolidaysForYear(y);
  const zassetsuMap = LunarCache.getZassetsuForYear(y);
  const key = keyOf(y, m, d);
  return {
    date, y, m, d,
    lunar, rokuyou,
    dayKanshi: dayK, yearKanshi: yearK,
    moonAge: age, moonIcon: moonIconForAge(age),
    season: LunarCache.getCurrentSekki(date),
    holiday: holidayMap.get(key) || null,
    zassetsu: zassetsuMap.get(key) || [],
  };
}

// ---------- 六曜・祝日の表示スタイル ----------
const ROKUYOU_STYLE = {
  "大安": { emoji: "☀️", cls: "taian" },
  "赤口": { emoji: "🔥", cls: "shakkou" },
  "先勝": { emoji: "🌅", cls: "sensho" },
  "友引": { emoji: "🤝", cls: "tomobiki" },
  "先負": { emoji: "🌇", cls: "senbu" },
  "仏滅": { emoji: "🌑", cls: "butsumetsu" },
};

// ---------- アプリ本体 ----------
const App = {
  state: {
    viewDate: new Date(), // 現在カレンダーに表示している月
    selectedDate: new Date(),
    tab: "today",
    settings: Store.getSettings(),
    memos: Store.getMemos(),
  },

  init() {
    this.applyTheme();
    this.bindNav();
    this.bindSettings();
    this.renderToday();
    this.renderCalendar();
    this.renderSettings();
    this.setupNotificationLoop();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  },

  // ---- テーマ ----
  applyTheme() {
    const theme = this.state.settings.theme;
    const root = document.documentElement;
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else if (theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme"); // auto: CSSのprefers-color-schemeに任せる
  },

  // ---- タブ切り替え ----
  bindNav() {
    document.querySelectorAll(".navbtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.state.tab = btn.dataset.tab;
        document.querySelectorAll(".navbtn").forEach((b) => b.classList.toggle("active", b === btn));
        document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("show", t.id === "tab-" + btn.dataset.tab));
      });
    });
    document.getElementById("prevMonth").addEventListener("click", () => {
      this.state.viewDate = new Date(this.state.viewDate.getFullYear(), this.state.viewDate.getMonth() - 1, 1);
      this.renderCalendar("right");
    });
    document.getElementById("nextMonth").addEventListener("click", () => {
      this.state.viewDate = new Date(this.state.viewDate.getFullYear(), this.state.viewDate.getMonth() + 1, 1);
      this.renderCalendar("left");
    });
    document.getElementById("closeSheet").addEventListener("click", () => this.closeSheet());
    document.getElementById("sheetOverlay").addEventListener("click", () => this.closeSheet());
    document.getElementById("saveMemoBtn").addEventListener("click", () => this.saveMemo());
    document.getElementById("icsBtn").addEventListener("click", () => this.exportDayICS());
    this.bindSheetGestures();
    this.bindCalendarSwipe();
  },

  // ---- カレンダーを左右にスワイプして月を変える（指の動きに合わせて追従）----
  bindCalendarSwipe() {
    const grid = document.getElementById("calGrid");
    let startX = 0, startY = 0, tracking = false, horizontal = false, currentDx = 0;
    const THRESHOLD = 55;
    const SNAP_MS = 220;

    const goToMonth = (offset, exitDx) => {
      // 今表示しているマスを画面の外まで追い出す
      grid.style.transition = `transform ${SNAP_MS}ms ease`;
      grid.style.transform = `translateX(${exitDx}px)`;
      const enterFrom = exitDx < 0 ? 36 : -36; // 追い出した向きの反対側から出てくる
      setTimeout(() => {
        this.state.viewDate = new Date(this.state.viewDate.getFullYear(), this.state.viewDate.getMonth() + offset, 1);
        grid.style.transition = "none";
        grid.style.transform = `translateX(${enterFrom}px)`;
        this.renderCalendar();
        // 次のフレームで中央へアニメーション
        requestAnimationFrame(() => {
          grid.style.transition = `transform ${SNAP_MS}ms ease`;
          grid.style.transform = "translateX(0)";
        });
      }, SNAP_MS);
    };

    grid.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
      horizontal = false;
      grid.style.transition = "none";
    }, { passive: true });

    grid.addEventListener("touchmove", (e) => {
      if (!tracking || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!horizontal && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
        horizontal = true;
      }
      if (horizontal) {
        e.preventDefault(); // 横に動かしている間はページが縦に動かないように
        currentDx = dx;
        grid.style.transform = `translateX(${dx}px)`;
      }
    }, { passive: false });

    grid.addEventListener("touchend", () => {
      if (!tracking) return;
      tracking = false;
      if (!horizontal) return;

      if (currentDx <= -THRESHOLD) {
        goToMonth(1, -window.innerWidth); // 次の月：左へ追い出す
      } else if (currentDx >= THRESHOLD) {
        goToMonth(-1, window.innerWidth); // 前の月：右へ追い出す
      } else {
        // しきい値まで届かなかったら元の位置に戻す
        grid.style.transition = `transform ${SNAP_MS}ms ease`;
        grid.style.transform = "translateX(0)";
      }
      currentDx = 0;
    });
  },

  // ---- シートを下にスワイプして閉じる（画面のどこからでもOK）----
  bindSheetGestures() {
    const sheet = document.getElementById("sheet");
    let startY = 0, currentY = 0, dragging = false, ignoring = false, mouseActive = false;

    // メモ欄やボタンの上から始まった操作はスワイプ扱いにしない
    const isInteractive = (el) => !!(el && el.closest && el.closest("textarea, button, input, a"));

    const onStart = (y, target) => {
      ignoring = isInteractive(target);
      if (ignoring) return;
      startY = y;
      currentY = y;
      dragging = false;
      sheet.style.transition = "none";
    };
    const onMove = (y, evt) => {
      if (ignoring) return;
      currentY = y;
      const dy = currentY - startY;
      if (!dragging) {
        // 下向きに動いていて、かつシートの中身が一番上までスクロールされていたら
        // ここでスワイプ・ダウンの判定にする（それ以外は中身のスクロールを優先）
        if (dy > 4 && sheet.scrollTop <= 0) {
          dragging = true;
        } else {
          return;
        }
      }
      if (evt && evt.cancelable) evt.preventDefault();
      sheet.style.setProperty("--drag-y", `${Math.max(0, dy)}px`);
    };
    const onEnd = () => {
      if (ignoring) { ignoring = false; return; }
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = "";
      const delta = Math.max(0, currentY - startY);
      sheet.style.removeProperty("--drag-y");
      if (delta > 80) this.closeSheet();
    };

    sheet.addEventListener("touchstart", (e) => onStart(e.touches[0].clientY, e.target), { passive: true });
    sheet.addEventListener("touchmove", (e) => onMove(e.touches[0].clientY, e), { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);

    // PCのマウス操作でも確認できるように（マウスを実際に押している間だけ反応させる）
    sheet.addEventListener("mousedown", (e) => {
      mouseActive = true;
      onStart(e.clientY, e.target);
    });
    window.addEventListener("mousemove", (e) => { if (mouseActive) onMove(e.clientY, null); });
    window.addEventListener("mouseup", () => {
      if (!mouseActive) return;
      mouseActive = false;
      onEnd();
    });
  },

  // ---- 今日タブ ----
  renderToday() {
    const info = getDayInfo(new Date());
    const el = document.getElementById("todayCard");
    const style = ROKUYOU_STYLE[info.rokuyou] || {};
    const tags = [];
    if (info.holiday) tags.push(`<span class="tag tag-holiday">🎌 ${info.holiday}</span>`);
    info.zassetsu.forEach((z) => tags.push(`<span class="tag tag-zassetsu">🌸 ${z}</span>`));
    el.innerHTML = `
      <div class="today-date">
        <div class="today-weekday">${["日","月","火","水","木","金","土"][info.date.getDay()]}曜日</div>
        <div class="today-daynum">${info.m}<span class="slash">/</span>${info.d}</div>
        <div class="today-year">${info.y}年</div>
      </div>
      <div class="hanko ${style.cls || ""}">
        <span class="hanko-emoji">${style.emoji || "📅"}</span>
        <span class="hanko-text">${info.rokuyou || "-"}</span>
      </div>
      <div class="today-grid">
        <div class="info-box"><div class="info-label">🐍 日の干支</div><div class="info-value">${info.dayKanshi.emoji} <ruby>${info.dayKanshi.name}<rt>${info.dayKanshi.yomi}</rt></ruby></div></div>
        <div class="info-box"><div class="info-label">🐲 年の干支</div><div class="info-value">${info.yearKanshi.emoji} <ruby>${info.yearKanshi.name}<rt>${info.yearKanshi.yomi}</rt></ruby></div></div>
        <div class="info-box"><div class="info-label">🌑 月齢</div><div class="info-value">${info.moonIcon} ${info.moonAge.toFixed(1)}</div></div>
        <div class="info-box"><div class="info-label">🌕 二十四節気</div><div class="info-value">${info.season || "-"}</div></div>
        ${info.lunar ? `<div class="info-box"><div class="info-label">📜 旧暦</div><div class="info-value">${info.lunar.isLeap ? "閏" : ""}${info.lunar.month}月${info.lunar.day}日</div></div>` : ""}
      </div>
      <div class="today-tags">${tags.join("") || '<span class="tag tag-none">今日はとくに行事はありません</span>'}</div>
    `;
  },

  // ---- カレンダータブ ----
  renderCalendar(direction) {
    const vd = this.state.viewDate;
    const year = vd.getFullYear(), month = vd.getMonth();
    document.getElementById("monthLabel").textContent = `${year}年 ${month + 1}月`;

    const grid = document.getElementById("calGrid");
    grid.innerHTML = "";
    ["日","月","火","水","木","金","土"].forEach((w, i) => {
      const wd = document.createElement("div");
      wd.className = "weekday" + (i === 0 ? " sun" : i === 6 ? " sat" : "");
      wd.textContent = w;
      grid.appendChild(wd);
    });

    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    const todayKey = keyOfDate(new Date());

    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startOffset + 1;
      const cell = document.createElement("div");
      if (dayNum < 1 || dayNum > daysInMonth) {
        cell.className = "cell empty";
        grid.appendChild(cell);
        continue;
      }
      const date = new Date(year, month, dayNum);
      const info = getDayInfo(date);
      const style = ROKUYOU_STYLE[info.rokuyou] || {};
      const isToday = keyOfDate(date) === todayKey;
      const dow = date.getDay();
      const hasMemo = !!this.state.memos[keyOfDate(date)];

      cell.className =
        "cell" +
        (isToday ? " today" : "") +
        (dow === 0 ? " sun" : dow === 6 ? " sat" : "") +
        (info.holiday ? " holiday" : "") +
        (info.dayKanshi.junishi === "酉" ? " tori" : "") +
        (info.rokuyou === "友引" ? " tomobiki-day" : "");
      cell.innerHTML = `
        <div class="cell-top">
          <div class="cell-num">${dayNum}</div>
          ${hasMemo ? '<span class="dot dot-memo"></span>' : ""}
        </div>
        <div class="cell-rokuyou ${style.cls || ""}">${info.rokuyou || ""}</div>
        <div class="cell-kanshi">${info.dayKanshi.name}</div>
      `;
      cell.addEventListener("click", () => this.openSheet(date));
      grid.appendChild(cell);
    }

    if (direction) {
      grid.classList.remove("slide-left", "slide-right");
      void grid.offsetWidth; // アニメーションを最初からやり直すためのおまじない
      grid.classList.add(direction === "left" ? "slide-left" : "slide-right");
    }
  },

  // ---- 日付詳細シート ----
  openSheet(date) {
    this.state.selectedDate = date;
    document.getElementById("sheet").style.removeProperty("--drag-y");
    const info = getDayInfo(date);
    const style = ROKUYOU_STYLE[info.rokuyou] || {};
    document.getElementById("sheetTitle").textContent =
      `${info.y}年${info.m}月${info.d}日（${["日","月","火","水","木","金","土"][date.getDay()]}）`;
    document.getElementById("sheetBody").innerHTML = `
      <div class="sheet-hanko ${style.cls || ""}">${style.emoji || ""} ${info.rokuyou || "-"}</div>
      <div class="sheet-grid">
        <div>🐍 日の干支：<ruby>${info.dayKanshi.name}<rt>${info.dayKanshi.yomi}</rt></ruby></div>
        <div>🐲 年の干支：<ruby>${info.yearKanshi.name}<rt>${info.yearKanshi.yomi}</rt></ruby></div>
        <div>🌑 月齢：${info.moonAge.toFixed(1)}（${info.moonIcon}）</div>
        <div>🌕 節気：${info.season || "-"}</div>
        ${info.lunar ? `<div>📜 旧暦：${info.lunar.isLeap ? "閏" : ""}${info.lunar.month}月${info.lunar.day}日</div>` : ""}
        ${info.holiday ? `<div>🎌 ${info.holiday}</div>` : ""}
        ${info.zassetsu.map((z) => `<div>🌸 ${z}</div>`).join("")}
      </div>
    `;
    document.getElementById("memoInput").value = this.state.memos[keyOfDate(date)] || "";
    document.getElementById("sheet").classList.add("open");
    document.getElementById("sheetOverlay").classList.add("open");
    document.body.classList.add("no-scroll");
  },
  closeSheet() {
    document.getElementById("sheet").classList.remove("open");
    document.getElementById("sheetOverlay").classList.remove("open");
    document.body.classList.remove("no-scroll");
    this.renderCalendar();
  },
  saveMemo() {
    const key = keyOfDate(this.state.selectedDate);
    const text = document.getElementById("memoInput").value.trim();
    if (text) this.state.memos[key] = text; else delete this.state.memos[key];
    Store.saveMemos(this.state.memos);
    this.toast("メモを保存しました");
  },

  // ---- ICS書き出し（iPhoneのカレンダー／リマインダーに登録できるファイル） ----
  exportDayICS() {
    const d = this.state.selectedDate;
    const info = getDayInfo(d);
    const title = `${info.rokuyou || ""} ${info.holiday || ""}`.trim() || "六曜カレンダー";
    const memo = this.state.memos[keyOfDate(d)] || "";
    const dt = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RokuyouCalendar//JP",
      "BEGIN:VEVENT",
      `UID:${dt}-${Math.random().toString(36).slice(2)}@rokuyou-calendar`,
      `DTSTART;VALUE=DATE:${dt}`,
      `DTEND;VALUE=DATE:${dt}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${memo.replace(/\n/g, "\\n")}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:REMINDER", "TRIGGER:-PT9H", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${dt}.ics`;
    a.click();
    this.toast("iPhoneの「カレンダー」に読み込める形式で書き出しました");
  },

  // ---- 設定タブ ----
  bindSettings() {
    document.querySelectorAll('input[name="theme"]').forEach((r) => {
      r.addEventListener("change", (e) => {
        this.state.settings.theme = e.target.value;
        Store.saveSettings(this.state.settings);
        this.applyTheme();
      });
    });
    document.getElementById("notifyToggle").addEventListener("change", async (e) => {
      if (e.target.checked) {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { e.target.checked = false; this.toast("通知が許可されませんでした"); return; }
      }
      this.state.settings.notify = e.target.checked;
      Store.saveSettings(this.state.settings);
    });
    document.getElementById("notifyTime").addEventListener("change", (e) => {
      this.state.settings.notifyTime = e.target.value;
      Store.saveSettings(this.state.settings);
    });
    document.getElementById("exportBtn").addEventListener("click", () => this.exportData());
    document.getElementById("importInput").addEventListener("change", (e) => this.importData(e));
  },
  renderSettings() {
    const s = this.state.settings;
    document.querySelector(`input[name="theme"][value="${s.theme}"]`).checked = true;
    document.getElementById("notifyToggle").checked = s.notify;
    document.getElementById("notifyTime").value = s.notifyTime;
  },

  // ---- 通知（アプリを開いている間、設定時刻になったら通知） ----
  setupNotificationLoop() {
    setInterval(() => {
      const s = this.state.settings;
      if (!s.notify || Notification.permission !== "granted") return;
      const now = new Date();
      const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
      const key = "notified_" + keyOfDate(now);
      if (hhmm === s.notifyTime && sessionStorage.getItem(key) !== "1") {
        const info = getDayInfo(now);
        new Notification("今日の暦", {
          body: `${info.rokuyou || ""}／${info.dayKanshi.name}${info.holiday ? "／" + info.holiday : ""}`,
        });
        sessionStorage.setItem(key, "1");
      }
    }, 30000);
  },

  // ---- バックアップ（書き出し／読み込み。iCloud Driveへの保存はFilesアプリ経由） ----
  exportData() {
    const data = { memos: this.state.memos, settings: this.state.settings, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rokuyou-backup-${keyOfDate(new Date())}.json`;
    a.click();
    this.toast("バックアップを書き出しました（「ファイル」でiCloud Driveに保存できます）");
  },
  importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.memos) { this.state.memos = data.memos; Store.saveMemos(this.state.memos); }
        if (data.settings) { this.state.settings = { ...this.state.settings, ...data.settings }; Store.saveSettings(this.state.settings); }
        this.applyTheme();
        this.renderSettings();
        this.renderCalendar();
        this.renderToday();
        this.toast("バックアップを読み込みました");
      } catch { this.toast("読み込みに失敗しました"); }
    };
    reader.readAsText(file);
  },

  toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2400);
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());
