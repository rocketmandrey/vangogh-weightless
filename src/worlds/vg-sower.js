// VG SOWER: "The Sower" (Van Gogh, Arles 1888, Kroller-Muller) as a finale scene of the Van Gogh clip, ~30 s.
// Low over a ploughed field of violet-blue and orange furrow strokes, a band of yellow-green wheat behind it, a huge
// chrome-yellow sun disc low on the horizon with strokes radiating round it in a yellow-green sky. The sower strides
// across the field from right to left casting seed. The sun sinks below the wheat, the sky goes through orange to deep
// blue night with stroke stars, then the planets (points of light, parts/vg-blasts.js) burst one after another over
// the field (EXPLODE_AT); the sower walks on, a dark silhouette lit by each flash. The camera creeps forward and pans
// slowly left with him.
// Every mark is a stroke (parts/vg-sower.js): the sky dome, furrow dashes, wheat stalks, far dashes, and the sower: a
// rig of limb segments, each a bundle of strokes over a dark contour, posed on the CPU every frame.
// World space: +Y up, the camera looks down -Z. Pure function of world time; layout from a seeded rng.
import * as THREE from 'three';
import { makePath, makeRng, makeNoise, hashSeed } from '../kit/core.js';
import { FIELD_VS, GROUND_VS, TINT_FS, GROUNDT_FS, makeSky, keyed, fieldSet } from '../parts/vg-sower.js';
import { buildBlasts, scheduleFrom, ROSTER } from '../parts/vg-blasts.js';

