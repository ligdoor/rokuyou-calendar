/**
 * astro.js
 * 太陽・月の位置を計算するための簡易天文計算。
 * ここで求めた「太陽黄経」「月齢」を元に、二十四節気・旧暦・六曜などを
 * 他のファイル（lunar.js など）で計算します。
 *
 * ※ 誤差は数分〜数十分程度で、カレンダーアプリとして使うには十分な精度です。
 */
const Astro = (() => {
  // 日付 → ユリウス通日（天文計算の共通の「日付の数え方」）に変換
  function toJulianDay(date) {
    const Y = date.getUTCFullYear();
    let M = date.getUTCMonth() + 1;
    const D =
      date.getUTCDate() +
      (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) / 24;
    let y = Y, m = M;
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + D + B - 1524.5;
  }

  function deg2rad(d) { return (d * Math.PI) / 180; }
  function norm360(x) { x = x % 360; if (x < 0) x += 360; return x; }

  // 太陽の視黄経（度）。0度=春分、90度=夏至、180度=秋分、270度=冬至
  function sunEclipticLongitude(jd) {
    const T = (jd - 2451545.0) / 36525;
    const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
    const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
    const Mr = deg2rad(M);
    const C =
      (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
      (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
      0.000289 * Math.sin(3 * Mr);
    const trueLong = L0 + C;
    const omega = 125.04 - 1934.136 * T;
    const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(deg2rad(omega));
    return norm360(lambda);
  }

  // 月の視黄経（度）
  function moonEclipticLongitude(jd) {
    const T = (jd - 2451545.0) / 36525;
    const Lp = norm360(218.3164477 + 481267.88123421 * T);
    const D = norm360(297.8501921 + 445267.1114034 * T);
    const M = norm360(357.5291092 + 35999.0502909 * T);
    const Mp = norm360(134.9633964 + 477198.8675055 * T);
    const F = norm360(93.272095 + 483202.0175233 * T);
    const Dr = deg2rad(D), Mr = deg2rad(M), Mpr = deg2rad(Mp), Fr = deg2rad(F);
    const dL =
      6.288774 * Math.sin(Mpr) +
      1.274027 * Math.sin(2 * Dr - Mpr) +
      0.658314 * Math.sin(2 * Dr) +
      0.213618 * Math.sin(2 * Mpr) -
      0.185116 * Math.sin(Mr) -
      0.114332 * Math.sin(2 * Fr) +
      0.058793 * Math.sin(2 * Dr - 2 * Mpr) +
      0.057066 * Math.sin(2 * Dr - Mr - Mpr) +
      0.053322 * Math.sin(2 * Dr + Mpr) +
      0.045758 * Math.sin(2 * Dr - Mr) -
      0.04092 * Math.sin(Mr - Mpr) -
      0.03072 * Math.sin(Dr) -
      0.030383 * Math.sin(Mr + Mpr);
    return norm360(Lp + dL);
  }

  // 月齢（0〜約29.53、0=新月、約14.8=満月）
  function moonAge(date) {
    const jd = toJulianDay(date);
    const sunLon = sunEclipticLongitude(jd);
    const moonLon = moonEclipticLongitude(jd);
    const phase = norm360(moonLon - sunLon);
    const synodic = 29.530588853;
    return (phase / 360) * synodic;
  }

  // 指定JD付近で最も近い新月のJDを求める（反復計算）
  function findNewMoonNear(jdGuess) {
    let jd = jdGuess;
    for (let i = 0; i < 8; i++) {
      const sunLon = sunEclipticLongitude(jd);
      const moonLon = moonEclipticLongitude(jd);
      let diff = norm360(moonLon - sunLon);
      if (diff > 180) diff -= 360;
      jd -= diff * (29.530588853 / 360);
    }
    return jd;
  }

  return {
    toJulianDay,
    sunEclipticLongitude,
    moonEclipticLongitude,
    moonAge,
    findNewMoonNear,
    norm360,
  };
})();
