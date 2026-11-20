// VG OLIVES: the Saint-Remy "Olive Trees" (Van Gogh, 1889) at dusk, a finale scene of the Van Gogh clip, ~30 s.
// The lens drifts slowly forward low among the olive trees, looking up through their branches: gnarled trunks of
// twisting strokes, silvery-green foliage of short curved dabs, ochre and violet ground strokes with the trees'
// lilac shadows, the Alpilles a band of painted lilac-blue hills between the trunks, a pink-lilac and turquoise
// twilight sky laid in swirling strokes. Four planets (parts/vg-blasts.js) burst one after another (EXPLODE_AT),
// seen through the branches: the boughs go black against each flash and the leaves catch its warm light.
// Every mark is a stroke (parts/vg-sower.js: sky dome, BLOOM_VS strokes for wood, leaves and ground).
// World space: +Y up, the drift runs down -Z between the rows. Pure function of world time; layout from a seeded rng.
import * as THREE from 'three';
import { makePath, makeRng, makeNoise, hashSeed } from '../kit/core.js';
import { BLOOM_VS, GROUND_VS, TINT_FS, GROUNDT_FS, makeSky, keyed, bloomSet } from '../parts/vg-sower.js';
import { buildBlasts, scheduleFrom } from '../parts/vg-blasts.js';

