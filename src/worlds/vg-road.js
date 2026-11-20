// VG ROAD: "Road with Cypress and Star" (Saint-Remy, 1890) as a finale scene of the Van Gogh clip, a 30 s long take.
// On the road at night, a slow push (in the journey: on down the road, then up into the bright star, the hand-off): a giant cypress of curling black-green flame strokes in the middle reaching the
// top of the frame, a thin dim crescent moon to its right and one bright star in rings to its left, a swirling
// yellow-green stroke sky, tall wheat on the left, the road of pale violet and ochre dashes running off to the right
// past a small lit inn, two travellers with spades over their shoulders walking toward us and a yellow cart behind.
// Four planets hang as points either side of the cypress and burst one after another (EXPLODE_AT; parts/vg-blasts.js):
// the cypress stands black against the flashes, the sky dome swirls round each blast and a warm wash lights the road.
// Painted by the-turning-night's hand: its hero dome (turned, moon off) is the sky, its STROKE_VS cypress flame and
// wind-swayed wheat strokes, vg-night's flat strokes for the ground (2-3 tones, bristles, dark rims).
// World space: +Y up, ground near y = 0, the camera looks toward -Z up the road. Pure function of world time.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePath, makeRng, makeNoise, hashSeed } from '../kit/core.js';
import { STROKE_VS, STROKE_FS, PAINT_VS, PAINT_FS, makeSet as makeTNSet } from './the-turning-night.js';
import { buildHero } from '../parts/the-turning-night.js';
import { FLAT_VS, makeSet } from '../parts/vg-night.js';
import { paintFigure } from '../parts/vg-figure.js';
import { buildBlasts, scheduleFrom } from '../parts/vg-blasts.js';

// blast times in seconds of world time (retime to the music); which planet bursts at each is ORDER below
export const EXPLODE_AT = [6, 11, 16, 21];
export const DURATION = 30;
const FINE = 2, SKY_SLOW = 0.3;

const TAU = Math.PI * 2, D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// every planet of the roster has a place either side of the cypress (az/el degrees from the camera, az 0 = -Z), so an
// earlier world's bursts can hang here as remnants (&blasts=before:...); by default four burst here, the rest hidden
const PLACE = [
  { id: 'cobalt', az: -26, el: 20, dist: 430, ang: 8 },
  { id: 'cafe', az: 8, el: 17, dist: 420, ang: 7.5 },
  { id: 'rose', az: -30, el: 33, dist: 460, ang: 7 },
  { id: 'violet', az: 27, el: 31, dist: 450, ang: 7.5 },
  { id: 'sunflower', az: -36, el: 12, dist: 420, ang: 7 },
  { id: 'ice', az: 34, el: 13, dist: 440, ang: 7 },
  { id: 'emerald', az: -14, el: 36, dist: 480, ang: 6.5 },
  // lit in the journey (not the roster's dark green-gold): it bursts in the clear sky over the wheat, left of the cypress as the lens drifts left
  { id: 'cypress', az: 2, el: 26, dist: 480, ang: 11, dark: false, pal: [['#2E9A6A', 3], ['#7FC07A', 2.5], ['#E8E45A', 1.6], ['#F6D54A', 1.2], ['#1E4E5A', 1.4], ['#7FB2E5', 1]].map(([h, w]) => [new THREE.Color(h), w]) },
];
const ORDER = ['cafe', 'cobalt', 'violet', 'rose'];