export const EXPLODE_AT = [12, 16.5, 21, 25.5];
export const DURATION = 30;
const SKY_SLOW = 0.3, FINE = 2;
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export default {
  id: 'vg-sower',
  name: 'The Sower',
  category: 'wilderness',
  weirdness: 0.5,
  media: ['air', 'open'],
  async build(ctx) {
    const seed = hashSeed('vg-sower:field');
    const rng = makeRng(seed), noise = makeNoise(seed ^ 0x2c1b3c6d);
    const detail = Math.min(1.2, Math.max(0.5, (ctx.quality && ctx.quality.detail) || 1));
    const C = (h, s = 0.78) => new THREE.Color(h).multiplyScalar(s);
    const mix = (a, b, t, s = 1) => a.clone().lerp(b, t).multiplyScalar(s);
    const jit = (c, k = 0.13) => c.clone().multiplyScalar(1 + rng.range(-k, k));
    const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#B8C060');
    scene.fog = new THREE.FogExp2(new THREE.Color('#C8C070'), 0.0007);

    // ---------- the camera: low over the furrows, a slow creep forward that pans left with the sower ----------
    const q = (typeof location !== 'undefined') ? new URLSearchParams(location.search) : null;
    const dbg = q && q.get('vgcam') ? q.get('vgcam').split(',').map(Number) : null;   // dev aid: eyeH, yaw0, yaw1, pitch, travel
    const [EH, YAW0, YAW1, PITCH, TRAVEL] = dbg || [1.25, 4, -18, 9, 2.0];
    // the journey's ending (see 'the field answers' below): ?sowerEnd=a|b|c|d, d (violet tulips) by default
    const END = ['a', 'b', 'c', 'd'].includes(q && q.get('sowerEnd')) ? q.get('sowerEnd') : 'd';
    const camPts = [], cp0 = new THREE.Vector3(0.4, EH, 0.5);
    for (let i = 0; i <= 12; i++) {
      const s = i / 12, yaw = lerp(YAW0, YAW1, s) * D2R;
      camPts.push(cp0.clone());
      cp0.add(new THREE.Vector3(Math.sin(yaw) * Math.cos(PITCH * D2R), Math.sin(PITCH * D2R), -Math.cos(yaw) * Math.cos(PITCH * D2R)).multiplyScalar(TRAVEL / 12));
    }
    // journey: after the creep the lens leaves the sower and pushes on low over the furrows to the last flower (the hand-off)
    const creepL = camPts.length;
    { const yaw = YAW1 * D2R, d = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)), e = cp0.clone();
      for (const [k, y] of END === 'd' ? [[2.2, 1.18], [4.4, 0.86], [5.8, 0.68], [7, 0.64]] : [[2.2, 1.3], [4.6, 1.28], [7, 1.25]]) camPts.push(e.clone().addScaledVector(d, k).setY(y)); }
    const path = makePath(camPts);
    const HS = ctx.vary && ctx.vary.duration > 0 ? ctx.vary.duration / 15 : 1;
    const uCreep = (() => { const q = new THREE.Vector3(); let best = 1, bd = 1e9; for (let i = 0; i <= 400; i++) { path.pointAt(i / 400, q); const dd = q.distanceTo(camPts[creepL - 1]); if (dd < bd) { bd = dd; best = i / 400; } } return best; })();
    const eyeMid = path.pointAt(0.5, new THREE.Vector3());

    // ---------- the land ----------
    const FD = new THREE.Vector2(0.5, -1).normalize(), FN = new THREE.Vector2(-FD.y, FD.x), SPACING = 0.62;
    const furrow = (x, z) => Math.cos((x * FN.x + z * FN.y) / SPACING * TAU + 0.6 * noise.n2(x * 0.05, z * 0.05));   // +1 ridge, -1 trough
    const fwd = (x, z) => -(z - 0.5);                                   // distance ahead of the camera
    const ground = (x, z) => {
      const r = fwd(x, z);
      let h = 0.05 * furrow(x, z) * (1 - sstep(25, 40, r)) + 0.3 * noise.fbm2(x * 0.03, z * 0.03, 2);
      h += 4.2 * sstep(26, 140, r) + 1.2 * sstep(140, 500, r) + 2.5 * noise.fbm2(x * 0.004 + 2, z * 0.004, 2) * sstep(60, 200, r);
      return h;
    };
    const WHEAT0 = 34, WHEAT1 = 150;
    // the field's sector seen from the start (a, radians off -Z): d's low tail turns and drops, so its field runs wider, to
    // both edges of the frame at every angle (no slanted cut on the right); WD scales the stroke counts with the width
    const AW = END === 'd' ? 0.6 : 0, WD = 1 + AW * 2 / 1.75;

    // ---------- shared uniforms, materials ----------
    const wdir = new THREE.Vector2(1, -0.25).normalize();
    const SU = {
      uTime: { value: 0 }, uGain: { value: 1.08 }, uWeave: { value: 1.5708 }, uMinW: { value: 0.0016 }, uFlash: { value: new THREE.Vector3() },
      uTint: { value: new THREE.Color(1, 1, 1) }, uFine: { value: FINE }, uFlashD: { value: new THREE.Vector3(0, 1, 0) },
      uWind: { value: new THREE.Vector4(wdir.x, wdir.y, 0.12, 0.35) },
    };
    const strokeMat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU), vertexShader: FIELD_VS, fragmentShader: TINT_FS, side: THREE.DoubleSide, fog: true });

    // ---------- the sky ----------
    const sky = makeSky(fogU(), SU.uWeave, rng.range(0, 10)), SKU = sky.u;
    scene.add(sky.dome);
    const K = (o) => { const r = {}; for (const k in o) r[k] = typeof o[k] === 'string' ? C(o[k]) : o[k]; return r; };
    // the hours: noon yellow-green, the sun going down orange, dusk, night blue. tint: the light on the land
    const day = K({ h0: '#DCD866', h1: '#BCCA6A', h2: '#ECE496', z0: '#A6BC58', z1: '#8CAE52', z2: '#C8D27E', a0: '#F2E8A6', a1: '#E2CA52', glow: '#E8A040', gs: 0.35, stars: 0, fog: '#C8C070' });
    const gold = K({ h0: '#E89A3E', h1: '#D8763A', h2: '#F2C462', z0: '#C2A85E', z1: '#98A070', z2: '#DAB872', a0: '#F4D07E', a1: '#E08A40', glow: '#EA6A2A', gs: 0.85, stars: 0, fog: '#D09050' });
    const dusk = K({ h0: '#C85E3C', h1: '#8A4A6E', h2: '#E09052', z0: '#3A4A8C', z1: '#2A3A7C', z2: '#5A6AA2', a0: '#7A8AC2', a1: '#C07052', glow: '#D05A2A', gs: 0.6, stars: 0.35, fog: '#6A4A6A' });
    const night = K({ h0: '#24387C', h1: '#2C2C6C', h2: '#40609E', z0: '#0E1A50', z1: '#1A2A74', z2: '#2E4C9C', a0: '#5C88CA', a1: '#3C64B2', glow: '#7A4A54', gs: 0.18, stars: 1, fog: '#18224A' });
    for (const [o, t] of [[day, [1.02, 1.0, 0.94]], [gold, [1.05, 0.82, 0.62]], [dusk, [0.5, 0.4, 0.55]], [night, [0.17, 0.21, 0.46]]]) o.tint = new THREE.Color(...t);
    // (d holds the dusk a little longer, so the tulip field still reads when it comes up)
    const hour = keyed(END === 'd' ? [[0, day], [4.5, day], [7.5, gold], [10.6, dusk], [13.4, night], [99, night]] : [[0, day], [4.5, day], [7.5, gold], [10, dusk], [12, night], [99, night]]);
    const SUN_AZ = 5, SUN_R = 7.5;
    const sunEl = (t) => 7.8 - 17.5 * sstep(3, 10.5, t);
    const sunCore = [C('#F8E474', 0.9), C('#F4A43A', 0.88)], sunBody = [C('#EEB422', 0.88), C('#E87A26', 0.86)], sunHalo = [C('#F2E276', 0.84), C('#F2A64A', 0.84)];
    const azel = (az, el, out = new THREE.Vector3()) => out.set(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R));
    await ctx.yield();

    // ---------- the painted underlayer ----------
    {
      const NX = 180, NZ = 220, X0 = 900, Z0 = 12, Z1 = -950;
      const pos = new Float32Array((NX + 1) * (NZ + 1) * 3), col = new Float32Array((NX + 1) * (NZ + 1) * 3), idx = [];
      const cF = C('#5A4A78'), cF2 = C('#9A6A40'), cW = C('#B8A840'), cWf = C('#9AA048'), c = new THREE.Color(); let o = 0;
      for (let j = 0; j <= NZ; j++) {
        const s = j / NZ, z = Z0 + (Z1 - Z0) * (0.25 * s + 0.75 * s * s * s);
        for (let i = 0; i <= NX; i++) {
          const rr = i / NX * 2 - 1, x = X0 * (0.1 * rr + 0.9 * rr * rr * rr), r = fwd(x, z);
          pos[o] = x; pos[o + 1] = ground(x, z) - 0.03; pos[o + 2] = z;
          c.copy(cF).lerp(cF2, 0.35 + 0.25 * noise.n2(x * 0.1, z * 0.1));
          c.lerp(cW, sstep(WHEAT0 - 4, WHEAT0 + 6, r)).lerp(cWf, sstep(WHEAT1, 400, r));
          c.multiplyScalar(lerp(0.55, 1, sstep(3, 30, r)));
          col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; o += 3;
        }
      }
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, e = a + NX + 1, f = e + 1; idx.push(a, e, b, b, e, f); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
      const gu = Object.assign(fogU(), SU, { uWind: { value: new THREE.Vector4(FD.x, FD.y, 0, 0) } });
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: gu, vertexShader: GROUND_VS, fragmentShader: GROUNDT_FS, fog: true, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.name = 'field-underlayer'; scene.add(m);
    }
    await ctx.yield();

    // ---------- strokes: furrows, wheat, far dashes ----------
    const set = fieldSet();
    const warm = [[C('#D88C42'), 0.22], [C('#C8A448'), 0.22], [C('#E2B866'), 0.16], [C('#C87A5E'), 0.1], [C('#E8D088'), 0.1], [C('#B87638'), 0.1], [C('#9AAA58'), 0.1]];
    const cool = [[C('#5A4A9A'), 0.26], [C('#3A4A9C'), 0.22], [C('#6C5CA4'), 0.14], [C('#2A367A'), 0.14], [C('#4C6CAA'), 0.12], [C('#7A5A8A'), 0.08], [C('#C07A3A'), 0.04]];
    const pickW = (list) => { let r = rng(); for (const [c, w] of list) if ((r -= w) <= 0) return c; return list[0][0]; };
    const second = (c, list) => rng.chance(0.55) ? mix(c, pickW(list), 0.6) : mix(c, rng.chance(0.5) ? C('#F0DCA0') : C('#2A2A5A'), 0.35);
    const ang = (a) => [Math.cos(a), Math.sin(a)];
    // the furrows: chunky dashes laid along them, warm on the ridges, violet-blue in the troughs, now and then across
    {
      const N = Math.round(150000 * detail * WD), r0 = 0.9, r1 = 42;
      for (let i = 0; i < N; i++) {
        if (i % 4000 === 3999) await ctx.yield();
        const u = rng(), r = 1 / (1 / r0 - u * (1 / r0 - 1 / r1)), a = rng.range(-1.0 - AW, 0.75 + AW);
        const x = 0.4 + Math.sin(a) * r * 1.05, z = 0.5 - Math.cos(a) * r;
        const fr = furrow(x, z), ridge = fr + 0.25 * rng.gauss() > 0.35;
        const c = jit(pickW(ridge ? warm : cool));
        const s = 0.045 + 0.017 * r, hl = s * rng.range(0.9, 1.7);
        const across = rng.chance(0.08), [ca, sa] = ang(rng.gauss() * 0.15 + (across ? 1.2 * rng.sign() : 0));
        const tx = FD.x * ca - FD.y * sa, tz = FD.x * sa + FD.y * ca;
        set.add(0, x, ground(x, z) + 0.015 + 0.01 * s, z, tx * hl, rng.range(-0.05, 0.12) * hl, tz * hl, s * rng.range(0.24, 0.36), c, second(c, ridge ? warm : cool), rng.range(0.3, 1), rng());
      }
    }
    await ctx.yield();
    // the wheat band: stalks of yellow-green and ochre, the ears lighter, on the rise behind the field
    {
      const wc = [[C('#D8C048'), 0.26], [C('#B8B040'), 0.2], [C('#9AAA42'), 0.16], [C('#E0D070'), 0.14], [C('#C89A38'), 0.12], [C('#7A9A48'), 0.07], [C('#E8A848'), 0.05]];
      const N = Math.round(26000 * detail * WD);
      for (let i = 0; i < N; i++) {
        if (i % 4000 === 3999) await ctx.yield();
        const r = WHEAT0 + Math.pow(rng(), 1.6) * (WHEAT1 - WHEAT0), a = rng.range(-1.05 - AW, 0.85 + AW);
        const x = 0.4 + Math.sin(a) * r * 1.1, z = 0.5 - Math.cos(a) * r;
        const sc = r / 12, H = rng.range(1.1, 1.6) * (1 + 0.4 * sstep(40, 150, r)), lx = rng.gauss() * 0.15, lz = rng.gauss() * 0.15;
        const c = jit(pickW(wc));
        set.add(1, x, ground(x, z) - 0.05, z, lx, H * 0.7, lz, 0.018 * sc, c, mix(c, pickW(wc), 0.6), rng.range(0.4, 1), rng(), 0, rng.range(0.5, 1.2));
        const ce = jit(rng.chance(0.5) ? C('#EED868') : pickW(wc));
        set.add(1, x, ground(x, z) - 0.05, z, lx, H, lz, 0.028 * sc, ce, mix(ce, C('#F2E6A0'), 0.5), rng.range(0.4, 1), rng(), 0.62, rng.range(0.5, 1.2));
      }
      // the near edge of the wheat: a darker, greener fringe where it meets the ploughland
      for (let i = 0; i < 5000 * detail * WD; i++) {
        const r = WHEAT0 + rng.range(-2, 3), a = rng.range(-1.05 - AW, 0.85 + AW), x = 0.4 + Math.sin(a) * r * 1.1, z = 0.5 - Math.cos(a) * r;
        const c = jit(rng.chance(0.6) ? C('#6A8A3A') : C('#8A7A30'));
        set.add(1, x, ground(x, z) - 0.05, z, rng.gauss() * 0.2, rng.range(0.5, 1.0), rng.gauss() * 0.2, 0.05 * r / 12, c, mix(c, C('#3A5A3A'), 0.5), 0.6, rng(), 0, 0.8);
      }
    }
    await ctx.yield();
    // far dashes beyond the wheat
    {
      const fc = [C('#A8A848'), C('#C8A848'), C('#8A9A50'), C('#D0B860'), C('#7A8A5A'), C('#B88A48')];
      for (let i = 0; i < 16000 * detail * WD; i++) {
        const r = WHEAT1 + Math.pow(rng(), 1.5) * 750, a = rng.range(-1.1 - AW, 0.9 + AW), x = 0.4 + Math.sin(a) * r * 1.1, z = 0.5 - Math.cos(a) * r;
        const s = r / 30, c = jit(rng.pick(fc)), [ca, sa] = ang(rng.gauss() * 0.3);
        set.add(0, x, ground(x, z) + 0.4 * s, z, ca * s, rng.range(0, 0.2) * s, sa * s * 0.3, s * 0.22, c, mix(c, rng.pick(fc), 0.6), 0.6, rng());
      }
    }
    scene.add(Object.assign(set.mesh(strokeMat, 4), { name: 'field-strokes' }));
    await ctx.yield();

    // ---------- the sower ----------
    // a rig of segments [a, b, half width, palette]; each segment is drawn as NS strokes: a dark contour at both edges
    // and three body strokes across it, turned to the lens every frame
    const SPEED = 0.2, AMP = 0.21, LEG = 0.46, CYCLE = 4 * 2 * LEG * Math.sin(AMP);
    // he walks about 9 m out in front of the lens, left of the sun as in the painting and clear of the line to the last
    // flower all the way, so he is never more than about 15% of the frame tall and never hidden behind it
    const walk0 = new THREE.Vector3(-2.5, 0, -9.5), head = new THREE.Vector3(-1, 0, 0.16).normalize();
    const cloth = [C('#2C3470'), C('#3A3E86'), C('#4A3A72'), C('#24305E'), C('#34408A')], trous = [C('#3A4A8A'), C('#2E3A76'), C('#5A4A7A'), C('#B07038')];
    // the face is in his hat's shadow against the low sun: dark umber, one warm stroke; the bag a dull straw, not a white card
    const skin = [C('#6A4430'), C('#5A3A2E'), C('#B06A38')], hat = [C('#D8B04A'), C('#C09038'), C('#E8C870')], bag = [C('#C8B47A'), C('#A8945E'), C('#D8C490')], rim = C('#0C0E1E');
    const SEGS = ['thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'torso', 'chest', 'neck', 'head', 'uarmR', 'farmR', 'handR', 'uarmL', 'farmL', 'bag', 'brim', 'brim2', 'crown'];
    const PAL = { thighL: trous, shinL: trous, footL: [C('#3A2A24'), C('#5A3A2A')], thighR: trous, shinR: trous, footR: [C('#3A2A24'), C('#5A3A2A')],
      torso: cloth, chest: cloth, neck: [C('#24305E'), C('#1A2048')], head: [C('#2E2430'), C('#3A2A2A'), C('#4A3428')], uarmR: cloth, farmR: cloth, handR: skin, uarmL: cloth, farmL: cloth, bag, brim: hat, brim2: hat, crown: hat };
    const NS = 7, fig = fieldSet();
    const jk = [];                                             // per stroke: where along and across its segment it sits
    for (const nm of SEGS) for (let k = 0; k < NS; k++) {
      const edge = k < 2, c = edge ? rim.clone() : jit(rng.pick(PAL[nm]));
      fig.add(0, 0, -500, 0, 0, 0.1, 0, 0.01, c, edge ? rim.clone() : mix(c, rng.pick(PAL[nm]), 0.6), edge ? 0.2 : rng.range(0.4, 0.9), rng());
      jk.push([rng.range(-1, 1), rng.range(-1, 1)]);
    }
    const NSEED = 36;
    for (let i = 0; i < NSEED; i++) { const c = jit(rng.pick(bag)); fig.add(0, 0, -500, 0, 0, 0.01, 0, 0.008, c, c, 0.3, rng(), 0, 0, 0.15); }
    const figMesh = fig.mesh(strokeMat, 2, true); figMesh.renderOrder = 2; figMesh.name = 'sower'; scene.add(figMesh);
    const aPf = figMesh.geometry.getAttribute('aP'), aDf = figMesh.geometry.getAttribute('aD');
    const jt = SEGS.map(() => [rng.range(-1, 1), rng.range(-1, 1), rng.range(0.85, 1.15)]);   // per segment stroke jitter
    const V = () => new THREE.Vector3();
    const J = { pelvis: V(), hipL: V(), hipR: V(), kneeL: V(), kneeR: V(), ankL: V(), ankR: V(), toeL: V(), toeR: V(), chest: V(), neck: V(), headC: V(), headT: V(),
      shL: V(), shR: V(), elL: V(), elR: V(), haL: V(), haR: V(), bagA: V(), bagB: V(), brimA: V(), brimB: V(), brimC: V(), brimD: V(), crownT: V() };
    const F = V(), S = V(), Y = new THREE.Vector3(0, 1, 0), tmp = V(), tmp2 = V(), camP = V(), side = V(), ax = V();
    const walkDist = (t) => SPEED * t;
    // the cast: the right hand sweeps out from the bag to the right in the first 40% of each cycle, comes back slowly
    const castOf = (c) => c < 0.4 ? sstep(0, 0.4, c) : 1 - sstep(0.4, 1, c);
    function poseAt(t) {
      const d = walkDist(t), ph = d / CYCLE * TAU;
      F.copy(head); S.crossVectors(F, Y).normalize();                         // S: his right
      const base = tmp.copy(walk0).addScaledVector(head, d);
      const leg = (sg, hip, knee, ank, toe) => {
        const p = ph + (sg < 0 ? 0 : Math.PI), th = AMP * Math.sin(p), kn = 0.08 + 0.7 * Math.pow(Math.max(0, Math.cos(p)), 1.5);
        knee.copy(hip).addScaledVector(F, Math.sin(th) * LEG).addScaledVector(Y, -Math.cos(th) * LEG);
        ank.copy(knee).addScaledVector(F, Math.sin(th - kn) * LEG).addScaledVector(Y, -Math.cos(th - kn) * LEG);
        toe.copy(ank).addScaledVector(F, 0.2).addScaledVector(Y, -0.04 + 0.05 * Math.max(0, Math.cos(p)));
      };
      J.pelvis.set(0, 0, 0);
      J.hipL.copy(S).multiplyScalar(-0.11); J.hipR.copy(S).multiplyScalar(0.11);
      leg(-1, J.hipL, J.kneeL, J.ankL, J.toeL); leg(1, J.hipR, J.kneeR, J.ankR, J.toeR);
      const lift = -Math.min(J.ankL.y, J.ankR.y) + 0.07 + ground(base.x, base.z);   // the stance foot on the ground
      const lean = 0.2 + 0.04 * Math.sin(ph * 2), twist = 0.12 * Math.sin(ph);
      J.chest.copy(F).multiplyScalar(Math.sin(lean) * 0.5).addScaledVector(Y, Math.cos(lean) * 0.5);
      J.neck.copy(J.chest).addScaledVector(F, Math.sin(lean) * 0.1).addScaledVector(Y, 0.1);
      J.headC.copy(J.neck).addScaledVector(F, 0.04).addScaledVector(Y, 0.08); J.headT.copy(J.headC).addScaledVector(Y, 0.05).addScaledVector(F, 0.015);
      const Sx = tmp2.copy(S).applyAxisAngle(Y, twist);
      J.shL.copy(J.chest).addScaledVector(Sx, -0.2).addScaledVector(Y, -0.04); J.shR.copy(J.chest).addScaledVector(Sx, 0.2).addScaledVector(Y, -0.04);
      // the right arm: from the bag at his left hip, flung out to the right and forward, the hand open
      const cst = castOf(((ph / TAU) % 1 + 1) % 1), al = lerp(-0.85, 1.35, cst), el = -1.05 + 0.75 * Math.sin(cst * Math.PI);
      const dirA = ax.copy(F).multiplyScalar(Math.cos(al) * Math.cos(el)).addScaledVector(S, Math.sin(al) * Math.cos(el)).addScaledVector(Y, Math.sin(el));
      J.haR.copy(J.shR).addScaledVector(dirA, 0.64);
      J.elR.copy(J.shR).lerp(J.haR, 0.5).addScaledVector(Y, -0.05).addScaledVector(S, 0.05 * (1 - cst));
      // the left arm holds the bag at his belly
      J.elL.copy(J.shL).addScaledVector(Y, -0.27).addScaledVector(F, 0.08).addScaledVector(S, -0.06);
      J.haL.copy(J.chest).addScaledVector(Y, -0.42).addScaledVector(F, 0.2).addScaledVector(S, -0.04);
      J.bagA.copy(J.haL).addScaledVector(Y, 0.02).addScaledVector(F, 0.02); J.bagB.copy(J.bagA).addScaledVector(Y, -0.2).addScaledVector(S, -0.06).addScaledVector(F, 0.02);
      J.brimA.copy(J.headT).addScaledVector(Y, 0.0).addScaledVector(F, -0.2); J.brimB.copy(J.headT).addScaledVector(Y, -0.025).addScaledVector(F, 0.22);
      J.brimC.copy(J.headT).addScaledVector(Y, -0.01).addScaledVector(S, -0.21); J.brimD.copy(J.headT).addScaledVector(Y, -0.01).addScaledVector(S, 0.21);
      J.crownT.copy(J.headT).addScaledVector(Y, 0.045);
      for (const k in J) J[k].add(base).setY(J[k].y + lift);
      return { ph, cst };
    }
    // [from, to, half width at from, width at to as a fraction]: limbs and the coat taper, the hat is a short crown on a wide brim
    const SEGDEF = {
      thighL: ['hipL', 'kneeL', 0.085, 0.75], shinL: ['kneeL', 'ankL', 0.065, 0.7], footL: ['ankL', 'toeL', 0.045, 0.8],
      thighR: ['hipR', 'kneeR', 0.085, 0.75], shinR: ['kneeR', 'ankR', 0.065, 0.7], footR: ['ankR', 'toeR', 0.045, 0.8],
      torso: ['pelvis', 'chest', 0.17, 1.15], chest: ['chest', 'neck', 0.19, 0.55], neck: ['neck', 'headC', 0.04, 0.9], head: ['headC', 'headT', 0.062, 0.9],
      uarmR: ['shR', 'elR', 0.06, 0.8], farmR: ['elR', 'haR', 0.048, 0.75], handR: ['haR', 'haR', 0.04, 0.7], uarmL: ['shL', 'elL', 0.06, 0.8], farmL: ['elL', 'haL', 0.048, 0.75],
      bag: ['bagA', 'bagB', 0.1, 1.3], brim: ['brimA', 'brimB', 0.026, 1], brim2: ['brimC', 'brimD', 0.026, 1], crown: ['headT', 'crownT', 0.07, 0.8],
    };
    const pa = V(), pb = V(), mid = V(), dv = V(), tw = V();
    const putS = (i, a, b, hw) => { const P = aPf.array, D = aDf.array, o = i * 4; P[o] = (a.x + b.x) / 2; P[o + 1] = (a.y + b.y) / 2; P[o + 2] = (a.z + b.z) / 2; D[o] = (b.x - a.x) / 2; D[o + 1] = (b.y - a.y) / 2; D[o + 2] = (b.z - a.z) / 2; D[o + 3] = hw; };
    function drawSower(t) {
      const { ph } = poseAt(t);
      SEGS.forEach((nm, si) => {
        const [ka, kb, w0, wr] = SEGDEF[nm], [, , j3] = jt[si];
        pa.copy(J[ka]); pb.copy(J[kb]);
        if (nm === 'pelvis' || ka === 'pelvis') pa.copy(J.hipL).lerp(J.hipR, 0.5).addScaledVector(Y, 0.04);
        if (nm === 'handR') { pa.copy(J.elR).lerp(J.haR, 0.85); pb.copy(J.haR).addScaledVector(dv.subVectors(J.haR, J.elR).normalize(), 0.09); }
        ax.subVectors(pb, pa); const L = ax.length(); if (L > 1e-5) ax.divideScalar(L); else ax.set(0, 1, 0);
        mid.copy(pa).lerp(pb, 0.5);
        dv.subVectors(camP, mid).normalize(); const toward = tw.copy(dv);
        side.crossVectors(ax, dv).normalize();
        const wa = w0 * j3, wb = wa * wr;
        for (let k = 0; k < NS; k++) {
          const i = si * NS + k, [r1, r2] = jk[i];
          if (k < 2) {                                                     // the dark contour, one each side, following the taper
            const sg = k ? 1 : -1;
            tmp.copy(pa).addScaledVector(side, sg * wa * 0.92).addScaledVector(ax, -0.015); tmp2.copy(pb).addScaledVector(side, sg * wb * 0.92).addScaledVector(ax, 0.015);
            tmp.addScaledVector(toward, -0.012); tmp2.addScaledVector(toward, -0.012);
            putS(i, tmp, tmp2, (wa + wb) * 0.11);
          } else {                                                         // five body strokes across it: staggered, a little aslant, overlapping
            const c = (k - 4) * 0.3 + r1 * 0.06, sk = (k % 2 ? 1 : -1) * 0.12, s0 = (k % 2 ? 0.02 : 0.2) + 0.06 * r2, s1 = (k % 2 ? 0.8 : 0.98) + 0.05 * r2;
            tmp.copy(pa).addScaledVector(ax, L * s0 - 0.01).addScaledVector(side, (c + sk) * wa); tmp2.copy(pa).addScaledVector(ax, L * s1 + 0.01).addScaledVector(side, (c - sk) * (wa + (wb - wa) * s1));
            tmp.addScaledVector(toward, 0.003 * (k - 1)); tmp2.addScaledVector(toward, 0.003 * (k - 1));
            putS(i, tmp, tmp2, (wa + wb) * 0.19);
          }
        }
      });
      // the seed: a fan of pale dabs thrown from the hand at the end of each sweep, falling on the furrows
      const cyc = walkDist(t) / CYCLE, n0 = Math.floor(cyc);
      for (let i = 0; i < NSEED; i++) {
        const o = SEGS.length * NS + i, n = n0 - (i % 2), h1 = hash(n * 31 + i), h2 = hash(n * 17 + i * 3.1), h3 = hash(n * 7 + i * 1.7);
        const s = (cyc - n - 0.32 - 0.08 * h1) * CYCLE / SPEED;             // seconds since this seed left the hand
        if (s < 0 || s > 1.1) { aPf.array[o * 4 + 1] = -500; continue; }
        const tr = (n + 0.32) * CYCLE / SPEED; poseAt(tr);
        const vx = 1.2 + 2.2 * h2, vy = 0.4 + 1.2 * h3, a = (h1 - 0.5) * 1.4;
        dv.copy(S).multiplyScalar(Math.cos(a) * vx).addScaledVector(F, Math.sin(a) * vx + 0.6).addScaledVector(Y, vy);
        tmp.copy(J.haR).addScaledVector(dv, s).addScaledVector(Y, -4.9 * s * s);
        const gy = ground(tmp.x, tmp.z) + 0.02; if (tmp.y < gy) tmp.y = gy;
        tmp2.copy(tmp).addScaledVector(dv, 0.012);
        putS(o, tmp, tmp2, 0.011);
      }
      poseAt(t);
      aPf.needsUpdate = true; aDf.needsUpdate = true;
      return ph;
    }
    await ctx.yield();

    // ---------- the field answers: flowers ----------
    // From dusk flowers grow along the furrow ridges, in waves out from the sower's track, near and far; one grows on the
    // line in front of the lens, opens on a drum hit (BLOOM) and the lens flies into its heart, where the exit (a bare pane)
    // fades in. Four looks, ?sowerEnd=a|b|c|d: a poppies (red and white, dark hearts with pollen stamens), b night white
    // trumpets (datura, glowing, unfurling in a spiral), c star flowers (each heart a small turning star-whirl), d (the
    // default) violet tulips that rise out of the violet furrows in rows, and the lens glides low into one tulip's cup.
    // Times are seconds of the van-gogh journey step (its clock starts at 72 s of the clip): BLOOM is the kick and snare at
    // 124.656 s. The flowers' clock is the hour's, so a lone run of the world (HS = 1) plays the same story faster.
    const TS = 48.97 / 15, BLOOM = 52.656;
    const frng = makeRng(hashSeed('vg-sower:flowers:' + END));
    const SH = {
      round: (s) => (0.3 + 0.7 * Math.sin(Math.min(1, s * 1.5) * Math.PI / 2)) * (1 - 0.25 * s * s * s),
      flare: (s) => 0.25 + 0.75 * Math.pow(s, 1.3),
      lance: (s) => Math.max(0.15, Math.pow(Math.sin(Math.PI * Math.min(s, 0.97)), 0.7)),
      line: () => 1,
    };
    // a petal-like part: closed angle off the axis cl[0] + cl[1] s, open op[0] + op[1] s^op[2]; start radius r0 [closed, open];
    // closed length lc (x its open length); width W (x length) on shape; tw: spiral twist of the bud, gone when open; sw: a
    // spiral wind that stays; sp: turns with the flower's spin; cr: crumple; z0: offset along the axis (minus: behind the heart)
    const cfg = (o) => Object.assign({ cl: [0.1, 0.2], op: [1, 0.5, 1], r0: [0.02, 0.1], lc: 0.3, W: 0.4, shape: 'round', tw: 0, sw: 0, sp: 0, cr: 0, z0: 0 }, o);
    const fl = fieldSet(), flowers = [], strokes = [];
    const Yv = new THREE.Vector3(0, 1, 0), WHITE = new THREE.Color(1, 1, 1);
    const addS = (st, c1, c2, load, em) => { strokes.push(st); fl.add(0, 0, -500, 0, 0, 0.01, 0, 0.01, c1, c2, load, frng(), 0, 0, em); };
    const camMid = eyeMid.clone();
    // the variants' pigments
    const P3 = (...h) => h.map((x) => C(x));
    const VAR = {
      a: { lift: 0.32, veil: '#2A1E44',
        field: () => frng.chance(0.8) ? { pet: P3('#D8362A', '#C42A2C', '#E85234', '#B8242C'), heart: P3('#1A1228', '#2A1A3A'), em: 0.28 } : { pet: P3('#EEEAE0', '#DCD6D0', '#E8E0D8'), heart: P3('#1A1228', '#2A2240'), em: 0.3 } },
      b: { lift: 0.3, veil: '#EFE4BE',
        field: () => frng.chance(0.85) ? { pet: P3('#F2EEE2', '#E6E2D6', '#F6F0D4', '#DAD8E6'), heart: P3('#FFF0B8', '#F4E090'), em: 0.62 } : { pet: P3('#C8B8E0', '#B8A8D4'), heart: P3('#FFF0B8'), em: 0.45 } },
      d: { lift: 0.46, veil: '#4A3A7A',
        field: () => ({ pet: frng.chance(0.45) ? P3('#6A3A9A', '#7A4AAA', '#5A2A8A', '#6E44A8') : frng.chance(0.6) ? P3('#8A3A8A', '#9A4A9A', '#7A3488') : P3('#B83A8A', '#C84A9A', '#A8347E'),
          rim: P3('#D0A8E0', '#C0B0E8', '#E0B0D0'), em: 0.34 }) },
      c: { lift: 0.55, veil: '#22306E',
        field: () => ({ pet: frng.chance(0.8) ? P3('#4A64D0', '#5A74DA', '#3A54C0', '#6A80E0') : P3('#7A64C8', '#8A74D0'), heart: P3('#F8EEA0', '#FFF6C8'), ring: P3('#E8D870', '#88B0D8'), em: 0.95 }) },
    }[END];
    const FCF = {
      a: { pet: cfg({ cl: [0.15, 0.2], op: [0.85, 0.5, 1], r0: [0.02, 0.1], lc: 0.45, W: 0.5, shape: 'round', cr: 0.08 }), n: 5, hk: 0.5,
        heart: cfg({ cl: [Math.PI / 2, 0], op: [Math.PI / 2, 0, 1], r0: [-0.1, -0.16], lc: 0.6, W: 0.55, shape: 'line', z0: 0.04 }) },
      b: { pet: cfg({ cl: [0.06, 0.06], op: [0.3, 1.0, 2], r0: [0.02, 0.06], lc: 0.6, W: 0.38, shape: 'flare', tw: 2.2, sw: 0.3 }), n: 5, hk: 0.55,
        heart: cfg({ cl: [Math.PI / 2, 0], op: [Math.PI / 2, 0, 1], r0: [-0.08, -0.12], lc: 0.6, W: 0.6, shape: 'line', z0: 0.15 }) },
      d: { pet: cfg({ cl: [0.1, -0.05], op: [0.5, -0.32, 1], r0: [0.02, 0.1], lc: 0.5, W: 0.55, shape: 'round' }), n: 5, hk: 0.6, lk: 1.5 },
      c: { pet: cfg({ cl: [0.15, 0.2], op: [1.15, 0.35, 1], r0: [0.02, 0.18], lc: 0.5, W: 0.2, shape: 'lance' }), n: 6, hk: 0.55,
        heart: cfg({ cl: [Math.PI / 2, 0], op: [Math.PI / 2, 0, 1], r0: [-0.1, -0.15], lc: 0.6, W: 0.6, shape: 'line', z0: 0.05 }),
        ring: cfg({ cl: [Math.PI / 2, 0], op: [Math.PI / 2, 0, 1], r0: [0.12, 0.24], lc: 0.6, W: 0.12, shape: 'line', sw: 1.6, sp: 1, z0: 0.06 }) },
    }[END];
    // the sower's track: the seed falls there first, so the field answers there first and the answer runs out in waves
    const trA = walk0.clone(), trB = walk0.clone().addScaledVector(head, SPEED * 33);
    const dTrack = (x, z) => { const ax = trB.x - trA.x, az = trB.z - trA.z, k = Math.min(1, Math.max(0, ((x - trA.x) * ax + (z - trA.z) * az) / (ax * ax + az * az))); return Math.hypot(x - trA.x - ax * k, z - trA.z - az * k); };
    const newFlower = (o) => {
      const F = Object.assign({ push: 1, Hd: V(), Hs: V(), A: V(), e1: V(), e2: V(), M: V(), g: 0, o: 0, sc: 0, ang: 0, vis: false, spin: 0 }, o);
      flowers.push(F); return flowers.length - 1;
    };
    // the field flowers: on the furrow ridges of the ploughland, and some taller ones over the near edge of the wheat
    {
      const endU = 0.55, L = path.length;
      const TUL = END === 'd';
      for (let n = 0, tries = 0; n < Math.round((TUL ? 3600 * WD : 2200) * detail) && tries < 150000; tries++) {
        const far = n % 8 === 7;
        const r = far ? WHEAT0 + Math.pow(frng(), 1.4) * 50 : 1 / (1 / 1.6 - frng() * (1 / 1.6 - 1 / 33)), a = frng.range(-1.0 - AW, 0.8 + AW);
        const x = 0.4 + Math.sin(a) * r * 1.08, z = 0.5 - Math.cos(a) * r;
        if (!far && (TUL ? furrow(x, z) > -0.35 : furrow(x, z) < 0.45)) continue;          // tulips in the violet troughs, the rest on the ridges
        const nr = path.nearestXZ(x, z); if (nr.dist < (TUL ? (nr.u > 0.8 ? 0.6 : 0.3) : 0.75) && nr.u > endU) continue;   // nothing between the lens and the last flower
        const dE = Math.hypot(x - path.end.x, z - path.end.z), big = TUL ? 1 + 2.2 * Math.exp(-dE / 1.3) : 1;   // the tulips round the last one grow bigger
        const R = (0.045 + 0.008 * Math.min(r, 50)) * frng.range(0.75, 1.25) * (TUL ? big : 1), stemH = far ? frng.range(1.55, 2.1) : (0.2 + 0.012 * r) * frng.range(0.7, 1.3) * Math.sqrt(big);
        const B = new THREE.Vector3(x, ground(x, z) - 0.02, z), toC = new THREE.Vector3(camMid.x - x, 0, camMid.z - z).normalize();
        const f = new THREE.Vector3().copy(Yv).multiplyScalar(0.9).addScaledVector(toC, TUL ? 0.18 : 0.32).add(new THREE.Vector3(frng.gauss() * 0.18, 0, frng.gauss() * 0.18)).normalize();
        const Ac = new THREE.Vector3(frng.gauss() * 0.2, 1, frng.gauss() * 0.2).addScaledVector(toC, -0.1).normalize();
        const dT = dTrack(x, z), born = Math.min(50, (END === 'd' ? 31 : 33) + 16 * (1 - Math.exp(-dT / 10)) + 0.9 * Math.sin(dT * 0.8) + Math.abs(frng.gauss()) * 0.9);
        const grow = frng.range(1.6, 2.8), open = born + grow * 0.8 + frng.range(0, 0.9);
        const lean = new THREE.Vector3(frng.gauss(), 0, frng.gauss()).multiplyScalar(0.12 * stemH);
        const H = B.clone().addScaledVector(Yv, stemH).add(lean);
        const Fi = newFlower({ B, H, f, Ac, Sd: new THREE.Vector3().crossVectors(Yv, toC).normalize(), R, born, grow, open, odur: frng.range(0.9, 1.8), lean, stemW: R * 0.09 + 0.004,
          spin: END === 'c' ? frng.range(0.6, 1.2) * frng.sign() : 0 });
        n++;
        const pal = VAR.field(), pk = (l) => jit(frng.pick(l), 0.1), stemC = jit(frng.chance(0.5) ? C('#3A5A3A') : C('#4A6A34'));
        addS({ ty: 1, F: Fi, s0: 0, s1: 1, w0: 0, w1: 0 }, stemC, mix(stemC, C('#1E2A3A'), 0.5), 0.6, 0);
        if (TUL) for (let k = 0; k < 2; k++) { const lc = jit(frng.chance(0.5) ? C('#4A7A3A') : C('#3A6A4A')); addS({ ty: 2, F: Fi, s0: frng.range(0.03, 0.12), len: stemH * frng.range(0.5, 0.75), dir: new THREE.Vector3(frng.gauss() * 0.45, 1.3, frng.gauss() * 0.45).normalize() }, lc, mix(lc, C('#2A3A2A'), 0.5), 0.5, 0.05); }
        else if (frng.chance(0.7)) { const lc = jit(C('#4A7A3A')); addS({ ty: 2, F: Fi, s0: frng.range(0.2, 0.5), len: R * frng.range(1.2, 2), dir: new THREE.Vector3(frng.gauss(), 0.35, frng.gauss()).normalize() }, lc, mix(lc, C('#2A3A2A'), 0.5), 0.5, 0); }
        const ph0 = frng.range(0, TAU);
        for (let i = 0; i < FCF.n; i++) {
          const P = { phi: ph0 + i * TAU / FCF.n + frng.gauss() * 0.2, L: R * frng.range(0.85, 1.15) * (FCF.lk || 1), c: FCF.pet };
          for (const w of [-0.45, 0.45]) { const c1 = pk(pal.pet); addS({ ty: 0, F: Fi, P, s0: frng.range(0, 0.1), s1: frng.range(0.85, 1), w0: w * 0.6, w1: w + frng.gauss() * 0.1, hk: FCF.hk }, c1, mix(c1, pk(pal.pet), 0.6), frng.range(0.3, 0.9), pal.em * frng.range(0.8, 1.2)); }
        }
        if (pal.rim) for (let i = 0; i < 2; i++) {   // the afterglow on the rims of the cup
          const rc = pk(pal.rim), P = { phi: ph0 + (i * 2 + 0.5) * TAU / FCF.n, L: R * (FCF.lk || 1), c: FCF.pet };
          addS({ ty: 0, F: Fi, P, s0: 0.5, s1: 1.0, w0: 0.75, w1: 0.85, hk: 0.12 }, rc, mix(rc, pk(pal.pet), 0.4), 0.5, 0.6);
        }
        if (FCF.heart) { const hc = pk(pal.heart);
        addS({ ty: 0, F: Fi, P: { phi: ph0, L: R * 0.32, c: FCF.heart }, s0: 0, s1: 1, w0: 0, w1: 0, hk: 1 }, hc, mix(hc, pk(pal.heart), 0.5), 0.5, END === 'a' ? 0.05 : pal.em * 1.2); }
        if (FCF.ring) for (let i = 0; i < 2; i++) {
          const rc = jit(pal.ring[i]);
          addS({ ty: 0, F: Fi, P: { phi: ph0 + i * Math.PI, L: R * 0.3, c: FCF.ring }, s0: 0, s1: 1, w0: 0, w1: 0, hk: 1 }, rc, mix(rc, C('#F8F0D0'), 0.4), 0.5, pal.em * (i ? 0.5 : 0.9));
        }
      }
    }
    await ctx.yield();
    // the last flower: on the line at the end of the flight, its heart on the exit. Its bud rises from the furrows while the lens
    // comes on, it opens on BLOOM (a quick spring and a slow last unfurl) and the lens flies into its heart. Everything in front of
    // the pane stays 0.35 m or more off the axis, so it has left the frame by the crossing (0.45 m short of the pane)
    const E = path.end.clone(), fH = path.endTangent.clone().setY(0).normalize().negate();
    {
      const B = new THREE.Vector3(E.x, ground(E.x, E.z) - 0.02, E.z).addScaledVector(fH, -0.12);
      const Sd = new THREE.Vector3().crossVectors(Yv, fH).normalize();
      const hero = newFlower({ hero: true, B, H: E.clone(), f: fH.clone(), Ac: new THREE.Vector3().copy(Yv).addScaledVector(fH, 0.3).normalize(), Sd, R: 1, born: END === 'd' ? 42 : 44, grow: END === 'd' ? 8 : 7.4,
        lean: fH.clone().multiplyScalar(-0.06), stemW: 0.03, spin: END === 'c' ? 0.35 : 0 });
      const pk = (l) => jit(frng.pick(l), 0.09);
      // a petal painted as NJ x NS strokes laid from the heart to the rim, a second thinner coat over it and dark rims
      const petal = (P, NJ, NS, col, rim) => {
        for (let coat = 0; coat < 2; coat++) for (let k = 0; k < NS; k++) for (let j = 0; j < NJ; j++) {
          const w = -1 + (j + 0.5 + (coat ? 0.5 : 0)) / NJ * 2 + frng.range(-0.05, 0.05); if (Math.abs(w) > 1) continue;
          const s0 = k ? Math.max(0, k / NS - 0.05 + frng.range(-0.03, 0.03) + (coat ? 0.5 / NS : 0)) : frng.range(0, 0.14), s1 = Math.min(1.02, (k + 1) / NS + 0.06 + frng.range(-0.03, 0.03) + (coat ? 0.5 / NS : 0));
          const [c1, c2, em] = col((s0 + s1) / 2, w);
          addS({ ty: 0, F: hero, P, s0, s1, w0: w, w1: w * 0.9 + frng.range(-0.04, 0.04), hk: (coat ? 0.9 : 1.45) / NJ }, c1, c2, frng.range(0.3, 0.9), em);
        }
        if (rim) for (const sg of [-1, 1]) for (let k = 0; k < NS; k++) {
          const s0 = Math.max(0.05, k / NS), s1 = Math.min(1, (k + 1) / NS + 0.04), c = jit(rim);
          addS({ ty: 0, F: hero, P, s0, s1, w0: sg * 0.97, w1: sg * 0.95, hk: 0.3 / NJ }, c, mix(c, C('#0C0E1E'), 0.5), 0.3, 0);
        }
      };
      const down = (phi) => 1 - 0.3 * Math.max(0, -Math.sin(phi));       // the lower petals shorter, clear of the soil
      if (END === 'a') {
        const red = P3('#D8322A', '#C42428', '#E84A30', '#B01E2A', '#E0402C'), hi = P3('#F07858', '#F29A70'), blot = P3('#2A1A44', '#3A2250', '#2A1636', '#46224A');
        const col = (s, w) => { const c = s < 0.16 + 0.05 * Math.cos(w * 3) ? pk(blot) : frng.chance(0.12 + 0.25 * s) ? pk(hi) : pk(red); return [c, mix(c, frng.chance(0.5) ? pk(red) : C('#6A1424'), 0.6), s < 0.18 ? 0.02 : 0.2]; };
        const OUT = cfg({ cl: [0.12, 0.22], op: [0.95, 0.55, 1], r0: [0.03, 0.36], lc: 0.2, W: 0.52, shape: 'round', cr: 0.06 });
        const INN = cfg({ cl: [0.1, 0.18], op: [0.7, 0.55, 1], r0: [0.025, 0.31], lc: 0.24, W: 0.56, shape: 'round', cr: 0.05 });
        for (let i = 0; i < 4; i++) { const phi = i * Math.PI / 2 + 0.15 + frng.gauss() * 0.08; petal({ phi, L: 1.25 * down(phi) * frng.range(0.94, 1.06), c: OUT }, 12, 7, col, C('#5A1020')); }
        for (let i = 0; i < 4; i++) { const phi = i * Math.PI / 2 + 0.15 + Math.PI / 4 + frng.gauss() * 0.08; petal({ phi, L: 0.85 * down(phi), c: INN }, 10, 5, col, C('#5A1020')); }
        // the heart: a dark pod of black-violet and grey-green strokes just behind the pane, the stamens round it in front
        const POD = cfg({ cl: [1.5, 0], op: [1.62, 0, 1], r0: [0, 0], lc: 0.08, W: 0.1, shape: 'lance', z0: -0.05 });
        for (let i = 0; i < 44; i++) { const c = frng.chance(0.7) ? pk(blot) : jit(C('#4A5A48')); addS({ ty: 0, F: hero, P: { phi: i * TAU / 44 + frng.gauss() * 0.05, L: frng.range(0.3, 0.42), c: POD }, s0: 0, s1: 1, w0: 0, w1: 0, hk: 1 }, c, mix(c, C('#6A4A8A'), 0.5), 0.6, 0.12); }
        const STA = cfg({ cl: [0.1, 0], op: [0.95, 0.15, 1], r0: [0.02, 0.36], lc: 0.15, W: 0.05, shape: 'line', z0: -0.02 });
        for (let i = 0; i < 120; i++) {
          const P = { phi: i * TAU / 120 + frng.gauss() * 0.03, L: frng.range(0.15, 0.24), c: STA }, c = jit(C('#1A1428'));
          addS({ ty: 0, F: hero, P, s0: 0, s1: 0.85, w0: 0, w1: 0, hk: 1 }, c, mix(c, C('#3A2A4A'), 0.5), 0.4, 0);
          const pc = jit(frng.chance(0.7) ? C('#E8D070') : C('#F2E6A0'));
          addS({ ty: 0, F: hero, P, s0: 0.8, s1: 1.04, w0: 0, w1: 0, hk: 3.5 }, pc, mix(pc, C('#C89A38'), 0.5), 0.5, 0.45);
        }
      } else if (END === 'b') {
        const wht = P3('#F4F0E4', '#ECE8DC', '#F8F2D8', '#E4E2EA'), vein = P3('#D8E0A0', '#E8E8B0'), lil = P3('#B8B0D0', '#C8C0DC');
        const col = (s, w) => { const c = Math.abs(w) < 0.14 && s < 0.7 ? pk(vein) : Math.abs(w) > 0.75 && frng.chance(0.5) ? pk(lil) : pk(wht); return [c, mix(c, pk(lil), 0.45), 0.25 + 0.4 * (1 - s)]; };
        // one fused trumpet: ten half-lobes round the tube, a pointed tip on every other one
        const LOB = cfg({ cl: [0.05, 0.05], op: [0.35, 1.3, 2], r0: [0.03, 0.36], lc: 0.22, W: 0.42, shape: 'flare', tw: 2.6, sw: 0.4 });
        const lobL = (phi) => 1.15 * (1 - 0.3 * Math.max(0, -Math.sin(phi)));
        for (let i = 0; i < 10; i++) { const phi = i * TAU / 10 + 0.3; petal({ phi, L: lobL(phi) * (i % 2 ? 0.93 : 1), c: LOB }, 9, 8, col, i % 2 ? null : C('#8A84A8')); }
        for (let i = 0; i < 10; i += 2) { const phi = i * TAU / 10 + 0.3, c = jit(C('#F8F4E6')); addS({ ty: 0, F: hero, P: { phi, L: lobL(phi), c: LOB }, s0: 0.92, s1: 1.12, w0: 0, w1: 0, hk: 0.12 }, c, c, 0.5, 0.6); }
        // the glowing throat: a funnel of uneven strokes from behind the pane out into the tube, no edge of its own
        // (each stroke its own pitch and depth, so where the funnel passes through the pane is a ragged line, not a circle)
        const THR = () => cfg({ cl: [1.5, 0], op: [frng.range(1.15, 1.4), 0, 1], r0: [0, 0], lc: 0.06, W: 0.045, shape: 'lance', z0: -frng.range(0.09, 0.2) });
        for (let i = 0; i < 160; i++) { const c = jit(frng.chance(0.6) ? C('#FFF2C0') : C('#F8E080')); addS({ ty: 0, F: hero, P: { phi: i * TAU / 160 + frng.gauss() * 0.02, L: frng.range(0.3, 0.75), c: THR() }, s0: frng.range(0, 0.2), s1: 1, w0: 0, w1: 0, hk: 1 }, c, mix(c, C('#FFFFF0'), 0.5), 0.5, 1.1); }
      } else if (END === 'd') {
        // the last tulip: a bud on its stem in front of the lens from 114 s, a closed cup by 122 s (in the frame and growing all
        // the while, never a far bud that turns huge), and on BLOOM it opens a little and the lens slides in between its petals
        // (it stands upright, a tulip seen from the side; from 1.5 s before BLOOM it bows its cup slowly toward the lens, and
        // on BLOOM the petals part a little)
        flowers[hero].openFn = (t) => 0.5 * sstep(42 + 8 * 0.35, 50, t) + 0.3 * heroOpen(t);
        flowers[hero].tiltFn = (t) => 0.75 * sstep(BLOOM - 1.5, BLOOM + 1.4, t); flowers[hero].Ac.copy(Yv);
        const vio = P3('#6A3A9A', '#7A4AAA', '#5A2A8A', '#8A3A8A', '#9A4A9A', '#B83A8A', '#7E3C9E'), rim = P3('#C898D8', '#B8A0E0', '#D0A0C8'), base = P3('#2A1A4A', '#3A1A50');
        const col = (s, w) => { const edge = Math.abs(w) > 0.8 || s > 0.9; const c = s < 0.1 ? pk(base) : edge && frng.chance(0.35) ? pk(rim) : pk(vio); return [c, mix(c, pk(vio), 0.5), edge ? 0.5 : s < 0.1 ? 0.05 : 0.3]; };
        const OUT = cfg({ cl: [0.1, -0.05], op: [0.82, -0.6, 1], r0: [0.04, 0.17], lc: 0.55, W: 0.5, shape: 'round', cr: 0.03 });
        const INN = cfg({ cl: [0.08, -0.04], op: [0.7, -0.5, 1], r0: [0.035, 0.15], lc: 0.55, W: 0.5, shape: 'round', cr: 0.03 });
        for (let i = 0; i < 3; i++) petal({ phi: 0.5 + i * TAU / 3, L: 0.72, c: OUT }, 20, 12, col, null);
        for (let i = 0; i < 3; i++) petal({ phi: 0.5 + Math.PI / 3 + i * TAU / 3, L: 0.64, c: INN }, 20, 12, col, null);
        // the dark heart at the bottom of the cup, behind the pane
        const POD = cfg({ cl: [1.5, 0], op: [1.62, 0, 1], r0: [0, 0], lc: 0.1, W: 0.12, shape: 'lance', z0: -0.05 });
        for (let i = 0; i < 40; i++) { const c = pk(base); addS({ ty: 0, pod: 1, F: hero, P: { phi: i * TAU / 40 + frng.gauss() * 0.05, L: frng.range(0.2, 0.3), c: POD }, s0: 0, s1: 1, w0: 0, w1: 0, hk: 1 }, c, mix(c, C('#5A3A7A'), 0.5), 0.6, 0.1); }
      } else {
        const blu = P3('#2A3A9A', '#3A4AB2', '#4A5CC0', '#24307E', '#5A4AA8'), pale = P3('#F2E8A8', '#E8F0E0');
        const col = (s, w) => { const edge = (Math.abs(w) > 0.72 && s > 0.35) || s > 0.9; const c = edge && frng.chance(0.6) ? pk(pale) : pk(blu); return [c, mix(c, pk(blu), 0.5), edge ? 0.5 : 0.18]; };
        const OUT = cfg({ cl: [0.14, 0.22], op: [1.1, 0.4, 1], r0: [0.03, 0.44], lc: 0.2, W: 0.22, shape: 'lance' });
        const INN = cfg({ cl: [0.12, 0.2], op: [0.9, 0.45, 1], r0: [0.03, 0.4], lc: 0.24, W: 0.24, shape: 'lance' });
        for (let i = 0; i < 8; i++) { const phi = i * TAU / 8 + 0.2; petal({ phi, L: 1.2 * down(phi), c: OUT }, 7, 7, col, C('#141A4A')); }
        for (let i = 0; i < 8; i++) { const phi = i * TAU / 8 + 0.2 + Math.PI / 8; petal({ phi, L: 0.85 * down(phi), c: INN }, 6, 5, col, C('#141A4A')); }
        // the star-whirl: spiral arms of dashes, yellow-white and cerulean rings, behind the pane inside 0.36 m and rising in
        // front of it beyond; it turns, and faster once the flower is open
        const ARM = cfg({ cl: [1.4, 0], op: [1.62, -0.45, 1], r0: [0.02, 0.03], lc: 0.1, W: 0.06, shape: 'line', sw: 2.6, sp: 1, z0: -0.06 });
        const yw = P3('#F8EEA0', '#FFF6C8', '#F4E070'), cer = P3('#7AA8D8', '#9AC0E0', '#6A90C8');
        const EYE = cfg({ cl: [1.5, 0], op: [1.57, 0, 1], r0: [0, 0], lc: 0.1, W: 0.25, shape: 'lance', sp: 1, sw: 1.5, z0: -0.08 });
        for (let i = 0; i < 24; i++) { const c = pk(yw); addS({ ty: 0, F: hero, P: { phi: i * TAU / 24, L: frng.range(0.12, 0.2), c: EYE }, s0: 0, s1: 1, w0: 0, w1: 0, hk: 1 }, c, mix(c, C('#FFFFF0'), 0.5), 0.5, 1.2); }
        for (let i = 0; i < 72; i++) {
          const P = { phi: i * TAU / 72 + frng.gauss() * 0.02, L: frng.range(0.82, 0.95), c: ARM };
          for (let k = 0; k < 5; k++) {
            const s0 = 0.06 + k * 0.19 + frng.range(-0.02, 0.02), warm = k % 2 === 0, c = pk(warm ? yw : cer);
            addS({ ty: 0, F: hero, P, s0, s1: s0 + 0.17, w0: 0, w1: 0, hk: 0.8 + 0.6 * k }, c, mix(c, C('#F8F8E0'), 0.4), 0.5, warm ? 1.0 - 0.1 * k : 0.5);
          }
        }
      }
      // the stem and two leaves
      for (let k = 0; k < 6; k++) for (const w of [-0.6, 0, 0.6]) { const c = jit(frng.chance(0.5) ? C('#2E4A34') : C('#3A5A30')); addS({ ty: 1, F: hero, s0: k / 6, s1: (k + 1) / 6 + 0.04, w0: w, w1: w }, c, mix(c, C('#1A2430'), 0.5), 0.6, 0); }
      for (const sg of [-1, 1]) {
        const dir = Sd.clone().multiplyScalar(sg).addScaledVector(Yv, END === 'd' ? 1.4 : 0.5).addScaledVector(fH, 0.3).normalize();
        for (let k = 0; k < 7; k++) { const c = jit(C(k % 2 ? '#3A6A3A' : '#2E5232')); addS({ ty: 2, F: hero, s0: END === 'd' ? 0.04 : 0.3 + 0.08 * (sg + 1), len: END === 'd' ? 0.6 : 0.55, dir, k0: k / 7, k1: (k + 1.3) / 7, side: (k % 3 - 1) * 0.05 }, c, mix(c, C('#1A2A2A'), 0.5), 0.6, 0); }
      }
    }
    const fMat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU, { uTint: { value: new THREE.Color(1, 1, 1) } }), vertexShader: FIELD_VS, fragmentShader: TINT_FS, side: THREE.DoubleSide, fog: true });
    const flMesh = fl.mesh(fMat, 2, true); flMesh.renderOrder = 1; flMesh.name = 'flowers'; scene.add(flMesh);
    const aPl = flMesh.geometry.getAttribute('aP'), aDl = flMesh.geometry.getAttribute('aD');
    const putF = (i, a, b, hw) => { const P = aPl.array, D = aDl.array, o = i * 4; P[o] = (a.x + b.x) / 2; P[o + 1] = (a.y + b.y) / 2; P[o + 2] = (a.z + b.z) / 2; D[o] = (b.x - a.x) / 2; D[o + 1] = (b.y - a.y) / 2; D[o + 2] = (b.z - a.z) / 2; D[o + 3] = hw; };
    const heroOpen = (t) => {
      const pre = 0.05 * sstep(BLOOM - 0.7, BLOOM, t), x = Math.min(1, Math.max(0, (t - BLOOM) / 0.95)), c1 = 1.2;
      const e = x <= 0 ? 0 : 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
      return pre + (1 - pre) * e + 0.05 * sstep(BLOOM + 1, BLOOM + 3.5, t);
    };
    const ra = V(), ta = V(), qa = V(), qb = V(), qm = V();
    // a point of a petal-like part at (s along, w across) for flower F's state
    const petalAt = (out, F, P, s, w) => {
      const c = P.c, o = F.o, ph = P.phi + c.sp * F.ang + c.tw * (1 - Math.min(1, o)) * s + c.sw * s;
      const thC = c.cl[0] + c.cl[1] * s / 2, thO = c.op[0] + c.op[1] * Math.pow(s, c.op[2]) / (c.op[2] + 1), th = lerp(thC, thO, o);
      const L = P.L * lerp(c.lc, 1, o), r0 = F.R * lerp(c.r0[0], c.r0[1], o), cs = Math.cos(ph), sn = Math.sin(ph);
      ra.copy(F.e1).multiplyScalar(cs).addScaledVector(F.e2, sn); ta.copy(F.e1).multiplyScalar(-sn).addScaledVector(F.e2, cs);
      const hw = c.W * L * SH[c.shape](Math.min(1, s)) * (0.3 + 0.7 * Math.min(1, o));
      return out.copy(F.Hd).addScaledVector(ra, (r0 + L * s * Math.sin(th)) * F.sc * F.push).addScaledVector(F.A, (L * s * Math.cos(th) + c.z0 * F.R) * F.sc)
        .addScaledVector(ta, w * hw * F.sc).addScaledVector(F.A, c.cr * L * F.sc * o * s * Math.sin(w * 4.1 + s * 7.3 + P.phi * 5));
    };
    const stemAt = (out, F, s, w) => {
      const a = (1 - s) * (1 - s), b = 2 * s * (1 - s), cc = s * s;
      return out.copy(F.B).multiplyScalar(a).addScaledVector(F.M, b).addScaledVector(F.Hs, cc).addScaledVector(F.Sd, w * F.stemW);
    };
    // the heart opens wide round the lens on the last metre, so all of the flower in front of the pane has left the frame
    // before the crossing (no petal is cut off by it)
    let heroF = null;
    function drawFlowers(t, eye) {
      if (!heroF) heroF = flowers.find((F) => F.hero);
      const dE = eye.distanceTo(E); heroF.push = 1 + 2.2 * sstep(1.0, 0.5, dE);
      for (const F of flowers) {
        const g = sstep(F.born, F.born + F.grow, t); F.vis = g > 0.002; if (!F.vis) continue;
        F.g = g; F.o = F.hero ? (F.openFn ? F.openFn(t) : heroOpen(t)) : sstep(F.open, F.open + F.odur, t);
        F.sc = F.hero ? 0.35 + 0.65 * g : sstep(F.born + F.grow * 0.3, F.born + F.grow, t);
        F.ang = F.spin * t + (F.hero && t > BLOOM ? 1.6 * (t - BLOOM) * (t - BLOOM) / (1 + (t - BLOOM)) : 0);
        F.Hd.copy(F.B).lerp(F.H, F.hero ? g : Math.sqrt(g));
        F.M.copy(F.B).lerp(F.Hd, 0.55).addScaledVector(F.lean, -0.5);
        F.Hs.copy(F.Hd).addScaledVector(F.A, -0.12 * F.R * F.sc);                 // the stem meets the head at its back
        F.A.copy(F.Ac).lerp(F.f, F.tiltFn ? F.tiltFn(t) : sstep(0, 0.7, Math.min(1, F.o))).normalize();
        F.e1.copy(F.Sd).addScaledVector(F.A, -F.Sd.dot(F.A)).normalize(); F.e2.crossVectors(F.A, F.e1);
      }
      for (let i = 0; i < strokes.length; i++) {
        const S = strokes[i], F = flowers[S.F]; let w;
        if (!F.vis) { aPl.array[i * 4 + 1] = -500; continue; }
        if (S.ty === 0) {
          petalAt(qa, F, S.P, S.s0, S.w0); petalAt(qb, F, S.P, S.s1, S.w1);
          const c = S.P.c, o = Math.min(1, F.o), sm = Math.min(1, (S.s0 + S.s1) / 2);
          w = Math.max(0.002, c.W * S.P.L * lerp(c.lc, 1, F.o) * SH[c.shape](sm) * (0.3 + 0.7 * o) * S.hk * F.sc);
        } else if (S.ty === 1) {
          stemAt(qa, F, S.s0, S.w0); stemAt(qb, F, S.s1, S.w1); w = F.stemW * (F.hero ? 0.6 : 1) * (0.5 + 0.5 * F.g);
        } else {
          stemAt(qa, F, S.s0, 0); const L = S.len * F.g;
          const k0 = S.k0 ?? 0, k1 = S.k1 ?? 1;
          qb.copy(qa).addScaledVector(S.dir, L * k1).addScaledVector(Yv, -0.3 * L * k1 * k1); qa.addScaledVector(S.dir, L * k0).addScaledVector(Yv, -0.3 * L * k0 * k0);
          if (S.side) { qa.addScaledVector(F.Sd, S.side * L); qb.addScaledVector(F.Sd, S.side * L); }
          w = L * (S.k1 != null ? 0.09 : 0.16) * (0.4 + 0.6 * F.g);
        }
        // strokes thin away as they pass the lens, so none goes by as a flat slab or a dark bar
        let near = 1;
        if (F.hero || F.Hd.distanceTo(eye) < 0.6) { qm.subVectors(qb, qa); const k = Math.min(1, Math.max(0, qm.dot(ta.subVectors(eye, qa)) / Math.max(1e-6, qm.lengthSq()))); const dd = qm.multiplyScalar(k).add(qa).distanceTo(eye); near = F.hero ? sstep(0.3, 1.2, dd) : sstep(0.08, 0.3, dd); }
        if (S.pod) w *= sstep(0.9, 1.5, dE);            // the dark heart gives way: the dive sees the dusk through the cup floor
        putF(i, qa, qb, w * near);
      }
      aPl.needsUpdate = true; aDl.needsUpdate = true;
    }
    await ctx.yield();

    // ---------- the planets ----------
    // az/el from the middle of the camera's run; the burst order follows the pan to the left
    const PLACE = [
      { id: 'cafe', az: 13, el: 21, dist: 380, ang: 8.5 },
      { id: 'cypress', az: -24, el: 27, dist: 400, ang: 8.5 },
      { id: 'cobalt', az: -3, el: 31, dist: 420, ang: 9 },
      { id: 'sunflower', az: -34, el: 17, dist: 360, ang: 8.5 },
    ];
    const schedule = scheduleFrom(ctx, { before: [], here: PLACE.map((p, i) => ({ id: p.id, t: EXPLODE_AT[i] })), hide: [] });
    // the planets' own gain: in daylight they are not drawn, they come out with the stars
    const PU = { uTime: SU.uTime, uGain: { value: 0 }, uWeave: SU.uWeave, uFlash: SU.uFlash, uFine: SU.uFine, uFlashD: SU.uFlashD };
    const blasts = await buildBlasts(ctx, { scene, uniforms: PU, eye: eyeMid, place: PLACE, schedule, hero: { uniforms: SKU }, seed: 'vg-sower:planets', fine: FINE,
      flashFrom: new THREE.Vector3(0, -20, -10), flashGain: 0.55 });
    const pMeshes = PLACE.map((p) => scene.getObjectByName('planet-' + p.id)).filter(Boolean);
    for (const pl of blasts.planets) if (pl.slot >= 0) SKU.uBlastC.value[pl.slot].copy(pl.P.pal[0][0]).lerp(new THREE.Color(0.9, 0.76, 0.3), 0.3);

    const bufSize = new THREE.Vector2(), sd = V();
    return {
      scene, path, duration: DURATION,
      title: 'The Sower',
      ride: 'none', style: 'none',
      camera: { fov: 60, near: 0.08, far: 3000, lookAhead: 0.4, sway: 0.3, bank: 0 },
      pois: [],
      // the creep is slow, the push over the flowering field quick (the journey's long sunset is spent watching the sower); the
      // lens is about 1.7 m off the last flower when it opens, so the open flower just fills the frame
      pace: (u) => 0.35 + 2.15 * sstep(uCreep - 0.02, uCreep + 0.12, u),
      // the hand-off is the flower's heart: a bare pane (the exact window, no rim) that fades in while the petals fill the frame
      portal: { shape: 'rect', width: END === 'd' ? 10 : 5, height: END === 'd' ? 7 : 3.4, frame: 0, lens: 0, color: '#F6D54A', veil: VAR.veil, revealDistance: END === 'd' ? 8.045 : 8,   // (d's lower tail is a little longer: the olives' clock still starts at 98.3 s, so its burst stays on 136.5)
      blendDistance: 4, drawWithin: 1.35, drawIn: 0, fadeIn: [1.35, 0.8] },
      post: {
        exposure: 1.04,
        bloom: { strength: 0.4, radius: 0.6, threshold: 0.95 },
        grade: { saturation: 1.1, contrast: 1.06, tint: '#fff6e4', shadowTint: '#080c22', vignette: 0.32, grain: 0.03, aberration: 0 },
      },
      explodeAt: blasts.explodeAt,
      update(dt, time, camera) {
        camP.setFromMatrixPosition(camera.matrixWorld); if (camP.lengthSq() === 0) camP.copy(camera.position);
        sky.dome.position.copy(camP);
        ctx.renderer.getDrawingBufferSize(bufSize);
        SU.uWeave.value = 1.5708 * Math.min(1, 1080 / Math.max(1, bufSize.y));
        SU.uTime.value = time;
        const t = time / HS;   // the hour (and the sun, the planets' coming out) runs HS times slower in a longer journey step
        // the hour
        for (let i = 0; i < 3; i++) { hour(t, 'h' + i, SKU.uHor.value[i]); hour(t, 'z' + i, SKU.uZen.value[i]); }
        hour(t, 'a0', SKU.uAcc.value[0]); hour(t, 'a1', SKU.uAcc.value[1]);
        hour(t, 'glow', SKU.uGlowC.value); hour(t, 'tint', SU.uTint.value); hour(t, 'fog', scene.fog.color);
        const night = hour(t, 'stars');
        SKU.uStars.value = night; SKU.uTime.value = time * SKY_SLOW;
        azel(SUN_AZ, sunEl(t), sd); SKU.uSunDir.value.copy(sd);
        const sp = SKU.uSun.value; const ch = Math.acos(sd.y), hh = Math.hypot(sd.x, sd.z) || 1e-6;
        sp.set(sd.x / hh * ch, sd.z / hh * ch, SUN_R * D2R, 1 - sstep(8.5, 11.5, t));
        const sf = sstep(5, 10, t);
        SKU.uSunC.value[0].copy(sunCore[0]).lerp(sunCore[1], sf); SKU.uSunC.value[1].copy(sunBody[0]).lerp(sunBody[1], sf); SKU.uSunC.value[2].copy(sunHalo[0]).lerp(sunHalo[1], sf);
        SKU.uGlow.value.set(sp.x / (Math.hypot(sp.x, sp.y) || 1), sp.y / (Math.hypot(sp.x, sp.y) || 1), hour(t, 'gs'), 0.16 + 0.1 * sstep(5, 10, t));
        // the planets come out with the night
        const pg = sstep(8.5, 11, t);
        PU.uGain.value = 1.08 * pg; for (const m of pMeshes) m.visible = pg > 0.02;
        blasts.update(time, camP);
        for (let i = 0; i < 4; i++) SKU.uBlastG.value[i].x *= pg;
        drawSower(time);
        // the flowers in a light of their own (the night lifted for them) that flares on the bloom
        const fl0 = t * TS - BLOOM, flash = fl0 > 0 ? 1 + 0.6 * Math.exp(-fl0 / 0.35) : 1;
        fMat.uniforms.uTint.value.copy(SU.uTint.value).lerp(WHITE, VAR.lift).multiplyScalar(flash);
        drawFlowers(t * TS, camP);
      },
      dispose() {},
    };
  },
};
