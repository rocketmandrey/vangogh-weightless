// VG RHONE: "Starry Night over the Rhone" (Arles, 1888) as a finale scene of the Van Gogh clip, a 30 s long take.
// Low on the near bank among moored boats, a slow drift: deep ultramarine water, the far quay of Arles with its
// gas lamps throwing long golden zig-zag columns across the river, the town a dark blue-violet silhouette with a
// few lit windows and a church tower, a couple strolling on the bank, the Big Dipper as seven flower-like stars in a
// green-blue stroke sky. No moon. Four planets hang as points among the stars and burst one after another
// (EXPLODE_AT; parts/vg-blasts.js): their bursts run down the river as moving columns of their pigments, the sky
// reflection in the water (the turning-night mirror) carries their glow and shock rings, a warm wash lights the quay.
// Painted by the-turning-night's hand: its hero dome (turned away from its moon and Wheel, moon off) is the sky and
// the river's mirror, its STROKE_FS paints every stroke (vg-night's flat strokes: 2-3 tones, bristles, dark rims).
// World space: +Y up, water at y = 0, the camera looks toward -Z across the river. Pure function of world time.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePath, makeRng, makeNoise, hashSeed } from '../kit/core.js';
import { STROKE_FS, PAINT_VS, PAINT_FS } from './the-turning-night.js';
import { buildHero } from '../parts/the-turning-night.js';
import { FLAT_VS, makeSet } from '../parts/vg-night.js';
import { paintFigure } from '../parts/vg-figure.js';
import { buildBlasts, scheduleFrom } from '../parts/vg-blasts.js';
import { buildTwist, TWIST_MODES } from '../parts/vg-canvas-twist.js';

// blast times in seconds of world time (retime to the music); which planet bursts at each is ORDER below
export const EXPLODE_AT = [6, 11, 16, 21];
export const DURATION = 30;
const FINE = 2, SKY_SLOW = 0.3;

const TAU = Math.PI * 2, D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// every planet of the roster has a place in this sky (az/el degrees from the camera, az 0 = -Z), so an earlier
// world's bursts can hang here as remnants (&blasts=before:...); by default four burst here and the rest are hidden
// (the journey: the three that burst before, over the city and the road, stand where they stood in the road's sky, its
// azimuths + 8 deg, the turn between the road's last look and this world's first, so the hand-off keeps them in place;
// the journey's last two burst here, violet and ice)
const PLACE = [
  { id: 'sunflower', az: -28, el: 12, dist: 420, ang: 7.5 },
  { id: 'rose', az: 16, el: 9, dist: 420, ang: 8.5 },
  { id: 'ice', az: -4, el: 26, dist: 460, ang: 7 },
  { id: 'violet', az: 33, el: 20, dist: 440, ang: 7.5 },
  { id: 'cafe', az: -30, el: 16, dist: 440, ang: 7.5 },
  { id: 'cobalt', az: -18, el: 20, dist: 480, ang: 8 },
  { id: 'cypress', az: 10, el: 27, dist: 480, ang: 11 },
  { id: 'emerald', az: -12, el: 8, dist: 420, ang: 6 },
];
const ORDER = ['sunflower', 'rose', 'ice', 'violet'];

