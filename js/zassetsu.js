/**
 * zassetsu.js
 * 雑節（節分・彼岸・社日・八十八夜・入梅・半夏生・土用・二百十日・二百二十日）を
 * その年の二十四節気を基準に計算します。
 */
const Zassetsu = (() => {
  function jdToDate(jd) {
    // JD(正午UTC基準)をローカル日付(年月日)に変換
    const jdInt = Math.floor(jd + 0.5);
    const a = jdInt + 32044;
    const b = Math.floor((4 * a + 3) / 146097);
    const c = a - Math.floor((146097 * b) / 4);
    const d = Math.floor((4 * c + 3) / 1461);
    const e = c - Math.floor((1461 * d) / 4);
    const m = Math.floor((5 * e + 2) / 153);
    const day = e - Math.floor((153 * m + 2) / 5) + 1;
    const month = m + 3 - 12 * Math.floor(m / 10);
    const year = 100 * b + d - 4800 + Math.floor(m / 10);
    return new Date(Date.UTC(year, month - 1, day));
  }

  function dateKey(d) {
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  }

  // 指定した年について、雑節の日付一覧を計算する（Map<"YYYY-M-D", [名称,...]>）
  function getZassetsuForYear(year) {
    const jdStart = Astro.toJulianDay(new Date(Date.UTC(year - 1, 10, 1)));
    const jdEnd = Astro.toJulianDay(new Date(Date.UTC(year + 1, 1, 28)));
    const sekki = Lunar.get24Sekki(jdStart, jdEnd);

    const findSekki = (name, afterJD, beforeJD) =>
      sekki.find((s) => s.name === name && s.jd >= afterJD && s.jd <= beforeJD);

    const yearStartJD = Astro.toJulianDay(new Date(Date.UTC(year, 0, 1)));
    const yearEndJD = Astro.toJulianDay(new Date(Date.UTC(year, 11, 31)));

    const risshun = sekki.find((s) => s.name === "立春" && s.jd >= yearStartJD - 60 && s.jd <= yearEndJD);
    const rikka = sekki.find((s) => s.name === "立夏" && s.jd >= yearStartJD && s.jd <= yearEndJD);
    const risshuu = sekki.find((s) => s.name === "立秋" && s.jd >= yearStartJD && s.jd <= yearEndJD);
    const rittou = sekki.find((s) => s.name === "立冬" && s.jd >= yearStartJD && s.jd <= yearEndJD);
    const shunbun = sekki.find((s) => s.name === "春分" && s.jd >= yearStartJD && s.jd <= yearEndJD);
    const shuubun = sekki.find((s) => s.name === "秋分" && s.jd >= yearStartJD && s.jd <= yearEndJD);

    const events = [];

    if (risshun) {
      events.push({ jd: Math.floor(risshun.jd) - 1, name: "節分" });
      events.push({ jd: Math.floor(risshun.jd) + 87, name: "八十八夜" });
      events.push({ jd: Math.floor(risshun.jd) + 209, name: "二百十日" });
      events.push({ jd: Math.floor(risshun.jd) + 219, name: "二百二十日" });
    }
    // 彼岸（春・秋 それぞれ中日の前後3日、計7日間）
    if (shunbun) {
      for (let i = -3; i <= 3; i++) {
        events.push({ jd: Math.floor(shunbun.jd) + i, name: i === 0 ? "春彼岸（中日）" : "春彼岸" });
      }
    }
    if (shuubun) {
      for (let i = -3; i <= 3; i++) {
        events.push({ jd: Math.floor(shuubun.jd) + i, name: i === 0 ? "秋彼岸（中日）" : "秋彼岸" });
      }
    }
    // 土用（立春・立夏・立秋・立冬の直前18日間）
    [
      { term: risshun, label: "冬の土用" },
      { term: rikka, label: "春の土用" },
      { term: risshuu, label: "夏の土用" },
      { term: rittou, label: "秋の土用" },
    ].forEach(({ term, label }) => {
      if (!term) return;
      for (let i = 18; i >= 1; i--) {
        events.push({ jd: Math.floor(term.jd) - i, name: label });
      }
    });
    // 入梅（太陽黄経80度）・半夏生（太陽黄経100度）
    const nyuubaiJD = Lunar.findByDegree(yearStartJD, yearEndJD, 80);
    if (nyuubaiJD) events.push({ jd: Math.floor(nyuubaiJD), name: "入梅" });
    const hangeshouJD = Lunar.findByDegree(yearStartJD, yearEndJD, 100);
    if (hangeshouJD) events.push({ jd: Math.floor(hangeshouJD), name: "半夏生" });

    const map = new Map();
    events.forEach((ev) => {
      const d = jdToDate(ev.jd);
      const key = dateKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev.name);
    });
    return map;
  }

  return { getZassetsuForYear };
})();