export default {
  id: 'vg-road',
  name: 'Road with Cypress and Star',
  category: 'wilderness',
  weirdness: 0.5,
  media: ['air', 'open'],
  async build(ctx) {
    const rng = makeRng(hashSeed('vg-road:scene'));
    const noise = makeNoise(hashSeed('vg-road:noise'));
    const H = (h) => new THREE.Color(h);
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const mixc = (a, b, t) => a.clone().lerp(b, clamp(t, 0, 1));
    const scene = new THREE.Scene();
    scene.background = H('#3A5A6A');
    scene.fog = new THREE.FogExp2(H('#5A7A80'), 0.0024);

    // ---------- the sky: the turning night's dome, yellow-green and pale cerulean, turned, no moon ----------
    const hero = await buildHero({ ...ctx, rng: makeRng(hashSeed('vg-road:sky')) },
      { palette: ['#1E3A5A', '#3A6A8A', '#B8D0A8', '#E8DA70', '#5A8A6A', '#14261E', '#E8A040'], mirror: false, gate: false });
    const qr = (typeof location !== 'undefined') ? new URLSearchParams(location.search).get('vgrot') : null;
    hero.object.rotation.y = Math.PI + (qr ? Number(qr) : 1.0);
    const HU = hero.uniforms;
    HU.uGain.value = 1.0; HU.uCellK.value = 1 / FINE; HU.uStreak.value = 1; HU.uMoonK.value.set(0, 1, 0); HU.uStarK.value = 0.35;
    scene.add(hero.object);
    await ctx.yield();

    // ---------- the camera: on the road, a slow push toward the cypress ----------
    const q = (typeof location !== 'undefined') ? new URLSearchParams(location.search) : null;
    const dbg = q && q.get('vgcam') ? q.get('vgcam').split(',').map(Number) : null;   // dev aid: x,z,eyeY,yawDeg,pitchDeg,travel
    const [CX, CZ, EY, YAW, PITCH, TRAVEL] = dbg || [1.0, 8, 1.6, -5, 13, 4.5];
    const gaze = new THREE.Vector3(Math.sin(YAW * D2R) * Math.cos(PITCH * D2R), Math.sin(PITCH * D2R), -Math.cos(YAW * D2R) * Math.cos(PITCH * D2R));
    const side = new THREE.Vector3(-gaze.z, 0, gaze.x).normalize();
    const e0 = new THREE.Vector3(CX, EY, CZ);
    const eyeMid = e0.clone().addScaledVector(gaze, TRAVEL * 0.5);
    // the bright star in rings, left of the cypress (az -19, el 30 from the middle of the push, 600 m out)
    const STAR = eyeMid.clone().add(new THREE.Vector3(Math.sin(-19 * D2R) * Math.cos(30 * D2R), Math.sin(30 * D2R), -Math.cos(-19 * D2R) * Math.cos(30 * D2R)).multiplyScalar(600));
    // journey: it comes in right of the road, the cypress left of the middle of the frame, and crabs slowly left over the
    // wheat, facing up the road (the cypress, 20 m off, slides right across the frame), then rises gently forward over the
    // wheat, the cypress off to the right, and levels out looking up the valley at the horizon: there the next world comes
    // in (a bare pane that fades in over the last metres, its horizon on this one's: the Rhone opens up below, see portal)
    const journey = !!(ctx.vary && ctx.vary.duration > 0);
    const path = journey ? makePath([[3.0, 1.3, 8], [2.9, 1.6, 5.0], [1.8, 1.9, 3.4], [-0.8, 2.1, 2.4], [-3.6, 2.3, 2.0], [-6.5, 2.9, 1.4], [-10.5, 3.6, 0.4], [-13.8, 4.0, -1.0], [-15.6, 4.15, -2.6], [-15.9, 4.16, -5.0]])
      : makePath([e0.clone(), e0.clone().addScaledVector(gaze, TRAVEL * 0.5).addScaledVector(side, 0.2), e0.clone().addScaledVector(gaze, TRAVEL)]);
    const camXZ = new THREE.Vector2(eyeMid.x, eyeMid.z);
    const endDir = path.end.clone().sub(path.pointAt(0.985, new THREE.Vector3())).setY(0).normalize();   // level, along the route's end
    const lookAt = new THREE.Vector3(), lookD = new THREE.Vector3();

    // ---------- the land ----------
    // the road: a centre line from behind the camera, ahead past the cypress's right foot, bending off right to the inn
    const ROAD = [[0.6, 30], [0.8, 8], [1.6, -12], [3.2, -30], [7, -50], [14, -72], [26, -98], [44, -128], [70, -165], [110, -215]];
    const roadAt = (x, z) => {                       // { d: distance to the centre line, tx, tz: its direction, hw: half width }
      let best = 1e9, tx = 0, tz = -1;
      for (let i = 0; i < ROAD.length - 1; i++) {
        const [ax, az] = ROAD[i], [bx, bz] = ROAD[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d < best) { best = d; const l = Math.sqrt(L2); tx = dx / l; tz = dz / l; }
      }
      return { d: best, tx, tz, hw: 2.1 + 0.25 * noise.n2(x * 0.1, z * 0.1) };
    };
    const ground = (x, z) => 0.18 * noise.fbm2(x * 0.04, z * 0.04, 2) + 4 * sstep(150, 420, -z) * (0.6 + 0.4 * noise.n2(x * 0.006, 0.3)) - 0.08 * (1 - sstep(1.6, 2.4, roadAt(x, z).d));
    const CYP = new THREE.Vector3(-2.3, 0, -17);       // the cypress, by the road's left verge
    // the field to the left of the road is wheat; to the right a low blue-green meadow
    const roadX = (z) => { for (let i = 0; i < ROAD.length - 1; i++) { const [ax, az] = ROAD[i], [bx, bz] = ROAD[i + 1]; if (z <= az && z >= bz) return ax + (bx - ax) * (z - az) / (bz - az); } return z > 0 ? ROAD[0][0] : 200; };
    const isWheat = (x, z) => z > -160 && x < roadX(z) - 2.8;

    // ---------- materials ----------
    const wind = new THREE.Vector4(0.8, -0.35, 0.3, 0.05);
    const SU = {
      uTime: { value: 0 }, uMinW: { value: 0.0016 }, uGain: { value: 1.0 }, uWeave: HU.uWeave,
      uFlash: { value: new THREE.Vector3() }, uFlashD: { value: new THREE.Vector3(0, 1, 0) },
      uCreep: { value: 0 }, uWind: { value: wind }, uFine: { value: FINE },
      uSwitch: { value: 0 }, uDrain: { value: 0 }, uRain: { value: 0 }, uRare: { value: 0 }, uFlame: { value: 1.3 },
    };
    const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
    const fade = (a, b) => ({ uFade: { value: new THREE.Vector2(a, b) } });
    const flatMat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU, fade(900, 1400)), vertexShader: FLAT_VS, fragmentShader: STROKE_FS, side: THREE.DoubleSide, fog: true });
    const skyMat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU, fade(3000, 4000)), vertexShader: FLAT_VS, fragmentShader: STROKE_FS, side: THREE.DoubleSide, fog: false });
    const tnMat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU, fade(900, 1400)), vertexShader: STROKE_VS, fragmentShader: STROKE_FS, side: THREE.DoubleSide, fog: true });
    const paintMat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU), vertexShader: PAINT_VS, fragmentShader: PAINT_FS, fog: true, side: THREE.DoubleSide });
    const S = makeSet(rng); S.tones = true;          // flat ground strokes, figures, inn
    const T = makeTNSet();                            // cypress flame and wheat
    const bases = [];
    const colGeo = (g, colFn) => {
      g = g.index ? g.toNonIndexed() : g; if (g.getAttribute('uv')) g.deleteAttribute('uv');
      const p = g.getAttribute('position'), a = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const c = colFn(p.getX(i), p.getY(i), p.getZ(i)); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); bases.push(g);
    };

    // pigments
    const WHEAT = ['#C8A040', '#D8B848', '#B88A30', '#A8A040', '#C0B058', '#8A8A38', '#E0C860', '#9A7A30'].map(H);
    const WHEAT2 = ['#6A8A3A', '#4E7A3A', '#8AA048', '#3A5A3A'].map(H);
    const ROADC = ['#A898B8', '#B8A8C0', '#8C88B0', '#C8B890', '#D8C8A0', '#9AA0C0', '#B89878', '#7A80A8'].map(H);
    const MEAD = ['#2E6A5A', '#3A7A5A', '#4E8A5A', '#2A5A6A', '#5A8A4A', '#3A6A7A', '#6A9A5A', '#1E4E5A'].map(H);
    const HILL = ['#3A4A8A', '#4A5A9A', '#2E3E7A', '#5A6AA0'].map(H);

    // ---------- the ground: a painted base, then rows of flat strokes evenly spaced on screen ----------
    {
      const g = new THREE.PlaneGeometry(900, 700, 220, 220); g.rotateX(-Math.PI / 2); g.translate(0, 0, -300);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i), p.getZ(i)));
      g.computeVertexNormals();
      colGeo(g, (x, y, z) => {
        const r = roadAt(x, z);
        if (r.d < r.hw) return H('#6A6A88').multiplyScalar(0.8);
        if (isWheat(x, z)) return H('#6A5A2A');
        return H('#1E4A4A').lerp(H('#2A3A6A'), sstep(100, 300, -z));
      });
      const h = eyeMid.y;
      for (let ang = Math.atan(h / 320); ang < Math.atan(h / 1.0); ang += 0.0055 * rng.range(0.85, 1.15)) {
        const d = h / Math.tan(ang), hl0 = Math.max(0.05, d * 0.016), hw0 = Math.max(0.02, 0.0026 * d * d / h);
        const half = d * 1.2 + 3;
        for (let x = camXZ.x - half + rng.range(0, hl0); x < camXZ.x + half; x += hl0 * rng.range(1.1, 1.6)) {
          const z = camXZ.y - Math.sqrt(Math.max(0, d * d - (x - camXZ.x) ** 2)) + rng.range(-hw0, hw0);
          const r = roadAt(x, z), y = ground(x, z) + 0.02;
          if (r.d < r.hw) {                                     // the road: dashes along it, pale violet and ochre
            const a = Math.atan2(r.tz, r.tx) + rng.range(-0.18, 0.18), hl = hl0 * rng.range(0.9, 1.4);
            S.add(x, y, z, Math.cos(a) * hl, 0, Math.sin(a) * hl, hw0 * rng.range(0.8, 1.2), pick(ROADC), 0, 0, 1, 0, rng.range(-0.08, 0.08));
          } else if (isWheat(x, z)) {
            S.add(x, y, z, rng.range(-0.3, 0.3) * hl0, 0, hl0, hw0, rng() < 0.7 ? pick(WHEAT) : pick(WHEAT2), 0, 0, 1, 0);
          } else {                                              // the meadow: diagonal strokes, the far land bluer
            const a = rng.range(-0.4, 0.4) - 0.5 + (r.d < r.hw + 1.2 ? Math.atan2(r.tz, r.tx) + 0.5 : 0), hl = hl0 * rng.range(0.9, 1.3);
            const col = d > 120 && rng() < 0.6 ? pick(HILL) : pick(MEAD);
            S.add(x, y, z, Math.cos(a) * hl, 0, Math.sin(a) * hl, hw0 * rng.range(0.8, 1.2), col, 0, 0, 1, 0, rng.range(-0.08, 0.08));
          }
        }
        await ctx.yield();
      }
      // the low far hills under the sky: rows of blue-violet strokes standing on the horizon
      for (let i = 0; i < 2600; i++) {
        const az = rng.range(-70, 70) * D2R, R = rng.range(380, 460), x = camXZ.x + Math.sin(az) * R, z = camXZ.y - Math.cos(az) * R;
        const top = 7 + 9 * (0.5 + 0.5 * Math.sin(az * 3.1 + 1)) * (0.6 + 0.4 * noise.n2(az * 4, 0.7)) - 6 * sstep(0.1, 0.9, az);
        const y = ground(x, z) + rng.range(-1, Math.max(0, top));
        S.add(x, y, z, Math.cos(az) * 2.2, rng.range(-0.4, 0.4), Math.sin(az) * 2.2, 0.9, pick(HILL), 0, 0, 0, 0, 0.1);
      }
    }
    await ctx.yield();

    // ---------- the wheat: tall swaying stalks on the left, close to the lens near the road ----------
    {
      const WE = ['#E8D060', '#D8C058', '#F0DC78', '#C8B048'].map(H);
      for (let i = 0, made = 0; i < 160000 && made < 30000; i++) {
        const x = camXZ.x + rng.range(-40, 2), z = rng.range(-70, 9);
        if (!isWheat(x, z)) continue;
        const d = Math.hypot(x - camXZ.x, z - camXZ.y); if (rng() > 30 / (d * d + 30)) continue;
        if (Math.hypot(x - CYP.x, z - CYP.z) < 4.2) continue;
        const L = rng.range(0.9, 1.4), y = ground(x, z) - 0.05, col = rng() < 0.75 ? pick(WHEAT) : pick(WHEAT2);
        T.add(1, x, y, z, rng.range(-0.15, 0.15) * L, L, rng.range(-0.15, 0.15) * L, rng.range(0.035, 0.06) * (1 + d * 0.02), col, 0, rng(), 0, 0, 1, 0, 0, rng.range(0.85, 1.15));
        if (rng() < 0.6) T.add(1, x, y + L * 0.62, z, rng.range(-0.1, 0.1) * L, L * 0.4, rng.range(-0.1, 0.1) * L, rng.range(0.05, 0.08) * (1 + d * 0.02), pick(WE), 0, rng(), 0, 0, 1, 0, 0, 1);
        made++;
        if (made % 5000 === 4999) await ctx.yield();
      }
    }
    await ctx.yield();

    // ---------- the cypress: a giant black-green flame of curling strokes ----------
    {
      const Hh = 29, R = 3.9, y = ground(CYP.x, CYP.z) - 0.4;
      const cg = new THREE.ConeGeometry(R * 0.5, Hh * 0.9, 12, 10); cg.translate(CYP.x, y + Hh * 0.47, CYP.z);
      colGeo(cg, () => H(ctx.vary && ctx.vary.duration > 0 ? '#1E3A30' : '#0E1E16'));   // journey: the core seen through the bough's gap is not a black hole
      const cols = ['#1E4E3A', '#143A2A', '#0E2A20', '#2A5A3A', '#1E3A4A', '#3A6A3A', '#0A1A14', '#4A6A2A'].map(H);
      const n = Math.round(9000 * FINE / 2 * 1.4);
      for (let i = 0; i < n; i++) {
        const r = rng(), col = r < 0.3 ? cols[0] : r < 0.55 ? cols[1] : r < 0.72 ? cols[2] : r < 0.82 ? cols[3] : r < 0.9 ? cols[4] : r < 0.96 ? cols[5] : r < 0.985 ? cols[6] : cols[7];
        T.add(2, CYP.x, y, CYP.z, rng.range(0, TAU), rng(), Hh, rng.range(0.16, 0.3), col, 0, rng(), R, rng.range(1.0, 2.0), rng.range(0.75, 1.1), 1.6, 0, rng.range(0.85, 1.15));
      }
      // flame tongues: curling chains of short strokes that lick out and up from the body, so the silhouette burns
      const prof = (t) => R * Math.pow(Math.max(0, 1 - t), 0.8) * (0.5 + 0.5 * sstep(0, 0.16, t));
      const TONG = ['#123A2A', '#0E2A20', '#1A4430', '#0A1E18', '#24502E', '#14303A', '#2E5A2A'].map((h) => H(h).multiplyScalar(0.8));
      for (let i = 0; i < 1100; i++) {
        const t0 = Math.pow(rng(), 0.85) * 0.97, phi = rng.range(0, TAU), L = rng.range(2.2, 4.2) * (1 - 0.5 * t0), out = rng.range(0.9, 2.2) * (0.35 + 0.65 * prof(t0) / R);
        const hand = rng.sign(), col = pick(TONG), n = 5, hs = rng();
        let px = CYP.x + Math.cos(phi) * prof(t0) * 0.92, pz = CYP.z + Math.sin(phi) * prof(t0) * 0.92, py = y + t0 * Hh;
        for (let k = 0; k < n; k++) {
          const s0 = (k + 1) / n, curl = Math.sin(s0 * Math.PI) * out, a2 = phi + hand * s0 * 0.9;
          const nx = CYP.x + Math.cos(a2) * (prof(Math.min(0.99, t0 + s0 * L / Hh)) * 0.92 + curl), nz = CYP.z + Math.sin(a2) * (prof(Math.min(0.99, t0 + s0 * L / Hh)) * 0.92 + curl), ny = py + L / n;
          const c = col.clone().multiplyScalar(0.8 + 0.3 * s0);
          S.add((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2, (nx - px) / 2 * 1.2, (ny - py) / 2 * 1.2, (nz - pz) / 2 * 1.2, 0.1 * (1 - 0.5 * s0) + 0.035, c, 0, 0, 0, 0, hand * 0.25, [0.03, 0.02, 0.03, 0.7 + hs], hs);
          px = nx; py = ny; pz = nz;
        }
      }
    }
    await ctx.yield();

    // ---------- the inn far right: a low house with lit windows, a tree by it ----------
    {
      const ix = 34, iz = -104, y0 = ground(ix, iz);
      const gb = new THREE.BoxGeometry(9, 4.2, 6); gb.translate(ix, y0 + 2.1, iz); colGeo(gb, () => H('#4A4A6A'));
      const WALL = ['#6A7090', '#7A7AA0', '#5A6488', '#8A8098'].map(H), ROOF = ['#C86A3A', '#B85A30', '#D07A40'].map(H);
      for (let y = 0.2; y < 4.2; y += 0.28) for (let x = -4.4; x < 4.5; x += 0.35) S.add(ix + x, y0 + y, iz + 3.05, 0.05, 0.18, 0, 0.14, pick(WALL), 0, 0, 0, 1);
      for (let k = 0; k < 14; k++) { const t = k / 14; for (let x = -4.8; x < 4.9; x += 0.4) S.add(ix + x, y0 + 4.3 + t * 2.2, iz + 3.2 - t * 3.2, 0.25, 0.04, 0, 0.18, pick(ROOF), 0, 0, 0.8, 0.6); }
      for (const wx of [-2.6, 0, 2.6]) for (let k = 0; k < 5; k++) S.add(ix + wx + rng.range(-0.3, 0.3), y0 + 1.9 + rng.range(-0.45, 0.45), iz + 3.12, 0.08, 0.3, 0, 0.24, pick([H('#F6C84A'), H('#F0A030'), H('#FFE070')]), rng.range(1.2, 2), 0, 0, 1);
      for (let i = 0; i < 400; i++) { const a = rng.range(0, TAU), r = Math.sqrt(rng()) * 2.6; S.add(ix + 7 + Math.cos(a) * r, y0 + 4 + Math.sin(a) * r * 1.2 + 1.5, iz + 1, rng.range(-0.2, 0.2), 0.3, 0, 0.16, pick(['#1E4E3A', '#2A5A3A', '#143A2A'].map(H)), 0); }
    }

    // ---------- the bright star in rings (left of the cypress) and the thin dim crescent (right) ----------
    const SK = makeSet(rng);
    const skyPt = (az, el, R0 = 600) => eyeMid.clone().add(new THREE.Vector3(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R)).multiplyScalar(R0));
    const skyDir = skyPt(2, 14).sub(eyeMid).normalize();
    const basis = (c) => { const dir = c.clone().sub(eyeMid).normalize(), e1 = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize(); return [e1, new THREE.Vector3().crossVectors(dir, e1)]; };
    // the star is its own mesh, laid round its centre, so the journey can swell it about that centre (see update)
    const ST = makeSet(rng);
    {
      const c = STAR, [e1, e2] = basis(c), R = 15;
      const at = (a, r) => new THREE.Vector3().addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r);
      ST.add(0, 0, 0, e2.x * R * 0.07, e2.y * R * 0.07, e2.z * R * 0.07, R * 0.13, H('#FFFCE8'), 2.2);   // a small hot core and petals round it
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + rng.range(-0.2, 0.2), p = at(a, R * 0.16), d = at(a, 1); ST.add(p.x, p.y, p.z, d.x * R * 0.08, d.y * R * 0.08, d.z * R * 0.08, R * 0.05, H(pick(['#FFF8D8', '#FFFCE8', '#F6E070'])), 1.8, 0, 0, 0, 0.1); }
      for (let k = 0; k < 4; k++) {
        const n = 10 + k * 8, rr = R * (0.45 + k * 0.38), cl = k % 2 ? ['#E8E890', '#F6E070', '#FFF0B0'] : ['#B8D8C0', '#E0E8C0', '#C8E0A0'];
        for (let i = 0; i < n; i++) {
          const a = (i + rng.range(-0.2, 0.2)) / n * TAU, p = at(a, rr), d = at(a + 0.05, rr).sub(p).normalize();
          ST.add(p.x, p.y, p.z, d.x * rr * 0.22, d.y * rr * 0.22, d.z * rr * 0.22, R * 0.07, H(pick(cl)), (1.3 - 0.25 * k) * rng.range(0.8, 1.1), 0, 0, 0, 0.15);
        }
      }
      // fine rays out of the core, inside the first rings: a glint at the star's own size, the light the lens flies into
      // when it swells
      for (let i = 0; i < 64; i++) {
        const a = (i + rng.range(-0.35, 0.35)) / 64 * TAU, r0 = R * rng.range(0.12, 0.3), r1 = R * rng.range(0.55, 1.25), p = at(a, (r0 + r1) / 2), d = at(a, 1);
        ST.add(p.x, p.y, p.z, d.x * (r1 - r0) / 2, d.y * (r1 - r0) / 2, d.z * (r1 - r0) / 2, R * rng.range(0.018, 0.034), H(pick(['#FFF8D8', '#F6E070', '#FFFCE8', '#E8F0B0'])), rng.range(0.9, 1.4), 0, 0, 0, 0.04);
      }
    }
    {
      // a thin crescent, horns up-left, dim orange-yellow, and a faint ring of dabs
      const c = skyPt(15, 30), [e1, e2] = basis(c), R = 11;
      for (let i = 0; i < 26; i++) {
        const t = i / 25, a = -0.9 + t * 2.6, rr = R * (1 - 0.05 * Math.sin(t * Math.PI)), w = R * 0.16 * Math.sin(t * Math.PI) + R * 0.03;
        const p = c.clone().addScaledVector(e1, Math.cos(a) * rr).addScaledVector(e2, Math.sin(a) * rr);
        const d = e1.clone().multiplyScalar(-Math.sin(a)).addScaledVector(e2, Math.cos(a));
        SK.add(p.x, p.y, p.z, d.x * R * 0.14, d.y * R * 0.14, d.z * R * 0.14, w, H(pick(['#F0B040', '#E8A030', '#F6C860'])), 1.3, 0, 0, 0, 0.05);
      }
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * TAU, p = c.clone().addScaledVector(e1, Math.cos(a) * R * 1.7).addScaledVector(e2, Math.sin(a) * R * 1.7);
        const d = e1.clone().multiplyScalar(-Math.sin(a)).addScaledVector(e2, Math.cos(a));
        SK.add(p.x, p.y, p.z, d.x * R * 0.25, d.y * R * 0.25, d.z * R * 0.25, R * 0.06, H(pick(['#C8C880', '#B8D0A0'])), 0.3, 0, 0, 0, 0.1);
      }
      // a few small stars
      for (let i = 0; i < 18; i++) {
        const cc = skyPt(rng.range(-60, 60), rng.range(8, 45)), [f1, f2] = basis(cc), r0 = rng.range(1.6, 3);
        for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; const p = cc.clone().addScaledVector(f1, Math.cos(a) * r0 * 0.5).addScaledVector(f2, Math.sin(a) * r0 * 0.5); SK.add(p.x, p.y, p.z, f1.x * Math.cos(a) * r0 * 0.3 + f2.x * Math.sin(a) * r0 * 0.3, f1.y * Math.cos(a) * r0 * 0.3 + f2.y * Math.sin(a) * r0 * 0.3, f1.z * Math.cos(a) * r0 * 0.3 + f2.z * Math.sin(a) * r0 * 0.3, r0 * 0.12, H('#F6F0B0'), 1.2); }
      }
    }

    // ---------- moving: two travellers with spades walking toward us, the yellow cart behind ----------
    const movers = [];
    {
      // two walkers (parts/vg-figure.js) in their own set and rng; local forward is -z (the mesh turns them to us)
      const frng = makeRng(hashSeed('vg-road:travellers')), s = makeSet(frng);
      const walker = (ox, coat, legs, hat, hatCol, ph) => {
        const f = paintFigure(s, frng, { x: ox, y: 0, z: 0, face: Math.PI, kind: 'walk', coat, legs, hat, hatCol, light: [0.5, 0.86], warm: 0.3, hot: H('#E8C060'), stride: 3.6 + ph, noArm: 1 });
        // the spade over the right shoulder: the hand in front holds the handle, which rests on the shoulder, the blade behind
        const seg = (p, q, hw, c, bend = 0) => s.add((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, (q[0] - p[0]) / 2, (q[1] - p[1]) / 2, (q[2] - p[2]) / 2, hw, c, 0, 0, 0, 0, bend, f.sway, f.hs);
        const hand = f.P(0.17, 1.2, 0.24), back = f.P(0.17, 1.68, -0.5), tip = f.P(0.17, 1.72, -0.58), end = f.P(0.17, 1.8, -0.74), elbow = f.P(0.21, 1.08, 0.08);
        seg(hand, back, 0.03, H('#1A1410')); seg(hand, back, 0.018, H('#C8A060'));
        seg(tip, end, 0.075, H('#1A2030')); seg(tip, end, 0.055, H('#8A98A8'), 0.1);
        seg(f.P(0.19, 1.38, 0), elbow, 0.042, H('#0A1230')); seg(elbow, hand, 0.038, H('#0A1230'));   // the arm up to it
        seg(f.P(0.19, 1.36, 0.02), elbow, 0.024, coat); seg(elbow, hand, 0.022, coat);
        const e = f.P(0.17, 1.2, 0.25); s.add(e[0], e[1], e[2], 0, 0.02, 0, 0.03, H('#B87A4A'), 0, 0, 0, 0, 0, f.sway, f.hs);
      };
      walker(-0.38, H('#2A3A8A'), H('#1E2A5A'), 'straw', H('#E8D070'), 0);
      walker(0.36, H('#3A5A9A'), H('#2A2A4A'), 'felt', null, 0.4);
      const m = s.mesh(flatMat); m.name = 'travellers'; scene.add(m);
      movers.push((t) => {
        const z = -12.5 + 0.26 * t, x = 1.7 + 0.03 * (z + 15);
        m.position.set(x, ground(x, z) + 0.03 * Math.abs(Math.sin(t * 3.6)), z); m.rotation.y = Math.PI + 0.04;
      });
      // the cart: a yellow box on two wheels, the horse ahead of it, a driver
      const c = makeSet(rng); c.tones = true;
      const horse = H('#5A3A2A'), dark = H('#1A1410'), CART = ['#E8C040', '#F0D058', '#D8A830'].map(H);
      c.add(0, 1.3, 0, 0, 0.12, 0.8, 0.34, horse, 0);
      c.add(0, 1.66, 0.9, 0, 0.32, 0.22, 0.14, horse, 0);
      c.add(0, 1.92, 1.15, 0, -0.05, 0.24, 0.12, horse, 0);
      for (const [lx, lz] of [[0.15, 0.6], [-0.15, 0.6], [0.15, -0.6], [-0.15, -0.6]]) c.add(lx, 0.5, lz, 0, 0.5, 0, 0.065, dark, 0, 0, 0, 0, 0, [0, 0, 0.14, -4.4]);
      for (let i = 0; i < 70; i++) c.add(rng.range(-0.8, 0.8), rng.range(0.9, 1.9), rng.range(-3.7, -1.5), rng.range(-0.05, 0.05), 0.18, 0, 0.12, pick(CART), 0.05, 0, 0, 1);
      for (const sx of [-0.9, 0.9]) for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; c.add(sx, 0.7 + Math.sin(a) * 0.62, -2.6 + Math.cos(a) * 0.62, 0, Math.cos(a) * 0.16, -Math.sin(a) * 0.16, 0.05, dark, 0, 1, 0, 0); }
      c.add(0, 2.25, -1.9, 0, 0.3, 0, 0.18, H('#2A3A6A'), 0); c.add(0, 2.65, -1.9, 0, 0.1, 0, 0.1, dark, 0);
      const cm = c.mesh(flatMat); cm.name = 'cart'; scene.add(cm);
      movers.push((t) => {
        const z = -34 + 0.42 * t, x = 3.2 + 0.08 * (z + 30);
        cm.position.set(x, ground(x, z), z); cm.rotation.y = 0.08;
      });
    }

    // ---------- assemble ----------
    const baseMesh = new THREE.Mesh(mergeGeometries(bases), paintMat); baseMesh.frustumCulled = false; baseMesh.name = 'painted-bases';
    for (const g of bases) g.dispose();
    const flat = S.mesh(flatMat); flat.name = 'road-strokes';
    const tn = T.mesh(tnMat, 6); tn.name = 'cypress-wheat';
    const sky = SK.mesh(skyMat); sky.name = 'star-moon';
    const starMat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU, fade(1e5, 2e5), { uScl: { value: 1 }, uGain: { value: 1 } }), side: THREE.DoubleSide, fog: false, fragmentShader: STROKE_FS,
      vertexShader: FLAT_VS.replace('uniform float uTime, uMinW;', 'uniform float uTime, uMinW, uScl;').replace('max(aD.w, dist*uMinW)', 'max(aD.w*uScl, dist*uMinW)') });   // its widths swell with it
    if (!starMat.vertexShader.includes('aD.w*uScl')) throw new Error('vg-road: vg-night FLAT_VS has changed shape');
    const star = ST.mesh(starMat); star.name = 'star'; star.position.copy(STAR); star.frustumCulled = false;
    scene.add(baseMesh, flat, tn, sky, star);
    await ctx.yield();

    // ---------- the planets ----------
    const schedule = scheduleFrom(ctx, { before: [], here: ORDER.map((id, i) => ({ id, t: EXPLODE_AT[i] })), hide: PLACE.map((p) => p.id).filter((id) => !ORDER.includes(id)) });
    const blasts = await buildBlasts(ctx, { scene, uniforms: SU, eye: eyeMid, place: PLACE, schedule, hero, seed: 'vg-road:planets', fine: FINE, boost: 1.9, pointScale: 1.7,
      flashFrom: new THREE.Vector3(0, 0, -20), flashGain: 0.35, heat: 0.15, glowGain: 0.6 });

    const camP = new THREE.Vector3(), bufSize = new THREE.Vector2();
    return {
      scene, path, duration: DURATION,
      // journey: one look the whole way (two looks handing over let the route's own heading in between: a whip left and back):
      // up the road on the cypress and the sky either side (the burst), easing down to level along the route's end over the
      // glide, so it meets the Rhone's start look for look (the pane maps one to the other)
      pois: journey ? [{ at: (time, u) => { const k = sstep(0.5, 0.92, u ?? 0); return lookAt.copy(eyeMid).lerp(path.end, k).add(lookD.copy(skyDir).lerp(endDir, k).normalize().multiplyScalar(600)); },
        from: 0, to: 1, fade: 0.2, weight: 0.95 }] : [],
      pace: journey ? (u) => 1 + 0.5 * sstep(0.75, 0.97, u) : undefined,
      title: 'Road with Cypress and Star',
      ride: 'none', style: 'none',
      camera: { fov: 60, near: 0.08, far: 5000, lookAhead: journey ? 3 : 10, sway: 0.3, bank: 0 },   // (journey: a short look ahead, so the crab does not swing the gaze left before the looks take it)
      // the hand-off is on the horizon: a bare pane (the exact window, no rim) that fades in over the last 2.6 m of a level glide,
      // the Rhone's horizon laid on this one's
      portal: { shape: 'rect', width: 16, height: 10, frame: 0, lens: 0, color: '#1E3050', veil: '#14244A', revealDistance: 10, blendDistance: 5, drawWithin: 2.7, drawIn: 0, fadeIn: [2.6, 0.6], keepPace: true, tilt: journey },   // (tilted with the climb, so the Rhone comes in level, no pitch drop after the seam)
      explodeAt: blasts.explodeAt,
      post: {
        exposure: 1.04,
        bloom: { strength: 0.42, radius: 0.6, threshold: 0.95 },
        grade: { saturation: 1.1, contrast: 1.06, tint: '#fff3dc', shadowTint: '#06101e', vignette: 0.34, grain: 0.035, aberration: 0 },
      },
      update(dt, time, camera, u) {
        camP.setFromMatrixPosition(camera.matrixWorld); if (camP.lengthSq() === 0) camP.copy(camera.position);
        const sw = 1;
        star.scale.setScalar(sw); starMat.uniforms.uScl.value = sw;
        starMat.uniforms.uGain.value = 1 / (1 + 0.35 * Math.log(sw));   // as it swells its strokes stay painted yellow, not a white-out
        hero.update(dt * SKY_SLOW, time * SKY_SLOW, camera);
        ctx.renderer.getDrawingBufferSize(bufSize);
        SU.uWeave.value = 1.5708 * Math.min(1, 1080 / Math.max(1, bufSize.y));
        SU.uTime.value = time;
        for (const mv of movers) mv(time);
        blasts.update(time, camP);
      },
      dispose() { hero.dispose(); },
    };
  },
};
