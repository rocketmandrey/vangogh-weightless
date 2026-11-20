// VG BEDROOM: Van Gogh's "The Bedroom" (Arles, 1888) as a 32 s long take. The small crooked room: violet-blue walls,
// red-brown and green-ochre floor boards, the big chrome-yellow bed with its scarlet blanket and pale yellow-green
// pillows, two straw-seated chairs, the little table with jug, basin and bottles under the mirror, pictures on the walls,
// the blue smock and straw hat on their pegs, a towel by the green window. The camera starts close over the foot of the
// bed (the blanket fills the frame), drifts left across the room past the chair and the table, glides to the window,
// whose casements swing open, and flies out of it into the deep blue turning night (the hand-off is a cut on the stars).
// Painted by the same hand as the-turning-night (its PAINT shader on the opaque underpainting, its STROKE shader on every
// instanced stroke, its hero dome as the slow sky) and laid like vg-cafe: strokes lie FLAT on their surface (aN = normal),
// aN = 0 makes a billboard (the dark contour lines, the night outside). Each flat plane of the painting is translated
// into dense small directional strokes in two or three tones, and every object gets Van Gogh's dark outline.
// Pure function of world time; the room is not lit, it is painted.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePath } from '../kit/core.js';
import { STROKE_FS, PAINT_VS, PAINT_FS } from './the-turning-night.js';
import { buildHero } from '../parts/the-turning-night.js';

const TAU = Math.PI * 2, DURATION = 32;
const PACE0 = 0.7482;   // the doorway: the pace the cafe hands over at, as on the old (longer) route
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// the flat-or-billboard stroke vertex shader of vg-cafe (copied: vg-cafe does not export it)
// aP: centre xyz, hash | aD: half axis xyz, half width | aN: surface normal xyz (0 = billboard), bend | aC: rgb, emissive
const FLAT_VS = /* glsl */`
attribute vec4 aP, aD, aN, aC;
uniform float uTime, uMinW; uniform vec2 uFade;
varying vec2 vUv; varying vec4 vCol; varying float vId; varying vec3 vSideV, vAxisV;
#include <fog_pars_vertex>
void main(){
  float l = position.x, hs = aP.w;
  vec3 C = (modelMatrix*vec4(aP.xyz, 1.0)).xyz;
  vec3 d = mat3(modelMatrix)*aD.xyz; float hl = max(length(d), 1e-4); vec3 ax = d/hl;
  vec3 P = C + ax*l*hl;
  vec3 toC = cameraPosition - P; float dist = max(length(toC), 1e-3);
  vec3 n = mat3(modelMatrix)*aN.xyz;
  vec3 side = dot(n, n) > 0.25 ? normalize(cross(n, ax) + vec3(1e-5, 0.0, 0.0)) : normalize(cross(ax, toC/dist) + vec3(1e-5, 0.0, 0.0));
  P += side*aN.w*(1.0 - l*l)*hl;
  float hw = max(aD.w, dist*uMinW), sc = 1.0 - smoothstep(uFade.x, uFade.y, dist);
  P += side*position.y*hw*sc;
  vec4 mvPosition = viewMatrix*vec4(P, 1.0);
  gl_Position = sc < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix*mvPosition;
  vUv = position.xy; vCol = vec4(aC.rgb, aC.a*(0.9 + 0.1*sin(uTime*(3.0 + 5.0*hs) + hs*90.0))); vId = hs;
  vSideV = mat3(viewMatrix)*side; vAxisV = mat3(viewMatrix)*ax;
  #include <fog_vertex>
}`;

function makeSet(rng, tones) {
  const P = [], D = [], N = [], C = [];
  const set = {
    count: 0,
    // centre p, half axis d, half width, colour, normal n (null = billboard), emissive, bend
    add(p, d, hw, col, n = null, em = 0, bend = null) {
      const j = em > 0 ? 1 : 0.88 + 0.24 * rng(), h = rng(), b = bend ?? rng.range(-0.14, 0.14);
      const nx = n ? n.x : 0, ny = n ? n.y : 0, nz = n ? n.z : 0;
      const push = (x, y, z, hw2, r, g, bl, e, k = 1) => {
        P.push(x, y, z, h); D.push(d.x * k, d.y * k, d.z * k, hw2); N.push(nx, ny, nz, b); C.push(r, g, bl, e); set.count++;
      };
      push(p.x, p.y, p.z, hw, col.r * j, col.g * j, col.b * j, em);
      // two or three tones in one stroke: narrower streaks of a lighter and a darker mix of the same pigment along
      // its flanks, as a loaded brush leaves them
      if (tones && em === 0 && n) {
        let sx = ny * d.z - nz * d.y, sy = nz * d.x - nx * d.z, sz = nx * d.y - ny * d.x;
        const l = Math.hypot(sx, sy, sz) || 1; sx /= l; sy /= l; sz /= l;
        for (let k = 0, m = rng() < 0.55 ? 2 : 1; k < m; k++) {
          const s = (k ? -1 : 1) * rng.range(0.25, 0.5) * hw, lift = 0.0012 + 0.0008 * k, lt = k ? rng() < 0.3 : rng() < 0.6;
          const t = lt ? rng.range(1.15, 1.45) : rng.range(0.55, 0.75), wt = lt ? rng.range(0, 0.08) : 0;
          push(p.x + sx * s + nx * lift, p.y + sy * s + ny * lift, p.z + sz * s + nz * lift, hw * rng.range(0.28, 0.45),
            (col.r * t * (1 - wt) + 0.95 * wt) * j, (col.g * t * (1 - wt) + 0.9 * wt) * j, (col.b * t * (1 - wt) + 0.7 * wt) * j, 0, rng.range(0.5, 0.9));
        }
      }
    },
    mesh(mat) {
      const g0 = new THREE.PlaneGeometry(2, 2, 4, 1), geo = new THREE.InstancedBufferGeometry();
      geo.index = g0.index; geo.setAttribute('position', g0.getAttribute('position'));
      for (const [nm, a] of [['aP', P], ['aD', D], ['aN', N], ['aC', C]]) geo.setAttribute(nm, new THREE.InstancedBufferAttribute(new Float32Array(a), 4));
      geo.instanceCount = set.count;
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m;
    },
  };
  return set;
}

