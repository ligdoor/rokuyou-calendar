/**
 * lunar.js
 * 二十四節気・旧暦（太陰太陽暦）・六曜を計算します。
 * astro.js の太陽黄経・新月計算を使って、日本の伝統的な暦を組み立てます。
 */
const Lunar = (() => {
  // 二十四節気の名前（太陽黄経0度=春分 から15度刻み）
  const SEKKI_NAMES = [
    "春分", "清明", "穀雨", "立夏", "小満", "芒種",
    "夏至", "小暑", "大暑", "立秋", "処暑", "白露",
    "秋分", "寒露", "霜降", "立冬", "小雪", "大雪",
    "冬至", "小寒", "大寒", "立春", "雨水", "啓蟄",
  ];

  // 「中気」= 旧暦の月番号を決めるための12節気
  const CHUUKI_MONTH = {
    雨水: 1, 春分: 2, 穀雨: 3, 小満: 4, 夏至: 5, 大暑: 6,
    処暑: 7, 秋分: 8, 霜降: 9, 小雪: 10, 冬至: 11, 大寒: 12,
  };

  // 太陽黄経が targetDeg を通過するJDを [jdStart, jdEnd] の範囲で探す
  function findSolarLongitudeCrossing(jdStart, jdEnd, targetDeg) {
    let prevJD = jdStart;
    let prevLon = Astro.norm360(Astro.sunEclipticLongitude(jdStart) - targetDeg);
    for (let jd = jdStart + 1; jd <= jdEnd; jd++) {
      const lon = Astro.norm360(Astro.sunEclipticLongitude(jd) - targetDeg);
      if (prevLon > 300 && lon < 60) {
        let lo = prevJD, hi = jd;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2;
          const l = Astro.norm360(Astro.sunEclipticLongitude(mid) - targetDeg);
          if (l > 300) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
      }
      prevJD = jd; prevLon = lon;
    }
    return null;
  }

  // 指定範囲の二十四節気を全て求める
  function get24Sekki(jdStart, jdEnd) {
    const results = [];
    for (let i = 0; i < 24; i++) {
      const deg = i * 15;
      const jd = findSolarLongitudeCrossing(jdStart, jdEnd, deg);
      if (jd) results.push({ name: SEKKI_NAMES[i], deg, jd });
    }
    results.sort((a, b) => a.jd - b.jd);
    return results;
  }

  // 任意の太陽黄経（節気以外、例：入梅=80度）に対応する日を求める
  function findByDegree(jdStart, jdEnd, deg) {
    return findSolarLongitudeCrossing(jdStart, jdEnd, deg);
  }

  // 指定範囲の新月一覧（JD, 整数日に丸めない生値）を求める
  function getNewMoons(jdStart, jdEnd) {
    const moons = [];
    let guess = jdStart - 32;
    while (guess < jdEnd + 32) {
      const nm = Astro.findNewMoonNear(guess);
      if (moons.length === 0 || nm - moons[moons.length - 1] > 20) {
        moons.push(nm);
      }
      guess += 29.530588853;
    }
    return moons;
  }

  // 旧暦カレンダーを組み立てる（新月〜新月を1ヶ月とし、中気で月番号を決定）
  function buildLunarMonths(jdStart, jdEnd) {
    const newMoons = getNewMoons(jdStart, jdEnd);
    const sekkiList = get24Sekki(jdStart - 45, jdEnd + 45);

    const months = [];
    for (let i = 0; i < newMoons.length - 1; i++) {
      const startJD = Math.floor(newMoons[i]);
      const endJD = Math.floor(newMoons[i + 1]);
      let chuuki = null;
      for (const s of sekkiList) {
        if (s.jd >= newMoons[i] && s.jd < newMoons[i + 1] && CHUUKI_MONTH[s.name]) {
          chuuki = s.name;
          break;
        }
      }
      months.push({ startJD, endJD, chuuki });
    }

    // 冬至を含む月を「11月」の基準として、前後に月番号を伝播させる
    let anchor = months.findIndex((m) => m.chuuki === "冬至");
    if (anchor === -1) anchor = Math.floor(months.length / 2);
    months[anchor].month = months[anchor].chuuki ? CHUUKI_MONTH[months[anchor].chuuki] : 11;
    months[anchor].isLeap = false;

    for (let i = anchor + 1; i < months.length; i++) {
      const prev = months[i - 1];
      if (months[i].chuuki && CHUUKI_MONTH[months[i].chuuki] !== undefined) {
        months[i].month = CHUUKI_MONTH[months[i].chuuki];
        months[i].isLeap = false;
      } else {
        months[i].month = prev.month;
        months[i].isLeap = true;
      }
    }
    for (let i = anchor - 1; i >= 0; i--) {
      const next = months[i + 1];
      if (months[i].chuuki && CHUUKI_MONTH[months[i].chuuki] !== undefined) {
        months[i].month = CHUUKI_MONTH[months[i].chuuki];
        months[i].isLeap = false;
      } else {
        months[i].month = next.month;
        months[i].isLeap = true;
      }
    }
    return months;
  }

  // 六曜を求める（旧暦月・日から算出）
  const ROKUYOU_NAMES = ["大安", "赤口", "先勝", "友引", "先負", "仏滅"];
  function getRokuyou(lunarMonth, lunarDay) {
    const idx = (lunarMonth + lunarDay) % 6;
    return ROKUYOU_NAMES[idx];
  }

  return {
    SEKKI_NAMES,
    CHUUKI_MONTH,
    get24Sekki,
    findByDegree,
    buildLunarMonths,
    getRokuyou,
  };
})();
