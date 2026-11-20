// VG CROWS: "Wheatfield with Crows" (Van Gogh, 1890) for the Van Gogh music clip. A long take, low and agitated:
// the lens starts between the wheat ears beside the middle of three red-brown cart tracks (green verges, a green
// crown between the ruts), lifts a little along it past the fork, the crows burst up out of the wheat round the
// lens half way (u ~0.42-0.6), and the flight ends climbing steeply into the storm sky, a hand-off to the next world.
// Everything is strokes in the-turning-night's hand (parts/vg-crows.js takes its brush GLSL from that world):
//   the storm dome (slow current, three dense stroke layers, two pale cloud masses), wheat stalks and ears that
//   surge under travelling gusts, flat dashes laid along the tracks, grass on the verges, far dashes that keep the
//   distant field in strokes, and crows: black V brush marks (two-stroke wings and a dab of body) moved on the CPU.
// World space: +Y up, the flight runs from +Z to -Z, the fork is at the origin. Pure function of (u, world time).
import * as THREE from 'three';
import { makePath, makeRng, hashSeed } from '../kit/core.js';
import { DOME_VS, DOME_FS, FIELD_VS, STROKE2_FS, GROUND_VS, GROUND_FS } from '../parts/vg-crows.js';
import { hourPost, tintPalette } from '../parts/vg-hours.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
export const DURATION = 36;

// the three tracks (x, z) and their half widths; the middle one gives out in the wheat
const TRACKS = [
  { hw: 1.75, crown: true, pts: [[0.6, 90], [0.2, 50], [0, 20], [-0.3, 0], [0.3, -40], [1.6, -80], [1.0, -120], [-1.5, -160], [-3, -185]], end: [-140, -185] },
  { hw: 1.45, crown: false, pts: [[-0.2, 9], [-6, -3], [-19, -12], [-44, -21], [-90, -32], [-160, -44], [-270, -62], [-420, -80]] },
  { hw: 1.45, crown: true, pts: [[0.2, 6], [6.5, -5], [18, -18], [35, -39], [58, -68], [92, -104], [138, -150], [210, -215]] },
];

// a small stroke-set builder for FIELD_VS: aP, aD, aC, aT (4) and aX, aH (2); cut: a kind-1 stroke stops that
// fraction short of its stalk's top
function makeSet() {
  const P = [], D = [], C = [], T = [], X = [], H = [];
  const s = {
    count: 0,
    add(kind, px, py, pz, dx, dy, dz, hw, c1, c2, load, hs, t0 = 0, flex = 0, em = 0, cut = 0) {
      P.push(px, py, pz, kind); D.push(dx, dy, dz, hw); C.push(c1.r, c1.g, c1.b, em); T.push(c2.r, c2.g, c2.b, load); X.push(t0, flex); H.push(hs, cut); s.count++;
    },
    mesh(mat, segs, dynamic) {
      const g0 = new THREE.PlaneGeometry(2, 2, segs, 1), geo = new THREE.InstancedBufferGeometry();
      geo.index = g0.index; geo.setAttribute('position', g0.getAttribute('position'));
      const mk = (a, n) => { const b = new THREE.InstancedBufferAttribute(new Float32Array(a), n); if (dynamic) b.setUsage(THREE.DynamicDrawUsage); return b; };
      geo.setAttribute('aP', mk(P, 4)); geo.setAttribute('aD', mk(D, 4)); geo.setAttribute('aC', mk(C, 4)); geo.setAttribute('aT', mk(T, 4));
      geo.setAttribute('aX', mk(X, 2)); geo.setAttribute('aH', mk(H, 2));
      geo.instanceCount = s.count;
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m;
    },
  };
  return s;
}