export default {
  id: 'vg-bedroom',
  name: 'The Bedroom in Arles',
  category: 'domestic',
  weirdness: 0.3,
  media: ['interior'],
  async build(ctx) {
    const rng = ctx.rng, noise = ctx.noise;
    const n2 = (x, z) => (noise && noise.n2 ? noise.n2(x, z) : Math.sin(x * 1.7 + z * 0.3) * Math.cos(z * 1.3 - x * 0.4));
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const Y = V(0, 1, 0);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0B1A4A');
    scene.fog = new THREE.FogExp2(new THREE.Color('#10225E'), 0.006);

    // ---------- sky: the turning night's stroke dome, seen through the window and then all round ----------
    const hero = await buildHero(ctx, { palette: ['#0E2260', '#2A50B0', '#7FB2E5', '#F6E070', '#1E5A5A', '#14261E', '#F0A040'], mirror: false, gate: false });
    hero.object.rotation.y = 0.35;
    hero.uniforms.uGain.value = 1.05;
    const FINE = 2;
    hero.uniforms.uCellK.value = 1 / FINE; hero.uniforms.uStreak.value = 1;
    scene.add(hero.object);
    await ctx.yield();

    // ---------- pigments ----------
    const H = (h) => new THREE.Color(h);
    const P = (a) => a.map(H);
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const mixc = (a, b, t) => a.clone().lerp(b, clamp(t, 0, 1));
    const WALL = P(['#8C90CC', '#9AA2DA', '#7E84C2', '#A6AADC', '#8A94D2', '#B2B6E2', '#9890CC', '#7A8AC8']);
    const WALL_HI = P(['#C0C4EA', '#B8C8EC', '#CCC4E8']);
    const WALL_LO = P(['#5A5EA6', '#4E5A9E', '#6A64A8']);
    const CEIL = P(['#C4C8E0', '#B6BEDC', '#D0D0E4', '#A8B4D8']);
    const BOARD = P(['#B4704A', '#A2603E', '#C08A58', '#8E8C58', '#9A6A46', '#C49A64', '#A87C4C', '#7E8A54']);
    const SEAM = P(['#4E3A2A', '#5A4A30', '#3E3A2A']);
    const BED = P(['#E8B030', '#F0C040', '#DCA02C', '#E4A834', '#F4CC54', '#D8962A']);
    const BED_SH = P(['#B87A22', '#A86A20', '#C48A2A']);
    const RED = P(['#D8302A', '#C82822', '#E44A30', '#B42222', '#E0402A', '#CC3424']);
    const RED_SH = P(['#8E1A18', '#A02020', '#7A1414']);
    const SHEET = P(['#D8E0A0', '#C8D890', '#E4ECBC', '#BCCC84', '#E0E4A8']);
    const STRAW = P(['#E8C860', '#D8B048', '#C89838', '#F0D878', '#DCBC58']);
    const WOOD = P(['#D8A040', '#E0B050', '#C88C34', '#E4BC5C']);
    const DOOR = P(['#6A7AC2', '#7A8AD0', '#5E6CB4', '#8494D4', '#6E74BC']);
    const GREEN = P(['#4A9A44', '#5AAA4C', '#3E8A3A', '#6AB458', '#58A050']);
    const GLASS = P(['#3E6A92', '#4C7EA4', '#6A9CB4', '#5A8EA0', '#7AB0B0']);
    const INK = H('#2A2440'), INK_W = H('#3E2A18'), INK_R = H('#5A1212');

    // ---------- the room: crooked on purpose (the back wall is skewed, the side walls lean in) ----------
    const RH = 2.85;
    const FL = V(-1.62, 0, 0.6), BL = V(-1.52, 0, -4.30), BR = V(1.72, 0, -3.92), FR = V(1.70, 0, 0.6);
    const backZ = (x) => BL.z + (x - BL.x) / (BR.x - BL.x) * (BR.z - BL.z);
    const UB = BR.clone().sub(BL).normalize(), NB = V(-UB.z, 0, UB.x);          // back wall: along it, and inward
    const onBack = (x, y, off = 0) => V(x, y, backZ(x)).addScaledVector(NB, off);
    const WIN = { x0: -0.74, x1: 0.16, y0: 0.98, y1: 2.36 };
    const WT = 0.24;                                                              // wall thickness at the window

    // ---------- the flight ----------
    const path = makePath([
      // (one gentle bend to the window: the old route dipped to the bed, swung out to the chair and back, a whip; the first leg
      // keeps the old heading, so the entry frame stays; the suite's pace and duration keep both crossings where they were)
      [1.16, 1.46, -1.28], [1.0, 1.3, -2.0], [0.62, 1.3, -2.68], [0.14, 1.42, -3.28], [-0.18, 1.56, -3.76],
      [-0.29, 1.66, -4.16], [-0.22, 1.8, -4.75],
    ]);
    let uWin = 0.6;
    { const q = new THREE.Vector3(); for (let i = 0; i <= 400; i++) { path.pointAt(i / 400, q); if (q.z < backZ(q.x)) { uWin = i / 400; break; } } }
    const tWin = uWin * DURATION;

    // ---------- materials ----------
    const SU = {
      uTime: { value: 0 }, uMinW: { value: 0.0012 }, uGain: { value: 1.0 }, uWeave: hero.uniforms.uWeave,
      uFlash: { value: new THREE.Vector3() }, uFlashD: { value: new THREE.Vector3(0, 1, 0) },
      uCreep: { value: 0 }, uWind: { value: new THREE.Vector4(0, 1, 0, 0) }, uFine: { value: FINE },
    };
    const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
    const strokeMat = (fade, fog = true) => new THREE.ShaderMaterial({
      uniforms: Object.assign(fogU(), SU, { uFade: { value: new THREE.Vector2(fade[0], fade[1]) } }),
      vertexShader: FLAT_VS, fragmentShader: STROKE_FS, side: THREE.DoubleSide, fog,
    });
    const nearMat = strokeMat([400, 600]), skyMat = strokeMat([2000, 3000], false);
    const paintMat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), SU), vertexShader: PAINT_VS, fragmentShader: PAINT_FS, fog: true, side: THREE.DoubleSide });

    let S = makeSet(rng, true), K = makeSet(rng, false);        // S: paint (toned), K: the dark contour lines
    let bases = [];
    // the room is crooked as he painted it: everything in it leans a little (a shear: its tops go right and forward)
    const SHX = 0.045, SHZ = 0.025, room = new THREE.Group();
    room.matrixAutoUpdate = false; room.matrix.set(1, SHX, 0, 0, 0, 1, 0, 0, 0, SHZ, 1, 0, 0, 0, 0, 1); scene.add(room);
    const hsh = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };

    // ---------- painting helpers ----------
    // the opaque underpainting of a parallelogram o + s U + t V, vertex coloured, with rectangular holes [s0, s1, t0, t1]
    function baseQuad(o, U, Vv, n, colFn, holes = [], seg = 0.3, list = bases) {
      const cuts = (len, e) => { const a = [0, 1, ...e].sort((x, y) => x - y), out = [0];
        for (let i = 1; i < a.length; i++) { const k = Math.max(1, Math.ceil((a[i] - a[i - 1]) * len / seg)); for (let j = 1; j <= k; j++) out.push(a[i - 1] + (a[i] - a[i - 1]) * j / k); }
        return out; };
      const su = cuts(U.length(), holes.flatMap((h) => [h[0], h[1]])), sv = cuts(Vv.length(), holes.flatMap((h) => [h[2], h[3]]));
      const pos = [], nor = [], col = [], q = new THREE.Vector3();
      const put = (s, t) => { q.copy(o).addScaledVector(U, s).addScaledVector(Vv, t); pos.push(q.x, q.y, q.z); nor.push(n.x, n.y, n.z); const c = colFn(s, t, q); col.push(c.r, c.g, c.b); };
      for (let i = 0; i < su.length - 1; i++) for (let j = 0; j < sv.length - 1; j++) {
        const sc = (su[i] + su[i + 1]) / 2, tc = (sv[j] + sv[j + 1]) / 2;
        if (holes.some((h) => sc > h[0] && sc < h[1] && tc > h[2] && tc < h[3])) continue;
        put(su[i], sv[j]); put(su[i + 1], sv[j]); put(su[i + 1], sv[j + 1]);
        put(su[i], sv[j]); put(su[i + 1], sv[j + 1]); put(su[i], sv[j + 1]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      list.push(g);
    }
    // dense flat strokes over that parallelogram; ang(s, t) is the stroke direction, radians from U toward V
    function paintFace(o, U, Vv, n, opt, set = S) {
      const Lu = U.length(), Lv = Vv.length(), u = U.clone().divideScalar(Lu), v = Vv.clone().divideScalar(Lv);
      const hl0 = Math.min(opt.hl, 0.5 * Math.max(Lu, Lv)), hw0 = Math.min(opt.hw, 0.5 * Math.min(Lu, Lv) + 0.004);
      const nS = Math.ceil(Lu * Lv * (opt.cover ?? 1.8) / (4 * hl0 * hw0));
      const nx = Math.max(1, Math.round(Math.sqrt(nS * Lu / Lv))), ny = Math.max(1, Math.ceil(nS / nx));
      const holes = opt.holes || [], p = new THREE.Vector3(), d = new THREE.Vector3();
      const angF = typeof opt.ang === 'function' ? opt.ang : () => opt.ang ?? 0;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const s = (i + rng()) / nx, t = (j + rng()) / ny;
        if (holes.some((h) => s > h[0] - 0.4 * hl0 / Lu && s < h[1] + 0.4 * hl0 / Lu && t > h[2] - 0.4 * hl0 / Lv && t < h[3] + 0.4 * hl0 / Lv)) continue;
        const a = angF(s, t) + rng.range(-1, 1) * (opt.jit ?? 0.18), ca = Math.cos(a), sa = Math.sin(a);
        // keep the stroke inside the face along its own direction (a thin leg stays a leg)
        const room = Math.min(Math.abs(ca) > 1e-3 ? Math.min(s, 1 - s) * Lu / Math.abs(ca) : 9, Math.abs(sa) > 1e-3 ? Math.min(t, 1 - t) * Lv / Math.abs(sa) : 9);
        const hl = Math.max(hl0 * 0.35, Math.min(hl0 * rng.range(0.75, 1.15), room + hl0 * (opt.spill ?? 0.25)));
        p.copy(o).addScaledVector(U, s).addScaledVector(Vv, t).addScaledVector(n, (opt.lift ?? 0.003) + rng() * 0.002);
        d.copy(u).multiplyScalar(ca).addScaledVector(v, sa).multiplyScalar(hl);
        set.add(p, d, hw0 * rng.range(0.8, 1.15), opt.col(s, t, p), n, opt.em ?? 0);
      }
    }
    // a contour: a chain of short dark billboard strokes from a to b, a little unsteady, as his outlines are
    function ink(a, b, hw, col = INK, seg = 0.09) {
      const L = a.distanceTo(b), m = Math.max(1, Math.ceil(L / seg)), d = b.clone().sub(a).divideScalar(m);
      for (let k = 0; k < m; k++) {
        const c = a.clone().addScaledVector(d, k + 0.5).add(V(rng.range(-1, 1) * hw * 0.3, rng.range(-1, 1) * hw * 0.3, rng.range(-1, 1) * hw * 0.3));
        K.add(c, d.clone().multiplyScalar(0.62 + rng() * 0.08), hw * rng.range(0.8, 1.2), col.clone().multiplyScalar(rng.range(0.75, 1.15)), null, 0, rng.range(-0.08, 0.08));
      }
    }
    function inkLoop(pts, hw, col, seg) { for (let i = 0; i < pts.length; i++) ink(pts[i], pts[(i + 1) % pts.length], hw, col, seg); }
    // a painted box: centre c, size, turned yaw about Y; strokes follow the grain axis ('x' | 'y' | 'z', local)
    function box(c, sx, sy, sz, yaw, o) {
      const ex = V(Math.cos(yaw), 0, -Math.sin(yaw)), ey = Y.clone(), ez = V(Math.sin(yaw), 0, Math.cos(yaw));
      const E = { x: [ex, sx], y: [ey, sy], z: [ez, sz] }, other = { x: ['z', 'y'], y: ['x', 'z'], z: ['x', 'y'] };
      for (const ax of ['x', 'y', 'z']) for (const sg of [1, -1]) {
        const key = (sg > 0 ? '+' : '-') + ax;
        if (o.skip && o.skip.includes(key)) continue;
        const [ua, va] = other[ax], [eu, lu] = E[ua], [ev, lv] = E[va], [en, ln] = E[ax];
        const n = en.clone().multiplyScalar(sg), U = eu.clone().multiplyScalar(lu), Vv = ev.clone().multiplyScalar(lv);
        const og = c.clone().addScaledVector(n, ln / 2).addScaledVector(U, -0.5).addScaledVector(Vv, -0.5);
        const shade = o.shade ? o.shade(key) : (ax === 'y' ? (sg > 0 ? 1.08 : 0.6) : 0.85 + 0.15 * (n.x * 0.6 + n.z * 0.8));
        const g = o.grain || (lu > lv ? ua : va), ang = g === ua ? 0 : g === va ? Math.PI / 2 : (lu > lv ? 0 : Math.PI / 2);
        baseQuad(og, U, Vv, n, (s, t, p) => o.col(key, s, t, p).multiplyScalar(0.62 * shade), [], 0.4);
        paintFace(og, U, Vv, n, { hl: o.hl ?? 0.045, hw: o.hw ?? 0.011, ang, jit: o.jit ?? 0.12, cover: o.cover ?? 1.9, col: (s, t, p) => o.col(key, s, t, p).multiplyScalar(shade) });
      }
      if (o.ink) {
        const hx = ex.clone().multiplyScalar(sx / 2), hy = ey.clone().multiplyScalar(sy / 2), hz = ez.clone().multiplyScalar(sz / 2);
        const at = (a, b, cc) => c.clone().addScaledVector(hx, a).addScaledVector(hy, b).addScaledVector(hz, cc);
        const w = o.inkW ?? 0.008;
        for (const a of [-1, 1]) for (const b of [-1, 1]) {
          if (!(o.inkSkip && o.inkSkip.includes('x' + a + b))) ink(at(-1, a, b), at(1, a, b), w, o.ink);
          if (!(o.inkSkip && o.inkSkip.includes('y' + a + b))) ink(at(a, -1, b), at(a, 1, b), w, o.ink);
          if (!(o.inkSkip && o.inkSkip.includes('z' + a + b))) ink(at(a, b, -1), at(a, b, 1), w, o.ink);
        }
      }
    }
    // a painted ellipsoid (pillows, jug, basin, hat): strokes run round it; a dark rim is drawn as a ring facing `face`
    // o.sq < 1 squares it off (a pillow: flat faces, round seams); o.L lights it (each stroke lighter or darker by its facing)
    function blob(c, rx, ry, rz, colFn, o = {}) {
      const sq = o.sq ?? 1, sqm = (e) => { if (sq !== 1) { const m = (v) => Math.sign(v) * Math.pow(Math.abs(v), sq); e.set(m(e.x), m(e.y), m(e.z)); } return e; };
      const shade = (e, n) => { const c0 = colFn(e); if (!o.L) return c0; const k = n.dot(o.L); return c0.multiplyScalar(0.8 + 0.38 * Math.max(0, k) + 0.1 * Math.min(0, k)); };
      const g = new THREE.SphereGeometry(1, 22, 14).toNonIndexed(); g.deleteAttribute('uv');
      { const p = g.getAttribute('position'), q = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { q.fromBufferAttribute(p, i); sqm(q); p.setXYZ(i, q.x, q.y, q.z); } }
      g.scale(rx, ry, rz); g.translate(c.x, c.y, c.z);
      const p = g.getAttribute('position'), a = new Float32Array(p.count * 3), q = new THREE.Vector3(), e = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { q.fromBufferAttribute(p, i); e.set((q.x - c.x) / rx, (q.y - c.y) / ry, (q.z - c.z) / rz); const cc = colFn(e).multiplyScalar(0.6); a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); bases.push(g);
      const area = 4 * Math.PI * Math.pow((rx * ry + ry * rz + rx * rz) / 3, 1) * (sq < 1 ? 1.6 : 1), hl = o.hl ?? 0.03, hw = o.hw ?? 0.009;
      const m = Math.ceil(area * (o.cover ?? 2.2) / (4 * hl * hw));
      for (let i = 0; i < m; i++) {
        let n;
        if (sq === 1) {
          const z = rng.range(-1, 1), ph = rng.range(0, TAU), r = Math.sqrt(1 - z * z);
          e.set(r * Math.cos(ph), z, r * Math.sin(ph)); n = V(e.x / rx, e.y / ry, e.z / rz).normalize();
        } else {                                       // squared off: a uniform point on a box face, pulled in onto the rounded surface
          const wx = ry * rz, wy = rx * rz, wz = rx * ry, k = rng() * (wx + wy + wz), sg = rng() < 0.5 ? -1 : 1, a = rng.range(-1, 1), b = rng.range(-1, 1);
          if (k < wx) e.set(sg, a, b); else if (k < wx + wy) e.set(a, sg, b); else e.set(a, b, sg);
          const F = Math.pow(Math.abs(e.x), 2 / sq) + Math.pow(Math.abs(e.y), 2 / sq) + Math.pow(Math.abs(e.z), 2 / sq); e.multiplyScalar(Math.pow(F, -sq / 2));
          const gp = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2 / sq - 1); n = V(gp(e.x) / rx, gp(e.y) / ry, gp(e.z) / rz).normalize();
        }
        if (o.cut && e.y < o.cut) continue;
        let t = V(-n.z, 0, n.x); if (t.lengthSq() < 1e-4) t.set(1, 0, 0); t.normalize();
        const bt = new THREE.Vector3().crossVectors(n, t), an = (o.ang ?? 0) + rng.range(-0.35, 0.35);
        const dir = t.multiplyScalar(Math.cos(an)).addScaledVector(bt, Math.sin(an)).multiplyScalar(hl * rng.range(0.7, 1.1));
        S.add(V(c.x + e.x * rx, c.y + e.y * ry, c.z + e.z * rz).addScaledVector(n, 0.003), dir, hw * rng.range(0.8, 1.2), shade(e, n), n);
      }
      if (o.face) {                                   // the outline, as he draws it: a dark ring round the silhouette
        const f = o.face.clone().normalize(), u1 = new THREE.Vector3().crossVectors(Y, f).normalize(), u2 = new THREE.Vector3().crossVectors(f, u1);
        const pts = []; for (let i = 0; i < 20; i++) { const an = i / 20 * TAU, d = u1.clone().multiplyScalar(Math.cos(an)).addScaledVector(u2, Math.sin(an));
          const ell = 1 / Math.sqrt((d.x / rx) ** 2 + (d.y / ry) ** 2 + (d.z / rz) ** 2); if (o.cut && d.y / ry * ell / ry < o.cut - 0.05) { pts.push(null); continue; } pts.push(c.clone().addScaledVector(d, ell * 1.01)); }
        for (let i = 0; i < 20; i++) { const A = pts[i], B = pts[(i + 1) % 20]; if (A && B) ink(A, B, o.inkW ?? 0.006, o.ink || INK, 0.05); }
      }
    }

    // a turned vessel (jug, basin, bottle): profile prof = [[r, y], ...] from the foot up. Its strokes run up the
    // meridians in rings, toned by how each faces the light L (lit, mid, shade, a pale gleam where it faces it most);
    // its outline is a dark card through its axis, a hair wider than the profile (it turns to the eye, so whatever side
    // the camera takes the vessel keeps a dark contour round its silhouette), plus dark rings at the lip and the foot
    function lathe(c, prof, tones, o = {}) {
      const L = (o.L || V(0.8, 0, -0.6)).clone().setY(0).normalize(), hl = o.hl ?? 0.016, hw = o.hw ?? 0.0055, ink0 = o.ink || INK;
      const pts = prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.002), y));
      const g = new THREE.LatheGeometry(pts, 18).toNonIndexed(); g.deleteAttribute('uv'); g.translate(c.x, c.y, c.z);
      const pa = g.getAttribute('position'), ca = new Float32Array(pa.count * 3);
      for (let i = 0; i < pa.count; i++) { const k = (pa.getX(i) - c.x) * L.x + (pa.getZ(i) - c.z) * L.z, cc = pick(k > 0.01 ? tones.lit : k > -0.01 ? tones.mid : tones.shade).clone().multiplyScalar(0.6); ca[i * 3] = cc.r; ca[i * 3 + 1] = cc.g; ca[i * 3 + 2] = cc.b; }
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); bases.push(g);
      for (let k = 0; k < prof.length - 1; k++) {
        const [r0, y0] = prof[k], [r1, y1] = prof[k + 1], segL = Math.hypot(r1 - r0, y1 - y0), m = Math.max(1, Math.round(segL / (hl * 1.5)));
        for (let j = 0; j < m; j++) {
          const t = (j + 0.5) / m, r = r0 + (r1 - r0) * t, y = y0 + (y1 - y0) * t, na = Math.max(5, Math.ceil(TAU * r / (hw * 1.5)));
          for (let i = 0; i < na; i++) {
            const th = (i + rng()) / na * TAU, cs = Math.cos(th), sn = Math.sin(th), lk = cs * L.x + sn * L.z;
            const n = V(cs * (y1 - y0), -(r1 - r0), sn * (y1 - y0)).normalize(), d = V(cs * (r1 - r0), y1 - y0, sn * (r1 - r0)).normalize();
            const tw = rng.range(-0.25, 0.25), side = V(-sn, 0, cs), dir = d.multiplyScalar(Math.cos(tw)).addScaledVector(side, Math.sin(tw)).multiplyScalar(Math.min(hl * rng.range(0.7, 1.1), segL * 0.7 + hl * 0.3));
            let col = pick(lk > 0.75 && rng() < 0.6 ? tones.gleam : lk > 0.15 ? tones.lit : lk > -0.45 ? tones.mid : tones.shade).clone();
            if (r1 < r0 && rng() < 0.3) col.multiplyScalar(0.85);                     // the under-curves a touch darker
            S.add(V(c.x + cs * (r + 0.0015), c.y + y, c.z + sn * (r + 0.0015)), dir, hw * rng.range(0.8, 1.2), col, n);
            if (o.inside) S.add(V(c.x + cs * (r - 0.003), c.y + y, c.z + sn * (r - 0.003)), dir, hw * rng.range(0.8, 1.2), pick(lk < 0 ? tones.lit : tones.mid).clone().multiplyScalar(0.9), n.clone().negate());
          }
        }
        K.add(V(c.x, c.y + (y0 + y1) / 2, c.z), V(0, (y1 - y0) * 0.75 + 0.002, 0), Math.max(r0, r1) + (o.inkW ?? 0.005), ink0.clone().multiplyScalar(rng.range(0.85, 1.1)), null, 0, 0);
      }
      const ring = (r, y, w) => { const pp = []; for (let i = 0; i < 14; i++) { const th = i / 14 * TAU; pp.push(V(c.x + Math.cos(th) * r, c.y + y, c.z + Math.sin(th) * r)); } inkLoop(pp, w, ink0, 0.03); };
      ring(prof[prof.length - 1][0] + 0.002, prof[prof.length - 1][1], (o.inkW ?? 0.005) * 0.8);
      ring(prof[0][0] + 0.002, prof[0][1] + 0.002, (o.inkW ?? 0.005) * 0.8);
    }

    // ---------- walls, floor, ceiling ----------
    const center = V(0, 1.4, -1.9);
    // patches as he hatched them: the wall is laid in small irregular patches, each with its own stroke direction
    // and its own mix (lighter, darker, bluer), not as an even fur
    const patch = (a, b) => { const u = a / 0.2 + 0.35 * n2(a * 3.1, b * 2.7), v = b / 0.17 + 0.35 * n2(b * 2.9 + 7, a * 3.3); return [Math.floor(u), Math.floor(v)]; };
    const patchAng = (a, b, base) => { const [i, j] = patch(a, b), h = hsh(i, j); return base + (h < 0.55 ? (h - 0.27) * 1.2 : h < 0.8 ? 0.75 + (h - 0.55) : -0.8 - (h - 0.8) * 1.5); };
    function wallCol(s, t, p, sides) {
      const [pi, pj] = patch(p.x + p.z, p.y), ph = hsh(pi + 17, pj + 5);
      const k = n2(p.x * 1.9 + p.z * 1.3, p.y * 2.1) * 0.35 + (ph - 0.5) * 0.9 + rng.range(-0.2, 0.2);
      let c = pick(WALL).clone();
      if (ph > 0.85) c.lerp(H('#6A7AC8'), 0.35);
      if (k > 0.32) c.lerp(pick(WALL_HI), 0.6); else if (k < -0.35) c.lerp(pick(WALL_LO), 0.45);
      const edge = Math.min(sides ? Math.min(s, 1 - s) * 3 : 1, t * 6, 1);
      return c.multiplyScalar(0.8 + 0.2 * edge);
    }
    function wall(A, B, holes, ang) {
      const U = B.clone().sub(A), Vv = V(0, RH, 0);
      let n = new THREE.Vector3().crossVectors(U, Vv).normalize();
      if (n.dot(center.clone().sub(A)) < 0) n.negate();
      baseQuad(A, U, Vv, n, (s, t, p) => wallCol(s, t, p, true).lerp(H('#3A3C80'), 0.5).multiplyScalar(0.7), holes);
      const Lu = U.length();
      paintFace(A, U, Vv, n, { hl: 0.045, hw: 0.012, ang: (s, t) => patchAng(s * Lu, t * RH, ang(s, t)), jit: 0.1, cover: 2.8, holes, col: (s, t, p) => wallCol(s, t, p, true) });
      return { U, n };
    }
    const LW = wall(FL, BL, [], (s, t) => 1.25 + 0.35 * Math.sin(s * 9 + t * 4));
    const RW = wall(FR, BR, [], (s, t) => 1.85 + 0.3 * Math.sin(s * 8 - t * 5));
    const sW0 = (WIN.x0 - BL.x) / (BR.x - BL.x), sW1 = (WIN.x1 - BL.x) / (BR.x - BL.x);
    const BW = wall(BL, BR, [[sW0, sW1, WIN.y0 / RH, WIN.y1 / RH]], (s, t) => 1.45 + 0.45 * Math.sin(s * 7 + 1));
    await ctx.yield();
    // the corners and the skirting line: darker violet-blue contours
    for (const [a, b] of [[BL, BR], [FL, BL], [FR, BR]]) ink(a.clone().setY(0.012), b.clone().setY(0.012), 0.012, H('#3A3A70'));
    ink(BL.clone().setY(0), BL.clone().setY(RH), 0.012, H('#4A4A88'), 0.12);
    ink(BR.clone().setY(0), BR.clone().setY(RH), 0.012, H('#4A4A88'), 0.12);
    for (const [a, b] of [[BL, BR], [FL, BL], [FR, BR]]) ink(a.clone().setY(RH - 0.01), b.clone().setY(RH - 0.01), 0.014, H('#5A5A90'), 0.14);
    // ceiling
    {
      const o = V(-1.7, RH, 0.7), U = V(3.5, 0, 0), Vv = V(0, 0, -5.1), n = V(0, -1, 0);
      const cc = () => pick(CEIL).clone();
      baseQuad(o, U, Vv, n, () => cc().multiplyScalar(0.6));
      paintFace(o, U, Vv, n, { hl: 0.07, hw: 0.02, ang: 0.4, jit: 0.4, cover: 1.6, col: cc });
    }
    // the floor: boards running toward the window, each its own mix, laid in long strokes with dark seams
    {
      const o = V(-1.7, 0, 0.7), U = V(3.5, 0, 0), Vv = V(0, 0, -5.1), n = V(0, 1, 0);
      baseQuad(o, U, Vv, n, (s, t, p) => mixc(H('#7A4E34'), H('#6A6A44'), 0.5 + 0.5 * n2(p.x * 3, p.z)).multiplyScalar(0.8));
      const BWd = 0.155, d = new THREE.Vector3(), q = new THREE.Vector3();
      for (let x = FL.x + 0.02, b = 0; x < FR.x; x += BWd, b++) {
        const hue = pick(BOARD), alt = pick(BOARD), zEnd = backZ(x);
        for (const off of [-0.042, 0, 0.042]) {
          for (let z = 0.7 - rng() * 0.2; z > zEnd; z -= rng.range(0.05, 0.075)) {
            const hl = rng.range(0.07, 0.12), xx = x + off + rng.range(-0.012, 0.012);
            let c = (rng() < 0.7 ? hue : alt).clone();
            if (rng() < 0.12) c.lerp(H('#E0A060'), 0.4); else if (rng() < 0.1) c.lerp(H('#5A7A4A'), 0.5);
            c.multiplyScalar(0.85 + 0.25 * sstep(-4.3, 0.5, z));                   // the back of the room a touch darker
            const a = rng.range(-0.06, 0.06);
            q.set(xx, 0.003 + rng() * 0.002, Math.max(z, zEnd + hl * 0.6)); d.set(Math.sin(a) * hl, 0, -Math.cos(a) * hl);
            S.add(q, d, rng.range(0.016, 0.022), c, n);
          }
        }
        // the seam on its right edge
        for (let z = 0.7; z > zEnd; z -= 0.14) {
          q.set(x + BWd / 2 + rng.range(-0.006, 0.006), 0.007, z - 0.07); d.set(rng.range(-0.004, 0.004), 0, -0.078);
          K.add(q, d, 0.0055, pick(SEAM), n, 0, 0);
        }
        if (b % 4 === 3) await ctx.yield();
      }
    }
    await ctx.yield();

    // ---------- the window: deep reveal, green frame, two casements that open inward, green shutters outside ----------
    const winC = onBack((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2);
    {
      const a0 = onBack(WIN.x0, WIN.y0), a1 = onBack(WIN.x1, WIN.y0), b0 = onBack(WIN.x0, WIN.y1), b1 = onBack(WIN.x1, WIN.y1);
      const out = NB.clone().multiplyScalar(-WT), up = V(0, WIN.y1 - WIN.y0, 0), across = a1.clone().sub(a0);
      const rev = (o, U, Vv, n) => { baseQuad(o, U, Vv, n, (s, t, p) => wallCol(0.5, 0.5, p).multiplyScalar(0.62)); paintFace(o, U, Vv, n, { hl: 0.035, hw: 0.011, ang: Math.PI / 2, jit: 0.3, col: (s, t, p) => wallCol(0.5, 0.5, p).lerp(pick(WALL_HI), 0.3) }); };
      rev(a0, out, up, UB.clone());                       // left jamb, faces +along
      rev(a1, out, up, UB.clone().negate());
      rev(a0, across, out, Y.clone());                    // sill
      rev(b0, across, out, Y.clone().negate());           // head
      // the fixed frame in the opening: green, outlined
      const fr = (A, B, w) => { const d = B.clone().sub(A), n = NB.clone(); const Lr = d.length();
        const side = new THREE.Vector3().crossVectors(n, d).normalize().multiplyScalar(w);
        const o = A.clone().addScaledVector(side, -0.5);
        box(A.clone().add(B).multiplyScalar(0.5).addScaledVector(NB, -0.03), Lr < 0.001 ? 0.01 : (Math.abs(d.y) > 0.01 ? w : Lr), Math.abs(d.y) > 0.01 ? Lr : w, 0.05, Math.atan2(-UB.z, UB.x), { col: () => pick(GREEN).clone(), hl: 0.03, hw: 0.009, ink: INK, inkW: 0.006, grain: Math.abs(d.y) > 0.01 ? 'y' : 'x' }); void o; };
      fr(a0, b0, 0.06); fr(a1, b1, 0.06); fr(a0, a1, 0.07); fr(b0, b1, 0.07);
      // the sill board inside, ochre-green
      box(onBack((WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.02, 0.05), WIN.x1 - WIN.x0 + 0.16, 0.035, 0.12, Math.atan2(-UB.z, UB.x), { col: () => mixc(pick(GREEN), pick(WOOD), 0.4), ink: INK, inkW: 0.006 });
      // the outer shutters, folded open against the yellow house front
      for (const sd of [-1, 1]) {
        const hingeX = sd < 0 ? WIN.x0 : WIN.x1, hinge = onBack(hingeX, (WIN.y0 + WIN.y1) / 2, -WT - 0.02);
        const ang = Math.atan2(-UB.z, UB.x) + sd * 0.35;               // ~20 degrees off the wall: they frame the view
        const dir = V(Math.cos(ang), 0, -Math.sin(ang)).multiplyScalar(sd);
        for (let k = 0; k < 2; k++) {
          const c = hinge.clone().addScaledVector(dir, 0.11 + k * 0.22).addScaledVector(NB, -0.02 - 0.04 * k * 0);
          box(c, 0.21, WIN.y1 - WIN.y0 + 0.08, 0.035, ang, { col: () => pick(GREEN).clone().multiplyScalar(0.85), grain: 'y', hl: 0.04, hw: 0.01, ink: H('#14301A'), inkW: 0.007 });
        }
      }
      // a band of the yellow house's front round the opening, seen as we pass
      const fo = onBack(WIN.x0 - 0.9, WIN.y0 - 0.9, -WT), fu = UB.clone().multiplyScalar(WIN.x1 - WIN.x0 + 1.8), fv = V(0, WIN.y1 - WIN.y0 + 1.6, 0), fn = NB.clone().negate();
      const fH = [[0.9 / (WIN.x1 - WIN.x0 + 1.8), (0.9 + WIN.x1 - WIN.x0) / (WIN.x1 - WIN.x0 + 1.8), 0.9 / (WIN.y1 - WIN.y0 + 1.6), (0.9 + WIN.y1 - WIN.y0) / (WIN.y1 - WIN.y0 + 1.6)]];
      const yel = () => mixc(pick(P(['#C89A30', '#B88A30', '#D8A838'])), H('#2A3A6A'), 0.45);
      baseQuad(fo, fu, fv, fn, () => yel().multiplyScalar(0.6), fH);
      paintFace(fo, fu, fv, fn, { hl: 0.05, hw: 0.014, ang: 1.4, jit: 0.3, holes: fH, col: yel });
    }
    // the casements: their own meshes, hinged at the jambs, opening inward as the camera comes (a function of time)
    const casements = [];
    {
      const yaw = Math.atan2(-UB.z, UB.x), wHalf = (WIN.x1 - WIN.x0) / 2 * Math.hypot(1, (BR.z - BL.z) / (BR.x - BL.x)), hgt = WIN.y1 - WIN.y0 - 0.1;
      for (const sd of [-1, 1]) {
        const Sx = makeSet(rng, true), saveS = S;
        const g = new THREE.Group();
        g.position.copy(onBack(sd < 0 ? WIN.x0 : WIN.x1, WIN.y0 + 0.05, -0.1)); g.rotation.y = yaw;
        // built in the group's own frame: x along the wall (away from the hinge = -sd), y up, z into the room
        const loc = [];
        const ax = -sd;
        const bars = [[0.02, 0, 0.02, hgt, 0.035], [ax * (wHalf - 0.02), 0, ax * (wHalf - 0.02), hgt, 0.03]];
        for (const yy of [0.02, hgt * 0.36, hgt * 0.68, hgt - 0.02]) bars.push([0, yy, ax * wHalf, yy, yy < 0.05 || yy > hgt - 0.05 ? 0.035 : 0.022]);
        // glass, as in the painting: each pane laid in its own planes of green-yellow above and teal below, mostly
        // vertical strokes, a pale diagonal gleam across it, and gaps where the brush skipped: there the night shows through
        const GL_HI = P(['#A8BC70', '#9AB468', '#B4C478', '#8EAE6A']), GL_MID = P(['#5A9A84', '#509484', '#64A28C', '#6EA890']), GL_LO = P(['#3E7E7A', '#367474', '#468682', '#3A7680']);
        const rows = [[0.035, hgt * 0.36 - 0.015], [hgt * 0.36 + 0.015, hgt * 0.68 - 0.015], [hgt * 0.68 + 0.015, hgt - 0.035]];
        for (const [y0, y1] of rows) {
          const ph = rng.range(0.15, 0.45), tilt = rng.range(-0.15, 0.15), pw = wHalf - 0.06, n = Math.ceil(pw * (y1 - y0) * 1.9 / (4 * 0.034 * 0.0095));
          for (let i = 0; i < n; i++) {
            const sx = rng(), ty = rng(), x = ax * (0.03 + sx * pw), y = y0 + ty * (y1 - y0), gl = Math.abs(sx * 0.9 - ty * 0.7 + 0.1 - ph) < 0.07;
            const mid = Math.hypot(sx - 0.5, ty - 0.55) < 0.28;
            if (!gl && mid && rng() < 0.1) continue;                     // the skipped places: the night behind
            let c = pick(ty > 0.62 + 0.1 * Math.sin(sx * 5) ? GL_HI : ty > 0.25 ? GL_MID : GL_LO).clone();
            if (gl) { if (rng() < 0.45) continue; c.lerp(H('#E4ECC8'), 0.4); }
            const a = gl ? 1.0 + rng.range(-0.15, 0.15) : 1.57 + tilt + rng.range(-0.18, 0.18), hl = gl ? rng.range(0.03, 0.05) : rng.range(0.025, 0.045);
            const d = V(Math.cos(a) * hl * ax, Math.sin(a) * hl, 0), hw = rng.range(0.008, 0.011);
            Sx.add(V(x, y, 0.004), d, hw, c, V(0, 0, 1));
            Sx.add(V(x, y, -0.004), d, hw, c.clone().multiplyScalar(0.82), V(0, 0, -1));
          }
        }
        const Kx = makeSet(rng, false);
        for (const [x0, y0, x1, y1, w] of bars) {
          const L = Math.hypot(x1 - x0, y1 - y0), m = Math.max(1, Math.ceil(L / 0.05)), dx = (x1 - x0) / m, dy = (y1 - y0) / m;
          for (let k = 0; k < m; k++) for (const z of [0.012, -0.012]) {
            Sx.add(V(x0 + dx * (k + 0.5), y0 + dy * (k + 0.5), z), V(dx * 0.65, dy * 0.65, 0), w * 0.5, pick(GREEN).clone(), V(0, 0, Math.sign(z)));
          }
          // its dark edges
          const nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
          for (const s of [-1, 1]) for (let k = 0; k < m; k++) Kx.add(V(x0 + dx * (k + 0.5) + nx * s * w * 0.5, y0 + dy * (k + 0.5) + ny * s * w * 0.5, 0.016), V(dx * 0.62, dy * 0.62, 0), 0.0045, INK.clone(), null, 0, 0);
        }
        g.add(Sx.mesh(nearMat), Kx.mesh(nearMat));
        room.add(g);
        casements.push({ g, sd, yaw });
        void loc; void saveS;
      }
    }
    await ctx.yield();

    // ---------- the bed: chrome yellow wood, scarlet blanket, pale yellow-green pillows and sheet ----------
    {
      const bx0 = 0.44, bx1 = 1.66, bz0 = -1.72, bz1 = -3.80, mx = (bx0 + bx1) / 2, mz = (bz0 + bz1) / 2;
      const wood = (key) => (key[0] === '-' && key[1] !== 'y') || key === '+x' ? pick(BED_SH).clone().lerp(pick(BED), 0.4) : pick(BED).clone();
      const wb = { col: (k) => wood(k), ink: INK_W, inkW: 0.009, hl: 0.04, hw: 0.011 };
      for (const x of [bx0, bx1]) {
        box(V(x, 0.66, bz1), 0.075, 1.32, 0.075, 0, { ...wb, grain: 'y' });            // head posts
        box(V(x, 0.44, bz0), 0.075, 0.88, 0.075, 0, { ...wb, grain: 'y' });            // foot posts
        box(V(x, 0.42, mz), 0.06, 0.2, bz0 - bz1 - 0.08, 0, { ...wb, grain: 'z' });    // side rails
      }
      box(V(mx, 0.86, bz1), bx1 - bx0 - 0.07, 0.86, 0.045, 0, { ...wb, grain: 'y', hl: 0.06 });   // headboard
      box(V(mx, 1.33, bz1), bx1 - bx0 + 0.08, 0.07, 0.09, 0, { ...wb, grain: 'x' });             // its top rail
      box(V(mx, 0.56, bz0), bx1 - bx0 - 0.07, 0.48, 0.045, 0, { ...wb, grain: 'y', hl: 0.05 });   // footboard
      box(V(mx, 0.83, bz0), bx1 - bx0 + 0.06, 0.06, 0.085, 0, { ...wb, grain: 'x' });            // its top rail
      // a few long streaks of grain on the boards, the darker brown of his drawing
      for (let i = 0; i < 26; i++) { const x = rng.range(bx0 + 0.08, bx1 - 0.08); K.add(V(x, rng.range(0.42, 0.74), bz0 + 0.026), V(rng.range(-0.004, 0.004), rng.range(0.04, 0.09), 0), 0.004, BED_SH[0].clone().multiplyScalar(0.8), V(0, 0, 1), 0, 0); }
      for (let i = 0; i < 30; i++) { const x = rng.range(bx0 + 0.08, bx1 - 0.08); K.add(V(x, rng.range(0.5, 1.22), bz1 + 0.026), V(rng.range(-0.004, 0.004), rng.range(0.05, 0.1), 0), 0.004, BED_SH[0].clone().multiplyScalar(0.8), V(0, 0, 1), 0, 0); }
      // mattress under the sheet (head end) and the blanket over the rest, draped over the sides
      box(V(mx, 0.6, mz), bx1 - bx0 - 0.04, 0.16, bz0 - bz1 - 0.06, 0, { col: () => pick(SHEET).clone(), hl: 0.04, hw: 0.011, skip: ['-y'] });
      const bl0 = bz0 - 0.02, bl1 = -3.02, blC = (bl0 + bl1) / 2;
      const red = (k, s, t, p) => { const r = n2(p.x * 6, p.z * 6); let c = (k === '+y' ? pick(RED) : pick(RED).clone().lerp(pick(RED_SH), 0.45)).clone(); if (r > 0.45) c.lerp(H('#F07040'), 0.35); if (r < -0.5) c.lerp(pick(RED_SH), 0.5); return c; };
      box(V(mx, 0.585, blC), bx1 - bx0 + 0.02, 0.25, bl0 - bl1, 0, { col: red, hl: 0.05, hw: 0.012, jit: 0.5, skip: ['-y'], ink: INK_R, inkW: 0.008, inkSkip: ['x-1-1', 'x-11', 'z-1-1', 'z1-1', 'y-1-1', 'y1-1', 'y-11', 'y11'], shade: (k) => k === '+y' ? 1 : 0.8 });
      // fold lines in the blanket: a few darker wavy strokes across it, and lighter ridges
      for (let i = 0; i < 9; i++) { const z = rng.range(bl1 + 0.1, bl0 - 0.1), x = rng.range(bx0 + 0.15, bx1 - 0.15), a = rng.range(-0.5, 0.5);
        S.add(V(x, 0.716, z), V(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12), 0.01, pick(RED_SH).clone(), Y, 0, 0.3);
        S.add(V(x + 0.02, 0.718, z + 0.02), V(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1), 0.007, H('#E85438'), Y, 0, 0.3); }
      // the sheet turned down over the blanket's head edge
      box(V(mx, 0.72, bl1 - 0.06), bx1 - bx0 + 0.02, 0.035, 0.14, 0, { col: () => pick(SHEET).clone(), hl: 0.035, hw: 0.009, ink: H('#6A7A40'), inkW: 0.005, grain: 'x' });
      // pillows, one behind the other, the back one leaning on the headboard
      const pil = (e) => { const c = pick(SHEET).clone().lerp(H('#E8EC98'), 0.3); if (e.y < -0.3) c.lerp(H('#9AAA60'), 0.4); if (e.y > 0.55) c.lerp(H('#F4F4D0'), 0.35); if (Math.abs(e.x) > 0.8) c.lerp(H('#A8B870'), 0.3); return c; };
      const PL = V(-0.35, 0.85, 0.45).normalize(), po = { hl: 0.03, hw: 0.009, cover: 2.8, sq: 0.6, L: PL, face: V(-0.3, 0.8, 0.6), ink: H('#4E5E30'), inkW: 0.007 };
      const pillows = [[V(mx - 0.29, 0.84, -3.46), 0.28, 0.16, 0.22], [V(mx + 0.29, 0.84, -3.54), 0.28, 0.16, 0.22], [V(mx, 0.98, -3.69), 0.56, 0.16, 0.11]];
      for (const [pc, rx, ry, rz] of pillows) {
        blob(pc, rx, ry, rz, pil, po);
        // the dent in the middle and the seams pulled in at the corners: a few darker curved strokes on the top
        for (let i = 0; i < 7; i++) { const a = rng.range(-0.6, 0.6), x = pc.x + rng.range(-0.45, 0.45) * rx, z = pc.z + rng.range(-0.4, 0.4) * rz;
          S.add(V(x, pc.y + ry * 0.93, z), V(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05), 0.006, H('#9AA868'), Y, 0, 0.4); }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.add(V(pc.x + sx * rx * 0.8, pc.y + ry * 0.55, pc.z + sz * rz * 0.75), V(-sx * 0.035, 0.012, -sz * 0.02), 0.006, H('#7E8E50'), V(sx * 0.5, 0.8, sz * 0.3).normalize(), 0, 0.3);
      }
    }
    await ctx.yield();

    // ---------- the chairs: yellow wood, woven straw seats, dark outlines ----------
    function chair(x, z, yaw) {
      const ex = V(Math.cos(yaw), 0, -Math.sin(yaw)), ez = V(Math.sin(yaw), 0, Math.cos(yaw));
      const at = (a, y, b) => V(x, y, z).addScaledVector(ex, a).addScaledVector(ez, b);
      const wd = { col: (k) => (k[0] === '-' ? pick(WOOD).clone().multiplyScalar(0.8) : pick(WOOD).clone()), ink: INK_W, inkW: 0.006, hl: 0.03, hw: 0.008 };
      const S2 = 0.21, SY = 0.46;
      for (const a of [-1, 1]) for (const b of [-1, 1]) box(at(a * S2, SY / 2, b * S2), 0.04, SY, 0.04, yaw, { ...wd, grain: 'y' });
      for (const a of [-1, 1]) box(at(a * S2, 0.72, -S2), 0.04, 0.52, 0.04, yaw, { ...wd, grain: 'y' });   // back posts
      for (const y of [0.66, 0.84]) box(at(0, y, -S2), 2 * S2 - 0.03, 0.05, 0.025, yaw, { ...wd, grain: 'x' });  // back slats
      for (const y of [0.13]) { box(at(0, y, S2), 2 * S2, 0.025, 0.025, yaw, { ...wd, grain: 'x' }); box(at(-S2, y + 0.06, 0), 0.025, 0.025, 2 * S2, yaw, { ...wd, grain: 'z' }); box(at(S2, y + 0.06, 0), 0.025, 0.025, 2 * S2, yaw, { ...wd, grain: 'z' }); }
      box(at(0, SY - 0.015, 0), 2 * S2 + 0.04, 0.035, 2 * S2 + 0.04, yaw, { ...wd, skip: ['+y'], grain: 'x' });
      // the woven seat: short crossing strokes, two directions in checker
      const o = at(-S2 - 0.01, SY + 0.004, S2 + 0.01), U = ex.clone().multiplyScalar(2 * S2 + 0.02), Vv = ez.clone().multiplyScalar(-(2 * S2 + 0.02));
      baseQuad(o, U, Vv, Y, () => pick(STRAW).clone().multiplyScalar(0.55));
      const N = 13;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const s = (i + 0.5) / N, t = (j + 0.5) / N, diag = (i + j) % 2, a = diag ? Math.PI / 4 : -Math.PI / 4;
        for (let k = 0; k < 2; k++) {
          const p = o.clone().addScaledVector(U, s + rng.range(-0.02, 0.02)).addScaledVector(Vv, t + rng.range(-0.02, 0.02)).add(V(0, 0.002 + k * 0.001, 0));
          const d = ex.clone().multiplyScalar(Math.cos(a)).addScaledVector(ez, Math.sin(a)).multiplyScalar(0.022);
          let c = pick(STRAW).clone(); const edge = Math.min(s, 1 - s, t, 1 - t); c.multiplyScalar(0.8 + 0.5 * Math.min(1, edge * 4));
          S.add(p, d, 0.0085, c, Y);
        }
      }
      inkLoop([at(-S2 - 0.02, SY + 0.006, -S2 - 0.02), at(S2 + 0.02, SY + 0.006, -S2 - 0.02), at(S2 + 0.02, SY + 0.006, S2 + 0.02), at(-S2 - 0.02, SY + 0.006, S2 + 0.02)], 0.007, INK_W, 0.06);
    }
    chair(-0.08, -1.72, -0.5);         // by the bed, facing the room
    chair(-1.2, -2.5, Math.PI / 2 - 0.25);   // against the left wall
    await ctx.yield();

    // ---------- the little table under the mirror, with jug, basin, bottles ----------
    {
      const tx = -1.21, tz = -3.56, ty = 0.74, yaw = Math.atan2(-(BL.z - FL.z) * 0, 1) - 0.02;
      const wd = { col: (k) => (k === '+y' ? pick(WOOD).clone().lerp(H('#F0C870'), 0.2) : pick(WOOD).clone().multiplyScalar(0.82)), ink: INK_W, inkW: 0.007, hl: 0.035, hw: 0.009 };
      box(V(tx, ty - 0.02, tz), 0.6, 0.04, 0.74, yaw, { ...wd, grain: 'z' });
      for (const a of [-1, 1]) for (const b of [-1, 1]) box(V(tx + a * 0.26, (ty - 0.04) / 2, tz + b * 0.33), 0.035, ty - 0.04, 0.035, yaw, { ...wd, grain: 'y' });
      box(V(tx, 0.58, tz + 0.345), 0.5, 0.1, 0.02, yaw, { ...wd, grain: 'x' });
      // jug and basin: blue, in his lighter and darker blues
      // jug and basin: his blues, lit from the window; the jug stands in the basin, its spout and handle drawn on
      const BLUE = { lit: P(['#6A8AD0', '#7A9AD8', '#5A7AC8']), mid: P(['#4A6AB8', '#3A5AA8', '#4A62B0']), shade: P(['#2A3A80', '#24346A', '#2E3E88']), gleam: P(['#C8DCF0', '#B8D0F0', '#E0ECF8']) };
      const bc = V(tx + 0.02, ty, tz + 0.02), jc = V(tx - 0.0, ty + 0.03, tz - 0.0);
      lathe(bc, [[0.07, 0], [0.11, 0.012], [0.15, 0.035], [0.172, 0.06], [0.178, 0.068]], BLUE, { hl: 0.022, hw: 0.007, inside: true });
      for (let i = 0; i < 40; i++) { const a = rng.range(0, TAU), r = Math.sqrt(rng()) * 0.14; S.add(V(bc.x + Math.cos(a) * r, ty + 0.045, bc.z + Math.sin(a) * r), V(rng.range(0.012, 0.022), 0, rng.range(-0.006, 0.006)), 0.006, pick(P(['#9AB8E0', '#7A98D0', '#C8DCF0'])), Y); }
      lathe(jc, [[0.05, 0], [0.068, 0.03], [0.078, 0.08], [0.07, 0.13], [0.045, 0.18], [0.036, 0.21], [0.044, 0.235], [0.05, 0.245]], BLUE, { hl: 0.018, hw: 0.006 });
      { const sp = jc.clone().add(V(0.05, 0.24, 0.02)); S.add(sp, V(0.022, 0.008, 0.008), 0.009, pick(BLUE.lit), null); K.add(sp.clone().add(V(0.004, 0.004, 0)), V(0.024, 0.008, 0.008), 0.003, INK, null, 0, 0); }
      for (let i = 0; i < 7; i++) {                         // the handle: a loop of blue strokes on the far side, outlined
        const a0 = i / 6 * Math.PI, a1 = (i + 1) / 6 * Math.PI, p = (a) => jc.clone().add(V(-0.06 - 0.045 * Math.sin(a), 0.2 - 0.12 * a / Math.PI, -0.02));
        if (i < 6) { const A = p(a0), B = p(a1), d = B.clone().sub(A).multiplyScalar(0.6); S.add(A.clone().add(B).multiplyScalar(0.5), d, 0.008, pick(BLUE.mid), null); K.add(A.clone().add(B).multiplyScalar(0.5).add(V(0, 0, -0.002)), d.clone().multiplyScalar(1.1), 0.012, INK, null, 0, 0); }
      }
      const bot = [[tx - 0.17, tz + 0.2, ['#2E6A4A', '#3E8A5A', '#1E4A34'], 0.12], [tx - 0.2, tz + 0.05, ['#4A8A5A', '#6AAA6A', '#2E6A40'], 0.1], [tx + 0.16, tz - 0.22, ['#C8A040', '#E0C060', '#8A6A28'], 0.07], [tx + 0.1, tz - 0.28, ['#7A3A2A', '#A0503A', '#4A2018'], 0.09]];
      for (const [bxp, bzp, hc, h] of bot) {
        const [m0, l0, s0] = hc.map(H), T = { lit: [l0], mid: [m0], shade: [s0], gleam: [l0.clone().lerp(H('#F0F4E0'), 0.6)] }, hh = 2 * h;
        lathe(V(bxp, ty, bzp), [[0.026, 0], [0.03, 0.01], [0.031, hh * 0.62], [0.024, hh * 0.74], [0.012, hh * 0.84], [0.011, hh], [0.014, hh + 0.008]], T, { hl: 0.014, hw: 0.005, inkW: 0.004 });
      }
      // brushes and a comb lying on the table
      for (let i = 0; i < 4; i++) { const a = rng.range(-0.6, 0.6); K.add(V(tx + rng.range(0, 0.15), ty + 0.006, tz + rng.range(0, 0.15)), V(Math.sin(a) * 0.07, 0, Math.cos(a) * 0.07), 0.006, pick(P(['#6A3A1A', '#E8D8A0', '#3A2A1A'])), Y, 0, 0); }
      // the mirror on the left wall above it
      const lw = (s, y) => FL.clone().addScaledVector(LW.U, s).setY(y).addScaledVector(LW.n, 0.012);
      const ms0 = (tz + 0.22 - FL.z) / (BL.z - FL.z), ms1 = (tz - 0.22 - FL.z) / (BL.z - FL.z);
      const mo = lw(ms0, 1.22), mU = lw(ms1, 1.22).sub(mo), mV = V(0, 0.52, 0);
      baseQuad(mo, mU, mV, LW.n, () => H('#7A8A98'));
      // the mirror: grey-green planes of a few tones, a lighter gleam down one side (patches, not rain)
      paintFace(mo.clone().addScaledVector(LW.n, 0.004), mU, mV, LW.n, { hl: 0.026, hw: 0.008, cover: 2.6, ang: (s, t) => patchAng(s * 0.44, t * 0.52, 1.45), jit: 0.12,
        col: (s, t) => { const g = Math.abs(s - 0.3 + 0.2 * t) < 0.09; return g ? pick(P(['#D8E4D8', '#E4ECE0', '#C8D8D0'])).clone() : mixc(pick(P(['#8AA4A8', '#9AB0B0', '#7A96A0', '#A8BCB4', '#8A9CA8'])), H('#5A6A90'), Math.abs(s - 0.5) + Math.abs(t - 0.5) - 0.3); } });
      const mc = [mo, mo.clone().add(mU), mo.clone().add(mU).add(mV), mo.clone().add(mV)].map((p) => p.addScaledVector(LW.n, 0.01));
      inkLoop(mc, 0.016, H('#4A3A22'), 0.07); inkLoop(mc, 0.006, INK, 0.07);
    }
    await ctx.yield();

    // ---------- pictures on the walls: framed squares of strokes, no images ----------
    function picture(o, U, Vv, n, kind) {
      const w = U.length(), h = Vv.length();
      baseQuad(o.clone().addScaledVector(n, 0.01), U, Vv, n, () => H('#3A3A3A'));
      const o2 = o.clone().addScaledVector(n, 0.014);
      const col = (s, t) => {
        if (kind === 'land') return t > 0.62 ? pick(P(['#7AB0D8', '#A8CCE0', '#5A8AC8'])).clone() : t > 0.4 ? pick(P(['#E8C850', '#D8B040', '#C8D060'])).clone() : pick(P(['#3E7A3A', '#5A9A44', '#2E5A3A', '#8AA040'])).clone();
        if (kind === 'print') return Math.hypot(s - 0.5, t - 0.55) < 0.22 ? pick(P(['#D85A3A', '#3A5A9A', '#E8C060'])).clone() : pick(P(['#E8E0C0', '#D8D0B0', '#F0E8D0'])).clone();
        const head = Math.hypot((s - 0.5) * 1.3, t - 0.62) < 0.2, body = t < 0.38 && Math.abs(s - 0.5) < 0.4 - t * 0.2;
        if (head) return pick(kind === 'por1' ? P(['#E0A860', '#D89850', '#C88848', '#E8C080']) : P(['#D8A070', '#C89060', '#E0B080'])).clone();
        if (body) return pick(kind === 'por1' ? P(['#2A2A3A', '#3A3A5A', '#1E2A4A']) : P(['#3A6A3A', '#2E5A3A', '#C04030'])).clone();
        return pick(kind === 'por1' ? P(['#3A6AB0', '#2E5AA0', '#4A7AC0']) : P(['#8AB050', '#7AA040', '#A8C060'])).clone();
      };
      paintFace(o2, U, Vv, n, { hl: Math.min(0.03, w * 0.12), hw: 0.008, ang: kind === 'land' ? 0.1 : 1.3, jit: 0.6, col, lift: 0.002 });
      const c = [o, o.clone().add(U), o.clone().add(U).add(Vv), o.clone().add(Vv)].map((p) => p.addScaledVector(n, 0.02));
      inkLoop(c, 0.018, kind === 'print' ? H('#3A2A1A') : H('#B88A3A'), 0.06);
      inkLoop(c.map((p, i) => p.clone().lerp(c[(i + 2) % 4], 0.03)), 0.006, INK_W, 0.06);
    }
    const rw = (z, y) => { const s = (z - FR.z) / (BR.z - FR.z); return FR.clone().addScaledVector(RW.U, s).setY(y).addScaledVector(RW.n, 0.004); };
    const zU = (z0, z1) => rw(z1, 0).sub(rw(z0, 0));
    picture(rw(-2.95, 1.55), zU(-2.95, -3.62), V(0, 0.5, 0), RW.n, 'land');
    picture(rw(-2.12, 1.6), zU(-2.12, -2.48), V(0, 0.44, 0), RW.n, 'por1');
    picture(rw(-1.55, 1.6), zU(-1.55, -1.91), V(0, 0.44, 0), RW.n, 'por2');
    picture(rw(-0.85, 1.72), zU(-0.85, -1.12), V(0, 0.3, 0), RW.n, 'print');
    picture(rw(-0.85, 1.32), zU(-0.85, -1.12), V(0, 0.3, 0), RW.n, 'print');
    // two small prints on the back wall, left of the window
    picture(onBack(-1.38, 1.62, 0.004), UB.clone().multiplyScalar(0.26), V(0, 0.32, 0), NB, 'print');
    picture(onBack(-1.02, 1.62, 0.004), UB.clone().multiplyScalar(0.26), V(0, 0.32, 0), NB, 'print');
    // ---------- doors on the left wall: lilac-blue boards with dark frames ----------
    for (const [z0, z1] of [[0.45, -0.38], [-1.42, -2.2]]) {
      const lw = (z, y) => { const s = (z - FL.z) / (BL.z - FL.z); return FL.clone().addScaledVector(LW.U, s).setY(y).addScaledVector(LW.n, 0.006); };
      const o = lw(z0, 0), U = lw(z1, 0).sub(o), Vv = V(0, 2.05, 0);
      baseQuad(o, U, Vv, LW.n, () => pick(DOOR).clone().multiplyScalar(0.6));
      paintFace(o.clone().addScaledVector(LW.n, 0.002), U, Vv, LW.n, { hl: 0.06, hw: 0.013, ang: Math.PI / 2, jit: 0.08, col: (s) => pick(DOOR).clone().multiplyScalar(0.85 + 0.3 * Math.abs(Math.sin(s * 9))) });
      const c = [o, o.clone().add(U), o.clone().add(U).add(Vv), o.clone().add(Vv)].map((p) => p.addScaledVector(LW.n, 0.012));
      ink(c[0], c[3], 0.014, INK); ink(c[3], c[2], 0.014, INK); ink(c[1], c[2], 0.014, INK);
      for (const s of [0.33, 0.66]) ink(o.clone().addScaledVector(U, s).addScaledVector(LW.n, 0.01).setY(0.05), o.clone().addScaledVector(U, s).addScaledVector(LW.n, 0.01).setY(2.0), 0.005, H('#3A4A8A'));
      K.add(o.clone().addScaledVector(U, 0.88).setY(1.0).addScaledVector(LW.n, 0.02), V(0, 0.03, 0), 0.012, H('#2A2A2A'), null);
    }
    // ---------- pegs on the back wall right of the window: the blue smock and the straw hat; the towel by the window ----------
    {
      for (const x of [1.0, 1.3, 1.55]) K.add(onBack(x, 1.78, 0.04), NB.clone().multiplyScalar(0.035), 0.01, H('#3A2A1A'), null);
      ink(onBack(0.92, 1.78, 0.01), onBack(1.64, 1.78, 0.01), 0.012, H('#6A4A2A'));
      // the smock hangs from the middle peg down behind the headboard
      const so = onBack(1.12, 1.18, 0.05), sU = UB.clone().multiplyScalar(0.36), sV = V(0, 0.6, 0);
      baseQuad(so, sU, sV, NB, () => H('#2A3E7A'));
      paintFace(so.clone().addScaledVector(NB, 0.004), sU, sV, NB, { hl: 0.05, hw: 0.011, ang: Math.PI / 2, jit: 0.25, col: (s, t) => pick(P(['#3A5AA0', '#2A4A8A', '#4A6AB8', '#5A7AC0'])).clone().multiplyScalar(0.8 + 0.3 * t) });
      const sc = [so, so.clone().add(sU), so.clone().add(sU).add(sV), so.clone().add(sV)].map((p) => p.addScaledVector(NB, 0.012));
      inkLoop(sc, 0.008, INK, 0.07);
      // the straw hat hung on its peg: a round brim flat against the wall, the crown standing out of it into the room,
      // a dark ribbon round the crown; straw laid in rings, lighter above, and his brown outline round the brim
      {
        const hc = onBack(1.55, 1.69, 0.014), ua = UB.clone(), va = Y.clone(), nn = NB.clone(), HL = V(-0.3, 0.8, 0.5).normalize();
        const at = (x, y, z) => hc.clone().addScaledVector(ua, x).addScaledVector(va, y).addScaledVector(nn, z);
        const brimG = new THREE.CircleGeometry(0.172, 26).toNonIndexed(); brimG.deleteAttribute('uv');
        brimG.applyMatrix4(new THREE.Matrix4().makeBasis(ua, va, nn).setPosition(hc));
        const crownG = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2).toNonIndexed(); crownG.deleteAttribute('uv');
        crownG.applyMatrix4(new THREE.Matrix4().makeBasis(ua.clone().multiplyScalar(0.085), nn.clone().multiplyScalar(0.075), va.clone().multiplyScalar(0.08)).setPosition(at(0, 0.01, 0.004)));
        for (const g of [brimG, crownG]) { const p = g.getAttribute('position'), cc = new Float32Array(p.count * 3), b0 = STRAW[2].clone().multiplyScalar(0.6); for (let i = 0; i < p.count; i++) { cc[i * 3] = b0.r; cc[i * 3 + 1] = b0.g; cc[i * 3 + 2] = b0.b; } g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); bases.push(g); }
        for (let r = 0.092; r < 0.17; r += 0.013) {                         // the brim: rings of short tangential straw strokes
          const n = Math.ceil(TAU * r / 0.022);
          for (let i = 0; i < n; i++) { const a = (i + rng()) / n * TAU, cs = Math.cos(a), sn = Math.sin(a), d = ua.clone().multiplyScalar(-sn * 0.016).addScaledVector(va, cs * 0.016);
            const c = pick(STRAW).clone().multiplyScalar(0.78 + 0.32 * sn + rng.range(-0.08, 0.08) - (r > 0.155 ? 0.12 : 0));
            S.add(at(cs * r, sn * r, 0.004 + 0.002 * rng()), d, 0.0065, c, nn); }
        }
        for (let i = 0; i < 240; i++) {                                     // the crown: its dome, toned by its facing
          const z = Math.sqrt(rng()), ph = rng.range(0, TAU), q = Math.sqrt(1 - z * z), ex = q * Math.cos(ph), ey = q * Math.sin(ph);
          const n = ua.clone().multiplyScalar(ex / 0.085).addScaledVector(va, ey / 0.08).addScaledVector(nn, z / 0.075).normalize();
          const d = ua.clone().multiplyScalar(-ey).addScaledVector(va, ex).normalize().multiplyScalar(0.014), k = n.dot(HL);
          S.add(at(ex * 0.085, ey * 0.08 + 0.01, z * 0.075 + 0.006), d, 0.006, pick(STRAW).clone().multiplyScalar(0.6 + 0.55 * Math.max(0, k)), n);
        }
        const band = [], rim = [];
        for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; band.push(at(Math.cos(a) * 0.088, Math.sin(a) * 0.083 + 0.01, 0.016)); rim.push(at(Math.cos(a) * 0.175, Math.sin(a) * 0.175, 0.008)); }
        inkLoop(band, 0.011, H('#2A3460'), 0.03); inkLoop(rim, 0.006, INK_W, 0.04);
        for (let i = 0; i < 9; i++) { const a = (i + 0.5) / 9 * Math.PI; K.add(at(Math.cos(a) * 0.087, Math.sin(a) * 0.081 + 0.01, 0.01), ua.clone().multiplyScalar(-Math.sin(a) * 0.022).addScaledVector(va, Math.cos(a) * 0.022), 0.004, INK_W, null, 0, 0); }
      }
      // the towel on its nail, left of the window
      const to = onBack(-0.98, 1.02, 0.02), tU = UB.clone().multiplyScalar(0.16), tV = V(0, 0.52, 0);
      baseQuad(to, tU, tV, NB, () => H('#9AAA7A'));
      paintFace(to.clone().addScaledVector(NB, 0.004), tU, tV, NB, { hl: 0.04, hw: 0.009, ang: Math.PI / 2, jit: 0.15, col: (s) => pick(P(['#D8E4B8', '#C8D8A0', '#E8ECC8', '#B8C890'])).clone().multiplyScalar(0.85 + 0.3 * Math.sin(s * 3)) });
      const tc = [to, to.clone().add(tU), to.clone().add(tU).add(tV), to.clone().add(tV)].map((p) => p.addScaledVector(NB, 0.01));
      ink(tc[0], tc[3], 0.006, H('#5A6A3A')); ink(tc[1], tc[2], 0.006, H('#5A6A3A')); ink(tc[0], tc[1], 0.006, H('#5A6A3A'));
      for (const s of [0.2, 0.8]) ink(to.clone().addScaledVector(tU, s).setY(0.94).addScaledVector(NB, 0.012), to.clone().addScaledVector(tU, s).setY(1.0).addScaledVector(NB, 0.012), 0.009, H('#3A6A9A'));
      K.add(onBack(-0.9, 1.56, 0.03), NB.clone().multiplyScalar(0.02), 0.008, H('#2A2A2A'), null);
    }
    await ctx.yield();

    const roomS = S, roomK = K, roomBases = bases;            // everything after this is outside: its own sets, not sheared
    S = makeSet(rng, true); K = makeSet(rng, false); bases = [];
    // ---------- outside: the night over the town, as from the hill of the Starry Night ----------
    const GY = -3.6;                                       // the bedroom is up on the first floor
    {
      // the ground: a dark blue-green coat with long strokes curving away
      const o = V(-80, GY, 10), U = V(160, 0, 0), Vv = V(0, 0, -150), n = Y.clone();
      baseQuad(o, U, Vv, n, (s, t, p) => mixc(H('#14263A'), H('#1E3A3A'), 0.5 + 0.5 * n2(p.x * 0.1, p.z * 0.1)), [], 8);
      for (let i = 0; i < 3200; i++) {
        const x = rng.range(-40, 40), z = rng.range(-70, -4), a = 0.6 * Math.sin(x * 0.15 + z * 0.07), L = 0.3 + 0.012 * -z;
        S.add(V(x, GY + 0.02, z), V(Math.cos(a) * L, 0, Math.sin(a) * L * 0.4), 0.06 + 0.004 * -z, pick(P(['#1E3A4A', '#2A4A5A', '#1A3A2A', '#2E5A4A', '#3A4A7A', '#24406A'])).clone(), n);
      }
      // the far hills: a dark blue ridge of horizontal strokes under the sky
      {
        const pos = [], nor = [], col = [], hz = -125, ridge = (x) => GY + 9 + 4 * Math.sin(x * 0.035 + 1) + 2.5 * Math.sin(x * 0.09);
        for (let x = -160; x < 160; x += 4) for (const [a, b, c] of [[[x, GY], [x + 4, GY], [x + 4, 1]], [[x, GY], [x + 4, 1], [x, 1]]]) for (const [px, top] of [a, b, c]) {
          pos.push(px, top === 1 ? ridge(px) : GY, hz); nor.push(0, 0, 1); const cc = H('#1A2A5A'); col.push(cc.r, cc.g, cc.b);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); bases.push(g);
        for (let i = 0; i < 1400; i++) { const x = rng.range(-150, 150), y = rng.range(GY + 2, ridge(x)), a = 0.25 * Math.sin(x * 0.05) + rng.range(-0.15, 0.15);
          S.add(V(x, y, hz + 0.5), V(Math.cos(a) * 1.6, Math.sin(a) * 1.6, 0), 0.45, pick(P(['#22306A', '#2A3E7A', '#1A2A5A', '#34488A', '#2A5070'])).clone(), V(0, 0, 1)); }
        for (let x = -150; x < 150; x += 1.2) K.add(V(x, ridge(x) + 0.1, hz + 0.8), V(1.0, ridge(x + 1) - ridge(x), 0).multiplyScalar(0.6), 0.22, H('#0E1638'), null);
      }
      // the little town below: low houses with red-violet roofs and lit windows, a church spire
      const roofC = P(['#4A2440', '#5A2A3A', '#3E2442', '#62303A']), wallP = [P(['#22305E', '#2348A8', '#1C2A5A']), P(['#2A3E7A', '#1E3A5A', '#2E4A6A']), P(['#3A4A7A', '#2A3A6A', '#4A5A8A'])];
      const LIT = P(['#F08A24', '#F6C84A', '#F0A030']);
      function house(x, z, w, d, h, yaw) {
        const ex = V(Math.cos(yaw), 0, -Math.sin(yaw)), ez = V(Math.sin(yaw), 0, Math.cos(yaw)), pal = pick(wallP);
        const c0 = V(x, GY, z), fo = c0.clone().addScaledVector(ex, -w / 2).addScaledVector(ez, d / 2);
        const sl = 0.011 * Math.max(4, -z);                                   // stroke size grows with distance
        const face = (o, U, Vv, n, col, ang) => { baseQuad(o, U, Vv, n, () => col().multiplyScalar(0.7), [], 3); paintFace(o, U, Vv, n, { hl: sl * 2, hw: sl * 0.55, ang, jit: 0.3, cover: 1.5, col }); };
        face(fo, ex.clone().multiplyScalar(w), V(0, h, 0), ez, () => pick(pal).clone(), Math.PI / 2);
        face(fo.clone().addScaledVector(ex, w), ez.clone().multiplyScalar(-d), V(0, h, 0), ex, () => pick(pal).clone().multiplyScalar(0.8), Math.PI / 2);
        face(fo.clone().addScaledVector(ez, -d), ez.clone().multiplyScalar(d), V(0, h, 0), ex.clone().negate(), () => pick(pal).clone().multiplyScalar(0.8), Math.PI / 2);
        // the roof: two slopes from the eaves to the ridge
        const rh = Math.min(w, d) * 0.35, ridgeA = fo.clone().addScaledVector(ez, -d / 2).setY(GY + h + rh);
        for (const sg of [1, -1]) {
          const e0 = fo.clone().setY(GY + h).addScaledVector(ez, sg > 0 ? 0 : -d), U = ex.clone().multiplyScalar(w), Vv = ridgeA.clone().sub(fo.clone().setY(GY + h)).addScaledVector(ez, sg > 0 ? 0 : d);
          const n = new THREE.Vector3().crossVectors(U, Vv).normalize(); if (n.y < 0) n.negate();
          baseQuad(e0, U, Vv, n, () => pick(roofC).clone().multiplyScalar(0.7), [], 3);
          paintFace(e0, U, Vv, n, { hl: sl * 2, hw: sl * 0.6, ang: 0, jit: 0.25, cover: 1.5, col: () => pick(roofC).clone() });
        }
        ink(fo.clone().setY(GY + h + 0.05), fo.clone().addScaledVector(ex, w).setY(GY + h + 0.05), sl * 0.35, H('#0C1430'), sl * 4);
        // windows: lit or dark dabs on the front
        for (let y = GY + h * 0.3; y < GY + h * 0.85; y += h * 0.4) for (let k = 0.2; k < 0.9; k += 0.3) {
          const lit = rng() < 0.55, p = fo.clone().addScaledVector(ex, w * k).setY(y).addScaledVector(ez, 0.05);
          for (let m = 0; m < 3; m++) S.add(p.clone().addScaledVector(ex, rng.range(-0.12, 0.12)).add(V(0, rng.range(-0.15, 0.15), 0)), V(0, 0.2, 0), 0.09, lit ? pick(LIT) : H('#0C1430'), ez, lit ? rng.range(0.8, 1.4) : 0);
        }
      }
      for (let i = 0; i < 46; i++) {
        const z = rng.range(-26, -70), x = rng.range(-1, 1) * (12 + -z * 0.7);
        if (Math.abs(x) < 3 && z > -32) continue;
        house(x, z, rng.range(3, 6), rng.range(3, 5), rng.range(2.5, 5), rng.range(-0.4, 0.4));
        if (i % 6 === 5) await ctx.yield();
      }
      // the church: a tall nave and its needle spire, ahead and to the left
      house(-7, -48, 4, 9, 6, 0.1);
      const sp = V(-7.6, GY + 6, -44);
      for (let i = 0; i < 70; i++) { const t = rng(), y = GY + 6 + t * 11, r = (1 - t) * 0.9; K.add(V(sp.x + rng.range(-r, r), y, sp.z), V(rng.range(-0.05, 0.05), 0.5, 0), 0.12 + 0.18 * (1 - t), pick(P(['#22305E', '#1A2450', '#2E3E7A', '#14204A'])), null); }
      ink(V(sp.x - 0.9, GY + 6, sp.z), V(sp.x, GY + 17.2, sp.z), 0.08, H('#0C1430'), 0.8); ink(V(sp.x + 0.9, GY + 6, sp.z), V(sp.x, GY + 17.2, sp.z), 0.08, H('#0C1430'), 0.8);
      // a cypress, a dark green flame rising at the right: a solid dark core, then tongues of curling strokes that rise,
      // lean and turn over as in his cypresses, olive-green lights on their crests, a near-black edge
      {
        const cx = 6.5, cz = -14, h = 12, prof = (t) => (1.25 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.92)), 0.6) * (1 - 0.55 * t) + 0.05) * (1 + 0.14 * Math.sin(t * 21 + 1.3));
        const DK = P(['#0E1A14', '#14261E', '#10201A', '#16302A']), GR = P(['#1E3A2A', '#22402A', '#24482E', '#2E4A26', '#1A3A30']), LT = P(['#3E6A3A', '#4A7A40', '#5A8A44', '#6A8A3A']);
        for (let i = 0; i < 160; i++) {                                // the dark body under the tongues: many small dark strokes
          const t = rng() * 0.97, x = cx + rng.range(-0.85, 0.85) * prof(t), a = Math.PI / 2 + rng.range(-0.5, 0.5), L = rng.range(0.3, 0.5);
          K.add(V(x, GY + t * h, cz - 0.15), V(Math.cos(a) * L, Math.sin(a) * L, 0), rng.range(0.14, 0.24) * (1 - 0.4 * t), pick(DK).clone(), null, 0, rng.range(-0.3, 0.3));
        }
        for (let i = 0; i < 420; i++) {                                // the tongues, rising and curling over
          const t = Math.pow(rng(), 0.85) * 0.95, side = rng.range(-1, 1);
          let curl = rng() < 0.5 ? 1 : -1, x = cx + side * prof(t) * 0.85, y = GY + t * h, ang = Math.PI / 2 - curl * rng.range(0.1, 0.4);
          const n = rng.int(3, 6), L0 = rng.range(0.32, 0.6) * (1 - 0.45 * t), lit = side < -0.1 && rng() < 0.5, crest = rng() < 0.35, edge = Math.abs(side) > 0.8;
          for (let k = 0; k < n; k++) {
            const L = L0 * (1 - 0.12 * k), dx = Math.cos(ang) * L, dy = Math.sin(ang) * L;
            const col = edge && !lit ? pick(DK).clone() : (k === n - 1 && crest) || (lit && k > 0) ? pick(LT).clone() : pick(GR).clone();
            K.add(V(x + dx / 2, y + dy / 2, cz + rng.range(-0.1, 0.1)), V(dx * 0.6, dy * 0.6, 0), rng.range(0.1, 0.17) * (1 - 0.35 * k / n) * (1 - 0.35 * t), col.multiplyScalar(0.9), null, 0, curl * 0.4);
            x += dx * 0.85; y += dy * 0.85; ang += curl * rng.range(0.3, 0.55);
            if (Math.abs(x - cx) > prof(clamp((y - GY) / h, 0, 1)) * 0.95) curl = x > cx ? 1 : -1;   // past the edge: turn back in
          }
        }
      }
    }
    // stars: big flower rosettes ahead and above, as in the Starry Night
    const SK = makeSet(rng, false);
    {
      const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), dir = new THREE.Vector3(), O = V(0, 2, -6);
      const PET = P(['#F8F0C0', '#E8F0A0', '#FFF8E0', '#D8E8C0', '#F6E070']), OUT = P(['#7FB2E5', '#A8D0E8', '#C8E0C0', '#E8F0D0']);
      const star = (az, el, R, bright) => {
        dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
        const c = O.clone().addScaledVector(dir, 280);
        e1.crossVectors(Y, dir).normalize(); e2.crossVectors(dir, e1);
        const at = (a, r) => c.clone().addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r);
        SK.add(c, e2.clone().multiplyScalar(R * 0.12), R * 0.22, H('#FFFCE8'), null, 2.6 * bright);
        const np = rng.int(7, 11), a0 = rng.range(0, TAU);
        for (let i = 0; i < np; i++) { const a = a0 + (i + rng.range(-0.15, 0.15)) / np * TAU, p = at(a, R * 0.5), d = at(a, R * 0.5 + 1).sub(p);
          SK.add(p, d.multiplyScalar(R * 0.24), R * 0.12, pick(PET), null, 1.5 * bright * rng.range(0.8, 1.1), 0.2); }
        const no = rng.int(12, 18);
        for (let i = 0; i < no; i++) { const a = a0 + (i + 0.5) / no * TAU, p = at(a, R * 0.92), d = at(a + 0.05, R * 0.92).sub(p).normalize();
          SK.add(p, d.multiplyScalar(R * 0.2), R * 0.07, pick(OUT), null, 0.6 * bright, 0.15); }
      };
      const D2R = Math.PI / 180;
      for (let i = 0; i < 6; i++) star(rng.range(-50, 50) * D2R, rng.range(10, 75) * D2R, rng.range(7, 12), rng.range(0.85, 1.15));
      for (let i = 0; i < 24; i++) star(rng.range(-80, 80) * D2R, rng.range(6, 85) * D2R, rng.range(1.4, 3.0), rng.range(0.5, 0.9));
    }

    // ---------- assemble ----------
    for (const [bs, ss, ks, parent, nm] of [[roomBases, roomS, roomK, room, 'bedroom'], [bases, S, K, scene, 'outside']]) {
      const baseMesh = new THREE.Mesh(mergeGeometries(bs), paintMat); baseMesh.frustumCulled = false; baseMesh.name = nm + '-bases';
      for (const g of bs) g.dispose();
      const strokes = ss.mesh(nearMat); strokes.name = nm + '-strokes';
      const lines = ks.mesh(nearMat); lines.name = nm + '-contours';
      parent.add(baseMesh, strokes, lines);
    }
    bases = null;
    const stars = SK.mesh(skyMat); stars.name = 'flower-stars';
    scene.add(stars);
    winC.x += SHX * winC.y; winC.z += SHZ * winC.y;          // the window as the sheared room has it
    await ctx.yield();

    const camP = new THREE.Vector3(), bufSize = new THREE.Vector2();
    const uW = uWin;
    // (bell fades are fractions of each look's span: wide, so the gaze hands over slowly from one thing to the next)
    const pois = [
      { at: [0.95, 0.66, -2.75], from: -0.2, to: 0.4, fade: 0.6, weight: 0.4 },               // down onto the blanket
      // the window and the night beyond it as one far look (a look AT the window swung the gaze as the eye came up to it)
      { at: [winC.x + 0.4, winC.y + 9, winC.z - 50], from: 0.1, to: 1.2, fade: 0.45, weight: 0.85 },
    ];
    return {
      scene, path, duration: DURATION, pois,
      pace: (u) => 1 + PACE0 * (1 - sstep(0, 0.3, u)),
      title: 'The Bedroom in Arles',
      ride: 'none', style: 'none',
      camera: { fov: 56, near: 0.02, far: 3000, lookAhead: 1.1, sway: 0.25, bank: 0.12, lookArc: true },
      // the opening stands just outside the window, larger than it: the open casements look straight onto the next valley
      portal: { shape: 'rect', width: 2.2, height: 2.8, frame: 0, color: '#F6D54A', veil: '#0E2260', lens: 0, revealDistance: 40, onlyWithNext: true },
      post: {
        exposure: 1.06,
        bloom: { strength: 0.35, radius: 0.5, threshold: 0.95 },
        grade: { saturation: 1.12, contrast: 1.05, tint: '#fff6e4', shadowTint: '#0a0c28', vignette: 0.32, grain: 0.035, aberration: 0 },
      },
      update(dt, time, camera, u) {
        camP.setFromMatrixPosition(camera.matrixWorld); if (camP.lengthSq() === 0) camP.copy(camera.position);
        hero.update(dt, time * 0.3, camera);                // a calm sky: a slow drift, never a fast swirl
        ctx.renderer.getDrawingBufferSize(bufSize);
        SU.uWeave.value = 1.5708 * Math.min(1, 1080 / Math.max(1, bufSize.y));
        SU.uTime.value = time;
        // the casements: ajar at first, then swung wide open into the room before the camera reaches them
        const open = 0.22 + 1.5 * sstep(uWin - 7 / DURATION, uWin - 2.2 / DURATION, u ?? time / DURATION);   // by u: a journey may fly the room faster
        for (const c of casements) c.g.rotation.y = c.yaw + c.sd * open;
      },
      dispose() { hero.dispose(); },
    };
  },
};
