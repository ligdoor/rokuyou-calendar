/**
 * holidays.js
 * 日本の国民の祝日を計算します（2000年〜2050年目安の一般的なルールに対応）。
 * 春分の日・秋分の日は二十四節気の計算結果を利用します。
 * ※ オリンピック開催に伴う特例移動（2020・2021年）など、法改正による
 *   一時的な例外については反映していません。
 */
const Holidays = (() => {
  function nthMondayOfMonth(year, month, n) {
    // month: 1-12, n: 第n月曜日
    const d = new Date(Date.UTC(year, month - 1, 1));
    const firstMondayOffset = (8 - d.getUTCDay()) % 7; // 0=日曜
    const day = 1 + firstMondayOffset + (n - 1) * 7;
    return new Date(Date.UTC(year, month - 1, day));
  }

  function dateKey(d) {
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  }

  function getHolidaysForYear(year) {
    const map = new Map(); // key -> 祝日名

    const add = (date, name) => map.set(dateKey(date), name);

    add(new Date(Date.UTC(year, 0, 1)), "元日");
    add(nthMondayOfMonth(year, 1, 2), "成人の日");
    add(new Date(Date.UTC(year, 1, 11)), "建国記念の日");
    add(new Date(Date.UTC(year, 1, 23)), "天皇誕生日");

    // 春分の日・秋分の日（二十四節気計算より）
    const jdStart = Astro.toJulianDay(new Date(Date.UTC(year, 0, 1)));
    const jdEnd = Astro.toJulianDay(new Date(Date.UTC(year, 11, 31)));
    const sekki = Lunar.get24Sekki(jdStart - 10, jdEnd + 10);
    const shunbun = sekki.find((s) => s.name === "春分" && s.jd >= jdStart && s.jd <= jdEnd);
    const shuubun = sekki.find((s) => s.name === "秋分" && s.jd >= jdStart && s.jd <= jdEnd);
    if (shunbun) {
      const d = new Date(Date.UTC(year, 0, 1));
      d.setUTCDate(1 + Math.floor(shunbun.jd - jdStart));
      add(d, "春分の日");
    }
    if (shuubun) {
      const d = new Date(Date.UTC(year, 0, 1));
      d.setUTCDate(1 + Math.floor(shuubun.jd - jdStart));
      add(d, "秋分の日");
    }

    add(new Date(Date.UTC(year, 3, 29)), "昭和の日");
    add(new Date(Date.UTC(year, 4, 3)), "憲法記念日");
    add(new Date(Date.UTC(year, 4, 4)), "みどりの日");
    add(new Date(Date.UTC(year, 4, 5)), "こどもの日");
    add(nthMondayOfMonth(year, 7, 3), "海の日");
    add(new Date(Date.UTC(year, 7, 11)), "山の日");
    add(nthMondayOfMonth(year, 9, 3), "敬老の日");
    add(nthMondayOfMonth(year, 10, 2), "スポーツの日");
    add(new Date(Date.UTC(year, 10, 3)), "文化の日");
    add(new Date(Date.UTC(year, 10, 23)), "勤労感謝の日");

    // 振替休日：祝日が日曜日の場合、直後の祝日でない日を休日にする
    const substitutes = [];
    map.forEach((name, key) => {
      const [y, m, d] = key.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      if (date.getUTCDay() === 0) {
        let next = new Date(date);
        do {
          next.setUTCDate(next.getUTCDate() + 1);
        } while (map.has(dateKey(next)));
        substitutes.push([dateKey(next), "振替休日"]);
      }
    });
    substitutes.forEach(([key, name]) => {
      if (!map.has(key)) map.set(key, name);
    });

    // 国民の休日：前後を祝日に挟まれた平日（祝日でも振替休日でもない日）
    const allKeys = Array.from(map.keys());
    const kokuminKyujitsu = [];
    allKeys.forEach((key) => {
      const [y, m, d] = key.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 2);
      const between = new Date(date);
      between.setUTCDate(between.getUTCDate() + 1);
      if (map.has(dateKey(next)) && !map.has(dateKey(between)) && between.getUTCDay() !== 0) {
        kokuminKyujitsu.push([dateKey(between), "国民の休日"]);
      }
    });
    kokuminKyujitsu.forEach(([key, name]) => {
      if (!map.has(key)) map.set(key, name);
    });

    return map;
  }

  return { getHolidaysForYear };
})();
