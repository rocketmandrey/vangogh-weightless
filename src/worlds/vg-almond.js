// VG ALMOND: Van Gogh's "Almond Blossom" (Saint-Remy, 1890) and his Arles orchards in bloom ("Pink Peach Tree", "The
// Flowering Orchard", 1888) for the Van Gogh music clip. A 22 s long take round one almond tree in bloom, rooted in a
// spring orchard at dawn: the lens opens a hand's length from its blossom (petals of a few thick white strokes with pink
// hearts, red-brown buds, gnarled dark-rimmed branches), draws back in a widening orbit that shows the whole tree on its
// grass, the lane, the other trees in bloom, a reed hedge, a farm and cypresses, and comes back toward the crown. A gust
// runs in from the far orchard, bends the grass and the trees in a wave, tears a cloud of petals off the crown and blows
// it at the lens; the next world is behind that cloud (the hand-off).
// Every mark is a stroke (parts/vg-almond.js): a branch is a bundle of strokes laid across its silhouette on the
// near face of its cylinder, dark at both edges over a dark underpaint; petals lie flat in their flower's plane; the
// sky is vg-crows' storm dome repainted as a dawn sky: blue strokes, pink and pale yellow ones, in slow swirls over the horizon.
// World space: +Y up, the ground at G, the fork of the trunk at (0, 0.85, 0), the crown round (0, 2, 0), about 3 m across.
// Pure function of world time: the layout comes from a seeded rng, the motion from uTime.
import * as THREE from 'three';
import { makePath, makeRng, hashSeed, smoothstep as sstep } from '../kit/core.js';
import { DOME_VS, SKY_FS, BLOOM_VS, STROKE2_FS } from '../parts/vg-almond.js';
import { hourPost, tintPalette } from '../parts/vg-hours.js';

const TAU = Math.PI * 2;
export const DURATION = 22.4;
const G = -0.75;                                              // the ground
// the gust: blows along WD at VF m/s, from the far orchard on the left of the last approach across it (a little toward
// the lens), so its wave runs across the grass and its petals stream across the frame; its crest is on the tree
// GUST_LEAD s before the crossing
const WD = new THREE.Vector2(1, -0.05).normalize(), VF = 12, GUST_LEAD = 4.0;
// how fast to fly at u (world.pace): slow by the opening branch, an even orbit, slow again into the gust's petals, down
// to about the sunflowers' own opening pace (so the engine's doorway never has to brake it: tCam below stays exact,
// and the sunflowers are entered as before, keeping the journey's later times)
const PACE = (u) => 0.5 + 0.6 * sstep(0.02, 0.15, u) - 0.6 * sstep(0.8, 0.97, u);

// the flight: in to the crown's edge and along it a hand's length from the blossom, then out in a widening orbit round
// the tree (half a turn, the orchard going by behind it), and back in toward the crown downwind of it, where the gust's
// petals fly (the portal is a bare pane just short of the blossom)
const EYE = (() => {
  const P = [[-2.35, 2.1, 1.35], [-1.95, 2.18, 0.95]];
  for (const a of [2.85, 3.05, 3.25, 3.45]) P.push([1.85 * Math.cos(a), 2.26 + 0.1 * (a - 2.85), 1.85 * Math.sin(a)]);
  const A0 = 3.68, A1 = 0.876 + TAU, N = 16;
  for (let i = 0; i <= N; i++) {
    const s = i / N, a = A0 + (A1 - A0) * s, e = Math.max(0, (s - 0.64) / 0.36);
    const r = 1.95 + 3.05 * sstep(0, 0.38, s) - 2.65 * e * e, y = 2.34 + 0.2 * sstep(0, 0.4, s) - 0.45 * sstep(0.7, 1, s);
    P.push([r * Math.cos(a), y, r * Math.sin(a)]);
  }
  return P;
})();

function makeSet() {
  const P = [], D = [], N = [], T = [], C = [], C2 = [], S = [];
  const s = {
    count: 0,
    // centre, half axis, half width, plane normal + arc, tube offset/radius/tilt/mode, colour, emissive, second, load, sway, hash
    add(px, py, pz, dx, dy, dz, hw, nx, ny, nz, arc, to, tr, tilt, mode, c1, em, c2, load, amp, ph, hs) {
      P.push(px, py, pz, hs); D.push(dx, dy, dz, hw); N.push(nx, ny, nz, arc); T.push(to, tr, tilt, mode);
      C.push(c1.r, c1.g, c1.b, em); C2.push(c2.r, c2.g, c2.b, load); S.push(amp, ph); s.count++;
    },
    mesh(mat, segs) {
      const g0 = new THREE.PlaneGeometry(2, 2, segs, 1), geo = new THREE.InstancedBufferGeometry();
      geo.index = g0.index; geo.setAttribute('position', g0.getAttribute('position'));
      for (const [nm, a, n] of [['aP', P, 4], ['aD', D, 4], ['aN', N, 4], ['aT', T, 4], ['aC', C, 4], ['aC2', C2, 4], ['aS', S, 2]]) geo.setAttribute(nm, new THREE.InstancedBufferAttribute(new Float32Array(a), n));
      geo.instanceCount = s.count;
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m;
    },
  };
  return s;
}

