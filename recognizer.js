/* Локальная проверка рукописной формулы.
   1) Штрихи делятся на дробные черты, знаки корня и символы.
   2) Каждый символ сравнивается с образцами алгоритмом $P (облако точек; порядок и направление штрихов не важны).
   3) Из символов собирается последовательность с дробями и корнями и сравнивается с эталоном
      (с учётом похожих символов, перестановки множителей и сторон равенства).
   Личные образцы (почерк пользователя) добавляются через learn(). */
(function (G) {
  "use strict";
  const N = 32;

  /* ---------- $P ---------- */
  function resample(strokes, n) {
    const pts = [];
    strokes.forEach((s, id) => s.forEach(p => pts.push({ x: p[0], y: p[1], id })));
    let L = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].id === pts[i - 1].id) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (L < 1e-6) { const out = []; for (let i = 0; i < n; i++) out.push({ ...pts[Math.floor(i * pts.length / n)] }); return out; }
    const I = L / (n - 1); let D = 0; const out = [{ ...pts[0] }];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].id !== pts[i - 1].id) continue;
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
      if (D + d >= I && d > 0) {
        const t = (I - D) / d, q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), id: b.id };
        out.push(q); pts.splice(i, 0, q); D = 0;
      } else D += d;
    }
    while (out.length < n) out.push({ ...pts[pts.length - 1] });
    return out.slice(0, n);
  }
  function normalize(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const s = Math.max(x1 - x0, y1 - y0) || 1;
    let cx = 0, cy = 0;
    const q = pts.map(p => ({ x: (p.x - x0) / s, y: (p.y - y0) / s }));
    for (const p of q) { cx += p.x; cy += p.y; }
    cx /= q.length; cy /= q.length;
    return { pts: q.map(p => ({ x: p.x - cx, y: p.y - cy })), ar: (x1 - x0) / ((y1 - y0) || 1e-6) };
  }
  function cloudDist(a, b, start) {
    const n = a.length, used = new Uint8Array(n); let sum = 0, i = start;
    do {
      let min = Infinity, idx = -1;
      for (let j = 0; j < n; j++) if (!used[j]) { const dx = a[i].x - b[j].x, dy = a[i].y - b[j].y, d = dx * dx + dy * dy; if (d < min) { min = d; idx = j; } }
      used[idx] = 1;
      sum += (1 - ((i - start + n) % n) / n) * Math.sqrt(min);
      i = (i + 1) % n;
    } while (i !== start);
    return sum;
  }
  function match(a, b) {
    const step = Math.floor(Math.pow(N, 0.5)); let min = Infinity;
    for (let i = 0; i < N; i += step) min = Math.min(min, cloudDist(a, b, i), cloudDist(b, a, i));
    return min;
  }
  const prep = strokes => normalize(resample(strokes, N));

  /* ---------- образцы ---------- */
  let base = [], personal = {};
  function loadGlyphs(list) {
    base = list.map(([c, st]) => {
      const strokes = st.map(a => { const s = []; for (let i = 0; i < a.length; i += 2) s.push([a[i], a[i + 1]]); return s; });
      return { c, ...prep(strokes) };
    });
  }
  function templates() {
    const out = base.slice();
    for (const c in personal) for (const t of personal[c]) out.push({ c, pts: t.pts, ar: t.ar, mine: true });
    return out;
  }
  function classify(strokes) {
    const g = prep(strokes), best = {};
    for (const t of templates()) {
      let d = match(g.pts, t.pts);
      // форма сильно разной вытянутости — штраф (поворот и масштаб $P не различает)
      const r = Math.abs(Math.log((g.ar + 0.05) / (t.ar + 0.05)));
      d *= 1 + Math.max(0, r - 0.7) * 0.35;
      if (t.mine) d *= 0.92;
      if (!(t.c in best) || d < best[t.c]) best[t.c] = d;
    }
    return Object.entries(best).map(([c, d]) => ({ c, d })).sort((a, b) => a.d - b.d).slice(0, 12);
  }

  /* ---------- похожие символы ---------- */
  const CLASSES = ["oO0οо", "l1|Iι", "cCс", "sS", "vVν", "wWω", "xXхχ", "zZ", "pPρр", "kKκк", "uUμ", "yYу", "Eℰ", "aαа", "eе",
    "nηп", "з3", "HН", "ΛЛл", "φΦфФ", "−-", "Bв"];
  const CLS = {}; CLASSES.forEach((s, i) => { for (const ch of s) CLS[ch] = i; });
  const EXTRA = { "т": "Ttm", "и": "uU", "ц": "uU", "ы": "bl", "ж": "x", "Γ": "rL", "м": "mM", "ε": "3", "Δ": "A" };
  // похожие, но разные по смыслу символы: засчитываем с небольшим штрафом
  const SOFT = { g: "q9", q: "g9", "9": "gq", r: "Γ", "Γ": "r", t: "+", "+": "t", "ε": "e", e: "ε" };
  const soft = (e, c) => (SOFT[e] || "").includes(c);
  const accept = (e, c) => e === c || (CLS[e] !== undefined && CLS[e] === CLS[c]) || (EXTRA[e] || "").includes(c);
  function matchCost(cands, e) {
    if (!cands.length) return 1;
    if (accept(e, cands[0].c)) return 0;
    if (soft(e, cands[0].c)) return 0.3;
    const k = cands.findIndex(x => accept(e, x.c));
    if (k < 0) return 1;
    const r = cands[k].d / (cands[0].d || 1e-6);
    return r <= 1.15 ? 0.25 : r <= 1.45 ? 0.6 : 1;
  }

  /* ---------- разбор штрихов ---------- */
  function bb(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  const union = bs => bb(bs.flatMap(b => [[b.x0, b.y0], [b.x1, b.y1]]));
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  function analyze(strokesIn) {
    const S = strokesIn.filter(s => s.length).map((pts, i) => ({ pts, i, b: bb(pts) }));
    if (!S.length) return [];
    const hs = S.filter(s => s.b.h > 0.4 * s.b.w).map(s => s.b.h).sort((a, b) => a - b);
    let H = hs.length ? hs[Math.floor(hs.length * 0.7)] : 0;
    if (!H) H = median(S.map(s => Math.max(s.b.w, s.b.h))) * 0.6;
    H = Math.max(H, 10);
    for (const s of S) s.flat = s.b.h < 0.35 * s.b.w && s.b.h < 0.45 * H && s.b.w > 0.25 * H;
    const xIn = (s, L, pad) => s.b.cx >= L.b.x0 - pad && s.b.cx <= L.b.x1 + pad;
    const blocked = (s, L, up) => S.some(F => F !== L && F !== s && F.flat && F.b.w >= 0.4 * H && xIn(s, F, 0) &&
      (up ? F.b.cy > s.b.y1 + 0.1 * H && F.b.cy < L.b.cy : F.b.cy < s.b.y0 - 0.1 * H && F.b.cy > L.b.cy));
    const reach = L => Math.max(1.6 * H, L.b.w);
    const aboveOf = L => S.filter(s => s !== L && !s.flat && xIn(s, L, 0.15 * H) && s.b.cy < L.b.cy - 0.15 * H && s.b.y1 <= L.b.cy + 0.4 * H && L.b.cy - s.b.y1 < reach(L) && !blocked(s, L, true));
    const belowOf = L => S.filter(s => s !== L && !s.flat && xIn(s, L, 0.15 * H) && s.b.cy > L.b.cy + 0.15 * H && s.b.y0 >= L.b.cy - 0.4 * H && s.b.y0 - L.b.cy < reach(L) && !blocked(s, L, false));

    // штрихи касаются друг друга (части одной буквы)
    const near = (s, g, tol) => {
      const t2 = tol * tol;
      for (const x of g.s) {
        if (x.b.x0 > s.b.x1 + tol || s.b.x0 > x.b.x1 + tol || x.b.y0 > s.b.y1 + tol || s.b.y0 > x.b.y1 + tol) continue;
        for (let i = 0; i < s.pts.length; i += 2) for (let j = 0; j < x.pts.length; j += 2) {
          const dx = s.pts[i][0] - x.pts[j][0], dy = s.pts[i][1] - x.pts[j][1];
          if (dx * dx + dy * dy < t2) return true;
        }
      }
      return false;
    };
    const items = [], used = new Set();
    // дробные черты
    for (const L of S) if (L.flat && L.b.w >= 0.4 * H && aboveOf(L).length && belowOf(L).length) { L.role = "bar"; used.add(L); items.push({ kind: "bar", b: L.b, s: [L] }); }
    // корень: черта сверху + «галочка» слева, либо одним штрихом
    for (const L of S) {
      if (used.has(L) || !L.flat || L.b.w < 1.2 * H || aboveOf(L).length || !belowOf(L).length) continue;
      const rpt = r => r.pts.reduce((m, p) => p[0] > m[0] ? p : m, [-Infinity, 0]);
      const rads = S.filter(r => {
        if (r === L || used.has(r) || r.flat || r.b.x1 > L.b.x0 + 0.5 * H || r.b.x1 < L.b.x0 - 0.6 * H) return false;
        if (r.b.y0 > L.b.cy + 0.5 * H || r.b.y1 < L.b.cy + 0.6 * H || r.b.w > 1.2 * H) return false;
        if (Math.abs(rpt(r)[1] - L.b.cy) > 0.45 * H) return false;
        // у «галочки» нижняя точка одна, а не горизонтальная линия (как у 2)
        const low = r.pts.filter(p => p[1] > r.b.y1 - 0.15 * r.b.h).map(p => p[0]);
        return Math.max(...low) - Math.min(...low) < 0.45 * Math.max(r.b.w, 0.3 * H);
      });
      const rad = rads.sort((a, b) => Math.hypot(rpt(a)[0] - L.b.x0, rpt(a)[1] - L.b.cy) - Math.hypot(rpt(b)[0] - L.b.x0, rpt(b)[1] - L.b.cy))[0];
      if (!rad) continue;
      used.add(L); used.add(rad);
      items.push({ kind: "sqrt", b: union([L.b, rad.b]), top: L.b.cy, x0: L.b.x0 - 0.1 * H, x1: L.b.x1 + 0.2 * H, s: [L, rad] });
    }
    for (const R of S) {
      if (used.has(R) || R.flat || R.b.w < 1.4 * H || R.b.h < 0.6 * H) continue;
      // правый конец знака корня — наверху
      const rp = R.pts.reduce((m, p) => p[0] > m[0] ? p : m, [-Infinity, 0]);
      if (rp[1] > R.b.y0 + 0.2 * R.b.h) continue;
      const topPts = R.pts.filter(p => p[1] < R.b.y0 + 0.18 * R.b.h);
      if (!topPts.length) continue;
      const span = Math.max(...topPts.map(p => p[0])) - Math.min(...topPts.map(p => p[0]));
      const leftLow = R.pts.some(p => p[0] < R.b.x0 + 0.3 * R.b.w && p[1] > R.b.y0 + 0.6 * R.b.h);
      const inside = S.filter(s => s !== R && !s.flat && !near(s, { s: [R] }, 0.08 * H) && s.b.y0 > R.b.y0 + 0.1 * H && s.b.cx > R.b.x0 + 0.25 * R.b.w && s.b.cx < R.b.x1 + 0.1 * H && s.b.cy > R.b.y0 && s.b.cy < R.b.y1 + 0.2 * H);
      if (span > 0.5 * R.b.w && leftLow && inside.length) {
        used.add(R);
        items.push({ kind: "sqrt", b: R.b, top: R.b.y0, x0: R.b.x0 + 0.2 * R.b.w, x1: R.b.x1 + 0.2 * H, s: [R] });
      }
    }
    // символы: объединяем пересекающиеся по горизонтали и касающиеся штрихи
    const groups = [];
    for (const s of S) {
      if (used.has(s)) continue;
      let best = null, bestOv = 0; const hits = [];
      for (const g of groups) {
        const wmin = Math.max(Math.min(s.b.w, g.b.w), 0.2 * H);
        const ov = (Math.min(s.b.x1, g.b.x1) - Math.max(s.b.x0, g.b.x0)) / wmin;
        const gap = Math.max(s.b.y0 - g.b.y1, g.b.y0 - s.b.y1, 0);
        const tiny = Math.max(s.b.w, s.b.h) < 0.3 * H;
        const bothFlat = s.flat && g.s.every(x => x.flat);
        const tol = bothFlat ? 0.7 * H : tiny ? 0.5 * H : 0.35 * H;
        // не склеиваем через дробную черту
        const across = items.some(it => it.kind === "bar" && (Math.min(s.b.cy, g.b.cy) < it.b.cy && Math.max(s.b.cy, g.b.cy) > it.b.cy) && xIn(s, { b: it.b }, 0));
        const touch = ov > -0.25 && near(s, g, 0.16 * H);
        const dot = tiny && Math.abs(s.b.cx - g.b.cx) < 0.35 * H + g.b.w / 2 && gap <= 0.6 * H && s.b.cy < g.b.y0;
        const eq = bothFlat && Math.abs(s.b.cx - g.b.cx) < 0.5 * Math.max(s.b.w, g.b.w) && gap <= 0.8 * H;
        const score = touch || dot || eq ? Math.max(ov, 0.5) : ov;
        if ((ov >= 0.3 && gap <= tol || touch || dot || eq) && !across) { hits.push(g); if (score > bestOv) { best = g; bestOv = score; } }
      }
      if (best) {
        // штрих может соединить несколько частей одного символа (перекладина π над двумя ножками)
        const join = Math.max(s.b.w, s.b.h) < 0.3 * H ? [best] : hits;
        for (const g of join) if (g !== best) { best.s.push(...g.s); groups.splice(groups.indexOf(g), 1); }
        best.s.push(s); best.b = union(best.s.map(x => x.b));
      }
      else groups.push({ s: [s], b: s.b });
    }
    for (const g of groups) {
      g.kind = "sym";
      const size = Math.max(g.b.w, g.b.h);
      if (size < 0.2 * H) g.cands = [{ c: "·", d: 1 }];
      else if (g.s.length === 1 && g.s[0].flat) g.cands = [{ c: "−", d: 1 }];
      else if (g.s.length === 2 && g.s.every(x => x.flat)) g.cands = [{ c: "=", d: 1 }];
      else g.cands = classify(g.s.map(x => x.pts));
      items.push(g);
    }
    return layout(items, H);
  }

  // Строим последовательность токенов: дроби и корни — структурные токены.
  function layout(items, H) {
    let set = items.slice();
    const sqrts = set.filter(it => it.kind === "sqrt");
    const bars = set.filter(it => it.kind === "bar").sort((a, b) => b.b.w - a.b.w);
    for (const bar of bars) {
      if (!set.includes(bar)) continue;
      const inX = it => it.b.cx >= bar.b.x0 - 0.2 * H && it.b.cx <= bar.b.x1 + 0.2 * H;
      const num = set.filter(it => it !== bar && inX(it) && it.b.cy < bar.b.cy && bar.b.cy - it.b.y1 < Math.max(2.2 * H, bar.b.w));
      const den = set.filter(it => it !== bar && inX(it) && it.b.cy > bar.b.cy && it.b.y0 - bar.b.cy < Math.max(2.2 * H, bar.b.w));
      // знак корня, внутри которого стоит дробь, не забираем в числитель
      const numF = num.filter(it => !(it.kind === "sqrt" && it.b.w > bar.b.w));
      set = set.filter(it => it !== bar && !numF.includes(it) && !den.includes(it));
      if (numF.length && den.length) set.push({ kind: "frac", num: numF, den, b: union([bar.b, ...numF.map(x => x.b), ...den.map(x => x.b)]) });
      else set.push(...numF, ...den, { kind: "sym", cands: [{ c: "−", d: 1 }], b: bar.b, s: bar.s });
    }
    for (const sq of sqrts) {
      if (!set.includes(sq)) continue;
      const inner = set.filter(it => it !== sq && it.b.cx > sq.x0 && it.b.cx < sq.x1 && it.b.cy > sq.top);
      set = set.filter(it => it !== sq && !inner.includes(it));
      set.push({ kind: "sqrtN", inner, b: union([sq.b, ...inner.map(x => x.b)]) });
    }
    set.sort((a, b) => a.b.x0 - b.b.x0);
    const out = [];
    for (const it of set) {
      if (it.kind === "frac") out.push({ s: "FR(" }, ...layout(it.num, H), { s: "FR|" }, ...layout(it.den, H), { s: "FR)" });
      else if (it.kind === "sqrtN") out.push({ s: "SQ(" }, ...layout(it.inner, H), { s: "SQ)" });
      else if (it.kind === "sym") out.push({ cands: it.cands, strokes: it.s.map(x => x.pts) });
    }
    return out;
  }

  /* ---------- эталон ---------- */
  function expected(src) {
    const out = [];
    function walk(s, zone, w, opt, top) {
      let i = 0, z = zone;
      const group = () => {
        const o = s[i], c = o === "[" ? "]" : "}";
        if (o === "{" || o === "[") { let d = 1, j = i + 1; while (j < s.length && d) { if (s[j] === o) d++; else if (s[j] === c) d--; j++; } const g = s.slice(i + 1, j - 1); i = j; return g; }
        return s[i++] || "";
      };
      while (i < s.length) {
        const c = s[i];
        if (c === " ") { i++; continue; }
        if (c === "\\") {
          const k = s[i + 1]; i += 2;
          if (k === "f") { const a = group(), b = group(); out.push({ s: "FR(", z }); walk(a, z + "n", w, opt); out.push({ s: "FR|" }); walk(b, z + "d", w, opt); out.push({ s: "FR)" }); }
          else if (k === "s") { const a = group(); out.push({ s: "SQ(", z }); walk(a, z + "s", w, opt); out.push({ s: "SQ)" }); }
          continue;
        }
        if (c === "_" || c === "^") { i++; walk(group(), z, c === "_" ? 0.5 * w : w, opt); continue; }
        if (c === "[") { walk(group(), z, w, true); continue; }
        if (c === "*") { out.push({ c: "·", z, w, opt: true }); i++; continue; }
        if (c === "=" && top) { out.push({ c: "=", z, w }); z = "R"; i++; continue; }
        out.push({ c, z, w, opt }); i++;
      }
    }
    walk(src, "L", 1, false, true);
    return out;
  }

  /* ---------- сравнение ---------- */
  const isStruct = t => !!t.s;
  function zones(tokens) {
    let z = ["L"]; const out = [];
    tokens.forEach((t0, k) => {
      const t = { ...t0, k };
      const cur = z[z.length - 1];
      if (t.s === "FR(") { out.push({ ...t, z: cur }); z.push(cur + "n"); }
      else if (t.s === "FR|") { z.pop(); z.push(cur.slice(0, -1) + "d"); out.push(t); }
      else if (t.s === "FR)" || t.s === "SQ)") { z.pop(); out.push(t); }
      else if (t.s === "SQ(") { out.push({ ...t, z: cur }); z.push(cur + "s"); }
      else {
        const top = z.length === 1;
        out.push({ ...t, z: cur });
        if (top && t.cands && t.cands[0].c === "=" && cur === "L") z = ["R"];
      }
    });
    return out;
  }
  function swapSides(tokens) {
    const k = tokens.findIndex(t => t.z === "L" && t.cands && t.cands[0].c === "=");
    if (k < 0) return null;
    const flip = t => t.z ? { ...t, z: (t.z[0] === "L" ? "R" : "L") + t.z.slice(1) } : t;
    return [...tokens.slice(k + 1).map(flip), { ...tokens[k], z: "L" }, ...tokens.slice(0, k).map(flip)];
  }
  const insCost = d => isStruct(d) ? 1 : d.cands[0].c === "·" ? 0 : 1;
  const delCost = e => e.opt ? 0 : isStruct(e) ? 1 : e.w;
  function subCost(d, e) {
    if (isStruct(d) || isStruct(e)) return isStruct(d) && isStruct(e) && d.s === e.s ? 0 : Infinity;
    return matchCost(d.cands, e.c) * e.w;
  }
  function editAlign(D, E) {
    const n = D.length, m = E.length, T = [];
    for (let i = 0; i <= n; i++) { T.push(new Float64Array(m + 1)); }
    for (let i = 1; i <= n; i++) T[i][0] = T[i - 1][0] + insCost(D[i - 1]);
    for (let j = 1; j <= m; j++) T[0][j] = T[0][j - 1] + delCost(E[j - 1]);
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
      T[i][j] = Math.min(T[i - 1][j] + insCost(D[i - 1]), T[i][j - 1] + delCost(E[j - 1]), T[i - 1][j - 1] + subCost(D[i - 1], E[j - 1]));
    const pairs = [], extra = [], missing = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && T[i][j] === T[i - 1][j - 1] + subCost(D[i - 1], E[j - 1])) { pairs.push([D[i - 1], E[j - 1], subCost(D[i - 1], E[j - 1])]); i--; j--; }
      else if (i > 0 && T[i][j] === T[i - 1][j] + insCost(D[i - 1])) { extra.push(D[i - 1]); i--; }
      else { missing.push(E[j - 1]); j--; }
    }
    return { cost: T[n][m], pairs, extra, missing };
  }
  function multisetAlign(D, E) {
    const zs = new Set([...D, ...E].filter(t => t.z).map(t => t.z));
    let cost = 0; const pairs = [], extra = [], missing = [];
    for (const z of zs) {
      const d = D.filter(t => t.z === z), e = E.filter(t => t.z === z);
      const cand = [];
      d.forEach((a, i) => e.forEach((b, j) => { const c = subCost(a, b); if (c < 1) cand.push([c, i, j]); }));
      cand.sort((a, b) => a[0] - b[0]);
      const ud = new Set(), ue = new Set();
      for (const [c, i, j] of cand) if (!ud.has(i) && !ue.has(j)) { ud.add(i); ue.add(j); cost += c; pairs.push([d[i], e[j], c]); }
      d.forEach((a, i) => { if (!ud.has(i)) { cost += insCost(a); extra.push(a); } });
      e.forEach((b, j) => { if (!ue.has(j)) { cost += delCost(b); missing.push(b); } });
    }
    // структура должна совпасть по порядку
    const sd = D.filter(isStruct).map(t => t.s).join(), se = E.filter(isStruct).map(t => t.s).join();
    if (sd !== se) cost += 1;
    return { cost, pairs, extra, missing };
  }
  function check(strokes, src) {
    const E = expected(src);
    const W = E.reduce((a, t) => a + (isStruct(t) ? 0 : t.opt ? 0 : t.w), 0);
    const D0 = zones(analyze(strokes));
    if (!D0.length) return { verdict: 0, cost: W, W, tokens: [], status: new Map() };
    const variants = [D0]; const sw = swapSides(D0); if (sw) variants.push(sw);
    let best = null;
    for (const D of variants) for (const r of [editAlign(D, E), multisetAlign(D, E)]) if (!best || r.cost < best.cost - 1e-9) best = r;
    const status = new Map();
    for (const [d, e, c] of best.pairs) status.set(d.k, { e: e.c, c });
    for (const d of best.extra) status.set(d.k, { e: null, c: 1 });
    const cost = best.cost;
    const verdict = cost <= 0.35 ? 2 : cost <= Math.max(1.25, 0.15 * W) ? 1 : 0;
    return { verdict, cost, W, tokens: D0, status, pairs: best.pairs, missing: best.missing };
  }

  /* ---------- обучение почерку ---------- */
  function setPersonal(p) { personal = p || {}; }
  function learnFrom(result) {
    if (!result || !result.pairs || result.cost > 0.5 * result.W + 1) return 0;
    let n = 0;
    for (const [d, e, c] of result.pairs) {
      if (!d.strokes || !e.c || e.c === "·" || c === 0) continue;
      const g = prep(d.strokes);
      (personal[e.c] = personal[e.c] || []).push({ pts: g.pts.map(p => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) })), ar: +g.ar.toFixed(3) });
      if (personal[e.c].length > 6) personal[e.c].shift();
      n++;
    }
    return n;
  }
  const personalCount = () => Object.values(personal).reduce((a, l) => a + l.length, 0);

  G.Recog = { loadGlyphs, check, analyze, expected, learnFrom, setPersonal, getPersonal: () => personal, personalCount, accept };
  if (G.GLYPHS) loadGlyphs(G.GLYPHS);
})(typeof window !== "undefined" ? window : globalThis);