export default {
  id: 'vg-crows',
  name: 'Wheatfield with Crows',
  category: 'wilderness',
  weirdness: 0.3,
  media: ['air', 'open'],
  async build(ctx) {
    const rng = makeRng(hashSeed('vg-crows:' + Math.floor(ctx.rng() * 1e9)));
    const noise = ctx.noise;
    const detail = Math.min(1.2, Math.max(0.5, (ctx.quality && ctx.quality.detail) || 1));
    const C = (h, s = 1) => new THREE.Color(h).multiplyScalar(s);
    const mix = (a, b, t, s = 1) => a.clone().lerp(b, t).multiplyScalar(s);

    // ---------- pigments (albedo: the gallery light lifts them by up to ~1.4) ----------
    const W = {
      chrome: C('#E2B22A', 0.74), lemon: C('#F0D450', 0.72), ochre: C('#C2862A', 0.72), deep: C('#9A6418', 0.66),
      orange: C('#D2782A', 0.66), brown: C('#6E4416', 0.62), olive: C('#6E7A2E', 0.6), green: C('#4E8A3A', 0.6), pale: C('#F2E6A0', 0.72),
    };
    const R = { // the tracks
      red: C('#9A3E22', 0.7), sienna: C('#A85A2C', 0.72), verm: C('#C4562A', 0.68), dark: C('#5A2616', 0.66), plum: C('#5A3040', 0.6),
      grn: C('#3E8A3A', 0.66), emer: C('#2E9A5A', 0.6), lime: C('#8AB040', 0.62), vgreen: C('#1E5A3A', 0.62), blue: C('#2A4A8A', 0.6),
    };
    const crowC = C('#0A0B12'), crowC2 = C('#1A2238');

    const scene = new THREE.Scene();
    const fogCol = new THREE.Color('#24407E');
    scene.background = new THREE.Color('#0E1C58');
    scene.fog = new THREE.FogExp2(fogCol, 0.0016);

    // ---------- the tracks as a field: distance to each polyline ----------
    const segs = [];
    TRACKS.forEach((tr, k) => { for (let i = 0; i < tr.pts.length - 1; i++) segs.push({ k, a: tr.pts[i], b: tr.pts[i + 1] }); });
    // { d: distance to the nearest track centre, k: which, tx, tz: its direction, hw: its half width there }
    const near = (x, z) => {
      let best = 1e9, bk = 0, bx = 0, bz = 1;
      for (const s of segs) {
        const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L2 = dx * dx + dz * dz;
        const t = Math.min(1, Math.max(0, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / L2));
        const d = Math.hypot(x - s.a[0] - dx * t, z - s.a[1] - dz * t);
        if (d < best) { best = d; bk = s.k; const l = Math.sqrt(L2); bx = dx / l; bz = dz / l; }
      }
      const tr = TRACKS[bk];
      let hw = tr.hw * (1 + 0.12 * noise.n2(x * 0.08, z * 0.08));
      if (tr.end) hw *= sstep(tr.end[1], tr.end[0], z);
      return { d: best, k: bk, tx: bx, tz: bz, hw };
    };
    const ground = (x, z) => {
      const ax = Math.abs(x), far = sstep(25, 140, Math.hypot(x, Math.min(0, z + 60)));
      let h = 0.25 * noise.fbm2(x * 0.05, z * 0.05, 2) + far * 4.5 * noise.fbm2(x * 0.004 + 3.1, z * 0.004, 3);
      h += sstep(250, 900, -z) * 6 + sstep(200, 700, ax) * 5;
      const n = near(x, z);
      h -= 0.14 * (1 - sstep(n.hw * 0.4, n.hw, n.d));            // the tracks are worn a little into the field
      return h;
    };

    // ---------- the flight ----------
    // (journey: from -39 on the flight comes down again and leaves the track for the wheat on its right, into a thick
    // stand of it where the next field is handed over: see the bridge below and portal.fadeIn)
    const eye = [[3.0, 0.72, 40], [2.5, 0.8, 27], [1.2, 1.0, 13], [0.1, 1.45, -3], [-0.4, 2.1, -21], [0.1, 2.4, -39], [0.9, 2.0, -57],
      [2.3, 1.4, -70], [4.3, 1.15, -78], [5.6, 1.1, -83]];
    const path = makePath(eye.map(([x, y, z]) => [x, ground(x, z) + y, z]));
    const LEN = path.length;
    await ctx.yield();

    // ---------- shared uniforms and materials ----------
    const wdir = new THREE.Vector2(1, -0.32).normalize();
    const SU = {
      uTime: { value: 0 }, uGain: { value: 1.1 }, uWeave: { value: 1.5708 }, uMinW: { value: 0.0017 }, uFlash: { value: new THREE.Vector3() },
      uWind: { value: new THREE.Vector4(wdir.x, wdir.y, 0.22, 0.62) },
    };
    const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
    const strokeMat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU), vertexShader: FIELD_VS, fragmentShader: STROKE2_FS, side: THREE.DoubleSide, fog: true });

    // ---------- the storm dome ----------
    const azel = (az, el) => new THREE.Vector3(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R));
    const chart = (d) => { const th = Math.acos(d.y), h = Math.hypot(d.x, d.z) || 1e-6; return new THREE.Vector2(d.x / h * th, d.z / h * th); };
    const cA = chart(azel(-34, 24)), cB = chart(azel(14, 42));
    const tang = (c) => { const t = new THREE.Vector2(-c.y, c.x).normalize(); return t; };
    const domeU = Object.assign(fogU(), {
      uTime: SU.uTime, uGain: { value: 1.05 }, uWeave: SU.uWeave, uBump: { value: 0.9 }, uSeed: { value: rng.range(0, 10) },
      uSky: { value: [C('#081238'), C('#18297A'), C('#2A4CA8'), C('#5E8ED2'), C('#B4C8DC'), C('#DCE0D2'), C('#24567A'), C('#0B1726'), C('#C8A040')].map((c) => c.multiplyScalar(0.78)) },
      uCloud: { value: [new THREE.Vector4(cA.x, cA.y, 0.2, 1.0), new THREE.Vector4(cB.x, cB.y, 0.16, 0.9)] },
      uCloudE: { value: [new THREE.Vector4(tang(cA).x, tang(cA).y, 1.9, 1), new THREE.Vector4(tang(cB).x, tang(cB).y, 1.6, -1)] },
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), new THREE.ShaderMaterial({
      uniforms: domeU, vertexShader: DOME_VS, fragmentShader: DOME_FS, side: THREE.BackSide, depthWrite: false, fog: true,
    }));
    dome.renderOrder = -1; dome.frustumCulled = false; dome.name = 'storm-dome';
    scene.add(dome);

    // ---------- the underlayer ----------
    {
      const NX = 200, NZ = 240, X0 = 1400, Z0 = 160, Z1 = -1500;
      const pos = new Float32Array((NX + 1) * (NZ + 1) * 3), col = new Float32Array((NX + 1) * (NZ + 1) * 3), idx = [];
      const cW = mix(W.ochre, W.deep, 0.5, 0.85), cWf = mix(W.chrome, W.ochre, 0.5, 0.9), cP = mix(R.red, R.sienna, 0.4), cV = mix(R.grn, R.vgreen, 0.4);
      const c = new THREE.Color(); let o = 0;
      for (let j = 0; j <= NZ; j++) {
        const s = j / NZ, z = Z0 + (Z1 - Z0) * (0.3 * s + 0.7 * s * s * s);
        for (let i = 0; i <= NX; i++) {
          const r = i / NX * 2 - 1, x = X0 * (0.12 * r + 0.88 * r * r * r);
          const n = near(x, z);
          pos[o] = x; pos[o + 1] = ground(x, z); pos[o + 2] = z;
          // near the flight the underpaint is a dark ground between the strokes; far out the tracks melt into the field
          const df = path.nearestXZ(x, z).dist, tk = 1 - sstep(40, 110, df);
          c.copy(cW).lerp(cWf, sstep(30, 200, Math.hypot(x, z + 50)));
          if (n.d < n.hw + 0.8) c.lerp(cV, tk);
          if (n.d < n.hw) c.lerp(cP, tk);
          if (TRACKS[n.k].crown && n.d < 0.3 && n.hw > 0.5) c.lerp(cV, tk);
          c.multiplyScalar(lerp(0.55, 1, sstep(6, 40, df)));
          col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; o += 3;
        }
        if (j % 12 === 11) await ctx.yield();
      }
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, e = a + NX + 1, f = e + 1; idx.push(a, e, b, b, e, f); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU), vertexShader: GROUND_VS, fragmentShader: GROUND_FS, fog: true, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.name = 'field-underlayer'; scene.add(m);
    }
    await ctx.yield();

    // ---------- strokes ----------
    const set = makeSet();
    const wheatCols = [[W.chrome, 0.3], [W.ochre, 0.2], [W.lemon, 0.14], [W.deep, 0.1], [W.orange, 0.08], [W.pale, 0.06], [W.brown, 0.05], [W.olive, 0.04], [W.green, 0.03]];
    const pickW = () => { let r = rng(); for (const [c, w] of wheatCols) if ((r -= w) <= 0) return c; return W.chrome; };
    const second = (c) => { // a neighbouring tone carried by some of the bristles
      const r = rng();
      return r < 0.3 ? mix(c, W.pale, 0.45) : r < 0.55 ? mix(c, W.deep, 0.5) : r < 0.75 ? mix(c, W.orange, 0.5) : r < 0.9 ? mix(c, W.lemon, 0.5) : mix(c, W.olive, 0.6);
    };
    const jit = (c) => c.clone().multiplyScalar(rng.range(0.85, 1.15));
    const pq = new THREE.Vector3();
    // distance in xz from the flight line (its first 0.85, where it still flies low)
    const flightXZ = []; for (let i = 0; i <= 120; i++) { path.pointAt(i / 120 * 0.9, pq); flightXZ.push([pq.x, pq.z]); }
    const dFlight = (x, z) => { let b = 1e9; for (const [px, pz] of flightXZ) b = Math.min(b, (px - x) ** 2 + (pz - z) ** 2); return Math.sqrt(b); };

    // wheat: stalk strokes from the ground and, on most, an ear stroke on the top third
    // big slow patches of the field: deeper ochre, a greener hollow, orange, a pale run (the painting is never one yellow)
    const patch = (x, z) => {
      const a = noise.n2(x * 0.045 + 7.1, z * 0.045), b = noise.n2(x * 0.03 - 4.3, z * 0.03 + 2.2);
      const c3 = noise.n2(x * 0.016 + 1.7, z * 0.016 - 5.2);
      return a > 0.32 ? W.deep : a < -0.38 ? W.pale : b > 0.38 ? W.olive : b < -0.42 ? W.orange : c3 > 0.42 ? W.green : c3 < -0.45 ? W.brown : null;
    };
    const flowerC = [C('#C8301E', 0.8), C('#D84A22', 0.78), C('#2A50B8', 0.75), C('#3A6AD0', 0.72)];
    const wheat = (x, z, scale, fine) => {
      const n = near(x, z);
      if (n.d < n.hw + 0.7) return false;
      const y = ground(x, z) - 0.05, H = rng.range(0.95, 1.5) * scale;
      const lb = rng.gauss() * 0.22, la = rng.range(0, TAU), lx = Math.cos(la) * lb, lz = Math.sin(la) * lb;
      const pc = patch(x, z), flex = rng.range(0.6, 1.3);
      // a poppy or a cornflower: a fat dab at the top of a short stem, in clusters
      const fl = noise.n2(x * 0.09 + 3.3, z * 0.09 - 8.1);
      if (fl > 0.3 && rng.chance(fine ? 0.18 : 0.3)) {
        const c = jit(rng.pick(flowerC)), Hf = H * rng.range(0.7, 0.95), hwf = (fine ? 0.016 : 0.045) * Math.sqrt(scale);
        set.add(1, x, y, z, lx, Hf, lz, fine ? 0.004 : 0.012 * Math.sqrt(scale), W.olive, R.vgreen, 0.6, rng(), 0, flex);
        set.add(1, x, y, z, lx, Hf * 1.04, lz, hwf, c, mix(c, R.dark, 0.5), rng.range(0.4, 0.9), rng(), 0.93, flex);
        return true;
      }
      if (fine) {
        // near the lens: a thin stalk in two tones, an ear of short kernel dabs alternating left and right with
        // neighbouring tones and a dark one between, and a few awns
        const c0 = jit(pc && rng.chance(0.55) ? pc : pickW()), sh = rng.range(0.0028, 0.004);
        set.add(1, x, y, z, lx, H, lz, sh, mix(c0, W.olive, 0.15), mix(c0, W.pale, 0.3), rng.range(0.3, 0.8), rng(), 0, flex, 0, 0.2);
        const side = rng.range(0, TAU), ox = Math.cos(side), oz = Math.sin(side), nk = rng.int(7, 10), kl = rng.range(0.035, 0.05);
        const earC = jit(rng.chance(0.2) && pc ? pc : rng.chance(0.45) ? W.chrome : rng.chance(0.5) ? W.lemon : W.ochre);
        for (let k = 0; k < nk; k++) {                            // kernels on the stalk's own curve, top down
          const cut = k * 0.03, sdk = (k % 2 ? 1 : -1) * 0.0045, c = rng.chance(0.18) ? jit(W.deep) : rng.chance(0.5) ? earC : jit(second(earC));
          set.add(1, x + ox * sdk, y, z + oz * sdk, lx, H, lz, rng.range(0.0065, 0.009), c, mix(c, W.pale, 0.4), rng.range(0.3, 0.9), rng(), 1 - cut - kl, flex, 0, cut);
        }
        if (rng.chance(0.6)) for (let k = 0; k < 2; k++)          // awns
          set.add(1, x + ox * 0.004 * (k ? 1 : -1), y, z + oz * 0.004 * (k ? 1 : -1), lx, H * 1.06, lz, 0.0018, jit(W.pale), W.lemon, 0.3, rng(), 0.9, flex);
        return true;
      }
      const hw = rng.range(0.018, 0.03) * Math.sqrt(scale) * (scale > 1.5 ? 1.7 : 1);
      // three short dabs up the stalk, each its own tone, overlapping a little; the top one is the fat ear
      const segsW = [[0, 0.42, 1], [0.32, 0.72, 1.15], [0.6, 1, rng.range(1.5, 2.1)]];
      let c = jit(pc && rng.chance(0.75) ? pc : rng.chance(0.06) ? rng.pick([W.brown, W.olive, R.vgreen]) : pickW());
      for (let k = 0; k < 3; k++) {
        if (k === 0 && rng.chance(0.35)) continue;
        if (k === 2) c = jit(rng.chance(0.15) && pc ? pc : rng.chance(0.5) ? W.lemon : rng.chance(0.5) ? W.chrome : W.pale);
        else if (k === 1) c = mix(c, pickW(), 0.6);
        const t0 = segsW[k][0], H1 = H * (segsW[k][1] + rng.range(-0.04, 0.04));
        set.add(1, x, y, z, lx, H1, lz, hw * segsW[k][2], c, second(c), rng.range(0.4, 1), rng(), t0 / segsW[k][1], flex);
      }
      return true;
    };
    {
      const NA = Math.round(42000 * detail), NB = Math.round(36000 * detail);
      let made = 0;
      for (let i = 0; i < NA * 3 && made < NA; i++) {          // close to the flight line: dense, the lens is among them
        if (i % 2000 === 1999) await ctx.yield();
        const u = Math.pow(rng(), 1.15) * 0.98, p = path.pointAt(u, pq), x = p.x + rng.gauss() * 6.5, z = p.z + rng.range(-3, 3);
        const df = dFlight(x, z); if (df < 0.45) continue;
        if (wheat(x, z, 1, df < 3.5)) made++;
      }
      made = 0;
      for (let i = 0; i < NB * 3 && made < NB; i++) {          // the field round it, bigger strokes further out
        if (i % 2000 === 1999) await ctx.yield();
        const x = rng.range(-75, 75), z = rng.range(-230, 60), df = dFlight(x, z);
        if (df < 6 || rng() > 2.4 / (1 + df / 22)) continue;
        if (wheat(x, z, 1 + df / 30, false)) made++;
      }
      made = 0;
      const NC = Math.round(22000 * detail);
      for (let i = 0; i < NC * 3 && made < NC; i++) {          // the lens's own row: thicker, so no bare ground between the fine stalks
        if (i % 2000 === 1999) await ctx.yield();
        const u = Math.pow(rng(), 1.15) * 0.6, p = path.pointAt(u, pq), x = p.x + rng.gauss() * 2.4, z = p.z + rng.range(-3, 3);
        const df = dFlight(x, z); if (df < 0.45 || df > 3.5) continue;
        if (wheat(x, z, 1, true)) made++;
      }
      // the floor between the stalks near the lens: small flat dabs of straw, shadow and green
      const floorC = [W.deep, W.brown, W.olive, W.ochre, R.vgreen, W.orange, R.plum];
      for (let i = 0; i < Math.round(40000 * detail); i++) {
        const u = rng() * 0.62, p = path.pointAt(u, pq), x = p.x + rng.gauss() * 3, z = p.z + rng.range(-3, 3);
        const n = near(x, z); if (n.d < n.hw + 0.6 || dFlight(x, z) > 5) continue;
        const hl = rng.range(0.04, 0.09), ang = rng.range(0, TAU), c = jit(rng.pick(floorC));
        set.add(0, x, ground(x, z) + 0.01, z, Math.cos(ang) * hl, 0, Math.sin(ang) * hl, rng.range(0.012, 0.022), c, second(c), rng.range(0.3, 0.9), rng());
      }
    }
    await ctx.yield();
    // far dashes: the distant field, short strokes that lie with the land and keep a few pixels of height
    {
      const NF = Math.round(30000 * detail);
      for (let i = 0; i < NF; i++) {
        if (i % 3000 === 2999) await ctx.yield();
        const a = rng.range(-1.35, 1.35) + (rng.chance(0.12) ? Math.PI : 0), r = 50 + Math.pow(rng(), 1.6) * 900;
        const x = Math.sin(a) * r, z = -60 - Math.cos(a) * r * 0.9;
        const df = dFlight(x, z); if (df < 45) continue;
        const n = near(x, z), onTrack = n.d < n.hw * (1 + df / 300);
        const s = df / 40, hl = rng.range(0.4, 0.8) * s, ang = rng.gauss() * 0.5;
        const pcf = patch(x, z), flf = noise.n2(x * 0.03 + 3.3, z * 0.03 - 8.1);
        let c = onTrack ? jit(rng.pick([R.red, R.sienna, R.verm])) : flf > 0.45 && rng.chance(0.3) ? jit(rng.pick(flowerC)) : jit(pcf && rng.chance(0.7) ? pcf : pickW());
        if (!onTrack && r > 400 && rng.chance(0.25)) c = jit(rng.pick([R.grn, R.vgreen, mix(R.vgreen, R.blue, 0.5)]));
        const ca = Math.cos(ang), sa = Math.sin(ang), tx = onTrack ? n.tx : -Math.cos(a), tz = onTrack ? n.tz : Math.sin(a) * 0.9;
        const dx = (tx * ca - tz * sa) * hl, dz = (tx * sa + tz * ca) * hl;
        set.add(0, x, ground(x, z) + 0.3 * s, z, dx, rng.range(-0.1, 0.25) * hl, dz, rng.range(0.1, 0.18) * s, c, second(c), rng.range(0.3, 0.9), rng());
      }
    }
    // tracks: flat dashes laid along them, the verges and the crown in short green grass
    {
      const trackC = [[R.red, 0.3], [R.sienna, 0.22], [R.verm, 0.14], [R.dark, 0.12], [R.plum, 0.08], [R.grn, 0.06], [R.blue, 0.04], [W.ochre, 0.04]];
      const pickR = () => { let r = rng(); for (const [c, w] of trackC) if ((r -= w) <= 0) return c; return R.red; };
      const grassC = [R.grn, R.grn, R.emer, R.lime, R.vgreen, W.olive, R.blue];
      for (const tr of TRACKS) {
        for (let k = 0; k < tr.pts.length - 1; k++) {
          const [ax, az] = tr.pts[k], [bx, bz] = tr.pts[k + 1], L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
          for (let s = 0; s < L; s += 0.22) {
            const x0 = ax + tx * s, z0 = az + tz * s, dc = dFlight(x0, z0), far = 1 + Math.max(0, dc - 6) / 40;
            if (far > 3.5 && rng() > 3.5 / far) continue;
            const n = near(x0, z0); if (n.hw < 0.15) continue;
            const nTr = Math.round((far < 1.6 ? 32 : 10) / Math.min(far, 3));
            for (let i = 0; i < nTr; i++) {                          // the bare track
              const o = rng.range(-1, 1) * n.hw, x = x0 - tz * o, z = z0 + tx * o, fs = far < 1.6 ? 0.45 : 1, hl = rng.range(0.22, 0.45) * far * fs, ang = rng.gauss() * 0.14;
              const ca = Math.cos(ang), sa = Math.sin(ang), c = jit(pickR());
              set.add(0, x, ground(x, z) + 0.02 + 0.03 * far, z, (tx * ca - tz * sa) * hl, 0, (tx * sa + tz * ca) * hl, rng.range(0.05, 0.085) * far * fs, c, second(c).lerp(R.dark, 0.3), rng.range(0.3, 1), rng());
            }
            const nG = Math.round((far < 1.6 ? 34 : 11) / Math.min(far, 3));
            for (let i = 0; i < nG; i++) {                           // verges both sides, the crown
              const sd = rng.sign(), crown = tr.crown && rng.chance(0.22);
              const o = crown ? rng.gauss() * 0.16 * n.hw : sd * (n.hw + rng.range(-0.15, 1.1)), x = x0 - tz * o, z = z0 + tx * o;
              const c = jit(rng.pick(grassC)), c2 = mix(c, rng.pick([R.lime, R.vgreen, W.olive]), 0.6);
              if (far < 1.6 && rng.chance(0.7)) {                    // near the lens: flat painted strokes laid along the verge
                const hl = rng.range(0.06, 0.13), ang = rng.gauss() * 0.4, ca = Math.cos(ang), sa = Math.sin(ang);
                set.add(0, x, ground(x, z) + 0.03 + rng.range(0, 0.04), z, (tx * ca - tz * sa) * hl, rng.range(0, 0.04), (tx * sa + tz * ca) * hl, rng.range(0.012, 0.022), c, c2, rng.range(0.4, 1), rng());
                continue;
              }
              const H = rng.range(0.18, 0.45) * Math.min(far, 2.5) * (far < 1.6 ? 0.7 : 1), la = rng.gauss() * 0.35;
              const al = rng.sign() * (far < 1.6 ? rng.range(0.15, 0.45) : rng.range(0.6, 1.5));
              set.add(1, x, ground(x, z) - 0.03, z, tx * al - tz * sd * la * 0.4, H, tz * al + tx * sd * la * 0.4, (far < 1.6 ? rng.range(0.007, 0.012) : rng.range(0.03, 0.05)) * Math.sqrt(far),
                c, c2, rng.range(0.4, 1), rng(), 0, 0.35);
            }
          }
          if (k % 2) await ctx.yield();
        }
      }
    }
    // journey bridge: a thick stand of the field's coarse wheat on the line over the last metres; the lens pushes through it
    // while the exit (a bare pane) fades in behind the stalks
    {
      const L = path.length;
      for (let i = 0, made = 0; i < 4000 && made < 900; i++) {
        path.pointAt((L - rng.range(1.2, 4.2)) / L, pq);
        if (wheat(pq.x + rng.gauss() * 0.3, pq.z + rng.gauss() * 0.3, rng.range(1.1, 1.45), false)) made++;
      }
    }
    scene.add(set.mesh(strokeMat, 4));
    await ctx.yield();

    // ---------- crows ----------
    // 18 already in the sky ahead, 46 hidden in the wheat beside the flight line that burst up as the lens comes by
    const crows = [];
    for (let i = 0; i < 18; i++) {
      crows.push({ sky: true, c: new THREE.Vector3(rng.range(-160, 160), rng.range(25, 110), rng.range(-160, -420)), r: rng.range(8, 30), w: rng.sign() * rng.range(0.05, 0.12),
        a0: rng.range(0, TAU), drift: new THREE.Vector3(rng.range(-1.5, 1.5), rng.range(-0.3, 0.3), rng.range(0.5, 2.5)), hz: rng.range(1.6, 2.6), ph: rng.range(0, TAU), span: rng.range(1.1, 1.5) });
    }
    // where the last look of the flight lands: half the flock wheels there, 30-85 m out, for the hand-off
    const pEnd = path.pointAt(1, new THREE.Vector3()), tEnd = path.tangentAt(1, new THREE.Vector3());
    const yawEnd = Math.atan2(tEnd.x, -tEnd.z), elEnd = Math.asin(tEnd.y);
    for (let i = 0; i < 46; i++) {
      // the burst: most of them go up within two seconds of each other, the rest straggle after
      const u = i < 32 ? 0.42 + 0.05 * Math.pow(rng(), 1.4) : rng.range(0.47, 0.6), p = path.pointAt(u + rng.range(-0.01, 0.06), pq), sd = rng.sign();
      const hx = p.x + sd * rng.range(1.4, 8), hz = p.z + rng.range(-2, 2);
      const across = rng.chance(0.3) ? -sd : sd, high = rng.chance(0.6);
      const vx = across === sd ? sd * rng.range(0.2, 1.2) : across * rng.range(1.5, 3.2);
      crows.push({ sky: false, u0: u, h: new THREE.Vector3(hx, ground(hx, hz) + 0.5, hz),
        c: high ? (() => { const yw = yawEnd + rng.range(-0.55, 0.55), el = elEnd + rng.range(-0.3, 0.25), d = rng.range(30, 85);
          return pEnd.clone().add(new THREE.Vector3(Math.sin(yw) * Math.cos(el), Math.sin(el), -Math.cos(yw) * Math.cos(el)).multiplyScalar(d)); })()
          : new THREE.Vector3(across * rng.range(4, 45), rng.range(12, 40), rng.range(-125, -210)),
        r: rng.range(4, 16), w: rng.sign() * rng.range(0.1, 0.25), a0: rng.range(0, TAU), dur: rng.range(6, 10), lift: rng.range(1.5, 3.2), vx, vf: rng.range(5.2, 7.5), climb: rng.range(0.4, 1.1),
        hz: rng.range(3.0, 4.2), ph: rng.range(0, TAU), span: rng.range(0.8, 1.05) });
    }
    // close passes: a few overtake the lens from behind at arm's length, beating hard, and fly on ahead
    const camV = LEN / DURATION;
    for (let i = 0; i < 9; i++) {
      const u = 0.4 + i * 0.026 + rng.range(0, 0.012), p = path.pointAt(u - 0.012, pq), sd = i % 2 ? 1 : -1;
      const hx = p.x + sd * rng.range(1.0, 2.4), hz = p.z + rng.range(-0.5, 0.5);
      crows.push({ sky: false, pass: true, u0: u, h: new THREE.Vector3(hx, p.y + rng.range(0.3, 1.3), hz),
        c: new THREE.Vector3(sd * rng.range(6, 30), rng.range(14, 36), rng.range(-130, -200)),
        r: rng.range(5, 14), w: rng.sign() * rng.range(0.1, 0.22), a0: rng.range(0, TAU), dur: rng.range(9, 13), lift: rng.range(0.2, 0.6), vx: sd * rng.range(-0.6, 0.4), vf: camV * rng.range(1.7, 2.3), climb: rng.range(0.3, 0.7),
        hz: rng.range(3.2, 4.0), ph: rng.range(0, TAU), span: rng.range(0.85, 1.05) });
    }
    // each crow: per wing an inner and an outer stroke and four primaries fanned at the tip, a body, a head, a tail
    const NK = 15, crowHi = [crowC2, C('#2A3A6A'), C('#30284A'), crowC2];
    const cset = makeSet();
    for (let i = 0; i < crows.length * NK; i++) cset.add(0, 0, -500, 0, 0, 0.1, 0, 0.05, i % 3 ? crowC : C('#141622'), rng.pick(crowHi), rng.range(0.25, 0.6), rng());
    const crowMesh = cset.mesh(strokeMat, 2, true); crowMesh.renderOrder = 2; scene.add(crowMesh);
    const aPc = crowMesh.geometry.getAttribute('aP'), aDc = crowMesh.geometry.getAttribute('aD');
    const put = (i, a, b, hw) => { const P = aPc.array, D = aDc.array, o = i * 4; P[o] = (a.x + b.x) / 2; P[o + 1] = (a.y + b.y) / 2; P[o + 2] = (a.z + b.z) / 2; D[o] = (b.x - a.x) / 2; D[o + 1] = (b.y - a.y) / 2; D[o + 2] = (b.z - a.z) / 2; D[o + 3] = hw; };
    const hide = (i) => { for (let k = 0; k < NK; k++) { const o = (i * NK + k) * 4; aPc.array[o + 1] = -500; aDc.array[o + 3] = 0; } };
    const cp = new THREE.Vector3(), cq = new THREE.Vector3(), E2 = new THREE.Vector3(), camP = new THREE.Vector3(), camR = new THREE.Vector3(), F = new THREE.Vector3(), Lv = new THREE.Vector3(), Up = new THREE.Vector3(), E = new THREE.Vector3(), Tt = new THREE.Vector3(), Bd = new THREE.Vector3();
    function crowAt(c, time, u, out) {
      const ring = (t) => { const a = c.a0 + c.w * t * TAU; return Tt.set(c.c.x + Math.cos(a) * c.r, c.c.y + Math.sin(a * 1.7) * c.r * 0.15, c.c.z + Math.sin(a) * c.r); };
      if (c.sky) return out.copy(ring(time)).addScaledVector(c.drift, time);
      const s = (u - c.u0) * DURATION;
      if (s <= 0) return null;
      // up out of the wheat in a second, then flapping on ahead of the lens a little faster than it flies, then away to wheel
      const T = ring(time), e = sstep(c.dur * 0.3, c.dur * 1.6, s);
      const fx = c.h.x + c.vx * s, fy = c.h.y + c.lift * (1 - Math.exp(-s * 2.0)) + c.climb * s, fz = c.h.z - c.vf * s;
      return out.set(lerp(fx, T.x, e), lerp(fy, T.y, e), lerp(fz, T.z, e));
    }

    const bufSize = new THREE.Vector2();
    // the journey's hour (vg-hours.js): sunset, a low orange-pink light in the pale strokes and the cloud, gone to dusk at the end
    const golden = ctx.vary && ctx.vary.hour === 'golden', skyU = dome.material.uniforms.uSky, skyBase = skyU.value.map((c) => c.clone());
    const SET_W = [0, 0, 0, 0.1, 0.5, 0.55, 0, 0, 0.6], fogBase = scene.fog.color.clone(), fogSet = new THREE.Color('#C87A62');   // the blues stay; the low light is in the pale strokes and the haze
    return {
      scene, path, duration: DURATION,
      title: 'Wheatfield with Crows',
      ride: 'none', style: 'none',
      camera: { fov: 58, near: 0.06, far: 4000, lookAhead: 12, sway: 0.5, bank: 0.35 },
      pois: [],
      // the hand-off hides in the wheat: a bare pane (the exact window, no rim) that fades in while the stalks fill the frame
      portal: { shape: 'rect', width: 6, height: 4, frame: 0, lens: 0, color: '#E8D4BC', veil: '#8A7A50', revealDistance: 14, blendDistance: 10, drawWithin: 2.7, drawIn: 0, fadeIn: [2.7, 1.8] },
      post: {
        exposure: 1.06,
        bloom: { strength: 0.2, radius: 0.5, threshold: 0.97 },
        grade: { saturation: 1.12, contrast: 1.06, tint: '#fff4e0', shadowTint: '#060a20', vignette: 0.34, grain: 0.035, aberration: 0 },
      },
      postAt: golden ? function (u) { return hourPost(this.post, [[0, { exposure: 1.04, tint: '#ffe8cc', shadowTint: '#140a24', saturation: 1.14 }], [0.5, { exposure: 1.02, tint: '#ffe0c4', shadowTint: '#120a28', saturation: 1.12 }], [1, { exposure: 1.0, tint: '#ffd4a8', shadowTint: '#140a24', saturation: 1.12 }]], u); } : undefined,
      update(dt, time, camera, u) {
        camP.setFromMatrixPosition(camera.matrixWorld); if (camP.lengthSq() === 0) camP.copy(camera.position);
        dome.position.copy(camP);
        // the sun lowering: its light grows in the pale strokes toward the sower's sunset
        if (golden) { const k = 0.45 + 0.55 * sstep(0.3, 1, u ?? 0); tintPalette(skyU.value, skyBase, '#F2A070', SET_W, k); scene.fog.color.copy(fogBase).lerp(fogSet, 0.6 * k); }
        ctx.renderer.getDrawingBufferSize(bufSize);
        SU.uWeave.value = 1.5708 * Math.min(1, 1080 / Math.max(1, bufSize.y));
        SU.uTime.value = time;
        camR.setFromMatrixColumn(camera.matrixWorld, 0);
        for (let i = 0; i < crows.length; i++) {
          const c = crows[i];
          const p0 = crowAt(c, time, u, cp); if (!p0) { hide(i); continue; }
          const p1 = crowAt(c, time + 0.06, u + 0.06 / DURATION, cq);
          F.subVectors(p1, p0); const v = F.length(); if (v > 1e-4) F.divideScalar(v); else F.set(0, 0, -1);
          const dist = p0.distanceTo(camP);
          const span = c.span * Math.max(1, dist * 0.09), hw = span * 0.05;
          // the wings spread across the flight, turned toward the picture plane so a crow always reads as a V
          Lv.crossVectors(F, Up.set(0, 1, 0)); if (Lv.lengthSq() < 1e-4) Lv.copy(camR); Lv.normalize();
          if (Lv.dot(camR) < 0) Lv.negate();
          Lv.lerp(camR, 0.6).normalize();
          Up.set(0, 1, 0);
          const s = c.sky ? 0 : (u - c.u0) * DURATION;
          const beat = c.sky ? 0.55 + 0.45 * Math.sin(time * 0.6 + c.ph) : 1;   // the far ones glide between bursts of beats
          const ph = time * TAU * c.hz * (c.sky ? 1 : 1 + 0.4 * Math.exp(-s)) + c.ph;
          const a1 = 0.28 + 0.6 * Math.sin(ph) * beat, a2 = a1 - 0.35 - 0.55 * Math.sin(ph - 0.9) * beat;
          Bd.copy(p0).addScaledVector(Up, -Math.sin(ph) * span * 0.06);
          const o = i * NK;
          for (let sd = -1, k = 0; sd <= 1; sd += 2, k++) {
            E.copy(Bd).addScaledVector(Lv, sd * Math.cos(a1) * span * 0.25).addScaledVector(Up, Math.sin(a1) * span * 0.25);       // the wrist
            Tt.copy(E).addScaledVector(Lv, sd * Math.cos(a2) * span * 0.3).addScaledVector(Up, Math.sin(a2) * span * 0.3);         // the tip
            put(o + k * 6, Bd, E, hw * 1.0);                                                                                       // coverts
            for (let f = 0; f < 5; f++) {            // flight feathers: from along the arm out to a fanned, fingered trailing edge
              cq.copy(Bd).lerp(E, 0.3 + f * 0.17);
              E2.copy(E).lerp(Tt, 0.35 + f * 0.17).addScaledVector(F, -span * (0.12 - f * 0.022));
              put(o + k * 6 + 1 + f, cq, E2, hw * (0.5 - f * 0.05));
            }
          }
          E.copy(Bd).addScaledVector(F, span * 0.13); Tt.copy(Bd).addScaledVector(F, -span * 0.1);
          put(o + 12, Tt, E, hw * 1.15);
          E2.copy(E).addScaledVector(F, span * 0.08).addScaledVector(Up, span * 0.01); put(o + 13, E, E2, hw * 0.7);
          E2.copy(Tt).addScaledVector(F, -span * 0.16).addScaledVector(Up, -span * 0.015); put(o + 14, Tt, E2, hw * 0.65);
        }
        aPc.needsUpdate = true; aDc.needsUpdate = true;
      },
      dispose() {},
    };
  },
};
