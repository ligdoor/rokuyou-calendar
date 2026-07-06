/**
 * kanshi.js
 * 干支（十干十二支）を「年」と「日」それぞれについて計算します。
 */
const Kanshi = (() => {
  const JIKKAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  const JUNISHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const JUNISHI_EMOJI = ["🐭", "🐂", "🐯", "🐰", "🐲", "🐍", "🐴", "🐐", "🐵", "🐔", "🐶", "🐗"];

  // 年の干支（1984年 = 甲子(きのえね) を基準に計算）
  function yearKanshi(year) {
    const idx = ((((year - 1984) % 60) + 60) % 60);
    return {
      jikkan: JIKKAN[idx % 10],
      junishi: JUNISHI[idx % 12],
      name: JIKKAN[idx % 10] + JUNISHI[idx % 12],
      emoji: JUNISHI_EMOJI[idx % 12],
    };
  }

  // 日の干支（ユリウス通日を60で割った余りから算出）
  function dayKanshi(date) {
    const jd = Math.floor(Astro.toJulianDay(date) + 0.5);
    const idx = (((jd + 50) % 60) + 60) % 60;
    return {
      jikkan: JIKKAN[idx % 10],
      junishi: JUNISHI[idx % 12],
      name: JIKKAN[idx % 10] + JUNISHI[idx % 12],
      emoji: JUNISHI_EMOJI[idx % 12],
    };
  }

  return { JIKKAN, JUNISHI, yearKanshi, dayKanshi };
})();