export default {
  id: 'vg-almond',
  name: 'Almond Blossom',
  category: 'wilderness',
  weirdness: 0.3,
  media: ['air'],
  async build(ctx) {
    const rng = makeRng(hashSeed('vg-almond:' + Math.floor(ctx.rng() * 1e9)));
    const C = (h, s = 1) => new THREE.Color(h).multiplyScalar(s);
    const mix = (a, b, t) => a.clone().lerp(b, t);
    const jit = (c, k = 0.12) => c.clone().multiplyScalar(1 + rng.range(-k, k));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#5DB4BE');
    scene.fog = new THREE.FogExp2(new THREE.Color('#7CC4C2'), 0.008);

    const path = makePath(EYE);
    // the flight line as samples, for keeping the branches out of the lens' way
    const NS = 700, FS = new Float32Array((NS + 1) * 3), pq = new THREE.Vector3();
    for (let i = 0; i <= NS; i++) { path.pointAt(i / NS, pq); FS[i * 3] = pq.x; FS[i * 3 + 1] = pq.y; FS[i * 3 + 2] = pq.z; }
    const near = { d: 0, x: 0, y: 0, z: 0 };
    const nearest = (x, y, z) => {
      let b = 1e9, bi = 0;
      for (let i = 0; i <= NS; i++) { const dx = FS[i * 3] - x, dy = FS[i * 3 + 1] - y, dz = FS[i * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < b) { b = d; bi = i; } }
      near.d = Math.sqrt(b); near.x = FS[bi * 3]; near.y = FS[bi * 3 + 1]; near.z = FS[bi * 3 + 2]; return near;
    };

    // ---------- shared uniforms, materials ----------
    const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
    const SU = {
      uTime: { value: 0 }, uGain: { value: 1.08 }, uWeave: { value: 1.5708 }, uMinW: { value: 0.0016 }, uFlash: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(0.4, 2.2, 0) }, uBoxS: { value: new THREE.Vector3(6, 4.6, 6) }, uGust: { value: new THREE.Vector4(WD.x, WD.y, -1e3, 1) },
    };
    // when the lens is where: the engine's flight (speed eased toward the paced target at 1.4/s, makePace's scaling) run
    // ahead here, so the gust and its petals are timed to the lens: tCam(u) s; the crossing is at u = 1 - 0.45 / L
    const tCam = (() => {
      const L = path.length, dur = ctx.vary && ctx.vary.duration > 0 ? ctx.vary.duration : DURATION, N = 400, tab = new Float32Array(N + 1);
      let inv = 0; for (let i = 0; i < 64; i++) inv += 2 / (PACE(i / 64) + PACE((i + 1) / 64));
      const k = inv / 64, dt = 1 / 120;
      for (let j = 0, d = 0, v = L / dur, t = 0; j <= N && t < 4 * dur; t += dt) {
        while (j <= N && j / N <= d / L) tab[j++] = t;
        v += (L / dur * PACE(Math.min(1, d / L)) * k - v) * (1 - Math.exp(-dt * 1.4)); d += v * dt;
      }
      return (u) => { const x = Math.min(1, Math.max(0, u)) * N, i = Math.min(N - 1, Math.floor(x)); return tab[i] + (tab[i + 1] - tab[i]) * (x - i); };
    })();
    const T_X = tCam(1 - 0.45 / path.length), T_HIT = T_X - GUST_LEAD;
    const strokeMat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU), vertexShader: BLOOM_VS, fragmentShader: STROKE2_FS, side: THREE.DoubleSide, fog: true });

    // ---------- the sky ----------
    const skyTime = { value: 0 };
    const domeU = Object.assign(fogU(), {
      uTime: skyTime, uGain: { value: 1.0 }, uWeave: SU.uWeave, uBump: { value: 0.85 }, uSeed: { value: rng.range(0, 10) }, uCell: { value: 0.017 },
      uJit: { value: 0.45 }, uLight: { value: new THREE.Vector3(-0.8, 0.6, 0.6) },
      uSky: { value: ['#2A5A92', '#4A88A8', '#3E7A96', '#6E9ED0', '#EEB8C4', '#F2E0A0', '#4C8CC8', '#5A9AB8', '#F6E6C8'].map((h) => C(h, 0.8)) },
      uCloud: { value: [new THREE.Vector4(5, 5, 0.1, 0), new THREE.Vector4(5, 5, 0.1, 0)] },
      uCloudE: { value: [new THREE.Vector4(1, 0, 1, 0), new THREE.Vector4(1, 0, 1, 0)] },
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), new THREE.ShaderMaterial({
      uniforms: domeU, vertexShader: DOME_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: true,
    }));
    dome.renderOrder = -1; dome.frustumCulled = false; dome.name = 'sky';
    scene.add(dome);
    await ctx.yield();

    // ---------- pigments (albedo: the gallery light lifts them) ----------
    const B = {
      rim: [C('#1A1510'), C('#1E2719'), C('#2A1C16'), C('#16201C')],
      under: C('#2C281A'),
      body: [[C('#4A3622'), 0.26], [C('#5C5230'), 0.2], [C('#4A5A34'), 0.16], [C('#6E3E26'), 0.1], [C('#8A7448', 0.95), 0.1],
        [C('#33463F'), 0.12], [C('#2A3022'), 0.06]],
      lit: [C('#9A8A52'), C('#8A9A6A'), C('#A8784A'), C('#7A8A70')],
      twig: [[C('#56663A'), 0.3], [C('#6A6234'), 0.24], [C('#74402A'), 0.2], [C('#44502E'), 0.16], [C('#363F34'), 0.1]],
    };
    const pickW = (list) => { let r = rng(); for (const [c, w] of list) if ((r -= w) <= 0) return c; return list[0][0]; };
    const F = {
      white: [C('#F3F0E2', 0.86), C('#EAE9DA', 0.86), C('#E6EEE6', 0.84), C('#F4E8DC', 0.86), C('#F8F6EC', 0.88)],
      shade: [C('#C3CFC6', 0.84), C('#B8C8C8', 0.82), C('#D2C4C0', 0.84)],
      pink: [C('#EBC2BC', 0.86), C('#DE9E98', 0.84), C('#E8B0B0', 0.86)],
      heart: [C('#A8443A', 0.82), C('#7E2E26', 0.8), C('#C66456', 0.84)],
      stamen: [C('#D8CC78', 0.86), C('#C4BC6A', 0.84), C('#E6DDA0', 0.86)],
      line: [C('#6F8A80', 0.8), C('#7C8E9C', 0.8), C('#8A9488', 0.8)],
      bud: [C('#9A4232', 0.82), C('#B85A48', 0.84), C('#C66A58', 0.84)], budTip: [C('#EED8CC', 0.86), C('#F0E2D8', 0.86)],
      calyx: [C('#5A2A1E', 0.8), C('#4A3020', 0.8)], twigC: [C('#4E5A2E', 0.85), C('#6A4A2A', 0.85)],
    };

    // ---------- the tree: gnarled polylines grown from the fork, kept out of the flight line ----------
    // a branch: { lv, pts: [x, y, z, r, amp, ph] ... }
    const branches = [];
    const sway = (s) => Math.min(0.022, 0.0035 * Math.pow(Math.max(0, s), 1.5));
    const v = new THREE.Vector3(), w = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const perp = (d, out) => { out.set(rng.gauss(), rng.gauss(), rng.gauss()); out.addScaledVector(d, -out.dot(d)); return out.normalize(); };
    const STEP = [0.07, 0.045, 0.03, 0.02, 0.014], GN = [0.035, 0.09, 0.12, 0.15, 0.18], CLR = [0.3, 0.2, 0.13, 0.08, 0.06];
    const queue = [], fork = new THREE.Vector3(0, 0.85, 0);
    function grow(p0, dir, len, r0, r1, lv, s0, ph0, ck = 1) {
      const p = p0.clone(), d = dir.clone().normalize(), n = Math.max(3, Math.ceil(len / STEP[lv])), st = len / n;
      const pts = [p.x, p.y, p.z, r0, sway(s0), ph0];
      let s = s0;
      const bul = rng.range(0, TAU);
      for (let i = 1; i <= n; i++) {
        const t = i / n, r = (r0 + (r1 - r0) * t) * (lv <= 1 ? 1 + 0.13 * Math.sin(i * 0.7 + bul) * Math.sin(i * 0.23 + 2 * bul) : 1);   // gnarled girth
        d.x += rng.gauss() * GN[lv]; d.y += rng.gauss() * GN[lv]; d.z += rng.gauss() * GN[lv];
        if (lv && rng.chance(0.08 + 0.03 * lv)) d.addScaledVector(perp(d, w), rng.range(0.25, 0.5));   // the almond's angular kinks
        d.y += lv === 1 ? 0.012 : lv === 2 ? 0.02 : 0.008;
        if (lv === 0) { d.x += 0.07 * Math.sin(i * 0.31 + bul); d.z += 0.07 * Math.cos(i * 0.23 + bul); d.addScaledVector(v.subVectors(fork, p).normalize(), 0.08); }   // the trunk winds, gnarled, up to the fork
        if (lv >= 1) { v.set(p.x, 0, p.z); const rr = v.length(); if (rr > 1.45) d.addScaledVector(v, -0.1 * (rr - 1.45) / rr); }   // the crown's envelope
        const q = nearest(p.x, p.y, p.z), clr = r + CLR[lv] * ck;
        if (q.d < clr * 2) {
          v.set(p.x - q.x, p.y - q.y, p.z - q.z).divideScalar(Math.max(q.d, 1e-4));
          if (lv <= 2) { v.y = Math.abs(v.y) + 0.35; v.normalize(); }   // the wood goes round and OVER the lens: a canopy, not a floor
          d.addScaledVector(v, 0.6 * (1 - q.d / (clr * 2)));
        }
        d.normalize();
        p.addScaledVector(d, st); s += st;
        const q2 = nearest(p.x, p.y, p.z), hard = r + 0.05;
        if (q2.d < hard) { v.set(p.x - q2.x, p.y - q2.y, p.z - q2.z).divideScalar(Math.max(q2.d, 1e-4)); p.set(q2.x, q2.y, q2.z).addScaledVector(v, hard); }   // never through the lens
        if (lv >= 3 && q2.d < r + CLR[lv] * 0.45) break;          // a twig is cut short rather than cross the lens' way
        pts.push(p.x, p.y, p.z, r, sway(s), ph0 + 1.3 * (s - s0));
      }
      const b = { lv, pts, len: s - s0, s0 };
      branches.push(b);
      if (lv < 4 && pts.length >= 18) queue.push(b);
      return b;
    }
    const SPACE = [0, 0.15, 0.09, 0.048], ANG = [0, [0.5, 0.95], [0.5, 0.9], [0.55, 1.0]], LEN = [0, [0.42, 0.75], [0.18, 0.38], [0.07, 0.17]];
    function children(b) {
      const lv = b.lv + 1, np = b.pts.length / 6, a = new THREE.Vector3(), t0 = new THREE.Vector3(), cd = new THREE.Vector3();
      let roll = rng.range(0, TAU), at = rng.range(0.15, 0.3) * SPACE[b.lv];
      const L = b.len;
      for (let sAt = Math.max(at, lv >= 3 ? 0.03 : 0.1); sAt < L * 0.97; sAt += SPACE[b.lv] * rng.range(0.7, 1.35)) {
        const fi = sAt / L * (np - 1), i = Math.min(np - 2, Math.floor(fi)), o = i * 6;
        a.set(b.pts[o], b.pts[o + 1], b.pts[o + 2]);
        t0.set(b.pts[o + 6] - b.pts[o], b.pts[o + 7] - b.pts[o + 1], b.pts[o + 8] - b.pts[o + 2]).normalize();
        roll += 2.4 + rng.range(-0.4, 0.4);
        // a direction off the parent: up and outward are favoured
        const e1 = perp(t0, new THREE.Vector3()), e2 = new THREE.Vector3().crossVectors(t0, e1);
        const ang = rng.range(ANG[lv - 1][0], ANG[lv - 1][1]);
        cd.copy(t0).multiplyScalar(Math.cos(ang)).addScaledVector(e1, Math.sin(ang) * Math.cos(roll)).addScaledVector(e2, Math.sin(ang) * Math.sin(roll));
        // most lean up and out; some cross the open middle of the vase, where the lens flies
        const inward = lv <= 3 && rng.chance(lv === 2 ? 0.4 : 0.3);
        cd.y += inward ? 0.05 : 0.25; v.set(a.x, 0, a.z).normalize(); cd.addScaledVector(v, inward ? -0.9 : 0.2).normalize();
        const rem = 1 - sAt / L, len = rng.range(LEN[lv - 1][0], LEN[lv - 1][1]) * (0.6 + 0.6 * rem), rp = b.pts[o + 3];
        const r0 = lv === 4 ? Math.min(rp * 0.7, 0.0045) : rp * rng.range(0.5, 0.68);
        grow(a, cd, len, r0, Math.max(0.0022, r0 * 0.45), lv, b.s0 + sAt, b.pts[o + 5]);
      }
    }
    // the trunk, rooted in the grass, then four (or five) limbs out of the fork
    grow(new THREE.Vector3(0.12, G - 0.1, 0.1), new THREE.Vector3(-0.03, 1, -0.02), 1.82, 0.12, 0.085, 0, 0, 0);
    const nl = rng.chance(0.5) ? 4 : 5, az0 = rng.range(0, TAU);
    for (let k = 0; k < nl; k++) {
      const az = az0 + k * TAU / nl + rng.range(-0.3, 0.3), el = rng.range(0.7, 1.0);
      grow(fork, new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)), rng.range(1.8, 2.1), 0.065, 0.018, 1, 0, rng.range(0, TAU));
    }
    // hero branches: out of the nearest limb, across the opening's flight a hand's length off it, so the take opens
    // close on blossoming wood
    {
      const T = new THREE.Vector3(), tq = new THREE.Vector3(), sd = new THREE.Vector3(), best = new THREE.Vector3();
      const limbs = branches.filter((b) => b.lv === 1);
      for (const [u, side, lift] of [[0.015, 1, 0.06], [0.03, -1, 0.1], [0.045, 1, -0.04], [0.06, -1, 0.08], [0.075, 1, 0.05]]) {
        path.pointAt(u, T); path.tangentAt(u, tq); sd.crossVectors(tq, up).normalize();
        T.addScaledVector(sd, side * 0.2).addScaledVector(up, lift);
        let bd = 1e9, br = 0.02;
        for (const b of limbs) for (let i = 0; i < b.pts.length; i += 6) {
          const d = Math.hypot(b.pts[i] - T.x, b.pts[i + 1] - T.y, b.pts[i + 2] - T.z);
          if (d < bd && b.pts[i + 1] < T.y + 0.2) { bd = d; best.set(b.pts[i], b.pts[i + 1], b.pts[i + 2]); br = b.pts[i + 3]; }
        }
        if (bd > 2.2) continue;
        grow(best, v.subVectors(T, best), bd + 0.45, Math.max(0.012, br * 0.5), 0.006, 2, 1.2, rng.range(0, TAU), 0.35);
      }
    }
    for (let qi = 1; qi < queue.length; qi++) { children(queue[qi]); if (qi % 20 === 0) await ctx.yield(); }
    await ctx.yield();

    // ---------- branch strokes ----------
    const set = makeSet();
    const a = new THREE.Vector3(), b2 = new THREE.Vector3(), tg = new THREE.Vector3();
    let nb = 0;
    for (const br of branches) {
      const pts = br.pts, np = pts.length / 6, twig = br.lv >= 3;
      // stations along the polyline every ~1.1 radii
      let acc = 0;
      for (let i = 0; i < np - 1; i++) {
        const o = i * 6;
        a.set(pts[o], pts[o + 1], pts[o + 2]); b2.set(pts[o + 6], pts[o + 7], pts[o + 8]);
        const segL = a.distanceTo(b2); tg.subVectors(b2, a).divideScalar(segL || 1);
        for (; acc < segL; ) {
          const f = acc / segL, x = a.x + (b2.x - a.x) * f, y = a.y + (b2.y - a.y) * f, z = a.z + (b2.z - a.z) * f;
          const r = pts[o + 3] + (pts[o + 9] - pts[o + 3]) * f, amp = pts[o + 4] + (pts[o + 10] - pts[o + 4]) * f, ph = pts[o + 5] + (pts[o + 11] - pts[o + 5]) * f;
          const thick = r > 0.025, st = thick ? Math.min(0.03, r * 0.55) : Math.min(0.06, Math.max(0.004, r * 1.1));
          const twist = thick ? 0.28 * Math.sin((br.s0 + i * 0.05 + acc) * 3.1 + br.lv) + (br.lv === 0 ? 0.22 : 0.1) : 0;   // the bark spirals
          // the dark underpaint on the axis, both dark edges, then the body strokes on the near face
          let hl = st * 1.0;
          set.add(x, y, z, tg.x * hl, tg.y * hl, tg.z * hl, r * 1.04, 0, 0, 0, 0, 0, 0, 0, 0, B.under, 0, B.rim[0], 0.3, amp, ph, rng());
          for (let sd = -1; sd <= 1; sd += 2) {
            if (twig && rng.chance(0.25)) continue;
            hl = st * rng.range(0.9, 1.5);
            const c = jit(rng.pick(B.rim), 0.2);
            set.add(x, y, z, tg.x * hl, tg.y * hl, tg.z * hl, r * rng.range(0.15, 0.26), 0, 0, 0, rng.range(-0.1, 0.1), sd * rng.range(0.74, 0.9), r, rng.gauss() * 0.05, 0, c, 0, mix(c, B.under, 0.5), 0.4, amp, ph, rng());
          }
          const nIn = r < 0.005 ? 1 : r < 0.012 ? 2 : r < 0.025 ? 3 : r < 0.05 ? 8 : 11;
          for (let k = 0; k < nIn; k++) {
            hl = st * (thick ? rng.range(1.2, 2.2) : rng.range(0.9, 1.8));
            const lit = thick && k > nIn * 0.55 && rng.chance(0.35);   // the lit side picks up ochre and grey-green
            const c = lit ? jit(rng.pick(B.lit)) : jit(pickW(twig ? B.twig : B.body)), c2 = rng.chance(0.5) ? jit(pickW(twig ? B.twig : B.body)) : mix(c, B.rim[1], 0.4);
            const off = nIn === 1 ? rng.range(-0.3, 0.3) : (-0.62 + 1.24 * (k + rng()) / nIn);
            set.add(x, y, z, tg.x * hl, tg.y * hl, tg.z * hl, r * (thick ? rng.range(0.13, 0.2) : rng.range(0.24, 0.4)), 0, 0, 0, rng.range(-0.12, 0.12), off, r, twist + rng.gauss() * (thick ? 0.06 : 0.1), 0, c, 0, c2, rng.range(0.3, 0.9), amp, ph, rng());
          }
          if (thick && rng.chance(br.lv === 0 ? 0.22 : 0.1)) {        // a knot: a dark curl and its lighter lip
            const off = rng.range(-0.4, 0.4), kh = st * rng.range(0.6, 1.1);
            set.add(x, y, z, tg.x * kh, tg.y * kh, tg.z * kh, r * 0.16, 0, 0, 0, rng.sign() * 0.5, off, r * 1.03, rng.range(0.6, 1.2) * rng.sign(), 0, jit(rng.pick(B.rim)), 0, B.under, 0.3, amp, ph, rng());
            set.add(x, y, z, tg.x * kh * 0.7, tg.y * kh * 0.7, tg.z * kh * 0.7, r * 0.07, 0, 0, 0, 0.3, off + 0.1, r * 1.05, rng.range(0.6, 1.2), 0, jit(rng.pick(B.lit)), 0, B.under, 0.3, amp, ph, rng());
          }
          acc += st;
        }
        acc -= segL;
      }
      if (++nb % 40 === 0) await ctx.yield();
    }
    await ctx.yield();

    // ---------- blossoms and buds on the outer wood ----------
    const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fc = new THREE.Vector3(), m = new THREE.Vector3(), out = new THREE.Vector3();
    const s1 = new THREE.Vector3(), s2 = new THREE.Vector3(), u1 = new THREE.Vector3();
    // LOD: the detail distance of the strokes being laid (0 = always; > 0 fade out beyond; < 0 fade in beyond). In the
    // distance only a share of the flowers stays, each as its five petal strokes and its heart, so the crown reads as
    // distinct blossoms on dark wood instead of a white mush
    let LOD = 0;
    const flat = (p, q, hw, nn, arc, c1, em, c2, load, amp, ph, cut = LOD) => {
      set.add((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2, (q.x - p.x) / 2, (q.y - p.y) / 2, (q.z - p.z) / 2, hw, nn.x, nn.y, nn.z, arc, cut, 0, 0, 0, c1, em, c2, load, amp, ph, rng());
    };
    const free = (p, q, hw, c1, c2, load, amp, ph, cut = LOD) => {
      set.add((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2, (q.x - p.x) / 2, (q.y - p.y) / 2, (q.z - p.z) / 2, hw, 0, 0, 0, 0, cut, 0, 0, 0, c1, 0, c2, load, amp, ph, rng());
    };
    let nFlowers = 0;
    const FL = [];                                          // the open flowers' centres (where the gust tears petals off)
    function blossom(x, y, z, t, r, amp, ph, stage, force = false) {
      // where on the twig, facing which way
      perp(t, m); out.set(x, y - 2.0, z).normalize();
      m.addScaledVector(out, 0.7).addScaledVector(up, 0.3); m.addScaledVector(t, -m.dot(t)).normalize();
      const rf = stage === 2 ? rng.range(0.006, 0.009) : stage === 1 ? rng.range(0.012, 0.017) : rng.range(0.018, 0.026);
      fc.set(x, y, z).addScaledVector(m, r + rf * (stage === 2 ? 0.9 : 0.35));
      if (!force && nearest(fc.x, fc.y, fc.z).d < rf + 0.045) return;
      nFlowers++;
      const keep = rng.chance(stage === 2 ? 0.5 : 0.55), fine = keep ? 2.3 : 2.6;   // fine: where a kept flower's detail goes
      LOD = keep ? 0 : 2.9;
      if (stage === 2) {                                    // a bud: red-brown ovals, a pale tip, a dark calyx
        LOD = keep ? 0 : 2.9;
        const L = rf * rng.range(1.1, 1.5);
        s1.copy(fc).addScaledVector(m, -L * 0.9); s2.copy(fc).addScaledVector(m, -L * 0.25);
        free(s1, s2, rf * 0.32, rng.pick(F.calyx), rng.pick(F.bud), 0.4, amp, ph);
        s1.copy(fc).addScaledVector(m, -L * 0.6); s2.copy(fc).addScaledVector(m, L * 0.5);
        free(s1, s2, rf * 0.5, rng.pick(F.bud), rng.pick(F.pink), 0.5, amp, ph);
        s1.copy(fc).addScaledVector(m, L * 0.05); s2.copy(fc).addScaledVector(m, L * 0.75);
        free(s1, s2, rf * 0.3, rng.pick(rng.chance(0.5) ? F.budTip : F.pink), rng.pick(F.white), 0.5, amp, ph);
        LOD = 0;
        return;
      }
      if (!force) FL.push(fc.x, fc.y, fc.z);
      n.copy(m).multiplyScalar(0.8).add(perp(m, e1).multiplyScalar(0.55)).normalize();
      perp(n, e1); e2.crossVectors(n, e1);
      const cup = stage === 1 ? rng.range(0.45, 0.7) : rng.range(0.05, 0.25), th0 = rng.range(0, TAU), lift = 0.00035;
      // a dark calyx behind
      s1.copy(fc).addScaledVector(n, -rf * 0.15).addScaledVector(m, -rf * 0.25); s2.copy(fc).addScaledVector(n, -rf * 0.05).addScaledVector(m, rf * 0.15);
      free(s1, s2, rf * 0.13, rng.pick(F.calyx), rng.pick(F.twigC), 0.4, amp, ph);
      for (let k = 0; k < 5; k++) {
        const th = th0 + k * TAU / 5 + rng.range(-0.18, 0.18), len = rf * rng.range(0.85, 1.05), np = stage === 1 ? 2 : rng.chance(0.5) ? 3 : 4;
        const shaded = rng.chance(0.25), base = shaded ? rng.pick(F.shade) : rng.pick(F.white);
        for (let j = 0; j < np; j++) {
          LOD = keep && j === (np >> 1) ? 0 : keep ? fine : 2.9;
          const ph2 = th + (j - (np - 1) / 2) * rng.range(0.22, 0.32);
          u1.copy(e1).multiplyScalar(Math.cos(ph2)).addScaledVector(e2, Math.sin(ph2));
          const lz = lift * (1 + j + k * np);
          s1.copy(fc).addScaledVector(u1, rf * rng.range(0.12, 0.25)).addScaledVector(n, lz);
          s2.copy(fc).addScaledVector(u1, len * rng.range(0.8, 1.0)).addScaledVector(n, lz + cup * len);
          const c = jit(rng.chance(0.2) ? rng.pick(F.white) : base, 0.06);
          const c2 = rng.chance(0.25) ? rng.pick(F.pink) : rng.chance(0.2) ? rng.pick(F.shade) : rng.pick(F.white);
          flat(s1, s2, rf * rng.range(0.15, 0.21), n, rng.range(-0.15, 0.15), c, rng.range(0.12, 0.3), c2, rng.range(0.15, 0.45), amp, ph);
        }
        // the pink at the petal's foot, now and then a thin grey-green line round its tip
        LOD = keep ? fine : 2.9;
        u1.copy(e1).multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th));
        const lz = lift * (2 + 5 * np);
        s1.copy(fc).addScaledVector(u1, rf * 0.1).addScaledVector(n, lz); s2.copy(fc).addScaledVector(u1, rf * rng.range(0.38, 0.5)).addScaledVector(n, lz + cup * rf * 0.4);
        flat(s1, s2, rf * rng.range(0.12, 0.17), n, 0, rng.pick(F.pink), 0, rng.pick(F.white), 0.4, amp, ph);
        if (np >= 3 && rng.chance(0.25)) {             // on the petal, inside its tip (never a crescent floating past it)
          w.crossVectors(n, u1);
          const tip = fc.clone().addScaledVector(u1, len * 0.8).addScaledVector(n, cup * len * 0.8 + lz * 1.5);
          s1.copy(tip).addScaledVector(w, -rf * 0.17); s2.copy(tip).addScaledVector(w, rf * 0.17);
          flat(s1, s2, rf * 0.03, n, 0.2, rng.pick(F.line), 0, rng.pick(F.shade), 0.4, amp, ph, keep ? 1.4 : 1.4);
        }
      }
      // the heart: red-brown dabs, a ring of stamens standing out of it
      const lz = lift * 30;
      for (let k = 0; k < 3; k++) {
        LOD = keep && k === 0 ? 0 : keep ? fine : 2.9;
        u1.set(rng.gauss(), rng.gauss(), rng.gauss()).addScaledVector(n, -u1.dot(n)).normalize();
        s1.copy(fc).addScaledVector(u1, -rf * 0.12).addScaledVector(n, lz); s2.copy(fc).addScaledVector(u1, rf * 0.14).addScaledVector(n, lz);
        flat(s1, s2, rf * rng.range(0.09, 0.13), n, 0, rng.pick(F.heart), 0, rng.pick(F.heart), 0.5, amp, ph);
      }
      if (keep) {                                      // the far dab: a crisp white star with a pink-red heart, only in the distance
        LOD = -2.0;
        const th1 = rng.range(0, TAU);
        for (let k = 0; k < 3; k++) {
          u1.copy(e1).multiplyScalar(Math.cos(th1 + k * 1.05)).addScaledVector(e2, Math.sin(th1 + k * 1.05));
          s1.copy(fc).addScaledVector(u1, -rf * 1.05); s2.copy(fc).addScaledVector(u1, rf * 1.05);
          free(s1, s2, rf * 0.42, jit(rng.pick(F.white), 0.05), rng.chance(0.3) ? rng.pick(F.pink) : rng.pick(F.shade), 0.3, amp, ph);
        }
        s1.copy(fc).addScaledVector(n, rf * 0.05).addScaledVector(e1, -rf * 0.22); s2.copy(fc).addScaledVector(n, rf * 0.05).addScaledVector(e1, rf * 0.22);
        free(s1, s2, rf * 0.24, rng.pick(F.heart), rng.pick(F.pink), 0.4, amp, ph);
      }
      const ns = stage === 1 ? 4 : rng.int(6, 9);
      LOD = 1.8;
      for (let k = 0; k < ns; k++) {
        const th = th0 + k * TAU / ns + rng.range(-0.2, 0.2);
        u1.copy(e1).multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th));
        s1.copy(fc).addScaledVector(u1, rf * 0.12).addScaledVector(n, lz + rf * 0.05);
        s2.copy(fc).addScaledVector(u1, rf * rng.range(0.26, 0.36)).addScaledVector(n, lz + rf * rng.range(0.12, 0.25));
        free(s1, s2, rf * 0.035, rng.pick(F.stamen), rng.pick(F.heart), 0.3, amp, ph);
      }
      LOD = 0;
    }
    for (const br of branches) {
      if (br.lv < 2) continue;
      const pts = br.pts, np = pts.length / 6, gap = br.lv === 2 ? 0.06 : 0.038;
      let next = br.lv === 4 ? rng.range(0, 0.02) : rng.range(0.02, gap);
      for (let i = 0, s = 0; i < np - 1; i++) {
        const o = i * 6;
        a.set(pts[o], pts[o + 1], pts[o + 2]); b2.set(pts[o + 6], pts[o + 7], pts[o + 8]);
        const L = a.distanceTo(b2); tg.subVectors(b2, a).divideScalar(L || 1);
        while (next < s + L) {
          const f = (next - s) / L, x = a.x + (b2.x - a.x) * f, y = a.y + (b2.y - a.y) * f, z = a.z + (b2.z - a.z) * f;
          const tipK = next / br.len, amp = pts[o + 4], ph = pts[o + 5], k = rng.chance(0.35) ? 2 : 1;
          for (let j = 0; j < k; j++) blossom(x, y, z, tg, pts[o + 3], amp, ph, tipK > 0.85 && rng.chance(0.6) ? 2 : rng.chance(0.15) ? 1 : rng.chance(0.08) ? 2 : 0);
          next += gap * rng.range(0.6, 1.5);
        }
        s += L;
      }
    }
    await ctx.yield();

    // ---------- petals drifting down through the crown ----------
    for (let i = 0; i < 260; i++) {
      const c = rng.pick(F.white), hl = rng.range(0.004, 0.007);
      set.add(rng.range(-3, 3.8), rng.range(-0.1, 4.5), rng.range(-3, 3), hl, 0, 0, hl * rng.range(0.6, 0.8), 0, 0, 0, 0, 0, 0, 0, 1, c, 0.04, rng.pick(F.pink), rng.range(0.2, 0.6), 0, rng.range(0, TAU), rng());
    }
    // ---------- the gust's petals: torn off the crown's downwind face as its wave passes, blown on a swirl into a cloud
    // round the last stretch of the flight (thinning toward the exit, so the next world shows through it) ----------
    {
      const L = path.length, at = new THREE.Vector3(), tq = new THREE.Vector3(), q1 = new THREE.Vector3(), q2 = new THREE.Vector3(), nF = FL.length / 3;
      for (let i = 0; i < 30000 && nF; i++) {
        let rem; do rem = rng.range(0.5, 2.6); while (rng() > sstep(0.5, 0.8, rem) * (1 - 0.6 * sstep(1.8, 2.6, rem)));
        path.pointAt(1 - rem / L, at); path.tangentAt(1 - rem / L, tq); perp(tq, q1); q2.crossVectors(tq, q1);
        const rr = 1.4 * Math.sqrt(rng()), an = rng() * TAU;   // a uniform disc round the line: no hole, no rim
        at.addScaledVector(q1, rr * Math.cos(an)).addScaledVector(q2, rr * Math.sin(an)).addScaledVector(tq, rng.range(-0.2, 0.2));
        at.x -= WD.x * 0.7; at.z -= WD.y * 0.7;              // it arrives upwind of its place and drifts across it (0.7 m/s)
        let fi = 0; for (let k = 0; k < 4; k++) { fi = rng.int(0, nF - 1) * 3; if (FL[fi] * WD.x + FL[fi + 2] * WD.y > -0.3) break; }
        const ox = FL[fi] + rng.range(-0.012, 0.012), oy = FL[fi + 1] + rng.range(-0.012, 0.012), oz = FL[fi + 2] + rng.range(-0.012, 0.012);
        // arrives 1 s before the lens gets to its place and has drifted onto it as the lens passes; torn off as the wave
        // passes its flower
        const ta = tCam(1 - rem / L) - 1.0 + rng.range(-0.3, 0.3), t0 = T_HIT + (ox * WD.x + oz * WD.y) / VF + 0.05, hl = rng.range(0.011, 0.018);
        const tr = Math.min(t0 + rng() * Math.max(0.3, 0.85 * (ta - 0.6 - t0)), ta - 0.6);   // a stream torn off all through the gust, not one puff
        perp(tq, q1);
        set.add(ox, oy, oz, q1.x * hl, q1.y * hl, q1.z * hl, hl * rng.range(0.45, 0.6), at.x, at.y, at.z, 0.12, ta - tr, 0, 0, 2,
          jit(rng.chance(0.2) ? rng.pick(F.pink) : rng.pick(F.white), 0.05), 0.05, rng.chance(0.4) ? rng.pick(F.pink) : rng.pick(F.shade), rng.range(0.2, 0.6), tr, rng() * TAU, rng());
      }
    }
    await ctx.yield();

    // ---------- the orchard round it: the ground, grass, the lane, a reed hedge, the other trees, a farm, cypresses ----------
    const lane = (x) => 3.2 + 0.1 * x + 1.6 * Math.sin(0.08 * x + 0.5);            // the lane's middle (z), in front of the tree
    const onLane = (x, z) => Math.abs(z - lane(x)) < 0.75;
    const hills = (x, z) => { const r = Math.hypot(x, z), an = Math.atan2(z, x); return 5.5 * sstep(70, 170, r) * (0.55 + 0.45 * Math.sin(3 * an + 1) * Math.sin(5 * an + 2)); };
    const gy = (x, z) => G + hills(x, z);
    const GRASS = [[C('#7E9A48', 0.85), 0.18], [C('#9AAA50', 0.85), 0.14], [C('#B8B460', 0.85), 0.12], [C('#6A8A4A', 0.85), 0.14], [C('#7A9A7A', 0.85), 0.12], [C('#C8B868', 0.85), 0.08], [C('#5A7A4A', 0.85), 0.12], [C('#A0A87A', 0.85), 0.06], [C('#8A8AA8', 0.85), 0.04]];
    const DARK = [C('#3E5A2E', 0.85), C('#2E4A3A', 0.85), C('#4A5A2A', 0.85), C('#35503E', 0.85), C('#3A4A5E', 0.85)];
    // darker patches across the meadow (the shadow of the far trees, wetter grass), a few metres across
    const patch = (x, z) => sstep(0.25, 0.75, 0.5 + 0.5 * Math.sin(x * 0.33 + 1.4 * Math.sin(z * 0.27 + 1)) * Math.sin(z * 0.29 - 1.1 * Math.sin(x * 0.21)));
    const DIRT = [[C('#D8C48E'), 0.3], [C('#CDB283'), 0.25], [C('#E6D6A8'), 0.2], [C('#B89AA8'), 0.13], [C('#C8A070'), 0.12]];
    const SHADE = [C('#5A6A9A'), C('#6A7AA8'), C('#4A6A7A')], FAR = [C('#5A7A9A'), C('#6A8A8A'), C('#7A9AB0'), C('#8AA080'), C('#9A9AB8')];
    // flat: a dash lying in a plane (normal nx, ny, nz); dab: a free stroke
    const dash = (x, y, z, dx, dy, dz, hw, nx, ny, nz, c1, c2, load) => set.add(x, y, z, dx, dy, dz, hw, nx, ny, nz, rng.range(-0.2, 0.2), 0, 0, 0, 0, c1, 0, c2, load, 0, 0, rng());
    const dab = (x, y, z, dx, dy, dz, hw, c1, c2, load, amp, em = 0) => set.add(x, y, z, dx, dy, dz, hw, 0, 0, 0, rng.range(-0.15, 0.15), 0, 0, 0, 0, c1, em, c2, load, amp, rng() * TAU, rng());
    // the underpaint of the land, out to the hills
    {
      const NR = 80, NA = 128, pos = [], col = [], idx = [], c = new THREE.Color();
      const g0 = C('#4C6A34'), g1 = C('#6A7E3C'), g2 = C('#8A9048'), far = C('#4E7A6A'), gd = C('#2E4632');
      for (let i = 0; i <= NR; i++) {
        const r = 300 * Math.pow(i / NR, 2.2);
        for (let j = 0; j < NA; j++) {
          const an = j / NA * TAU, x = r * Math.cos(an), z = r * Math.sin(an);
          const nz = 0.5 + 0.25 * Math.sin(x * 0.21 + 2 * Math.sin(z * 0.13)) + 0.25 * Math.sin(z * 0.17 - x * 0.07);
          c.copy(g0).lerp(g1, nz).lerp(g2, 0.4 * sstep(0.7, 1, nz)).lerp(gd, 0.6 * patch(x, z)).lerp(far, sstep(40, 150, r));
          pos.push(x, gy(x, z) - 0.02, z); col.push(c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) { const p0 = i * NA + j, p1 = i * NA + (j + 1) % NA; idx.push(p0, p1, p0 + NA, p1, p1 + NA, p0 + NA); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
      const land = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide }));
      land.frustumCulled = false; land.name = 'land'; scene.add(land);
    }
    // grass: blades standing up out of the ground that sway and bend from the foot in the gust (negative sway), thick
    // round the tree, bigger with distance; the blue-lilac shadow at the tree's foot
    for (let i = 0; i < 30000; i++) {
      const r = i < 17000 ? 0.25 + 11.75 * Math.sqrt(rng()) : 12 + 36 * Math.pow(rng(), 0.8), an = rng() * TAU, x = r * Math.cos(an), z = r * Math.sin(an);
      if (onLane(x, z)) continue;
      const len = rng.range(0.1, 0.26) * (1 + Math.max(0, r - 8) / 8), lx = rng.gauss() * 0.18 + WD.x * 0.3, lz = rng.gauss() * 0.18 + WD.y * 0.3, nn = Math.hypot(lx, 1, lz) * 2 / len;
      const dx = lx / nn, dy = 1 / nn, dz = lz / nn, y = gy(x, z), c = jit(rng() < 0.8 * patch(x, z) ? rng.pick(DARK) : pickW(GRASS)), sh = r < 2.6 && rng.chance(0.4);
      set.add(x + dx, y + dy, z + dz, dx, dy, dz, len * rng.range(0.07, 0.11), 0, 0, 0, rng.range(-0.3, 0.3), 0, 0, 0, 0, sh ? jit(rng.pick(SHADE)) : c, 0, mix(c, pickW(GRASS), 0.5), rng.range(0.3, 0.8), -rng.range(0.02, 0.035), rng() * TAU, rng());
    }
    // the ground between: dashes lying on it, mostly one way (the painter's rhythm), and the lane's paler ones along it
    for (let i = 0; i < 16000; i++) {
      const r = i < 9000 ? 0.2 + 11.8 * Math.sqrt(rng()) : 12 + 55 * Math.pow(rng(), 0.9), an = rng() * TAU, x = r * Math.cos(an), z = r * Math.sin(an);
      const on = onLane(x, z), len = rng.range(0.08, 0.2) * (1 + Math.max(0, r - 6) / 6), th = on ? Math.atan(0.1 + 0.128 * Math.cos(0.08 * x + 0.5)) + rng.gauss() * 0.2 : Math.atan2(WD.y, WD.x) + 0.25 * Math.sin(x * 0.4 + z * 0.3) + rng.gauss() * 0.35;
      const c = on ? jit(pickW(DIRT)) : r < 2.4 && rng.chance(0.5) ? jit(rng.pick(SHADE)) : jit(rng() < 0.8 * patch(x, z) ? rng.pick(DARK) : pickW(GRASS));
      dash(x, gy(x, z) + 0.012, z, Math.cos(th) * len / 2, 0, Math.sin(th) * len / 2, len * rng.range(0.22, 0.32), 0, 1, 0, c, on ? jit(pickW(DIRT)) : mix(c, pickW(GRASS), 0.5), rng.range(0.3, 0.8));
    }
    for (let i = 0; i < 6000; i++) {
      const x = rng.sign() * 80 * Math.pow(rng(), 1.4), z = lane(x) + rng.range(-0.72, 0.72), len = rng.range(0.1, 0.22) * (1 + Math.abs(x) / 10), th = Math.atan(0.1 + 0.128 * Math.cos(0.08 * x + 0.5)) + rng.gauss() * 0.18;
      const c = jit(pickW(DIRT));
      dash(x, gy(x, z) + 0.014, z, Math.cos(th) * len / 2, 0, Math.sin(th) * len / 2, len * rng.range(0.25, 0.35), 0, 1, 0, c, mix(c, pickW(DIRT), 0.5), rng.range(0.3, 0.8));
    }
    const MEAD = [C('#E8E0D0', 0.9), C('#EEC4CC', 0.9), C('#9A9AD8', 0.9), C('#E8C858', 0.9)];
    for (let i = 0; i < 2600; i++) {                        // small flowers in the grass: white, pink, blue-lilac and yellow dots
      const r = 0.5 + 24 * Math.sqrt(rng()), an = rng() * TAU, x = r * Math.cos(an), z = r * Math.sin(an), h = rng.range(0.008, 0.016) * (1 + r / 8);
      if (onLane(x, z)) continue;
      dab(x, gy(x, z) + rng.range(0.05, 0.15), z, h, 0, 0, h * 0.8, rng.chance(0.3) ? jit(rng.pick(F.white)) : jit(rng.pick(MEAD)), rng.pick(F.stamen), 0.4, -0.02);
    }
    await ctx.yield();
    // the reed hedge behind the lane's far side (+z), straw and brown, bending in the gust like the grass
    {
      const REED = [[C('#C8A85A'), 0.3], [C('#B08A48'), 0.22], [C('#D8C070'), 0.18], [C('#8A7040'), 0.16], [C('#8A9A50'), 0.14]];
      for (let i = 0; i < 3200; i++) {
        const x = rng.range(-50, 50), z = 15 + 0.04 * x + rng.range(-0.12, 0.12), h = rng.range(1.1, 1.6) / 2, lx = rng.gauss() * 0.06, y = gy(x, z);
        const c = jit(pickW(REED));
        set.add(x + lx * h, y + h, z, lx * h, h, 0, rng.range(0.012, 0.02), 0, 0, 0, rng.range(-0.1, 0.1), 0, 0, 0, 0, c, 0, mix(c, pickW(REED), 0.5), 0.5, -0.02, rng() * TAU, rng());
      }
      for (let i = 0; i < 400; i++) {                       // two rails of dark wood through it
        const x = -50 + i / 4, z = 15 + 0.04 * x, c = jit(rng.pick(B.rim), 0.2);
        for (const yy of [0.45, 0.95]) dab(x, gy(x, z) + yy + rng.range(-0.02, 0.02), z - 0.08, 0.16, 0, 0.0064, 0.025, c, B.under, 0.3, 0);
      }
    }
    // the other trees of the orchard, in loose rows (some peach-pink), and smaller ones further off
    const WHITE = [C('#F3F0E2', 0.86), C('#EAE9DA', 0.86), C('#F4E8DC', 0.86), C('#E6EEE6', 0.84)];
    const PEACH = [C('#F0B8C0', 0.86), C('#E8A0AC', 0.84), C('#F4C8CC', 0.86), C('#DE8A9A', 0.82)];
    function orchardTree(x, z, h, pink, nd) {
      const y0 = gy(x, z), fx = x + rng.range(-0.12, 0.12) * h, fz = z + rng.range(-0.12, 0.12) * h, fy = y0 + h * rng.range(0.28, 0.36), tw = h * 0.035;
      const seg = (ax, ay, az, bx, by, bz, hw, amp) => {
        const c = jit(pickW(B.body)), d = 0.5;
        dab((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, (bx - ax) * d * 1.15, (by - ay) * d * 1.15, (bz - az) * d * 1.15, hw, jit(rng.pick(B.rim)), B.under, 0.3, amp);
        dab((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, (bx - ax) * d, (by - ay) * d, (bz - az) * d, hw * 0.45, c, rng.chance(0.4) ? jit(rng.pick(B.lit)) : c, 0.5, amp);
      };
      for (let k = 0; k < 4; k++) {
        const t0 = k / 4, t1 = (k + 1) / 4, w0 = rng.range(-0.04, 0.04) * h, w1 = rng.range(-0.04, 0.04) * h;
        seg(x + (fx - x) * t0 + w0, y0 + (fy - y0) * t0, z + (fz - z) * t0, x + (fx - x) * t1 + w1, y0 + (fy - y0) * t1, z + (fz - z) * t1, tw * (1 - 0.2 * t0), 0);
      }
      const tips = [];
      for (let k = 0, nl = rng.int(4, 6), az0 = rng.range(0, TAU); k < nl; k++) {
        const az = az0 + k / nl * TAU + rng.range(-0.4, 0.4), el = rng.range(0.55, 1.05), sl = h * rng.range(0.38, 0.55) / 3;
        let px = fx, py = fy, pz = fz, dx = Math.cos(az) * Math.cos(el), dy = Math.sin(el), dz = Math.sin(az) * Math.cos(el);
        for (let j = 0; j < 3; j++) {
          const qx = px + dx * sl, qy = py + dy * sl, qz = pz + dz * sl;
          seg(px, py, pz, qx, qy, qz, tw * 0.55 * (1 - 0.28 * j), 0.008 * j);
          tips.push(qx, qy, qz, j);
          dx += rng.gauss() * 0.35; dy += rng.gauss() * 0.2 + 0.05; dz += rng.gauss() * 0.35; const nn = Math.hypot(dx, dy, dz); dx /= nn; dy /= nn; dz /= nn;
          px = qx; py = qy; pz = qz;
        }
      }
      const pal = pink ? PEACH : WHITE, hd = 0.022 * h;
      for (let i = 0; i < tips.length; i += 4) for (let k = 0, n = Math.round(nd * (0.5 + 0.35 * tips[i + 3])); k < n; k++) {
        const s0 = h * 0.1, bx = tips[i] + rng.gauss() * s0, by = tips[i + 1] + rng.gauss() * s0 * 0.7, bz = tips[i + 2] + rng.gauss() * s0, an = rng() * TAU, hl = hd * rng.range(0.7, 1.3);
        const c = jit(rng.pick(pal), 0.06);
        dab(bx, by, bz, Math.cos(an) * hl, Math.sin(an) * hl * 0.6, rng.gauss() * hl * 0.4, hl * 0.6, rng.chance(0.12) ? jit(rng.pick(F.shade)) : c, rng.chance(0.25) ? rng.pick(F.heart) : rng.pick(pal), 0.35, 0.03, 0.08);
      }
    }
    {
      let made = 0;
      for (let gx = -6; gx <= 6; gx++) for (let gz = -6; gz <= 6; gz++) {
        const x = gx * 8.5 + rng.range(-1.5, 1.5), z = gz * 8 + (gx & 1) * 4 + rng.range(-1.5, 1.5), r = Math.hypot(x, z);
        if (r < 9.5 || r > 46 || Math.abs(z - lane(x)) < 2.2 || Math.abs(z - 15 - 0.04 * x) < 1.5 || !rng.chance(0.7) || nearest(x, 1.5, z).d < 4) continue;
        orchardTree(x, z, rng.range(3.2, 4.6), rng.chance(0.3), 34); if (++made % 6 === 0) await ctx.yield();
      }
      for (let i = 0; i < 46; i++) {
        const an = rng() * TAU, r = rng.range(50, 95), x = r * Math.cos(an), z = r * Math.sin(an);
        if (Math.abs(z - lane(x)) < 2.5) continue;
        orchardTree(x, z, rng.range(3.4, 4.8), rng.chance(0.3), 9);
      }
    }
    await ctx.yield();
    // a farmhouse behind the tree as the last approach sees it: cream walls, a shaded side, an orange tiled roof
    {
      const hx = -36, hz = -44, y0 = gy(hx, hz), ang = Math.atan2(-hz, -hx) + 0.45;
      const fN = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), uA = new THREE.Vector3(-fN.z, 0, fN.x), W2 = 4.5, D2 = 2.6, H = 3.6, RH = 2.0;
      const WALL = [C('#EDE0B8', 0.9), C('#E6D2A0', 0.9), C('#E8C49A', 0.9)], SIDE = [C('#B8A890', 0.85), C('#A89AB0', 0.85), C('#C0AE8E', 0.85)], ROOF = [C('#C8603A'), C('#D87A48'), C('#B04A30'), C('#E0905A')];
      const face = (o, a1, a2, n, l1, l2, cnt, pal, sl) => {
        for (let i = 0; i < cnt; i++) {
          const s1 = rng.range(-1, 1), s2 = rng.range(-1, 1), p = o.clone().addScaledVector(a1, s1 * l1).addScaledVector(a2, s2 * l2).addScaledVector(n, 0.02), d = a1.clone().multiplyScalar(rng.range(0.15, 0.24)).addScaledVector(a2, sl + rng.gauss() * 0.02);
          const c = jit(rng.pick(pal), 0.08);
          dash(p.x, p.y, p.z, d.x, d.y, d.z, 0.06, n.x, n.y, n.z, c, jit(rng.pick(pal)), 0.5);
        }
      };
      const ctr = new THREE.Vector3(hx, y0, hz), Y = new THREE.Vector3(0, 1, 0);
      face(ctr.clone().addScaledVector(fN, D2).addScaledVector(Y, H / 2), uA, Y, fN, W2, H / 2, 560, WALL, 0);
      face(ctr.clone().addScaledVector(uA, W2).addScaledVector(Y, H / 2), fN, Y, uA, D2, H / 2, 300, SIDE, 0);
      const rs = Math.hypot(D2, RH), rN = fN.clone().multiplyScalar(RH / rs).addScaledVector(Y, D2 / rs), rA = Y.clone().multiplyScalar(RH / rs).addScaledVector(fN, -D2 / rs);
      face(ctr.clone().addScaledVector(fN, D2 / 2).addScaledVector(Y, H + RH / 2), uA, rA, rN, W2 + 0.3, rs / 2 + 0.15, 520, ROOF, 0.03);
      for (let i = 0; i < 90; i++) {                       // the gable on the shaded side
        const t = Math.sqrt(rng()), s1 = rng.range(-1, 1) * t * D2, p = ctr.clone().addScaledVector(uA, W2 + 0.02).addScaledVector(fN, s1).addScaledVector(Y, H + RH * (1 - t) * rng());
        dash(p.x, p.y, p.z, fN.x * 0.18, 0, fN.z * 0.18, 0.06, uA.x, uA.y, uA.z, jit(rng.pick(SIDE)), jit(rng.pick(SIDE)), 0.5);
      }
      for (const [s1, s2, w, h, c] of [[-0.45, 1.05, 0.5, 1.0, C('#3A5A6A')], [-2.6, 2.3, 0.45, 0.4, C('#2E4A5A')], [1.6, 2.3, 0.45, 0.4, C('#2E4A5A')], [3.2, 1.3, 0.4, 0.4, C('#2E4A5A')]]) {
        const p = ctr.clone().addScaledVector(fN, D2 + 0.03).addScaledVector(uA, s1).addScaledVector(Y, s2);
        for (let k = 0; k < 8; k++) dash(p.x + uA.x * rng.range(-w, w) * 0.6, p.y + rng.range(-h, h) * 0.8, p.z + uA.z * rng.range(-w, w) * 0.6, uA.x * w * 0.5, 0, uA.z * w * 0.5, h * 0.3, fN.x, 0, fN.z, jit(c), C('#4A3020'), 0.4);
      }
    }
    // cypresses: dark flames off in the distance
    for (const [x, z, h] of [[-3, 58, 11], [7, 64, 9.5], [-52, 22, 10.5]]) {
      const y0 = gy(x, z), CY = [C('#1E3A2A'), C('#2A4A30'), C('#3A5A34'), C('#16281E'), C('#4A6A3A')];
      for (let i = 0; i < 900; i++) {
        const t = Math.pow(rng(), 0.8), an = rng() * TAU, R = 1.15 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.65)), 0.8) * (1 - 0.1 * t) * rng.range(0.75, 1);
        const px = x + R * Math.cos(an), pz = z + R * Math.sin(an), hl = rng.range(0.18, 0.3), dx = -Math.sin(an) * 0.35, dz = Math.cos(an) * 0.35, nn = Math.hypot(dx, 1, dz) / hl;
        const c = jit(rng.pick(CY), 0.15);
        dab(px, y0 + t * h, pz, dx / nn, 1 / nn, dz / nn, 0.07, c, rng.pick(CY), 0.5, 0.02);
      }
    }
    // the far hills: long blue-green and lilac strokes, lying along them
    for (let i = 0; i < 2600; i++) {
      const an = rng() * TAU, r = rng.range(85, 170), x = r * Math.cos(an), z = r * Math.sin(an), len = rng.range(0.8, 1.8);
      dab(x, gy(x, z) + 0.2, z, -Math.sin(an) * len, rng.gauss() * 0.05, Math.cos(an) * len, 0.3, jit(rng.pick(FAR)), jit(rng.pick(FAR)), 0.5, 0);
    }
    scene.add(Object.assign(set.mesh(strokeMat, 4), { name: 'almond-strokes' }));
    await ctx.yield();

    const camP = new THREE.Vector3(), bufSize = new THREE.Vector2();
    // the journey's hour (vg-hours.js): dawn, a peach light in the pale strokes that clears toward day by the end
    const dawn = ctx.vary && ctx.vary.hour === 'dawn', skyBase = domeU.uSky.value.map((c) => c.clone());
    const DAWN_W = [0, 0, 0, 0, 0.1, 0.2, 0, 0, 0.3], fogBase = scene.fog.color.clone(), fogDawn = new THREE.Color('#EEB8B4');   // only the pale strokes and the haze take the pink
    return {
      scene, path, duration: DURATION,
      title: 'Almond Blossom',
      ride: 'none', style: 'none',
      camera: { fov: 56, near: 0.012, far: 2000, lookAhead: 0.9, sway: 0.25, bank: 0.3 },
      // round the orbit, keep the whole tree in view (the last leg flies back at its crown)
      // (the tree held from the first frame: a look that came in at 1.5 s swung the opening gaze left, then 65 deg/s back right)
      pois: [{ at: [0, 1.45, 0], from: -0.1, to: 0.95, fade: 0.05, weight: 0.9, arc: true }],
      pace: PACE,
      // the hand-off hides in the gust's petals: a bare pane (no rim, the exact window) drawn only once they fill the frame,
      // fading in behind them over the last stretch, so the next world shows through the cloud as the lens passes it
      portal: { shape: 'rect', width: 4.2, height: 2.6, frame: 0, lens: 0, color: '#FFF2C8', veil: '#F4E6DA', revealDistance: 6, blendDistance: 2.5, drawWithin: 1.8, drawIn: 0, fadeIn: [1.8, 1.0] },
      post: {
        exposure: 1.02,
        bloom: { strength: 0.18, radius: 0.5, threshold: 0.98 },
        grade: { saturation: 1.08, contrast: 1.05, tint: '#fffaf0', shadowTint: '#0a2028', vignette: 0.28, grain: 0.03, aberration: 0 },
      },
      postAt: dawn ? function (u) { return hourPost(this.post, [[0, { exposure: 1.0, tint: '#fff0e8', shadowTint: '#24162c', saturation: 1.12 }], [0.8, { exposure: 1.0, tint: '#fff2e6', shadowTint: '#141c2a', saturation: 1.08 }], [1, { exposure: 1.02, tint: '#fff6ea', shadowTint: '#0a2028', saturation: 1.1 }]], u); } : undefined,
      update(dt, time, camera, u) {
        camP.setFromMatrixPosition(camera.matrixWorld); if (camP.lengthSq() === 0) camP.copy(camera.position);
        dome.position.copy(camP);
        if (dawn) { const k = 1 - 0.7 * Math.min(1, u ?? 0); tintPalette(domeU.uSky.value, skyBase, '#F9B4BA', DAWN_W, k); scene.fog.color.copy(fogBase).lerp(fogDawn, 0.5 * k); }
        ctx.renderer.getDrawingBufferSize(bufSize);
        SU.uWeave.value = 1.5708 * Math.min(1, 1080 / Math.max(1, bufSize.y));
        SU.uTime.value = time;
        SU.uGust.value.z = 1.2 + VF * (time - T_HIT);         // the wave's crest is on the tree at T_HIT
        skyTime.value = time * 0.45;                          // the sky only drifts
      },
      dispose() {},
    };
  },
};