export const EXPLODE_AT = [6, 11, 16, 21];
export const DURATION = 30;
const SKY_SLOW = 0.3, FINE = 2;
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export default {
  id: 'vg-olives',
  name: 'Olive Trees',
  category: 'wilderness',
  weirdness: 0.5,
  media: ['air', 'open'],
  async build(ctx) {
    const seed = hashSeed('vg-olives:grove');
    const rng = makeRng(seed), noise = makeNoise(seed ^ 0x1b873593);
    const detail = Math.min(1.2, Math.max(0.5, (ctx.quality && ctx.quality.detail) || 1));
    const C = (h, s = 0.78) => new THREE.Color(h).multiplyScalar(s);
    const mix = (a, b, t, s = 1) => a.clone().lerp(b, t).multiplyScalar(s);
    const jit = (c, k = 0.13) => c.clone().multiplyScalar(1 + rng.range(-k, k));
    const pickW = (list) => { let r = rng(); for (const [c, w] of list) if ((r -= w) <= 0) return c; return list[0][0]; };
    const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#8A8AB8');
    scene.fog = new THREE.FogExp2(new THREE.Color('#9A8AB0'), 0.0035);

    // ---------- the drift: low between the rows, looking up through the boughs ----------
    const q = (typeof location !== 'undefined') ? new URLSearchParams(location.search) : null;
    const dbg = q && q.get('vgcam') ? q.get('vgcam').split(',').map(Number) : null;   // dev aid: eyeH, yaw0, yaw1, pitch, travel
    const [EH, YAW0, YAW1, PITCH, TRAVEL] = dbg || [1.05, 4, -6, 18, 3.2];
    const camPts = [], cp0 = new THREE.Vector3(0, EH, 1.5);
    for (let i = 0; i <= 12; i++) {
      const s = i / 12, yaw = lerp(YAW0, YAW1, s) * D2R;
      camPts.push(cp0.clone());
      cp0.add(new THREE.Vector3(Math.sin(yaw) * Math.cos(PITCH * D2R), Math.sin(PITCH * D2R), -Math.cos(yaw) * Math.cos(PITCH * D2R)).multiplyScalar(TRAVEL / 12));
    }
    // journey: after the drift the lens pushes on, level, into a low bough and out of the grove (the hand-off)
    const driftEnd = cp0.clone();
    { const yaw = YAW1 * D2R, d = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
      for (const [k, y] of [[1.6, 2.1], [3.4, 2.0], [5.2, 1.9]]) camPts.push(driftEnd.clone().addScaledVector(d, k).setY(y)); }
    const path = makePath(camPts);
    const uDrift = (() => { const q = new THREE.Vector3(); let best = 1, bd = 1e9; for (let i = 0; i <= 400; i++) { path.pointAt(i / 400, q); const dd = q.distanceTo(driftEnd); if (dd < bd) { bd = dd; best = i / 400; } } return best; })();
    const eyeMid = path.pointAt(0.5 * uDrift, new THREE.Vector3());
    const NS = 120, FS = [];
    for (let i = 0; i <= NS; i++) FS.push(path.pointAt((i / NS * 1.15 - 0.05) * uDrift, new THREE.Vector3()));   // (the drift, as composed: the journey's push into the bough goes where it likes)
    const near = { d: 0, p: null };
    const nearest = (p) => { let b = 1e9, bp = FS[0]; for (const f of FS) { const d = f.distanceToSquared(p); if (d < b) { b = d; bp = f; } } near.d = Math.sqrt(b); near.p = bp; return near; };
    const ground = (x, z) => 0.18 * noise.fbm2(x * 0.06, z * 0.06, 2) + 0.06 * noise.n2(x * 0.4, z * 0.4) + sstep(60, 300, Math.hypot(x, z)) * 3;

    // ---------- shared uniforms, materials ----------
    const SU = {
      uTime: { value: 0 }, uGain: { value: 1.08 }, uWeave: { value: 1.5708 }, uMinW: { value: 0.0016 }, uFlash: { value: new THREE.Vector3() },
      uTint: { value: new THREE.Color(1, 1, 1) }, uFine: { value: FINE }, uFlashD: { value: new THREE.Vector3(0, 1, 0) },
      uBox: { value: new THREE.Vector3(0, -50, 0) }, uBoxS: { value: new THREE.Vector3(1, 1, 1) },
    };
    const strokeMat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU), vertexShader: BLOOM_VS, fragmentShader: TINT_FS, side: THREE.DoubleSide, fog: true });

    // ---------- the twilight sky ----------
    const sky = makeSky(fogU(), SU.uWeave, rng.range(0, 10)), SKU = sky.u;
    scene.add(sky.dome);
    SKU.uSwirl.value = 2.2; SKU.uCell.value = 0.0115;
    const K = (o) => { const r = {}; for (const k in o) r[k] = typeof o[k] === 'string' ? C(o[k]) : o[k]; return r; };
    const dusk = K({ h0: '#DCA0B4', h1: '#C28EC2', h2: '#EEC4C2', z0: '#5CB0B2', z1: '#4A8EB8', z2: '#8CCCC2', a0: '#F2DCD2', a1: '#A8E2D8', glow: '#EC9C7C', gs: 0.7, stars: 0.0,
      tint: new THREE.Color(0.82, 0.74, 0.86), fog: '#A08AB4' });
    const late = K({ h0: '#B07CA8', h1: '#8A6AAE', h2: '#D4A0B4', z0: '#3A7EA4', z1: '#2E5C9C', z2: '#5EA4B4', a0: '#D8C0D0', a1: '#7CC4C8', glow: '#D07A7A', gs: 0.5, stars: 0.55,
      tint: new THREE.Color(0.6, 0.56, 0.74), fog: '#7A6A9C' });
    const hour = keyed([[0, dusk], [4, dusk], [26, late], [99, late]]);
    SKU.uHills.value.set(1, 0.062, 0.034, 0.6);
    [C('#7C7AB8'), C('#9C92C8'), C('#3A3A74')].forEach((c, i) => SKU.uHillC.value[i].copy(c));
    const glowAz = 30 * D2R; SKU.uGlow.value.set(Math.sin(glowAz), -Math.cos(glowAz), 0.7, 0.22);
    await ctx.yield();

    // ---------- the ground underlayer ----------
    {
      const NX = 150, NZ = 170, X0 = 700, Z0 = 60, Z1 = -800;
      const pos = new Float32Array((NX + 1) * (NZ + 1) * 3), col = new Float32Array((NX + 1) * (NZ + 1) * 3), idx = [];
      const cA = C('#A88A58'), cB = C('#6E6290'), c = new THREE.Color(); let o = 0;
      for (let j = 0; j <= NZ; j++) {
        const s = j / NZ, z = Z0 + (Z1 - Z0) * (0.3 * s + 0.7 * s * s * s);
        for (let i = 0; i <= NX; i++) {
          const rr = i / NX * 2 - 1, x = X0 * (0.1 * rr + 0.9 * rr * rr * rr);
          pos[o] = x; pos[o + 1] = ground(x, z) - 0.03; pos[o + 2] = z;
          c.copy(cA).lerp(cB, 0.4 + 0.3 * noise.n2(x * 0.08, z * 0.08)).multiplyScalar(lerp(0.6, 1, sstep(2, 20, Math.hypot(x, z))));
          col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; o += 3;
        }
      }
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, e = a + NX + 1, f = e + 1; idx.push(a, e, b, b, e, f); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
      const gu = Object.assign(fogU(), SU, { uWind: { value: new THREE.Vector4(0.8, -0.6, 0, 0) } });
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: gu, vertexShader: GROUND_VS, fragmentShader: GROUNDT_FS, fog: true, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.name = 'grove-underlayer'; scene.add(m);
    }
    await ctx.yield();

    // ---------- pigments ----------
    const B = {
      rim: [C('#141A2C'), C('#1C2030'), C('#202A26')], under: C('#2A2C34'),
      body: [[C('#8A7A5A'), 0.2], [C('#6A7A6A'), 0.18], [C('#5A6A8C'), 0.16], [C('#A48C5E'), 0.14], [C('#4A5A50'), 0.12], [C('#7A6A8A'), 0.1], [C('#B4A070'), 0.1]],
    };
    const LEAF = [[C('#6E9272'), 0.22], [C('#8EAA92'), 0.14], [C('#4E8262'), 0.18], [C('#427278'), 0.14], [C('#A4B88C'), 0.08], [C('#6A8A44'), 0.12], [C('#34545A'), 0.12]];
    const GRD = [[C('#C8A060'), 0.24], [C('#B88A50'), 0.16], [C('#8A9A5A'), 0.07], [C('#C89A88'), 0.11], [C('#D8B878'), 0.12], [C('#7A6A9A'), 0.16], [C('#5A5A8A'), 0.14]];
    const SHADE = [[C('#6A5A9A'), 0.35], [C('#4C4C86'), 0.3], [C('#7A6A8A'), 0.2], [C('#5A7A7A'), 0.15]];
    const set = bloomSet();
    const v = new THREE.Vector3(), w = new THREE.Vector3(), Yv = new THREE.Vector3(0, 1, 0);
    const perp = (d, out) => { out.set(rng.gauss(), rng.gauss(), rng.gauss()); out.addScaledVector(d, -out.dot(d)); return out.normalize(); };

    // ---------- the trees ----------
    // a branch: { lv, pts: [x, y, z, r, amp, ph] ..., len }; the wood winds and twists, keeps out of the lens' way
    const STEP = [0.08, 0.06, 0.045, 0.03], GN = [0.07, 0.1, 0.14, 0.2], CLR = [0.7, 0.55, 0.4, 0.3], UP = [0.02, 0.035, 0.02, 0.0];
    const sway = (s) => Math.min(0.04, 0.003 * Math.pow(Math.max(0, s), 1.5));
    function grow(list, p0, dir, len, r0, r1, lv, s0, ph0) {
      const p = p0.clone(), d = dir.clone().normalize(), n = Math.max(3, Math.ceil(len / STEP[lv])), st = len / n;
      const pts = [p.x, p.y, p.z, r0, sway(s0), ph0];
      const tw = rng.range(0, TAU), tf = rng.range(1.5, 3);
      let s = s0;
      for (let i = 1; i <= n; i++) {
        const t = i / n, r = r0 + (r1 - r0) * t;
        d.x += rng.gauss() * GN[lv]; d.y += rng.gauss() * GN[lv] * 0.6; d.z += rng.gauss() * GN[lv];
        if (lv === 0) { d.x += 0.05 * Math.cos(tw + t * tf * TAU); d.z += 0.05 * Math.sin(tw + t * tf * TAU); }   // the trunk writhes
        d.y += UP[lv];
        const qn = nearest(p), clr = r + CLR[lv];
        if (qn.d < clr * 1.8) { v.subVectors(p, qn.p).divideScalar(Math.max(qn.d, 1e-4)); d.addScaledVector(v, 0.5 * (1 - qn.d / (clr * 1.8))); }
        d.normalize(); p.addScaledVector(d, st); s += st;
        if (p.y < ground(p.x, p.z) + 0.3 && lv > 0) p.y = ground(p.x, p.z) + 0.3;
        const q2 = nearest(p); if (lv >= 2 && q2.d < r + CLR[lv] * 0.6) break;
        pts.push(p.x, p.y, p.z, r, sway(s), ph0 + 1.1 * (s - s0));
      }
      const b = { lv, pts, len: s - s0, s0 }; list.push(b); return b;
    }
    function tree(x, z, size, far) {
      const list = [], g0 = ground(x, z);
      const lean = new THREE.Vector3(rng.gauss() * 0.25, 1, rng.gauss() * 0.25);
      const tl = rng.range(0.9, 1.5) * size, nStem = rng.chance(0.4) ? 2 : 1;
      const tops = [];
      for (let k = 0; k < nStem; k++) {
        const off = nStem > 1 ? rng.range(0.08, 0.16) * (k ? 1 : -1) : 0, a0 = rng.range(0, TAU);
        const b = grow(list, new THREE.Vector3(x + Math.cos(a0) * off, g0 - 0.1, z + Math.sin(a0) * off), lean.clone().add(new THREE.Vector3(Math.cos(a0) * off * 2, 0, Math.sin(a0) * off * 2)),
          tl, (nStem > 1 ? 0.13 : 0.18) * size, 0.11 * size, 0, 0, rng.range(0, TAU));
        tops.push(b);
      }
      for (const st of tops) {
        const o = st.pts.length - 6, top = new THREE.Vector3(st.pts[o], st.pts[o + 1], st.pts[o + 2]);
        const nl = rng.int(3, 4), az0 = rng.range(0, TAU);
        for (let k = 0; k < nl; k++) {
          const az = az0 + k * TAU / nl + rng.range(-0.4, 0.4), el = rng.range(0.3, 0.8);
          const limb = grow(list, top, new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)), rng.range(1.9, 2.8) * size, 0.075 * size, 0.03 * size, 1, st.len, rng.range(0, TAU));
          kids(list, limb, 2, size);
        }
      }
      return list;
    }
    function kids(list, b, lv, size) {
      const np = b.pts.length / 6, gap = lv === 2 ? 0.32 : 0.14, a = new THREE.Vector3(), t0 = new THREE.Vector3(), cd = new THREE.Vector3();
      for (let s = rng.range(0.2, 0.5) * gap + (lv === 2 ? 0.25 : 0.05); s < b.len * 0.98; s += gap * rng.range(0.7, 1.3)) {
        const i = Math.min(np - 2, Math.floor(s / b.len * (np - 1))), o = i * 6;
        a.set(b.pts[o], b.pts[o + 1], b.pts[o + 2]);
        t0.set(b.pts[o + 6] - b.pts[o], b.pts[o + 7] - b.pts[o + 1], b.pts[o + 8] - b.pts[o + 2]).normalize();
        perp(t0, w); const ang = rng.range(0.5, 1.0);
        cd.copy(t0).multiplyScalar(Math.cos(ang)).addScaledVector(w, Math.sin(ang));
        cd.y += lv === 2 ? 0.1 : -0.05; cd.normalize();
        const rem = 1 - s / b.len, len = (lv === 2 ? rng.range(0.8, 1.5) : rng.range(0.3, 0.55)) * (0.6 + 0.6 * rem) * size, rp = b.pts[o + 3];
        const c = grow(list, a, cd, len, rp * rng.range(0.5, 0.7), Math.max(0.003, rp * 0.3), lv, b.s0 + s, b.pts[o + 5]);
        if (lv < 3) kids(list, c, lv + 1, size);
      }
    }
    // the grove: rows, three trees near the lens chosen so their boughs cross the sky above it
    const spots = [[-1.9, -2.4, 1.25], [2.3, -6.4, 1.3], [-1.0, -12.0, 1.2]];
    for (let r = 0; r < 9; r++) for (let c = -4; c <= 4; c++) {
      const x = c * 7 + (r % 2) * 3.5 + rng.gauss() * 0.8, z = 3 - r * 6.5 + rng.gauss() * 0.8;
      if (Math.abs(x) < 3.6 && z > -16 && z < 4) continue;
      if (Math.abs(x) > 26 + r * 2) continue;
      spots.push([x, z, rng.range(0.85, 1.15)]);
    }
    const camC = path.pointAt(0.5, new THREE.Vector3());
    let nt = 0;
    for (const [x, z, size] of spots) {
      const dc = Math.hypot(x - camC.x, z - camC.z), far = sstep(10, 40, dc), ls = 1 + dc / 12;   // further: fewer, bigger marks
      const list = tree(x, z, size, far);
      const a = new THREE.Vector3(), b2 = new THREE.Vector3(), tg = new THREE.Vector3();
      for (const br of list) {
        const pts = br.pts, np = pts.length / 6;
        let acc = 0;
        for (let i = 0; i < np - 1; i++) {
          const o = i * 6;
          a.set(pts[o], pts[o + 1], pts[o + 2]); b2.set(pts[o + 6], pts[o + 7], pts[o + 8]);
          const segL = a.distanceTo(b2); tg.subVectors(b2, a).divideScalar(segL || 1);
          for (; acc < segL;) {
            const f = acc / segL, x0 = a.x + (b2.x - a.x) * f, y0 = a.y + (b2.y - a.y) * f, z0 = a.z + (b2.z - a.z) * f;
            const r = pts[o + 3] + (pts[o + 9] - pts[o + 3]) * f, amp = pts[o + 4] + (pts[o + 10] - pts[o + 4]) * f, ph = pts[o + 5] + (pts[o + 11] - pts[o + 5]) * f;
            const stp = Math.min(0.09, Math.max(0.006, r * 0.9)) * (far > 0.5 ? 1.6 : 1);
            let hl = stp;
            set.add(x0, y0, z0, tg.x * hl, tg.y * hl, tg.z * hl, r * 1.04, 0, 0, 0, 0, 0, 0, 0, 0, B.under, 0, B.rim[0], 0.3, amp, ph, rng());
            for (let sd = -1; sd <= 1; sd += 2) {
              hl = stp * rng.range(1.0, 1.7); const c = jit(rng.pick(B.rim), 0.2);
              set.add(x0, y0, z0, tg.x * hl, tg.y * hl, tg.z * hl, r * rng.range(0.14, 0.22), 0, 0, 0, rng.range(-0.1, 0.1), sd * rng.range(0.76, 0.9), r, rng.gauss() * 0.05, 0, c, 0, mix(c, B.under, 0.5), 0.4, amp, ph, rng());
            }
            const nIn = r < 0.008 ? 1 : r < 0.025 ? 2 : r < 0.06 ? 4 : 6;
            // the twist: body strokes wind round the trunk and the limbs
            const twist = br.lv <= 1 ? 0.35 * Math.sin(ph * 2.3 + br.lv) + 0.25 : 0.1 * rng.gauss();
            for (let k = 0; k < nIn; k++) {
              hl = stp * rng.range(1.2, 2.4);
              const c = jit(pickW(B.body)), c2 = rng.chance(0.5) ? jit(pickW(B.body)) : mix(c, B.rim[1], 0.4);
              const off = nIn === 1 ? rng.range(-0.3, 0.3) : (-0.7 + 1.4 * (k + rng()) / nIn);
              set.add(x0, y0, z0, tg.x * hl, tg.y * hl, tg.z * hl, r * rng.range(0.2, 0.34), 0, 0, 0, rng.range(-0.25, 0.25), off, r, twist + rng.gauss() * 0.08, 0, c, 0, c2, rng.range(0.3, 0.9), amp, ph, rng());
            }
            acc += stp;
          }
          acc -= segL;
        }
      }
      // the foliage: short curved dabs in clumps along the twigs and the outer boughs
      for (const br of list) {
        if (br.lv < 2) continue;
        const pts = br.pts, np = pts.length / 6, gap = (br.lv === 3 ? 0.028 : 0.06) * ls / Math.sqrt(detail), keep = 1 / (1 + far * 1.5);
        for (let i = 0; i < np - 1; i++) {
          const o = i * 6, segL = Math.hypot(pts[o + 6] - pts[o], pts[o + 7] - pts[o + 1], pts[o + 8] - pts[o + 2]);
          a.set(pts[o + 6] - pts[o], pts[o + 7] - pts[o + 1], pts[o + 8] - pts[o + 2]).normalize();
          for (let s = rng() * gap; s < segL; s += gap) {
            if (br.lv === 2 && s / segL + i / np < 0.6) continue;
            if (!rng.chance(keep)) continue;
            const f = s / segL, x0 = pts[o] + (pts[o + 6] - pts[o]) * f, y0 = pts[o + 1] + (pts[o + 7] - pts[o + 1]) * f, z0 = pts[o + 2] + (pts[o + 8] - pts[o + 2]) * f;
            const amp = pts[o + 4] + 0.006, ph = pts[o + 5];
            for (let k = 0; k < 2; k++) {
              perp(a, w); w.addScaledVector(Yv, -0.25).normalize();
              tg.copy(a).multiplyScalar(0.55).addScaledVector(w, 0.85).normalize();
              const L = rng.range(0.035, 0.05) * ls, cx = x0 + tg.x * L * 0.9, cy = y0 + tg.y * L * 0.9, cz = z0 + tg.z * L * 0.9;
              if (nearest(b2.set(cx, cy, cz)).d < 0.35) continue;
              const up = tg.y > 0.3 && rng.chance(0.5);
              const c = jit(up ? (rng.chance(0.6) ? C('#98B49C') : C('#B4C4A0')) : pickW(LEAF), 0.1);
              const c2 = rng.chance(0.5) ? jit(pickW(LEAF)) : mix(c, C('#2E4A52'), 0.45);
              perp(tg, v);
              set.add(cx, cy, cz, tg.x * L, tg.y * L, tg.z * L, L * rng.range(0.26, 0.36), v.x, v.y, v.z, rng.sign() * rng.range(0.2, 0.45), 0, 0, 0, 0, c, 0, c2, rng.range(0.3, 0.8), amp, ph + k, rng());
            }
          }
        }
      }
      // its shadow on the ground: violet strokes round the foot
      const ns = Math.round(600 * keep(far) * size);
      for (let i = 0; i < ns; i++) {
        const rr = Math.sqrt(rng()) * 2.6 * size, an = rng.range(0, TAU), sx = x + Math.cos(an) * rr + 0.6, sz = z + Math.sin(an) * rr * 0.8;
        const L = rng.range(0.08, 0.16) * ls, aa = rng.range(-0.4, 0.4) + 0.6, c = jit(pickW(SHADE));
        set.add(sx, ground(sx, sz) + 0.015, sz, Math.cos(aa) * L, 0, Math.sin(aa) * L, L * 0.3, 0, 0, 0, rng.sign() * 0.3, 0, 0, 0, 0, c, 0, mix(c, pickW(SHADE), 0.5), 0.5, 0, 0, rng());
      }
      if (++nt % 2 === 0) await ctx.yield();
    }
    function keep(far) { return 1 / (1 + far * 1.5); }
    await ctx.yield();

    // ---------- the ground: rhythmic curved strokes, grass tufts ----------
    {
      const N = Math.round(60000 * detail), r0 = 0.8, r1 = 60;
      for (let i = 0; i < N; i++) {
        if (i % 5000 === 4999) await ctx.yield();
        const u = rng(), r = 1 / (1 / r0 - u * (1 / r0 - 1 / r1)), an = rng.range(-1.1, 1.1);
        const x = Math.sin(an) * r * 1.1, z = 1.5 - Math.cos(an) * r;
        const s = 0.06 + 0.024 * r, L = s * rng.range(0.9, 1.6), fa = 1.6 * noise.n2(x * 0.15, z * 0.15) + 0.5;   // the strokes sweep with a slow wave
        const c = jit(pickW(GRD));
        const tuft = rng.chance(0.02);
        if (tuft) set.add(x, ground(x, z) + L * 0.6, z, rng.gauss() * 0.2 * L, L * 0.8, rng.gauss() * 0.2 * L, s * 0.22, 0, 0, 0, rng.sign() * 0.3, 0, 0, 0, 0, jit(rng.chance(0.5) ? C('#7A9A5A') : C('#9AAA6A')), 0, C('#4A6A5A'), 0.5, 0.004 * r, rng.range(0, TAU), rng());
        else set.add(x, ground(x, z) + 0.012 + 0.004 * r, z, Math.cos(fa) * L, 0, Math.sin(fa) * L, s * rng.range(0.24, 0.34), 0, 0, 0, rng.sign() * rng.range(0.15, 0.4), 0, 0, 0, 0, c, 0, mix(c, pickW(GRD), 0.6), rng.range(0.3, 0.9), 0, 0, rng());
      }
    }
    // journey bridge: a low bough of silvery leaves on the line over the last metres; the lens pushes through it while the
    // exit (a bare pane) fades in behind the leaves
    {
      const L = path.length, at = new THREE.Vector3(), tq = new THREE.Vector3(), nv = new THREE.Vector3(), tg = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
      for (let i = 0; i < 2000; i++) {
        // even over the whole frame (no lane, no hole round the line): the closer to the line, the smaller the leaf, so none
        // crosses the lens as a slab (its size on screen as it passes is about Lf / r)
        const uu = (L - rng.range(1.0, 1.25)) / L, r = 0.6 * Math.sqrt(rng()), a = rng.range(0, TAU);
        path.pointAt(uu, at); path.tangentAt(uu, tg); perp(tg, e1); e2.crossVectors(tg, e1);
        at.addScaledVector(e1, r * Math.cos(a)).addScaledVector(e2, r * Math.sin(a));
        tq.set(rng.gauss(), rng.gauss() * 0.4 - 0.3, rng.gauss()).normalize(); perp(tq, nv);
        const Lf = rng.range(0.04, 0.065) * Math.min(1, Math.max(0.25, r / 0.3)), up = tq.y > 0.2 || rng.chance(0.35);   // more leaves catch the dusk light
        const c = jit(up ? (rng.chance(0.6) ? C('#98B49C') : C('#B4C4A0')) : pickW(LEAF), 0.1), c2 = rng.chance(0.5) ? jit(pickW(LEAF)) : mix(c, C('#7A9A8A'), 0.4);
        set.add(at.x, at.y, at.z, tq.x * Lf, tq.y * Lf, tq.z * Lf, Lf * rng.range(0.28, 0.38), nv.x, nv.y, nv.z, rng.sign() * rng.range(0.2, 0.45), 0, 0, 0, 0, c, 0, c2, rng.range(0.3, 0.8), 0.006, rng.range(0, TAU), rng());
      }
    }
    scene.add(Object.assign(set.mesh(strokeMat, 4), { name: 'grove-strokes' }));
    await ctx.yield();

    // ---------- the planets, seen through the branches ----------
    const PLACE = [
      // rose in deep madder and crimson with orange and chrome fire (its own pale pinks vanish on the dusk sky)
      { id: 'rose', az: -13, el: 27, dist: 380, ang: 9.5, pal: [['#8E1A2C', 3], ['#D02E48', 3], ['#F08A24', 1.6], ['#F6D54A', 1.2], ['#1E6E5A', 1], ['#2348A8', 0.9]].map(([h, w]) => [new THREE.Color(h), w]) },
      { id: 'violet', az: -23, el: 34, dist: 400, ang: 8.5 },
      { id: 'emerald', az: 30, el: 32, dist: 420, ang: 8 },
      { id: 'ice', az: 11, el: 19, dist: 360, ang: 8.5 },
    ];
    const schedule = scheduleFrom(ctx, { before: [], here: PLACE.map((p, i) => ({ id: p.id, t: EXPLODE_AT[i] })), hide: [] });
    const PU = { uTime: SU.uTime, uGain: { value: 1.08 }, uWeave: SU.uWeave, uFlash: SU.uFlash, uFine: SU.uFine, uFlashD: SU.uFlashD };
    const blasts = await buildBlasts(ctx, { scene, uniforms: PU, eye: eyeMid, place: PLACE, schedule, hero: { uniforms: SKU }, seed: 'vg-olives:planets', fine: FINE,
      flashFrom: new THREE.Vector3(0, -10, -8), flashGain: 0.45, heat: 0.12, glowGain: 0.7 });
    for (const pl of blasts.planets) if (pl.slot >= 0) SKU.uBlastC.value[pl.slot].copy(pl.P.pal[0][0]).lerp(new THREE.Color(0.9, 0.76, 0.3), 0.3);
    // the planets are far: no grove fog on them
    for (const p of PLACE) { const m = scene.getObjectByName('planet-' + p.id); if (m) { m.material.fog = false; m.material.needsUpdate = true; } }

    const camP = new THREE.Vector3(), bufSize = new THREE.Vector2();
    return {
      scene, path, duration: DURATION,
      title: 'Olive Trees',
      ride: 'none', style: 'none',
      camera: { fov: 60, near: 0.05, far: 3000, lookAhead: 0.4, sway: 0.3, bank: 0 },
      pois: [],
      // the drift is slow, the push into the bough quick
      pace: (u) => 0.35 + 2.15 * sstep(uDrift - 0.02, uDrift + 0.12, u),
      // the hand-off hides in the bough: a bare pane (the exact window, no rim) that fades in while the leaves fill the frame
      portal: { shape: 'rect', width: 5, height: 3.4, frame: 0, lens: 0, color: '#F2C8D0', veil: '#3A3A6A', revealDistance: 8, blendDistance: 4, drawWithin: 1.35, drawIn: 0, fadeIn: [1.35, 1.0] },
      post: {
        exposure: 1.04,
        bloom: { strength: 0.4, radius: 0.6, threshold: 0.95 },
        grade: { saturation: 1.1, contrast: 1.06, tint: '#fff4f0', shadowTint: '#100c26', vignette: 0.32, grain: 0.03, aberration: 0 },
      },
      explodeAt: blasts.explodeAt,
      update(dt, time, camera) {
        camP.setFromMatrixPosition(camera.matrixWorld); if (camP.lengthSq() === 0) camP.copy(camera.position);
        sky.dome.position.copy(camP);
        ctx.renderer.getDrawingBufferSize(bufSize);
        SU.uWeave.value = 1.5708 * Math.min(1, 1080 / Math.max(1, bufSize.y));
        SU.uTime.value = time;
        const t = time;
        for (let i = 0; i < 3; i++) { hour(t, 'h' + i, SKU.uHor.value[i]); hour(t, 'z' + i, SKU.uZen.value[i]); }
        hour(t, 'a0', SKU.uAcc.value[0]); hour(t, 'a1', SKU.uAcc.value[1]);
        hour(t, 'glow', SKU.uGlowC.value); hour(t, 'tint', SU.uTint.value); hour(t, 'fog', scene.fog.color);
        SKU.uGlow.value.z = hour(t, 'gs'); SKU.uStars.value = hour(t, 'stars'); SKU.uTime.value = time * SKY_SLOW;
        blasts.update(time, camP);
      },
      dispose() {},
    };
  },
};