export default {
  id: 'vg-rhone',
  name: 'Starry Night over the Rhône',
  category: 'sky',
  weirdness: 0.5,
  media: ['air'],
  async build(ctx) {
    const rng = makeRng(hashSeed('vg-rhone:scene'));
    const noise = makeNoise(hashSeed('vg-rhone:noise'));
    const H = (h) => new THREE.Color(h);
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const mixc = (a, b, t) => a.clone().lerp(b, clamp(t, 0, 1));
    const scene = new THREE.Scene();
    scene.background = H('#0B1A4A');
    scene.fog = new THREE.FogExp2(H('#14306A'), 0.0022);

    // ---------- the sky: the turning night's dome turned away from its moon and Wheel, green-blue, no moon ----------
    const hero = await buildHero({ ...ctx, rng: makeRng(hashSeed('vg-rhone:sky')) },
      { palette: ['#0A2250', '#1F4E96', '#7FC0C8', '#F2D860', '#22625E', '#122A2A', '#E8902A'], mirror: false, gate: false });
    const qr = (typeof location !== 'undefined') ? new URLSearchParams(location.search).get('vgrot') : null;
    hero.object.rotation.y = Math.PI + (qr ? Number(qr) : 1.0);   // turned so no whirlpool star crowds the Dipper
    const HU = hero.uniforms;
    HU.uGain.value = 0.95; HU.uCellK.value = 1 / FINE; HU.uStreak.value = 1; HU.uMoonK.value.set(0, 1, 0); HU.uStarK.value = 0.4;
    scene.add(hero.object);
    await ctx.yield();

    // ---------- the camera: low on the near bank among the boats, a slow drift out over the water's edge ----------
    const q = (typeof location !== 'undefined') ? new URLSearchParams(location.search) : null;
    const dbg = q && q.get('vgcam') ? q.get('vgcam').split(',').map(Number) : null;   // dev aid: x,z,eyeY,yawDeg,pitchDeg,travel
    const [CX, CZ, EY, YAW, PITCH, TRAVEL] = dbg || [0.6, 6.2, 1.4, 8, 3, 1.6];
    const flatG = new THREE.Vector3(Math.sin(YAW * D2R), 0, -Math.cos(YAW * D2R));
    const gaze = new THREE.Vector3(Math.sin(YAW * D2R) * Math.cos(PITCH * D2R), Math.sin(PITCH * D2R), -Math.cos(YAW * D2R) * Math.cos(PITCH * D2R));
    const side = new THREE.Vector3(-gaze.z, 0, gaze.x).normalize();
    const e0 = new THREE.Vector3(CX, EY, CZ);
    const journey = (ctx.vary && ctx.vary.duration > 0);
    // journey: it comes in from the road's horizon: level, 3 m over the rise of the near bank, 14 m back from the water, the
    // river and the town's lamps opening up below; it glides down to the bank among the boats (still at the road's pace,
    // braking), drifts as composed, and then pulls back slowly and steadily along the bank, rising, the gaze on the river:
    // the whole sky, every new star-whirl over the water (the path runs 1 m past the last pose: a last world stops 1 m short of its end)
    const up = new THREE.Vector3(0, 1, 0), back = gaze.clone().setY(0).normalize().negate();
    const J = (f, sd, u, b) => e0.clone().addScaledVector(gaze, f).addScaledVector(side, sd).addScaledVector(up, u).addScaledVector(back, b);
    const K = (f, sd, u) => e0.clone().addScaledVector(flatG, f).addScaledVector(side, sd).addScaledVector(up, u);   // level offsets
    const path = journey ? makePath([K(-14, 0, 2.4), K(-11.5, 0, 2.4), K(-8, 0.05, 1.95), K(-4.6, 0.1, 0.95), K(-1.9, 0.05, 0.22), J(0, 0, 0, 0), J(1.0, 0.15, 0, 0), J(2.0, 0.2, 0.05, 0), J(2.3, -0.5, 0.5, 0.8), J(1.6, -1.8, 1.4, 3.2), J(0.6, -3.0, 2.4, 6.0), J(0, -3.6, 2.9, 8.0), J(-0.2, -3.8, 3.05, 9.0)])
      : makePath([e0.clone(), e0.clone().addScaledVector(gaze, TRAVEL * 0.5).addScaledVector(side, 0.25), e0.clone().addScaledVector(gaze, TRAVEL)]);
    const eyeMid = e0.clone().addScaledVector(gaze, TRAVEL * 0.5);
    const uOf = (d0) => { const q = new THREE.Vector3(); let best = 0, bd = 1e9; for (let i = 0; i <= 800; i++) { path.pointAt(i / 800, q); const dd = q.distanceTo(d0); if (dd < bd) { bd = dd; best = i / 800; } } return best; };
    const uBack = journey ? uOf(J(2.0, 0.2, 0.05, 0)) : 1, uArr = journey ? uOf(J(0, 0, 0, 0)) : 0;

    // ---------- the land ----------
    // the near bank's water line (z of the edge at x): a point of bank juts out on the right, where the couple walks
    const edgeZ = (x) => 3.2 + 0.5 * Math.sin(x * 0.21) - 12 * sstep(0.5, 10, x) + 3 * sstep(-6, -16, x);
    const bankY = (x, z) => { const e = z - edgeZ(x); return -0.25 + 0.6 * sstep(-0.3, 1.6, e) + 0.3 * sstep(2, 12, e) + 0.06 * noise.n2(x * 0.4, z * 0.4); };
    // the far quay: its wall face z at x (curving away to both sides), wall top at QH
    const quayZ = (x) => -150 - 0.00022 * (x + 40) * (x + 40);
    const QH = 3.2;

    // ---------- materials ----------
    const SU = {
      uTime: { value: 0 }, uMinW: { value: 0.0016 }, uGain: { value: 1.0 }, uWeave: HU.uWeave,
      uFlash: { value: new THREE.Vector3() }, uFlashD: { value: new THREE.Vector3(0, 1, 0) },
      uCreep: { value: 0 }, uWind: { value: new THREE.Vector4(0, 1, 0, 0) }, uFine: { value: FINE },
    };
    const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
    const strokeMat = (fade, fog = true) => new THREE.ShaderMaterial({
      uniforms: Object.assign(fogU(), SU, { uFade: { value: new THREE.Vector2(fade[0], fade[1]) } }),
      vertexShader: FLAT_VS, fragmentShader: STROKE_FS, side: THREE.DoubleSide, fog,
    });
    const nearMat = strokeMat([900, 1400]), skyMat = strokeMat([3000, 4000], false);
    const paintMat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU), vertexShader: PAINT_VS, fragmentShader: PAINT_FS, fog: true, side: THREE.DoubleSide });
    const S = makeSet(rng); S.tones = true;
    const bases = [];
    const colGeo = (g, colFn) => {
      g = g.index ? g.toNonIndexed() : g; if (g.getAttribute('uv')) g.deleteAttribute('uv');
      const p = g.getAttribute('position'), a = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const c = colFn(p.getX(i), p.getY(i), p.getZ(i)); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); bases.push(g);
    };
    const camXZ = new THREE.Vector2(eyeMid.x, eyeMid.z);
    const dCam = (x, z) => Math.hypot(x - camXZ.x, z - camXZ.y);

    // ---------- the river: the sky's mirror broken into dashes, and ripples of painted strokes over it ----------
    {
      const g = new THREE.PlaneGeometry(3200, 1600, 1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, -700);
      const water = new THREE.Mesh(g, hero.makeMirrorMaterial({ dim: 0.62, rowHeight: 0.0042 }));
      water.name = 'rhone-water'; water.frustumCulled = false; scene.add(water);
      const WC = ['#0B1A4A', '#132A6A', '#1B3A8A', '#2348A8', '#1E4E5A', '#22305E', '#2A4A9A'].map(H), LT = ['#5A8AC8', '#7FB2E5', '#4E9A9A', '#8CA8D8'].map(H);
      const h = eyeMid.y;
      for (let ang = Math.atan(h / 150); ang < Math.atan(h / 1.2); ang += 0.0052 * rng.range(0.85, 1.15)) {
        const d = h / Math.tan(ang), hl0 = d * 0.011, hw0 = Math.max(0.025, 0.0024 * d * d / h);
        const half = d * 1.15 + 4;
        for (let x = camXZ.x - half + rng.range(0, hl0); x < camXZ.x + half; x += hl0 * rng.range(1.7, 2.6)) {
          const z = camXZ.y - Math.sqrt(Math.max(0, d * d - (x - camXZ.x) ** 2)) + rng.range(-hw0, hw0);
          if (z > edgeZ(x) - 0.2 || z < quayZ(x) + 1) continue;
          if (rng() < 0.35) continue;                       // the mirror shows between the ripples
          const lt = rng() < 0.16, col = lt ? pick(LT) : pick(WC), hl = hl0 * rng.range(0.7, 1.3);
          S.add(x, 0.012, z, hl, 0, rng.range(-0.04, 0.04) * hl, hw0 * rng.range(0.7, 1.1), col, 0, 0, 1, 0, rng.range(-0.15, 0.15));
        }
        await ctx.yield();
      }
    }
    await ctx.yield();

    // ---------- the near bank: blue-green and ochre strokes, stones and tufts at the water's edge ----------
    {
      const g = new THREE.PlaneGeometry(80, 40, 160, 80); g.rotateX(-Math.PI / 2); g.translate(0, 0, 10);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) p.setY(i, bankY(p.getX(i), p.getZ(i)));
      g.computeVertexNormals();
      const c1 = H('#1E3A4A'), c2 = H('#3A5A3A'), c3 = H('#5A4A3A');
      colGeo(g, (x, y, z) => mixc(mixc(c1, c2, sstep(0, 2.5, z - edgeZ(x))), c3, 0.3 + 0.3 * noise.n2(x * 0.3, z * 0.3)).multiplyScalar(0.6));
      const BANK = ['#2E5A5A', '#3A6A4A', '#2A4A6A', '#3F6AA8', '#2E5A8A', '#4E7A5A', '#6A7AA0', '#8C78B0', '#9A8A5A', '#5A6A8A', '#1E4E5A', '#2A3A6A'].map(H);
      const STONE = ['#6A6A8A', '#8C88A8', '#4A5A7A', '#A898B0', '#5A4A5A'].map(H);
      // rows evenly spaced on screen (by depression angle from the eye), long flat diagonal strokes lying on the land
      const h = eyeMid.y - 0.25;
      for (let ang = Math.atan(h / 40); ang < Math.atan(h / 0.9); ang += 0.006 * rng.range(0.85, 1.15)) {
        const d = h / Math.tan(ang), hl0 = Math.max(0.05, d * 0.018), hw0 = Math.max(0.018, 0.0028 * d * d / h);
        const half = d * 1.15 + 3;
        for (let x = camXZ.x - half + rng.range(0, hl0); x < camXZ.x + half; x += hl0 * rng.range(1.1, 1.6)) {
          const z = camXZ.y - Math.sqrt(Math.max(0, d * d - (x - camXZ.x) ** 2)) + rng.range(-hw0, hw0);
          const e = z - edgeZ(x); if (e < -0.1) continue;
          const wet = e < 0.6, col = wet ? (rng() < 0.6 ? pick(STONE) : pick(BANK)) : pick(BANK);
          const a = rng.range(-0.35, 0.35) + 0.5, hl = hl0 * rng.range(0.8, 1.3);
          S.add(x, bankY(x, z) + 0.015, z, Math.cos(a) * hl, 0, Math.sin(a) * hl, hw0 * rng.range(0.8, 1.2), col, 0, 0, 1, 0, rng.range(-0.06, 0.06));
        }
        await ctx.yield();
      }
      // the water's edge: a pale broken line of foam and wet stone
      for (let x = camXZ.x - 26; x < camXZ.x + 26; x += 0.09 * (1 + Math.abs(x - camXZ.x) * 0.05)) {
        const z = edgeZ(x) + rng.range(-0.05, 0.08), d = dCam(x, z), k = 0.5 + d * 0.1;
        S.add(x, 0.03, z, 0.09 * k, 0, rng.range(-0.02, 0.02), 0.025 * k, pick([H('#3A5A8A'), H('#4E6A9A'), H('#2A4A7A'), H('#5A6A8A')]), 0, 0, 1, 0);
      }
      // a mooring post or two
      for (const [x, z] of [[-4.6, 3.9]]) {
        const y = bankY(x, z + 0.3);
        for (let i = 0; i < 9; i++) S.add(x + rng.range(-0.03, 0.03), y + 0.06 + i * 0.1, z, rng.range(-0.01, 0.01), 0.07, 0, 0.06, pick([H('#3A2A1A'), H('#5A3A20'), H('#2A1E18')]), 0);
      }
    }
    await ctx.yield();

    // ---------- the far quay: stone wall, walkway, gas lamps, the town above it ----------
    const LAMPS = [];
    {
      const WALL = ['#2A3A7A', '#3A4A8A', '#22306A', '#4A4A8A', '#2E4A7A'].map(H);
      const WALLW = ['#C88A3A', '#B87A3A', '#E0A050', '#8A6A5A'].map(H);
      for (let x = -340; x < 300; x += 12) {                       // the wall: a base slab per span
        const z0 = quayZ(x), z1 = quayZ(x + 12);
        const gw = new THREE.BoxGeometry(12.2, QH, 6); gw.rotateY(Math.atan2(z0 - z1, 12)); gw.translate(x + 6, QH / 2, (z0 + z1) / 2 - 3);
        colGeo(gw, () => H('#1A2458'));
      }
      // lamps along the quay, every 13-17 m
      for (let x = -300; x < 260; x += rng.range(13, 17)) LAMPS.push(new THREE.Vector3(x, QH + 4.2, quayZ(x) - 1.2));
      const warmAt = (x, y) => { let w = 0; for (const L of LAMPS) { const dx = x - L.x; if (Math.abs(dx) < 14) w += Math.exp(-(dx * dx) / 18 - ((y - L.y) ** 2) / 30); } return Math.min(1, w); };
      for (let x = -330; x < 290; x += rng.range(0.55, 0.75)) {
        const z = quayZ(x) + 0.05;
        for (let y = 0.2; y < QH; y += 0.42) {
          const w = warmAt(x, y), col = w > 0.25 ? mixc(pick(WALL), pick(WALLW), w) : pick(WALL);
          S.add(x, y + rng.range(-0.1, 0.1), z, 0.42, rng.range(-0.06, 0.06), 0, 0.2, col, 0, 0, 0, 1);
        }
        S.add(x, QH + 0.05, z - 0.4, 0.4, 0, 0, 0.35, mixc(H('#3A4A8A'), H('#D8A050'), warmAt(x, QH) * 0.8), 0, 0, 1, 0);   // the walkway's lip
      }
      // the town: blocks of houses behind the quay, dark blue-violet, some windows lit, a church tower
      const HOUSE = [['#1A2458', '#22306E', '#2A2A6A', '#1E3A6A'], ['#2A2458', '#3A2E6A', '#22306E', '#30306A'], ['#1E3A5A', '#1E4E5A', '#22406A', '#14303A']].map((a) => a.map(H));
      const LIT = ['#F2A030', '#F6C84A', '#E88A24', '#F8D870'].map(H);
      const RIM = ['#4E6AB0', '#3F6AA8', '#5A7AB8', '#6A5AA8'].map(H);
      const house = (x0, w, h, back, pal) => {
        const zf = quayZ(x0 + w / 2) - 4 - back;
        const gb = new THREE.BoxGeometry(w, h, 8); gb.translate(x0 + w / 2, QH + h / 2, zf - 4);
        colGeo(gb, () => pal[0].clone().multiplyScalar(0.55));
        for (let y = QH + 0.3; y < QH + h; y += 0.55) for (let x = x0 + 0.2; x < x0 + w; x += rng.range(0.6, 0.85)) {
          const col = y > QH + h - 0.7 ? pick(RIM) : pick(pal);
          S.add(x, y + rng.range(-0.12, 0.12), zf + 0.05, 0.1 * rng.range(-1, 1), 0.35, 0, 0.24, col, 0, 0, 0, 1, rng.range(-0.15, 0.15));
        }
        for (let wy = QH + 1.6; wy < QH + h - 1.2; wy += 2.8) for (let wx = x0 + 1.2; wx < x0 + w - 1; wx += 2.6) {
          const lit = rng() < 0.22;
          for (let k = 0; k < 3; k++) S.add(wx + rng.range(-0.2, 0.2), wy + rng.range(-0.3, 0.3), zf + 0.12, 0.08, 0.38, 0, 0.26, lit ? pick(LIT) : H('#0E1438'), lit ? rng.range(0.9, 1.6) : 0, 0, 0, 1);
        }
        for (let x = x0; x < x0 + w; x += 0.8) S.add(x, QH + h + 0.15, zf - 0.5, 0.5, rng.range(-0.08, 0.08), 0, 0.22, H('#101840'), 0, 0, 0, 1);   // roof edge
        if (rng() < 0.45) for (let y = 0.3, gh = w * rng.range(0.25, 0.4); y < gh; y += 0.5) {                                     // a gable
          const half = (w / 2) * (1 - y / gh);
          for (let x = -half; x < half; x += 0.7) S.add(x0 + w / 2 + x, QH + h + y, zf + 0.04, 0.05, 0.3, 0, 0.24, y > gh - 0.8 || Math.abs(x) > half - 0.7 ? pick(RIM) : pick(pal), 0, 0, 0, 1);
        }
        if (rng() < 0.4) { const cx = x0 + rng.range(1, w - 1); for (let i = 0; i < 4; i++) S.add(cx, QH + h + 0.5 + i * 0.45, zf - 1.5, 0, 0.3, 0, 0.35, H('#141C4A'), 0); }
      };
      for (let x = -330; x < 170;) {
        const w = rng.range(6, 12), h = rng.range(4.5, 10) * (1 - 0.4 * sstep(60, 170, x)), back = rng.range(0, 6);
        house(x, w, h, back, pick(HOUSE));
        if (rng() < 0.35) house(x + rng.range(-2, 2), rng.range(6, 10), h + rng.range(2.5, 6), back + 10, pick(HOUSE));   // a second row over the first
        x += w + rng.range(-0.5, 1.5);
        if (Math.round(x) % 5 === 0) await ctx.yield();
      }
      // the church tower and its spire
      {
        const tx = -58, zf = quayZ(tx) - 16, th = 26;
        const gb = new THREE.BoxGeometry(6, th, 6); gb.translate(tx, QH + th / 2, zf - 3); colGeo(gb, () => H('#1A2050'));
        for (let y = QH; y < QH + th; y += 0.5) for (let x = tx - 2.9; x < tx + 3; x += 0.6) S.add(x, y, zf + 0.05, 0.05, 0.32, 0, 0.24, y > QH + th - 2 ? pick(RIM) : pick(HOUSE[1]), 0, 0, 0, 1);
        for (let i = 0; i < 40; i++) { const t = i / 40, hw = 3 * (1 - t); S.add(tx + rng.range(-hw, hw), QH + th + t * 11, zf - 1, 0.05, 0.4, 0, 0.22, pick(RIM).clone().multiplyScalar(0.7), 0, 0, 0, 1); }
        S.add(tx, QH + th - 4, zf + 0.15, 0, 0.5, 0, 0.5, H('#F6C84A'), 1.4, 0, 0, 1);   // a lit clock face
      }
      // trees and low roofs to the right, where the quay runs off
      for (let i = 0; i < 1400; i++) {
        const x = rng.range(150, 300), zf = quayZ(x) - rng.range(4, 20), y = QH + rng.range(0, 9) * (1 - 0.5 * sstep(150, 300, x));
        S.add(x, y, zf, rng.range(-0.3, 0.3), 0.4, 0, 0.3, pick([H('#14303A'), H('#1E4E5A'), H('#1A2458'), H('#22406A')]), 0);
      }
      // the lamps: a dark post, a lantern of emissive strokes and a rosette halo; the warm light on the walkway
      for (const L of LAMPS) {
        for (let i = 0; i < 8; i++) S.add(L.x + rng.range(-0.04, 0.04), QH + 0.25 + i * 0.5, L.z, 0, 0.27, 0, 0.09, H('#0E1230'), 0);
        S.add(L.x, L.y, L.z, 0, 0.28, 0, 0.22, H('#FFF4C0'), 4.2);
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; S.add(L.x + Math.cos(a) * 0.3, L.y, L.z + 0.3, 0, 0.3, 0, 0.1, pick([H('#FFE070'), H('#F6C84A'), H('#FFB040')]), 2.8); }
        for (let k = 0; k < 2; k++) {
          const n = 12 + 6 * k, r0 = 0.9 + 0.8 * k;
          for (let i = 0; i < n; i++) {
            const a = (i + rng.range(-0.25, 0.25)) / n * TAU, ca = Math.cos(a), sa = Math.sin(a), r = r0 * rng.range(0.9, 1.1);
            S.add(L.x + ca * r, L.y + sa * r, L.z + 0.4, ca * 0.28, sa * 0.28, 0, 0.11, pick([H('#F6E070'), H('#F0A840'), H('#E8D890'), H('#C8E070')]), (1.5 - 0.6 * k) * rng.range(0.8, 1.1), 0, 0, 0, 0.1);
          }
        }
        for (let i = 0; i < 14; i++) S.add(L.x + rng.range(-3.5, 3.5), QH + 0.08, L.z + rng.range(-0.8, 0.9), 0.4, 0, 0, 0.28, pick([H('#E0A050'), H('#F0C060'), H('#C88A3A')]), 0.35, 0, 1, 0);
      }
    }
    await ctx.yield();

    // ---------- the lamps' reflections: long columns of golden dashes zig-zagging across the river to us ----------
    {
      const GOLD = ['#F6D54A', '#F0B030', '#F8E890', '#E8902A', '#FFE070', '#F2C040'].map(H);
      const h = eyeMid.y;
      for (const L of LAMPS) {
        // wind-ruffled water spreads each lamp's mirror image into a column from the far bank down toward us:
        // dashes spaced evenly in depression angle (on screen), zig-zagging either side of the lamp's azimuth
        const dx = L.x - camXZ.x, dz = L.z - camXZ.y, D = Math.hypot(dx, dz), fx = dx / D, fz = dz / D;
        if (Math.abs(Math.atan2(dx, -dz)) > 55 * D2R) continue;
        const dep0 = Math.atan(h / (D - 3)), dep1 = rng.range(7, 13) * D2R, n = 30, sw = rng.range(0.7, 1.3);
        for (let i = 0; i < n; i++) {
          const t = (i + rng.range(0, 0.6)) / n, dep = dep0 + (dep1 - dep0) * Math.pow(t, 1.25), d = h / Math.tan(dep);
          const zz = ((i % 2 ? 1 : -1) * rng.range(0.4, 1) + rng.range(-0.3, 0.3)) * 0.009 * sw * (1 + t), hl = d * rng.range(0.006, 0.012) * (1 - 0.45 * t);
          const x = camXZ.x + fx * d - fz * zz * d, z = camXZ.y + fz * d + fx * zz * d;
          if (z > edgeZ(x) - 0.4) break;
          const hw = Math.max(0.03, 0.0021 * d * d / h), em = (1.7 - 1.2 * t) * rng.range(0.7, 1.1);
          S.add(x, 0.04, z, -fz * hl, 0, fx * hl, hw, pick(GOLD), em, 0, 1, 0, rng.range(-0.1, 0.1), [-fz * d * 0.002, 0, fx * d * 0.002, rng.range(1.2, 2.2)]);
        }
      }
      // the town's lit windows: short dim dashes on the far water
      for (let i = 0; i < 160; i++) {
        const x = rng.range(-300, 150), z = quayZ(x) + rng.range(3, 25), d = dCam(x, z);
        S.add(x, 0.03, z, d * 0.006, 0, 0, Math.max(0.05, 0.0019 * d * d / h), pick(GOLD), 0.5, 0, 1, 0);
      }
    }
    await ctx.yield();

    // ---------- the boats: two moored rowboats at the water's edge, rocking a little ----------
    const movers = [];
    function boat(len, beam, hull, rim, inner, seed) {
      const s = makeSet(rng); s.tones = true;
      const r2 = makeRng(hashSeed('vg-rhone:boat:' + seed));
      const bw = (t) => beam * Math.pow(Math.max(0, 1 - t * t), 0.8), depth = 0.5, sheer = (t) => 0.4 + 0.3 * t * t * t * t;
      for (let i = 0; i <= 30; i++) {
        const t = i / 15 - 1, x = t * len / 2, b = bw(t);
        for (const sd of [-1, 1]) {
          for (let k = 0; k < 4; k++) {                        // hull planks down the side
            const v = k / 3, y = sheer(t) - v * depth, zz = sd * b * (1 - 0.35 * v * v);
            const c = v < 0.2 ? pick(rim) : pick(hull).clone().multiplyScalar(1 - 0.35 * v);
            s.add(x, y, zz, len / 30 * 0.75, -0.02 * t, 0, 0.075, c, 0, 0, 0.25 * v, sd, r2.range(-0.1, 0.1));
          }
          s.add(x, sheer(t) + 0.02, sd * b * 0.95, len / 30 * 0.8, 0, 0, 0.04, H('#1A1410'), 0, 0, 1, 0);   // gunwale
          for (let k = 0; k < 2; k++) s.add(x, sheer(t) - 0.2 - k * 0.12, sd * b * (0.75 - 0.25 * k), len / 30 * 0.7, 0, 0, 0.07, pick(inner), 0, 0, 0.6, -sd);   // inside
        }
        if (i % 3 === 0) s.add(x, sheer(t) - 0.35, 0, 0, 0, b * 0.8, 0.09, pick(inner).clone().multiplyScalar(0.7), 0, 0, 1, 0);   // floor boards
      }
      for (const t of [-0.2, 0.35]) s.add(t * len / 2, sheer(t) - 0.08, 0, 0.09, 0, bw(t) * 0.95, 0.07, pick(inner), 0, 0, 1, 0);       // thwarts
      s.add(0.1, sheer(0) - 0.05, 0.1, len * 0.35, 0.05, 0.12, 0.035, H('#C8A060'), 0);                                                   // an oar
      for (let i = 0; i <= 30; i++) { const t = i / 15 - 1; s.add(t * len / 2, 0.0, 0, len / 30, 0, 0, bw(t) * 1.05, H('#060a22'), 0, 0, 1, 0); }   // the dark of the waterline
      // its reflection: dark broken dashes on the water under the hull
      for (let i = 0; i < 26; i++) { const t = r2.range(-0.9, 0.9); s.add(t * len / 2, -0.02 - 0.0, r2.range(-1, 1) * beam * 1.2, len / 14, 0, 0, 0.05, mixc(hull[0], H('#05081A'), 0.55), 0, 0, 1, 0); }
      return s;
    }
    {
      const BL = ['#2348A8', '#2A50B0', '#3A6AC0', '#1E3A8A'].map(H), RD = ['#D8702A', '#E07A30', '#C86A28'].map(H), IN = ['#B88A40', '#8A6A30', '#C89A50'].map(H);
      const GR = ['#2E6A5A', '#3A7A5A', '#1E5A4A'].map(H), WH = ['#E8E0C8', '#D8D8B8', '#C8D0C0'].map(H), IN2 = ['#5A4A30', '#7A5A30', '#4A3A28'].map(H);
      for (const [s, x, z, yaw, ph] of [[boat(4.2, 0.72, BL, RD, IN, 1), -3.0, 0.4, 0.42, 0], [boat(3.6, 0.64, GR, WH, IN2, 2), 2.2, -0.9, -0.55, 1.7]]) {
        const m = s.mesh(nearMat); m.name = 'boat'; scene.add(m);
        movers.push((t) => { m.position.set(x, 0.05 + 0.025 * Math.sin(t * 0.9 + ph), z); m.rotation.set(0.03 * Math.sin(t * 0.7 + ph), yaw, 0.04 * Math.sin(t * 0.8 + ph + 1)); });
      }
    }
    await ctx.yield();

    // ---------- the couple strolling along the bank's point, arm in arm, toward us ----------
    {
      // two figures (parts/vg-figure.js) in their own set and rng: the man in a blue suit and dark hat, the woman on his
      // arm in a dark dress with a pale cap; lit warm from the quay's gas lamps on their left
      const frng = makeRng(hashSeed('vg-rhone:couple')), s = makeSet(frng);
      const lt = { light: [0.6, 0.8], warm: 0.45, hot: H('#E8B050'), kind: 'walk', y: 0, z: 0, face: 0, stride: 1.3 };
      const man = paintFigure(s, frng, { ...lt, x: -0.2, coat: H('#3A5A9A'), legs: H('#2A3A6A'), hat: 'felt', noArm: 1 });
      paintFigure(s, frng, { ...lt, x: 0.2, woman: true, dress: H('#2A2440'), blouse: H('#3A2E50'), hat: 'cap', noArm: -1 });
      // the linked arms: his right forearm across to her side
      const a = man.P(0.18, 1.3, 0.02), b = man.P(0.36, 1.12, 0.08);
      s.add((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, (b[0] - a[0]) / 2, (b[1] - a[1]) / 2, (b[2] - a[2]) / 2, 0.045, H('#0A1230'), 0, 0, 0, 0, 0.1, man.sway, man.hs);
      s.add((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 + 0.02, (b[0] - a[0]) / 2 * 0.9, (b[1] - a[1]) / 2 * 0.9, (b[2] - a[2]) / 2 * 0.9, 0.028, H('#3A5A9A'), 0, 0, 0, 0, 0.1, man.sway, man.hs);
      const m = s.mesh(nearMat); m.name = 'couple'; scene.add(m);
      const p0 = new THREE.Vector3(7.5, 0, -5.6), v = new THREE.Vector3(-0.2, 0, 0.5).normalize().multiplyScalar(0.06);
      movers.push((t) => { const x = p0.x + v.x * t, z = p0.z + v.z * t; m.position.set(x, bankY(x, z) + 0.012 * Math.abs(Math.sin(t * 1.3)), z); m.rotation.y = Math.atan2(v.x, v.z); });
    }
    await ctx.yield();

    // ---------- stars: the Big Dipper as seven flower-like rosettes, and smaller stars round it ----------
    const SK = makeSet(rng);
    {
      const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      const PET = ['#F8F0C0', '#E8F0A0', '#FFF8E0', '#F6E070', '#F2D860'].map(H), OUT = ['#7FC0C8', '#A8D0C8', '#C8E0A0', '#E8E890', '#5AA0A0'].map(H);
      const star = (az, el, R, bright) => {
        dir.set(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R));
        const c = eyeMid.clone().addScaledVector(dir, 600);
        e1.crossVectors(up, dir).normalize(); e2.crossVectors(dir, e1);
        const at = (a, r) => c.clone().addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r);
        SK.add(c.x, c.y, c.z, e2.x * R * 0.1, e2.y * R * 0.1, e2.z * R * 0.1, R * 0.2, H('#FFFCE8'), 2.8 * bright);
        const np = rng.int(7, 10), a0 = rng.range(0, TAU);
        for (let i = 0; i < np; i++) {
          const a = a0 + (i + rng.range(-0.15, 0.15)) / np * TAU, p = at(a, R * 0.45), d = at(a, R * 0.45 + 1).sub(p);
          SK.add(p.x, p.y, p.z, d.x * R * 0.22, d.y * R * 0.22, d.z * R * 0.22, R * 0.1, pick(PET), 1.5 * bright * rng.range(0.8, 1.1), 0, 0, 0, 0.2);
        }
        for (let ring = 0; ring < 2; ring++) {
          const no = rng.int(12, 18) + ring * 6, rr = R * (0.85 + ring * 0.45);
          for (let i = 0; i < no; i++) {
            const a = a0 + (i + 0.5) / no * TAU, p = at(a, rr), d = at(a + 0.05, rr).sub(p).normalize();
            SK.add(p.x, p.y, p.z, d.x * R * 0.18, d.y * R * 0.18, d.z * R * 0.18, R * 0.06, pick(OUT), (0.6 - 0.25 * ring) * bright, 0, 0, 0, 0.15);
          }
        }
      };
      // Alkaid, Mizar, Alioth, Megrez | Phecda, Merak, Dubhe (degrees on the sky, x right, y up), set above the town
      const DIP = [[0, 0], [4.8, 2.0], [8.8, 2.5], [12.6, 1.9], [13.4, -2.6], [20.0, -2.2], [19.8, 3.2]];
      DIP.forEach(([x, y], i) => star(-5 + x * 1.0, 14.5 + y * 1.0 + x * 0.1, 7.5 * (i === 6 || i === 5 ? 1.15 : 1), 1.05));
      for (let i = 0; i < 46; i++) {
        const az = rng.range(-55, 60), el = rng.range(6, 40);
        if (el < 21 && el > 10 && az > -8 && az < 18) continue;
        star(az, el, rng.range(2.2, 4.2), rng.range(0.55, 0.85));
      }
    }

    // ---------- assemble ----------
    const baseMesh = new THREE.Mesh(mergeGeometries(bases), paintMat); baseMesh.frustumCulled = false; baseMesh.name = 'painted-bases';
    for (const g of bases) g.dispose();
    const strokes = S.mesh(nearMat); strokes.name = 'rhone-strokes';
    const stars = SK.mesh(skyMat); stars.name = 'dipper-stars';
    scene.add(baseMesh, strokes, stars);
    await ctx.yield();

    // ---------- the planets ----------
    const schedule = scheduleFrom(ctx, { before: [], here: ORDER.map((id, i) => ({ id, t: EXPLODE_AT[i] })), hide: PLACE.map((p) => p.id).filter((id) => !ORDER.includes(id)) });
    const blasts = await buildBlasts(ctx, { scene, uniforms: SU, eye: eyeMid, place: PLACE, schedule, hero, seed: 'vg-rhone:planets', fine: FINE, pointScale: 1.7, boost: 1.9,
      flashFrom: new THREE.Vector3(0, 0, -60), flashGain: 0.4, water: { y: 0, width: 0.03, near: 3.5, far: 150 } });

    // ---------- the journey's ending (schedule.freeze, schedule.earth; both off on their own) ----------
    // freeze [a, b] world s: from a the whole painting slows and from b it stands still (sky, whirls, water, boats), the lens
    // still pulling back: warp() is the slowed clock, its rate 1 - smoothstep(a, b, t), integrated in closed form
    const FZ = schedule.freeze || null;
    const warp = (t) => { if (!FZ || t <= FZ[0]) return t; const w = FZ[1] - FZ[0], x = Math.min(1, (t - FZ[0]) / w); return FZ[0] + w * (x - x * x * x + x * x * x * x / 2); };
    // earth [t0, t1] world s: our own planet bursts from the far water at t0 (a drum hit) and takes river, town and boats with
    // it, and everything collapses into the flat canvas: the frame at t0 is kept (a snapshot, so from then on there is no depth
    // and no parallax) and redrawn over the scene by a full-frame quad that flings it out from the blast and smears it into
    // brushstrokes; at t1 (the next hit) the sky closes into Van Gogh's whirls. A pure function of world time.
    const EB = schedule.earth || null;
    const snapRT = EB ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }) : null;
    const OU = { tSnap: { value: snapRT && snapRT.texture }, uS: { value: 0 }, uS2: { value: 0 }, uAsp: { value: 16 / 9 }, uC: { value: new THREE.Vector2(0, -0.12) } };
    const overlay = EB ? new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: OU, depthTest: false, depthWrite: false, transparent: true, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`precision highp float;
uniform sampler2D tSnap; uniform float uS, uS2, uAsp; uniform vec2 uC; varying vec2 vUv;
float h21(vec2 p){ vec3 q = fract(vec3(p.xyx)*.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y)*q.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
// the canvas is carried along two flows (aspect space: x in -asp/2..asp/2, y in -.5...5): out from the blast inside its front,
// and, from the second hit, six whirls in the sky with a slow drift of the river's dashes
vec2 blast(vec2 p){
  // (up and out: the ground's paint is thrown into the sky; slow at the very middle, so the middle is not one stretched colour)
  vec2 d = p - uC; float r = length(d) + 1e-3, R = 1.7*(1. - exp(-1.4*uS));
  return normalize(d + vec2(0., .35*r))*(.55 + .45*vn(vec2(atan(d.y, d.x)*7., 3.)))*min(1., r/.25)*(1. - smoothstep(R - .25, R + .05, r));
}
vec2 whirls(vec2 p){
  vec2 v = vec2(.25*smoothstep(.0, -.1, p.y), 0.);
  for (int k = 0; k < 6; k++){
    float fk = float(k);
    vec2 wc = vec2((fk - 2.5)*.32*uAsp/1.78 + .06*sin(fk*2.3), .17 + .16*fract(sin(fk*12.9)*43.7));
    vec2 e = p - wc; float q = length(e);
    v += vec2(-e.y, e.x)/(q + .04)*(mod(fk, 2.) < .5 ? 1. : -1.)*.2*exp(-q*q/.028);
  }
  return v;
}
vec3 snap(vec2 p){ return texture2D(tSnap, clamp(vec2(p.x/uAsp + .5, p.y + .5), .001, .999)).rgb; }
void main(){
  vec2 p = vec2((vUv.x - .5)*uAsp, vUv.y - .5), q = p;
  float D1 = .45*(1. - exp(-1.1*uS)), D2 = 1.1*(1. - exp(-.7*max(uS2, 0.))) + .2*smoothstep(1., 3.5, uS);
  for (int i = 0; i < 10; i++) q -= (blast(q)*D1 + whirls(q)*D2)*.1;
  vec2 v = blast(q)*D1 + whirls(q)*D2 + vec2(1e-4, 0.); vec2 dir = normalize(v), nr = vec2(-dir.y, dir.x);
  // brushstrokes: the canvas falls into dashes laid along the flow, each one flat colour (sampled at its middle), its own
  // length, bristle grooves along it and a darker edge; they grow from nothing at the blast to Van Gogh's dabs
  float br = smoothstep(0., 1.2, uS), W = .0075 + .004*smoothstep(0., 2., uS2);
  float al = dot(p, dir), ac = dot(p, nr), band = floor(ac/W), jit = h21(vec2(band, 7.));
  float len = (.012 + .03*smoothstep(0., 3., uS) + .02*smoothstep(0., 2., uS2))*(.6 + .8*jit);
  float cell = floor(al/len + jit), mid = (cell + .5 - jit)*len - al, mc = (band + .5)*W - ac;
  vec3 fl = .5*(snap(q + dir*mid + nr*mc) + snap(q + dir*(mid + .3*len) + nr*mc)), sm = vec3(0.);
  for (int j = -2; j <= 2; j++) sm += snap(q + dir*float(j)*.25*len);
  vec3 c = mix(snap(q), mix(fl, sm*.2, .45), br);
  float fa = fract(al/len + jit), fc = fract(ac/W);
  c *= 1. + br*(.16*(vn(vec2(ac*900., cell)) - .5) - .18*(1. - smoothstep(0., .18, fc)*smoothstep(1., .82, fc)) - .1*(1. - smoothstep(0., .12, fa)*smoothstep(1., .88, fa)));
  // the blast: a capped warm flash at the far water and hot rays thrown out
  vec2 d = p - uC; float r = length(d), a = atan(d.y, d.x);
  float flash = .75*exp(-uS*1.8)*exp(-r*r/(.004 + .05*uS)) + .3*step(0., uS2)*exp(-uS2*2.)*exp(-r*r/.03);
  float rays = smoothstep(.6, 1., vn(vec2(a*34., r*3. - uS*4.)))*exp(-r*3.)*exp(-uS*.9);
  vec3 hot = mix(vec3(1., .74, .32), vec3(.98, .88, .4), vn(vec2(a*9., 1.)));
  c += hot*(min(flash, .75) + .5*rays);
  c = mix(c, c*(1. - .05*vn(vUv*vec2(480., 270.))), br);   // the canvas's tooth
  gl_FragColor = vec4(c, 1.);
}` })) : null;
    if (overlay) { overlay.frustumCulled = false; overlay.renderOrder = 1e9; overlay.visible = false; overlay.name = 'canvas-collapse'; scene.add(overlay); }
    // ?ending=a..e: the canvas kept at the blast is laid out again as real dabs of paint that twist counter-clockwise round
    // the light (parts/vg-canvas-twist.js), in TWIST_LEN s from the blast to the end of the clip; unset, the flung canvas above
    const TWIST_LEN = 5.12;   // 248.88 -> 254.0 on the clip's clock
    // ?ending=a2, the dark whirlpool: NO Earth blast (no flash, no light, no snapshot of it); from LIVE.a2[0] s before the blast's
    // hit (244.0 on the clip's clock) the live night frame is re-sampled every frame and its dabs turn counter-clockwise for LIVE.a2[1] s
    // ?ending=f..j, the smears (round 2): the same live frame and no blast, dragged like wet paint from LEAD s before the
    // blast's hit for LEN s, to the end of the track (256.0); g turns round the big star in the sky, the rest round the far water
    // the ending used unset: j, the palette knife (v9, accepted); ?ending=v8 brings back the flung canvas of v8
    const END = (q && q.get('ending')) || 'j';
    const LIVE = { a2: [4.883, 10], f: [8.883, 16], g: [8.883, 16], h: [15.883, 23], i: [8.883, 16], j: [8.883, 16] }[END];
    const SKY_C = [0.17, 0.28];   // the big star, aspect space (the frame at 240-256 on the clip's clock)
    const twist = EB && TWIST_MODES.includes(END) ? buildTwist({ tSnap: snapRT.texture, uniforms: OU, mode: END, weave: HU.uWeave, fine: FINE }) : null;
    if (twist) scene.add(twist.group);

    let snapped = false;
    const blastAt = new THREE.Vector3(eyeMid.x + 6, 0, quayZ(eyeMid.x + 6) + 25);   // the far water just short of the quay
    const camP = new THREE.Vector3(), bufSize = new THREE.Vector2(), poiAt = new THREE.Vector3(), poiD = new THREE.Vector3();
    return {
      scene, path, duration: (ctx.vary && ctx.vary.duration > 0) ? ctx.vary.duration : DURATION,
      // journey: through the pull-back the gaze holds across the river, a little up: the whole sky over the water
      // (the whole way: a short path that turns back would swing the route's own gaze to the sky), tipping up as it pulls back
      // (it comes in level along the route's start, the road's last look; dips a little toward the boats on the way down)
      pois: journey ? [{ at: (time, u) => { const el = (-2.5 * sstep(0, uArr * 0.5, u) + 5.5 * sstep(uArr * 0.5, uArr, u) + 8 * sstep(uBack, 0.9, u)) * D2R, az = (8 - 10 * sstep(uArr, uBack, u)) * D2R;
        return poiAt.copy(eyeMid).add(poiD.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(600)); },
        from: 0, to: 1, fade: 0.02, weight: 1, steady: true }] : [],
      // journey: the drift slow, the pull-back steady
      pace: journey ? (u) => 0.6 + 1.9 * (1 - sstep(uArr * 0.55, uArr, u)) + 0.15 * sstep(uBack - 0.03, uBack + 0.08, u) : undefined,
      paceToEnd: journey,
      title: 'Starry Night over the Rhône',
      ride: 'none', style: 'none',
      camera: { fov: 60, near: 0.08, far: 5000, lookAhead: journey ? 2 : 10, sway: 0.3, bank: 0 },
      portal: { shape: 'circle', radius: 4, color: '#F6D54A', glow: 1, drawWithin: 0 },
      explodeAt: blasts.explodeAt,
      post: {
        exposure: 1.08,
        bloom: { strength: 0.45, radius: 0.6, threshold: 0.95 },
        grade: { saturation: 1.12, contrast: 1.05, tint: '#fff3dc', shadowTint: '#050a24', vignette: 0.34, grain: 0.035, aberration: 0 },
      },
      update(dt, time, camera) {
        camP.setFromMatrixPosition(camera.matrixWorld); if (camP.lengthSq() === 0) camP.copy(camera.position);
        const tw = warp(time), rate = FZ ? 1 - sstep(FZ[0], FZ[1], time) : 1;   // (the painting's clock: stands still at the end)
        hero.update(dt * SKY_SLOW * rate, tw * SKY_SLOW, camera);    // a calm sky on a slow clock
        ctx.renderer.getDrawingBufferSize(bufSize);
        SU.uWeave.value = 1.5708 * Math.min(1, 1080 / Math.max(1, bufSize.y));
        SU.uTime.value = tw;
        for (const mv of movers) mv(tw);
        blasts.update(tw, camP);
        if (overlay && LIVE) {
          const s0 = time - (EB[0] - LIVE[0]);
          overlay.visible = false; twist.group.visible = false;
          if (s0 >= 0) {   // the live frame, under the dabs and for their colours; the vortex round the far water
            const r = ctx.renderer, prev = r.getRenderTarget();
            if (snapRT.width !== bufSize.x || snapRT.height !== bufSize.y) snapRT.setSize(bufSize.x, bufSize.y);
            r.setRenderTarget(snapRT); r.clear(); r.render(scene, camera); r.setRenderTarget(prev);
            if (!snapped) { OU.uAsp.value = bufSize.x / Math.max(1, bufSize.y); const n = blastAt.clone().project(camera);
              OU.uC.value.set(clamp(n.x, -0.8, 0.8) * 0.5 * OU.uAsp.value, clamp(n.y * 0.5, -0.3, 0.1)); snapped = true;
              if (END === 'g') OU.uC.value.set(SKY_C[0], SKY_C[1]); }
            twist.group.visible = true; twist.update(s0, LIVE[1]);
          }
        } else if (overlay) {
          const s0 = time - EB[0];
          if (s0 >= 0 && !snapped) {   // the frame of the blast, kept: the canvas from here on
            const r = ctx.renderer, prev = r.getRenderTarget();
            snapRT.setSize(bufSize.x, bufSize.y); overlay.visible = false; if (twist) twist.group.visible = false;
            r.setRenderTarget(snapRT); r.clear(); r.render(scene, camera); r.setRenderTarget(prev);
            OU.uAsp.value = bufSize.x / Math.max(1, bufSize.y);
            const n = blastAt.clone().project(camera);
            OU.uC.value.set(clamp(n.x, -0.8, 0.8) * 0.5 * OU.uAsp.value, clamp(n.y * 0.5, -0.3, 0.1));
            snapped = true;
          }
          overlay.visible = s0 >= 0 && !twist; if (twist) { twist.group.visible = s0 >= 0; twist.update(s0, TWIST_LEN); }
          OU.uS.value = Math.max(0, s0); OU.uS2.value = EB[1] != null ? Math.max(-1, time - EB[1]) : -1;
        }
      },
      dispose() { hero.dispose(); if (snapRT) snapRT.dispose(); if (twist) twist.dispose(); },
    };
  },
};
