// VG CAFE: Van Gogh's "Cafe Terrace at Night" (Arles, 1888) as a 36 s long take. A narrow street of fat blue-violet
// cobble strokes, the cafe terrace under its chrome-yellow awning and gas lamp, tables, chairs and a few painted
// figures, dark blue-green shuttered houses, a horse cart far down the street and a deep ultramarine slot of sky
// with big flower-like stars. The camera enters low over the cobbles, glides between the tables under the awning,
// then cranes up to the roofs, holds over Arles under the bursting sky and turns down into a lit upstairs window (the hand-off).
// Painted by the same hand as the-turning-night: its PAINT shader on the opaque base meshes (world-anchored dashes)
// and its STROKE fragment shader (impasto capsule, bristles, gallery light, canvas weave) on every instanced stroke;
// its hero dome (rotated so the moon and the Wheel are behind us) is the moving stroke sky.
// The strokes here lie FLAT on their surface (aN = normal) so close up a wall reads as paint, not as cards;
// aN = 0 makes a billboard (figures, foliage, stars, the lamp halo). The light is painted, not lit: every
// pigment is chosen from warm(p), the lamp's reach, as Van Gogh mixed it. Pure function of world time.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePath, makeRng, hashSeed } from '../kit/core.js';
import { paintFigure, FIG } from '../parts/vg-figure.js';
import { STROKE_FS, PAINT_VS, PAINT_FS } from './the-turning-night.js';
import { buildHero } from '../parts/the-turning-night.js';
import { hourPost } from '../parts/vg-hours.js';
import { buildBlasts, scheduleFrom } from '../parts/vg-blasts.js';

const TAU = Math.PI * 2, DURATION = 36;
// the lit upstairs window the flight ends in (facade x = -5, the opening z -18.8 .. -19.85, y 5.6 .. 7.3): the exit is a bare
// pane in its glass, a hair in front of the room strokes and behind the frame and shutters
const WIN_X = -4.975, WIN_Z = 19.325;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// aP: centre xyz, hash | aD: half axis xyz, half width | aN: surface normal xyz (0 = billboard), bend
// aC: rgb, emissive | aW: wiggle amplitude xyz, rad/s (>0 the whole stroke, <0 only its tip: legs)
const FLAT_VS = /* glsl */`
attribute vec4 aP, aD, aN, aC, aW;
uniform float uTime, uMinW; uniform vec2 uFade;
varying vec2 vUv; varying vec4 vCol; varying float vId; varying vec3 vSideV, vAxisV;
#include <fog_pars_vertex>
void main(){
  float l = position.x, hs = aP.w;
  vec3 C = (modelMatrix*vec4(aP.xyz, 1.0)).xyz;
  vec3 d = mat3(modelMatrix)*aD.xyz; float hl = max(length(d), 1e-4); vec3 ax = d/hl;
  vec3 P = C + ax*l*hl;
  if (aW.w != 0.0){ vec3 o = aW.xyz*sin(uTime*abs(aW.w) + hs*40.0); P += aW.w > 0.0 ? o : o*(l*0.5 + 0.5); }
  vec3 toC = cameraPosition - P; float dist = max(length(toC), 1e-3);
  vec3 n = mat3(modelMatrix)*aN.xyz;
  vec3 side = normalize(cross(ax, toC/dist) + vec3(1e-5, 0.0, 0.0));
  if (dot(n, n) > 0.25){
    vec3 fs = normalize(cross(n, ax) + vec3(1e-5, 0.0, 0.0));
    // a wall seen at a grazing angle: the stroke turns its face toward the eye, so it stays a stroke, not a hairline
    float g = abs(n.y) < 0.5 ? max(smoothstep(0.1, 0.42, abs(dot(normalize(n), toC/dist))), 1.0 - smoothstep(0.35, 0.75, abs(ax.y))) : 1.0;
    side = normalize(mix(side*sign(dot(side, fs) + 1e-4), fs, g));
  }
  P += side*aN.w*(1.0 - l*l)*hl;                     // a slight arc: no stroke is ruled
  float hw = max(aD.w, dist*uMinW), sc = 1.0 - smoothstep(uFade.x, uFade.y, dist);
  P += side*position.y*hw*sc;
  vec4 mvPosition = viewMatrix*vec4(P, 1.0);
  gl_Position = sc < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix*mvPosition;
  vUv = position.xy; vCol = vec4(aC.rgb, aC.a*(0.9 + 0.1*sin(uTime*(3.0 + 5.0*hs) + hs*90.0))); vId = hs;
  vSideV = mat3(viewMatrix)*side; vAxisV = mat3(viewMatrix)*ax;
  #include <fog_vertex>
}`;

function makeSet(rng) {
  const P = [], D = [], N = [], C = [], W = [];
  const set = {
    count: 0,
    // centre, half axis, half width, colour, emissive, normal (0 = billboard), bend, wiggle
    add(px, py, pz, dx, dy, dz, hw, col, em = 0, nx = 0, ny = 0, nz = 0, bend = null, w = null, hs = null) {
      const j = em > 0 ? 1 : 0.86 + 0.28 * rng(), h = hs ?? rng(), b = bend ?? rng.range(-0.12, 0.12);
      const push = (x, y, z, hw2, r, g, bl, e, k = 1) => {
        P.push(x, y, z, h); D.push(dx * k, dy * k, dz * k, hw2); N.push(nx, ny, nz, b);
        C.push(r, g, bl, e); if (w) W.push(w[0], w[1], w[2], w[3]); else W.push(0, 0, 0, 0);
        set.count++;
      };
      push(px, py, pz, hw, col.r * j, col.g * j, col.b * j, em);
      // two or three tones in one stroke: a narrower streak of a lighter or darker mix of the same pigment
      // laid along one flank of it, as a loaded brush leaves (a flat stroke keeps it on the surface)
      if (set.tones && em === 0 && hw > 0.015) {
        const flat = nx * nx + ny * ny + nz * nz > 0.25, hl = Math.hypot(dx, dy, dz) || 1;
        let sx = 0, sy = 0, sz = 0;
        if (flat) { sx = ny * dz - nz * dy; sy = nz * dx - nx * dz; sz = nx * dy - ny * dx; const l = Math.hypot(sx, sy, sz) || 1; sx /= l; sy /= l; sz /= l; }
        for (let k = 0, n = rng() < 0.4 ? 2 : 1; k < n; k++) {
          const s = (k ? -1 : 1) * rng.range(0.25, 0.5) * hw, lift = 0.003 + 0.002 * k, lt = rng() < 0.55;
          const t = lt ? rng.range(1.15, 1.4) : rng.range(0.6, 0.78), wt = lt ? rng.range(0, 0.06) : 0;
          const ox = flat ? sx * s + nx * lift : dx / hl * s, oy = flat ? sy * s + ny * lift : dy / hl * s, oz = flat ? sz * s + nz * lift : dz / hl * s;
          push(px + ox, py + oy, pz + oz, hw * rng.range(0.3, 0.45),
            (col.r * t * (1 - wt) + 0.9 * wt) * j, (col.g * t * (1 - wt) + 0.85 * wt) * j, (col.b * t * (1 - wt) + 0.6 * wt) * j, 0, rng.range(0.55, 0.9));
        }
      }
    },
    mesh(mat) {
      const g0 = new THREE.PlaneGeometry(2, 2, 4, 1), geo = new THREE.InstancedBufferGeometry();
      geo.index = g0.index; geo.setAttribute('position', g0.getAttribute('position'));
      for (const [nm, a] of [['aP', P], ['aD', D], ['aN', N], ['aC', C], ['aW', W]]) geo.setAttribute(nm, new THREE.InstancedBufferAttribute(new Float32Array(a), 4));
      geo.instanceCount = set.count;
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m;
    },
  };
  return set;
}

export default {
  id: 'vg-cafe',
  name: 'The Café Terrace at Night',
  category: 'city',
  weirdness: 0.3,
  media: ['air'],
  async build(ctx) {
    const rng = ctx.rng, noise = ctx.noise;
    const n2 = (x, z) => (noise && noise.n2 ? noise.n2(x, z) : Math.sin(x * 1.7 + z * 0.3) * Math.cos(z * 1.3 - x * 0.4));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0B1A4A');
    scene.fog = new THREE.FogExp2(new THREE.Color('#10225E'), 0.0105);

    // ---------- sky: the turning night's stroke dome, turned so its moon and Wheel are behind the camera ----------
    const hero = await buildHero(ctx, { palette: ['#0E2260', '#2A50B0', '#7FB2E5', '#F6E070', '#1E5A5A', '#14261E', '#F0A040'], mirror: false, gate: false });
    hero.object.rotation.y = Math.PI;
    hero.uniforms.uGain.value = 1.05;
    // finer brushwork (the shared knobs of the-turning-night): smaller sky dashes, bristle tones and dark rims
    const FINE = 2;
    hero.uniforms.uCellK.value = 1 / FINE; hero.uniforms.uStreak.value = 1;
    scene.add(hero.object);
    await ctx.yield();

    // ---------- pigments ----------
    const H = (h) => new THREE.Color(h);
    const COOL_STONE = ['#2B3A8C', '#3A4AA6', '#4E58B0', '#5C5AA8', '#28337A', '#3F6AA8', '#6670B8'].map(H);
    const WARM_STONE = ['#E8A050', '#F0C070', '#D88A6A', '#C99AA0', '#F2D088', '#E0905A'].map(H);
    const MID_STONE = ['#8C78B0', '#A88AA8', '#7C86C0', '#B89090'].map(H);
    const WALL_LIT = ['#F2C440', '#F6D54A', '#E8B030', '#D8D060', '#F0A830', '#F6E070'].map(H);
    const WALL_MID = ['#E08A2A', '#C88A3A', '#B8A050', '#D07830'].map(H);
    const WALL_DIM = ['#3A5A6A', '#2E4A70', '#4A6070', '#26406A'].map(H);
    const AWN = ['#F6D54A', '#FFE070', '#F2C030', '#F8E890', '#E8B828'].map(H);
    const AWN_TOP = ['#E09A30', '#D88A28', '#C8A040', '#F0B040'].map(H);
    const FLOOR = ['#E89A38', '#F0B04A', '#D07A28', '#E8A848', '#C86A28'].map(H);
    const HOUSE = [['#14261E', '#1E4E5A', '#22305E', '#1A3A4A'], ['#22305E', '#2348A8', '#1C2A5A', '#2A3E7A'], ['#1E4E5A', '#2A5E5A', '#14303A', '#2E6A6A']].map((a) => a.map(H));
    const SHUT = ['#2E6A5A', '#3A7A6A', '#1E4E5A', '#2A5A4A'].map(H);
    const LITWIN = ['#F08A24', '#F6C84A', '#F0A030'].map(H);
    const DARK = H('#0C1430'), INK = H('#101830');
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const mixc = (a, b, t) => a.clone().lerp(b, clamp(t, 0, 1));

    // ---------- the painted light: how far the lamp's warmth reaches ----------
    const LAMP = new THREE.Vector3(-3.3, 3.05, 1.2);
    function warm(x, y, z) {
      const zc = clamp(z, -16, 5), dz = z - zc, dx = x + 2.6, dy = y - 3.0;
      let w = 1 / (1 + (dx * dx + dy * dy * 0.6 + dz * dz) / 20);
      const lx = x - LAMP.x, ly = y - LAMP.y, lz = z - LAMP.z;
      w += 0.5 / (1 + (lx * lx + ly * ly + lz * lz) / 3);
      return clamp(w, 0, 1.2);
    }

    // ---------- the flight ----------
    // one calm move with no S-bends: straight down the middle of the street past the terrace (about 4 m off the tables
    // and the waiter, so no figure is a close-up), then a crane up over the end of the awning to the height of the roofs,
    // a slow hold up there over Arles while the sky down the street bursts, and one turn left and down to the lit window
    // on the first floor of the cafe (journey: through it into the bedroom)
    const path = makePath([
      [0.9, 0.5, 26], [0.6, 0.6, 18], [0.5, 0.9, 10], [0.5, 1.2, 2], [0.5, 1.6, -4], [0.6, 3.6, -8.5], [0.8, 7.5, -11.5],
      [1.0, 11.5, -13.2], [1.1, 13.8, -14.2], [0.6, 12.6, -16.6], [-0.8, 9.6, -18.6], [-2.4, 7.0, -19.3], [-3.6, 6.45, -WIN_Z], [WIN_X, 6.45, -WIN_Z],
    ]);
    const streetOff = (z) => 0.0028 * Math.max(0, -50 - z) ** 2;   // the street bends to the right toward its far end
    const clear = (x, y, z, r) => { const nn = path.nearestXZ(x, z); return nn.dist > r || Math.abs(nn.y - y) > r + 0.6; };

    // ---------- materials ----------
    const SU = {
      uTime: { value: 0 }, uMinW: { value: 0.0018 }, uGain: { value: 1.0 }, uWeave: hero.uniforms.uWeave,
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

    const S = makeSet(rng); S.tones = true;      // everything static
    const bases = [];
    // an opaque base box, vertex-coloured by colFn(x, y, z) (the underpainting in the gaps between strokes)
    function slab(cx, cy, cz, sx, sy, sz, colFn, seg = 1.2) {
      const g = new THREE.BoxGeometry(sx, sy, sz, Math.max(1, Math.ceil(sx / seg)), Math.max(1, Math.ceil(sy / seg)), Math.max(1, Math.ceil(sz / seg))).toNonIndexed();
      g.translate(cx, cy, cz); g.deleteAttribute('uv');
      const p = g.getAttribute('position'), a = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const c = colFn(p.getX(i), p.getY(i), p.getZ(i)); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      bases.push(g);
    }
    const under = (cool, hot) => (x, y, z) => mixc(cool, hot, sstep(0.15, 0.7, warm(x, y, z))).multiplyScalar(0.55);

    // ---------- the street: ground and fat cobble strokes ----------
    {
      const g = new THREE.PlaneGeometry(40, 190, 80, 380); g.rotateX(-Math.PI / 2); g.translate(0, 0, -45);
      const ng = g.toNonIndexed(); ng.deleteAttribute('uv');
      const p = ng.getAttribute('position'), a = new Float32Array(p.count * 3), cool = H('#1A2058'), hot = H('#7A4A30');
      for (let i = 0; i < p.count; i++) { const c = mixc(cool, hot, sstep(0.12, 0.6, warm(p.getX(i), 0, p.getZ(i)))); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      ng.setAttribute('color', new THREE.BufferAttribute(a, 3)); bases.push(ng);
    }
    function stoneCol(x, z) {
      const w = warm(x, 0.1, z) + 0.12 * n2(x * 0.7, z * 0.7) + rng.range(-0.08, 0.08);
      if (w > 0.5) return mixc(pick(MID_STONE), pick(WARM_STONE), sstep(0.5, 0.75, w));
      if (w > 0.22) return mixc(pick(COOL_STONE), pick(MID_STONE), sstep(0.22, 0.5, w));
      return pick(COOL_STONE).clone().multiplyScalar(0.75 + 0.6 * sstep(0.02, 0.22, w));
    }
    let row = 0;
    for (let z = 44; z > -118; row++) {
      const big = z < -40 ? 1 + Math.min(1.4, (-40 - z) / 30) : 1, dz = 0.2 * big, dx = 0.25 * big;
      for (let x = -5.2 + (row % 2) * dx * 0.5; x < 6.6; x += dx * rng.range(0.9, 1.1)) {
        if (x < -0.3 && z < 6.3 && z > -17.3) continue;        // under the terrace floor
        const cx = x + streetOff(z) + rng.range(-0.04, 0.04) * big, cz = z + rng.range(-0.04, 0.04) * big, a = rng.range(-0.5, 0.5);
        const hl = rng.range(0.1, 0.13) * big, hw = rng.range(0.07, 0.09) * big;
        const col = stoneCol(cx, cz);
        S.add(cx, 0.015 + rng() * 0.012, cz, Math.cos(a) * hl, 0, Math.sin(a) * hl, hw, col, 0, 0, 1, 0, rng.range(-0.3, 0.3));
        if (rng.chance(0.35)) {                                // a lighter lick on its rim
          const b = a + rng.range(-0.4, 0.4);
          S.add(cx + rng.range(-0.03, 0.03) * big, 0.04, cz - hw * 0.5, Math.cos(b) * hl * 0.7, 0, Math.sin(b) * hl * 0.7, hw * 0.35, col.clone().lerp(H('#B8C8F0'), 0.35), 0, 0, 1, 0, 0.25);
        }
      }
      z -= dz * rng.range(0.92, 1.08);
      if (row % 60 === 59) await ctx.yield();
    }
    // a kerb line along each side
    for (let z = 44; z > -115; z -= 0.3) for (const x of [-5.15 + streetOff(z), 6.45 + streetOff(z)]) S.add(x, 0.05, z, 0, 0, 0.26, 0.07, mixc(pick(COOL_STONE), pick(WALL_MID), sstep(0.3, 0.8, warm(x, 0.2, z))), 0, 0, 1, 0);
    await ctx.yield();

    // ---------- the terrace floor ----------
    const FT = 0.22;
    slab(-2.85, FT / 2, -5.5, 4.9, FT, 23.6, under(H('#5A3020'), H('#D07A28')), 0.8);
    for (let x = -5.0; x < -0.3; x += 0.085) {
      for (let z = 6.2 - rng.range(0, 0.4); z > -17.2; z -= rng.range(0.28, 0.4)) {
        const hl = rng.range(0.15, 0.22), w = warm(x, FT, z), col = mixc(pick(WALL_MID), pick(FLOOR), sstep(0.3, 0.75, w));
        S.add(x + rng.range(-0.02, 0.02), FT + 0.01 + rng() * 0.01, z, rng.range(-0.03, 0.03), 0, hl, rng.range(0.04, 0.05), col, 0, 0, 1, 0);
      }
    }
    // the platform's edges: not a box but a painted band, a lit orange lip over a dark umber riser, an unsteady dark
    // contour along the top, the boards' ends sticking out a little, and the warm spill on the cobbles at its foot
    const edgeBand = (x, z, nx, nz, tx, tz) => {
      const w = warm(x, FT, z), lip = mixc(pick(WALL_MID), pick(FLOOR), sstep(0.3, 0.8, w)), riser = mixc(H('#3A2018'), H('#8A4A20'), sstep(0.25, 0.8, w));
      const o = rng.range(-0.015, 0.015), a = rng.range(-0.35, 0.35);
      S.add(x + nx * (0.005 + o), FT * rng.range(0.32, 0.45), z + nz * (0.005 + o), tx * Math.sin(a) * 0.08, FT * rng.range(0.3, 0.42), tz * Math.sin(a) * 0.08, rng.range(0.03, 0.045), riser, 0, nx, 0, nz);
      S.add(x + nx * (0.012 + o), FT * rng.range(0.8, 0.9), z + nz * (0.012 + o), tx * rng.range(0.05, 0.09), rng.range(-0.012, 0.012), tz * rng.range(0.05, 0.09), rng.range(0.018, 0.026), lip, 0, nx, 0, nz);
      if (rng.chance(0.5)) S.add(x + nx * 0.02, FT + 0.012, z + nz * 0.02, tx * rng.range(0.06, 0.1), rng.range(-0.01, 0.01), tz * rng.range(0.06, 0.1), 0.011, mixc(H('#2A1810'), riser, 0.3), 0, 0, 0, 0, 0.1);
      if (rng.chance(0.35)) S.add(x + nx * rng.range(0.1, 0.35), 0.035, z + nz * rng.range(0.1, 0.35), tx * 0.12 + nx * 0.05, 0, tz * 0.12 + nz * 0.05, 0.05, mixc(pick(MID_STONE), pick(WARM_STONE), sstep(0.3, 0.7, w)), 0, 0, 1, 0);
    };
    for (let z = 6.2; z > -17.3; z -= 0.045) edgeBand(-0.38 + 0.03 * Math.sin(z * 1.7), z, 1, 0, 0, 1);
    for (const zE of [6.22, -17.22]) for (let x = -5; x < -0.38; x += 0.045) edgeBand(x, zE, 0, Math.sign(zE), 1, 0);
    // ---------- the cafe: facade at x = -5 (faces +x), z 12 .. -24, 13 m high ----------
    const CX = -5, CZ0 = 12, CZ1 = -24, CH = 13;
    slab(CX - 4.5, CH / 2, (CZ0 + CZ1) / 2, 9, CH, CZ0 - CZ1, under(H('#2A3A5A'), H('#C8902A')), 1.0);
    const holes = [];                                         // openings on the facade: [z0, z1, y0, y1, lit]
    for (let z = 9.6; z > -22; z -= 3.3) holes.push([z, z - 1.7, 0.25, 3.2, 2]);
    for (const y of [5.6, 8.6, 11.0]) for (let z = 10.2; z > -23; z -= 2.9) holes.push([z, z - 1.05, y, y + (y > 10 ? 1.3 : 1.7), rng.chance(0.25) ? 1 : 0]);
    for (const h of holes) if (h[2] === 5.6 && Math.abs((h[0] + h[1]) / 2 + WIN_Z) < 0.01) h[4] = 1;   // the journey's window is lit
    const inHole = (y, z) => holes.some((h) => z < h[0] + 0.05 && z > h[1] - 0.05 && y > h[2] - 0.05 && y < h[3] + 0.05);
    function wallCol(x, y, z) {
      const w = warm(x, y, z) * (1 - 0.35 * sstep(6, 13, y)) + 0.1 * n2(y * 0.6, z * 0.6) + rng.range(-0.06, 0.06);
      if (w > 0.55) return pick(WALL_LIT);
      if (w > 0.32) return mixc(pick(WALL_MID), pick(WALL_LIT), sstep(0.32, 0.55, w));
      return mixc(pick(WALL_DIM), pick(WALL_MID), sstep(0.1, 0.32, w));
    }
    for (let y = 0.15; y < CH; y += 0.14) {
      for (let z = CZ0 - rng.range(0, 0.12); z > CZ1; z -= rng.range(0.09, 0.12)) {
        const yy = y + rng.range(-0.04, 0.04);
        if (inHole(yy, z)) continue;
        const hl = rng.range(0.1, 0.16), t = rng.range(-0.35, 0.35);
        S.add(CX + 0.02 + rng() * 0.02, yy, z, 0, Math.cos(t) * hl, Math.sin(t) * hl, rng.range(0.035, 0.05), wallCol(CX, yy, z), 0, 1, 0, 0);
      }
      if (Math.round(y / 0.14) % 10 === 0) await ctx.yield();
    }
    // the cafe's front corner, toward the camera (z = 12, faces +z)
    for (let y = 0.3; y < CH; y += 0.3) for (let x = CX - 0.1; x > CX - 9; x -= rng.range(0.22, 0.3)) {
      const hl = rng.range(0.18, 0.28), t = rng.range(-0.3, 0.3);
      S.add(x, y + rng.range(-0.06, 0.06), CZ0 + 0.03, Math.sin(t) * hl, Math.cos(t) * hl, 0, 0.08, mixc(pick(WALL_DIM), pick(WALL_MID), 0.3 * sstep(-9, -5, x) * (1 - sstep(4, 12, y))), 0, 0, 0, 1);
    }
    // the openings: warm interiors behind dark frames, shutters on the upper floors
    for (const [z0, z1, y0, y1, lit] of holes) {
      const zc = (z0 + z1) / 2, hz = (z0 - z1) / 2, hy = (y1 - y0) / 2, yc = (y0 + y1) / 2;
      if (lit === 2) {                                         // ground floor: the glowing room of the cafe
        for (let i = 0; i < 300; i++) {
          const y = rng.range(y0 + 0.06, y1 - 0.06), z = rng.range(z1 + 0.06, z0 - 0.06), t = rng.range(-0.5, 0.5), hl = rng.range(0.08, 0.16), r = rng();
          const col = r < 0.3 ? pick(WALL_LIT) : r < 0.7 ? pick(LITWIN) : r < 0.9 ? pick([H('#B04A1A'), H('#8A3A18'), H('#C86A28')]) : pick([H('#3A5A2A'), H('#2A3A4A')]);
          S.add(CX + 0.01 + rng() * 0.01, y, z, 0, Math.cos(t) * hl, Math.sin(t) * hl, rng.range(0.035, 0.06), col, r < 0.7 ? rng.range(0.4, 1.1) : 0.15, 1, 0, 0);
        }
        for (let i = 0; i < 4; i++) S.add(CX + 0.02, rng.range(y0 + 0.4, y1 - 0.5), rng.range(z1 + 0.3, z0 - 0.3), 0, rng.range(0.2, 0.32), 0, 0.08, H('#6A3A1A'), 0.2, 1, 0, 0);   // figures inside
      } else if (lit === 1) {
        for (let i = 0; i < 40; i++) S.add(CX + 0.01, rng.range(y0 + 0.08, y1 - 0.08), rng.range(z1 + 0.08, z0 - 0.08), 0, rng.range(0.1, 0.18), rng.range(-0.04, 0.04), 0.05, pick(LITWIN), rng.range(0.7, 1.4), 1, 0, 0);
      } else {
        for (let i = 0; i < 40; i++) S.add(CX + 0.01, rng.range(y0 + 0.08, y1 - 0.08), rng.range(z1 + 0.08, z0 - 0.08), 0, rng.range(0.1, 0.18), rng.range(-0.04, 0.04), 0.05, mixc(DARK, pick([H('#2A3A6A'), H('#1E4E5A'), H('#3A4A8A')]), rng()), 0, 1, 0, 0);
      }
      const fc = mixc(INK, pick(WALL_MID), 0.25 * warm(CX, yc, zc));
      for (const s of [-1, 1]) S.add(CX + 0.035, yc, zc + s * (hz + 0.03), 0, hy, 0, 0.045, fc, 0, 1, 0, 0, 0.05);
      S.add(CX + 0.035, y1 + 0.03, zc, 0, 0, hz, 0.05, fc, 0, 1, 0, 0, 0.05);
      if (lit !== 2) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {   // shutters, folded back
        const z = zc + s * (hz + 0.12 + k * 0.17);
        S.add(CX + 0.05, yc, z, 0, hy * 0.97, rng.range(-0.02, 0.02), 0.08, pick(SHUT).clone().lerp(H('#8A9A40'), 0.4 * sstep(0.35, 0.7, warm(CX, yc, z))), 0, 1, 0, 0);
      }
    }
    // the cornice along the top
    for (let z = CZ0; z > CZ1; z -= 0.3) S.add(CX + 0.15, CH - 0.15, z, 0, rng.range(-0.03, 0.03), 0.22, 0.12, mixc(DARK, pick(WALL_DIM), 0.5), 0, 0, 1, 0);
    await ctx.yield();

    // ---------- the awning: from the wall (x -5, y 4.4) out to (x -0.75, y 3.5), z 6.2 .. -17.2 ----------
    const AW = { x0: CX, y0: 4.4, x1: -0.75, y1: 3.5, z0: 6.2, z1: -17.2 };
    {
      const sx = AW.x1 - AW.x0, sy = AW.y1 - AW.y0, L = Math.hypot(sx, sy), ux = sx / L, uy = sy / L, nx = -uy, ny = ux;   // n: up and out
      const g = new THREE.BoxGeometry(L, 0.05, AW.z0 - AW.z1, 8, 1, 30).toNonIndexed(); g.deleteAttribute('uv');
      g.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.atan2(sy, sx))); g.translate((AW.x0 + AW.x1) / 2, (AW.y0 + AW.y1) / 2, (AW.z0 + AW.z1) / 2);
      const p = g.getAttribute('position'), a = new Float32Array(p.count * 3), c0 = H('#C89028');
      for (let i = 0; i < p.count; i++) { a[i * 3] = c0.r; a[i * 3 + 1] = c0.g; a[i * 3 + 2] = c0.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); bases.push(g);
      for (let z = AW.z0; z > AW.z1; z -= rng.range(0.05, 0.07)) {
        for (let t = rng.range(0, 0.08); t < 1; t += rng.range(0.07, 0.1)) {
          const x = AW.x0 + sx * t, y = AW.y0 + sy * t, hl = rng.range(0.14, 0.22) * L / 4.3, jt = rng.range(-0.05, 0.05);
          const lampK = sstep(6, 0, Math.hypot(x - LAMP.x, z - LAMP.z));
          // underside: lit from below by the lamp, lemon and chrome yellow; the striped canvas runs down the slope
          const cu = (Math.floor((z + 20) / 0.55) % 2 ? pick(AWN) : mixc(pick(AWN), H('#F09A30'), 0.35)).clone();
          S.add(x - nx * 0.035, y - ny * 0.035, z, ux * hl, uy * hl, jt, rng.range(0.03, 0.042), cu, 0.12 + 0.3 * lampK, nx, ny, 0, 0.05);
          // top: duller ochre-orange, seen only from above at the end
          S.add(x + nx * 0.035, y + ny * 0.035, z, ux * hl, uy * hl, jt, rng.range(0.035, 0.05), pick(AWN_TOP), 0, nx, ny, 0, 0.05);
        }
      }
      // the valance: a hanging band at the outer edge, vertical strokes, a dark scalloped hem
      for (let z = AW.z0; z > AW.z1; z -= rng.range(0.045, 0.06)) {
        for (const s of [1, -1]) S.add(AW.x1 + s * 0.03, AW.y1 - 0.27 + rng.range(-0.04, 0.04), z, 0, 0.24, rng.range(-0.03, 0.03), 0.035, s > 0 ? mixc(pick(AWN), H('#F08A24'), 0.45 * rng()) : pick(AWN), s > 0 ? 0.05 : 0.25, 1, 0, 0);
      }
      for (let z = AW.z0; z > AW.z1; z -= 0.42) S.add(AW.x1 + 0.045, AW.y1 - 0.55, z - 0.21, 0, -0.04, 0.2, 0.035, H('#8A4A18'), 0, 1, 0, 0, 0.6);
      for (const zE of [AW.z0, AW.z1]) for (let t = 0.03; t < 1; t += 0.035) {   // the two ends
        const x = AW.x0 + sx * t, ytop = AW.y0 + sy * t;
        S.add(x, ytop - 0.27 + rng.range(-0.03, 0.03), zE, rng.range(-0.03, 0.03), 0.25, 0, 0.035, pick(AWN), 0.15, 0, 0, 1);
      }
    }
    await ctx.yield();

    // ---------- the gas lamp: a lantern of emissive strokes in a lemon-green halo ----------
    {
      const { x, y, z } = LAMP;
      S.add(x, y + 0.55, z, 0, 0.35, 0, 0.022, INK, 0);                           // hanger
      for (let i = 0; i < 6; i++) {                                               // panes and the iron frame between them
        const a = i / 6 * TAU, a2 = a + TAU / 12;
        S.add(x + Math.cos(a) * 0.13, y, z + Math.sin(a) * 0.13, 0, 0.19, 0, 0.045, pick([H('#FFF2A0'), H('#F6E070'), H('#E8F0A0'), H('#F0D860')]), 1.7, 0, 0, 0, 0.1, [0.004, 0, 0.004, 2.1]);
        S.add(x + Math.cos(a2) * 0.16, y, z + Math.sin(a2) * 0.16, 0, 0.21, 0, 0.012, H('#2A2418'), 0);
      }
      S.add(x, y, z, 0, 0.13, 0, 0.08, H('#FFF8C8'), 2.6);
      S.add(x, y + 0.24, z, 0.21, 0.04, 0, 0.05, INK, 0); S.add(x, y + 0.3, z, 0.08, 0.05, 0, 0.04, INK, 0);
      S.add(x, y - 0.22, z, 0.14, -0.02, 0, 0.035, INK, 0);
      for (let i = 0; i < 90; i++) {                                              // halo: radial dabs round it in every direction
        const u = rng.range(-1, 1), ph = rng.range(0, TAU), q = Math.sqrt(1 - u * u), dx = q * Math.cos(ph), dy = u, dz = q * Math.sin(ph);
        const k = rng(), r = 0.3 + 0.7 * k, L = 0.07 + 0.06 * k;
        S.add(x + dx * r, y + dy * r, z + dz * r, dx * L, dy * L, dz * L, 0.03 + 0.02 * k,
          pick(k < 0.4 ? [H('#FFF0B0'), H('#F6E070')] : [H('#D8E880'), H('#C8E070'), H('#F6E070')]), (1.3 - 1.0 * k) * rng.range(0.8, 1.1), 0, 0, 0, 0.1);
      }
    }

    // ---------- tables, chairs and painted figures on the terrace ----------
    // a painted box (a chair leg, a slat, a seat): an opaque underpainting turned by yaw, small flat strokes along its
    // grain in two or three tones on every face, and an unsteady contour of dark brown strokes along its edges
    function inkLine(set, ax, ay, az, bx, by, bz, hw, col, seg = 0.07) {
      const L = Math.hypot(bx - ax, by - ay, bz - az), m = Math.max(1, Math.ceil(L / seg)), dx = (bx - ax) / m, dy = (by - ay) / m, dz = (bz - az) / m;
      for (let k = 0; k < m; k++) set.add(ax + dx * (k + 0.5) + rng.range(-0.3, 0.3) * hw, ay + dy * (k + 0.5) + rng.range(-0.3, 0.3) * hw, az + dz * (k + 0.5) + rng.range(-0.3, 0.3) * hw,
        dx * 0.62, dy * 0.62, dz * 0.62, hw * rng.range(0.8, 1.2), col.clone().multiplyScalar(rng.range(0.8, 1.15)), 0, 0, 0, 0, rng.range(-0.08, 0.08));
    }
    function pbox(cx, cy, cz, sx, sy, sz, yaw, colFn, o = {}) {
      const c = Math.cos(yaw), s = Math.sin(yaw), ex = [c, 0, -s], ey = [0, 1, 0], ez = [s, 0, c];
      const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(); g.deleteAttribute('uv'); g.rotateY(yaw); g.translate(cx, cy, cz);
      const p = g.getAttribute('position'), a = new Float32Array(p.count * 3), b0 = colFn('-y').clone().multiplyScalar(0.55);
      for (let i = 0; i < p.count; i++) { a[i * 3] = b0.r; a[i * 3 + 1] = b0.g; a[i * 3 + 2] = b0.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); bases.push(g);
      const E = { x: [ex, sx], y: [ey, sy], z: [ez, sz] }, other = { x: ['z', 'y'], y: ['x', 'z'], z: ['x', 'y'] };
      const grain = o.grain || (sx >= sy && sx >= sz ? 'x' : sy >= sz ? 'y' : 'z');
      for (const ak of ['x', 'y', 'z']) for (const sg of [1, -1]) {
        const key = (sg > 0 ? '+' : '-') + ak; if (o.skip && o.skip.includes(key)) continue;
        const [ua, va] = other[ak], n = E[ak][0].map((v) => v * sg), ln = E[ak][1];
        const al = grain === ua || (grain !== va && E[ua][1] >= E[va][1]) ? E[ua] : E[va], ac = al === E[ua] ? E[va] : E[ua];
        const hl = Math.min(o.hl ?? 0.035, al[1] * 0.5), hw = Math.min(o.hw ?? 0.009, ac[1] * 0.5 + 0.002);
        const nS = Math.max(1, Math.ceil(al[1] * ac[1] * (o.cover ?? 1.7) / (4 * hl * hw)));
        const na = Math.max(1, Math.round(Math.sqrt(nS * al[1] / ac[1]))), nb = Math.max(1, Math.ceil(nS / na));
        for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
          const u = ((i + rng()) / na - 0.5) * al[1], v = ((j + rng()) / nb - 0.5) * ac[1];
          const h = Math.max(hl * 0.4, Math.min(hl * rng.range(0.75, 1.1), al[1] / 2 - Math.abs(u) + hl * 0.3)), jt = rng.range(-1, 1) * (o.jit ?? 0.1);
          const da = al[0], db = ac[0], cj = Math.cos(jt) * h, sj = Math.sin(jt) * h, lift = ln / 2 + 0.002 + rng() * 0.0015;
          S.add(cx + n[0] * lift + da[0] * u + db[0] * v, cy + n[1] * lift + da[1] * u + db[1] * v, cz + n[2] * lift + da[2] * u + db[2] * v,
            da[0] * cj + db[0] * sj, da[1] * cj + db[1] * sj, da[2] * cj + db[2] * sj, hw * rng.range(0.8, 1.15), colFn(key), 0, n[0], n[1], n[2]);
        }
      }
      if (o.ink) {
        const at = (i, j, k) => [cx + ex[0] * i * sx / 2 + ez[0] * k * sz / 2, cy + j * sy / 2, cz + ex[2] * i * sx / 2 + ez[2] * k * sz / 2];
        const w = o.inkW ?? 0.005;
        for (const i of [-1, 1]) for (const j of [-1, 1]) {
          if (!(o.inkSkip || '').includes('x')) inkLine(S, ...at(-1, i, j), ...at(1, i, j), w, o.ink);
          if (!(o.inkSkip || '').includes('y')) inkLine(S, ...at(i, -1, j), ...at(i, 1, j), w, o.ink);
          if (!(o.inkSkip || '').includes('z')) inkLine(S, ...at(i, j, -1), ...at(i, j, 1), w, o.ink);
        }
      }
    }
    // Arles cafe chairs: yellow-ochre wood under the lamp, a rush seat, contours of a darker brown (never black wire)
    const CH_WOOD = ['#E0A040', '#E8B450', '#D08A30', '#F0C060', '#C8802A'].map(H), CH_DARK = ['#6A4220', '#5A3A1E', '#7A4A24'].map(H);
    const RUSH = ['#E8C860', '#D8B048', '#C89838', '#F0D878', '#DCBC58'].map(H);
    function chair(x, z, face) {
      const fx = Math.sin(face), fz = Math.cos(face), rx = fz, rz = -fx, w = warm(x, 0.8, z);
      const lk = 0.25 + 0.75 * sstep(0.2, 0.75, w), SH = { '+y': 1.12, '-y': 0.55 };
      const col = (k) => mixc(pick(CH_DARK), pick(CH_WOOD), lk).multiplyScalar(SH[k] ?? rng.range(0.78, 1.0));
      const at = (a, y, b) => [x + rx * a + fx * b, y, z + rz * a + fz * b];
      const wd = { hl: 0.035, hw: 0.0085, ink: mixc(H('#2A1608'), H('#6A3A14'), 0.5 * lk), inkW: 0.004 };
      const L = 0.17, SY = FT + 0.45;
      for (const a of [-1, 1]) for (const b of [-1, 1]) pbox(...at(a * L, FT + 0.225, b * L), 0.034, 0.45, 0.034, face, col, { ...wd, grain: 'y', skip: ['+y', '-y'], inkSkip: 'xz' });
      for (const a of [-1, 1]) pbox(...at(a * L, SY + 0.25, -L), 0.034, 0.5, 0.034, face, col, { ...wd, grain: 'y', skip: ['-y'], inkSkip: 'xz' });
      for (const y of [SY + 0.3, SY + 0.45]) pbox(...at(0, y, -L), 2 * L, 0.055, 0.022, face, col, { ...wd, grain: 'x', inkSkip: 'yz' });
      pbox(...at(0, FT + 0.15, L), 2 * L, 0.02, 0.02, face, col, { ...wd, grain: 'x', inkSkip: 'xyz' });
      for (const a of [-1, 1]) pbox(...at(a * L, FT + 0.2, 0), 0.02, 0.02, 2 * L, face, col, { ...wd, grain: 'z', inkSkip: 'xyz' });
      pbox(...at(0, SY - 0.02, 0), 2 * L + 0.05, 0.04, 2 * L + 0.05, face, col, { ...wd, grain: 'x', skip: ['+y'], inkSkip: 'y' });
      // the rush seat: short crossing strokes in two directions, lighter toward the lamp
      const N = 9;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const u = ((i + 0.5) / N - 0.5) * 2 * L, v = ((j + 0.5) / N - 0.5) * 2 * L, an = (i + j) % 2 ? 0.785 : -0.785, ca = Math.cos(an) * 0.03, sa = Math.sin(an) * 0.03;
        const [px, , pz] = at(u + rng.range(-0.01, 0.01), 0, v + rng.range(-0.01, 0.01)), edge = Math.min(1, (L - Math.max(Math.abs(u), Math.abs(v))) * 12);
        S.add(px, SY + 0.004 + rng() * 0.002, pz, rx * ca + fx * sa, 0, rz * ca + fz * sa, 0.011, mixc(pick(CH_DARK), pick(RUSH), lk).multiplyScalar(0.75 + 0.35 * edge), 0, 0, 1, 0);
      }
    }
    function table(x, z) {
      const y = FT + 0.74, w = warm(x, y, z);
      const top = mixc(H('#7A8A90'), pick([H('#F0F0C0'), H('#E8E8A0'), H('#F8F0D0'), H('#D8E8B0')]), sstep(0.3, 0.8, w));
      // a round marble top: a disc of underpaint, strokes laid round it, a darker edge band and an unsteady contour
      const g = new THREE.CylinderGeometry(0.36, 0.36, 0.03, 22, 1).toNonIndexed(); g.deleteAttribute('uv'); g.translate(x, y - 0.015, z);
      const p = g.getAttribute('position'), a = new Float32Array(p.count * 3), tb = top.clone().multiplyScalar(0.55);
      for (let i = 0; i < p.count; i++) { a[i * 3] = tb.r; a[i * 3 + 1] = tb.g; a[i * 3 + 2] = tb.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); bases.push(g);
      S.add(x, y + 0.003, z, 0.05, 0, 0.03, 0.06, top, 0, 0, 1, 0);
      for (const [r, n] of [[0.1, 6], [0.19, 10], [0.28, 14], [0.33, 16]]) for (let i = 0; i < n; i++) {
        const an = (i + rng.range(-0.2, 0.2)) / n * TAU, ca = Math.cos(an), sa = Math.sin(an), k = r > 0.3 ? 0.8 : 1;
        S.add(x + ca * r, y + 0.003 + rng() * 0.002, z + sa * r, -sa * 0.06, 0, ca * 0.06, 0.035, top.clone().multiplyScalar(k * rng.range(0.85, 1.12)), 0, 0, 1, 0, 0.12);
      }
      for (let i = 0; i < 18; i++) { const an = i / 18 * TAU; S.add(x + Math.cos(an) * 0.362, y - 0.015, z + Math.sin(an) * 0.362, -Math.sin(an) * 0.065, 0, Math.cos(an) * 0.065, 0.014, top.clone().multiplyScalar(0.62), 0, Math.cos(an), 0, Math.sin(an), 0.1); }
      for (let i = 0; i < 22; i++) { const an = i / 22 * TAU; S.add(x + Math.cos(an) * 0.37, y - 0.028, z + Math.sin(an) * 0.37, -Math.sin(an) * 0.058, 0, Math.cos(an) * 0.058, 0.006, mixc(H('#2A2A30'), top, 0.25), 0, 0, 0, 0, 0.1); }
      // the iron foot: a dark olive column with a lamp-lit flank, and a crossed base
      const iron = () => mixc(H('#2A3030'), pick([H('#8A7A40'), H('#6A6A48'), H('#9A8040')]), 0.25 + 0.5 * sstep(0.3, 0.9, w) * rng());
      const ik = { hl: 0.04, hw: 0.008, ink: H('#181818'), inkW: 0.004 };
      pbox(x, FT + 0.37, z, 0.035, 0.72, 0.035, 0.4, iron, { ...ik, grain: 'y', skip: ['+y', '-y'], inkSkip: 'xz' });
      for (const yaw of [0.4, 0.4 + Math.PI / 2]) pbox(x, FT + 0.018, z, 0.44, 0.03, 0.035, yaw, iron, { ...ik, grain: 'x', skip: ['-y'], inkSkip: 'yz' });
      for (let i = 0, n = rng.int(0, 3); i < n; i++) {              // glasses and a bottle
        const an = rng.range(0, TAU), r = rng.range(0.05, 0.25), tall = rng.chance(0.3);
        S.add(x + Math.cos(an) * r, y + (tall ? 0.14 : 0.06), z + Math.sin(an) * r, 0, tall ? 0.13 : 0.05, 0, tall ? 0.035 : 0.03, tall ? H('#2E5A3A') : pick([H('#F0E8B0'), H('#E8A040')]), tall ? 0 : 0.3);
      }
    }
    // the people (parts/vg-figure.js): Van Gogh's small figures, a few broad marks round a dark Prussian contour, lit
    // orange on the lamp's side, no faces; they have their own rng and set, so reworking them never reshuffles the street
    const frng = makeRng(hashSeed('vg-cafe:figures')), FS = makeSet(frng);
    const PCOAT = [...FIG.coat, ...FIG.coat, ...FIG.coatWarm];
    function figure(x, y0, z, kind, face, o = {}, set = FS) {
      const still = set === FS, w = still ? warm(x, y0 + 1, z) : 0.1;
      let lx = still ? LAMP.x - x : 1, lz = still ? LAMP.z - z : 0.3; const ll = Math.hypot(lx, lz) || 1;
      return paintFigure(set, frng, { x, y: y0, z, face, kind, woman: o.woman, coat: o.coat || PCOAT[Math.floor(frng() * PCOAT.length)], legs: o.legs, apron: o.apron,
        hat: o.hat, light: [lx / ll, lz / ll], warm: 0.12 + 0.8 * sstep(0.3, 0.9, w), hot: H('#F0A040') });
    }
    for (let z = 4.6, k = 0; z > -16.5; z -= rng.range(2.1, 2.5), k++) {
      for (const x0 of [-4.05, -2.65]) {
        const x = x0 + rng.range(-0.15, 0.15), zz = z + rng.range(-0.3, 0.3) + (x0 < -3 ? 0.9 : 0);
        if (zz < -16.6 || !clear(x, 1, zz, 1.15)) continue;
        table(x, zz);
        const n = rng.int(2, 3);
        for (let i = 0; i < n; i++) {
          const a = rng.range(0, TAU), cx = x + Math.cos(a) * 0.62, cz = zz + Math.sin(a) * 0.62, face = Math.atan2(x - cx, zz - cz);
          if (cx < CX + 0.35 || !clear(cx, 1, cz, 0.85)) continue;
          chair(cx, cz, face);
          // patrons only on the chairs back under the awning, never at the lens's elbow (close up a few brush marks fall apart)
          const sits = rng.chance(0.55), wo = sits && rng.chance(0.4);
          if (sits && cx < -3.4) figure(cx, FT, cz, 'sit', face, { woman: wo });
        }
      }
    }
    // the waiter in his white apron, and a few people on the cobbles in front of the terrace (only those the lens passes
    // no nearer than 4 m: in a street this narrow a nearer one is a close-up)
    figure(-3.35, FT, -5.6, 'stand', -0.4, { coat: H('#141C3A'), legs: H('#141C3A'), apron: true, hat: null });
    for (const [x, z, f, wo] of [[2.3, -9, 2.4, 1], [2.8, -9.3, -2.6, 0], [2.6, -21, 0.2, 0], [2.7, 15, 3, 1], [3.6, -36, 0, 0], [4.2, -36.4, 0, 1]]) if (clear(x, 1, z, 4)) figure(x, 0, z, 'stand', f, { woman: !!wo });
    { const m = FS.mesh(nearMat); m.name = 'cafe-figures'; scene.add(m); }
    await ctx.yield();

    // ---------- the houses: dark blue-violet, shuttered, lit doors; every front its own rhythm ----------
    function houseFace(xF, side, z0, z1, h, pal, litP) {    // side: +1 faces +x, -1 faces -x
      pal = pal.map((c) => c.clone().lerp(H('#24306A'), 0.3));
      slab(xF - side * 4, h / 2, (z0 + z1) / 2, 8, h, z0 - z1, () => pal[0].clone().multiplyScalar(0.6), 1.6);
      const opens = [], fl = rng.range(2.5, 3.1), wz = rng.range(2.0, 2.8), ww = rng.range(0.8, 1.15), wh = rng.range(1.3, 1.7), y00 = rng.range(3.2, 3.8);
      const doorZ = (z0 + z1) / 2 + rng.range(-1.5, 1.5), shop = rng.chance(0.3);
      opens.push(shop ? [doorZ + 1.4, doorZ - 1.4, 0.1, 2.5, 2] : [doorZ + 0.6, doorZ - 0.6, 0, 2.3, rng.chance(0.6) ? 2 : 0]);
      for (let y = y00; y < h - 1.5; y += fl) for (let z = z0 - rng.range(0.8, 1.4); z > z1 + ww + 0.3; z -= wz) opens.push([z, z - ww, y, y + wh, rng.chance(litP) ? 1 : 0]);
      const inO = (y, z) => opens.some((o) => z < o[0] + 0.05 && z > o[1] - 0.05 && y > o[2] - 0.05 && y < o[3] + 0.05);
      const dense = Math.abs((z0 + z1) / 2) < 40 ? 1 : 1.6;
      for (let y = 0.12; y < h; y += 0.15 * dense) for (let z = z0; z > z1; z -= rng.range(0.11, 0.15) * dense) {
        const yy = y + rng.range(-0.05, 0.05); if (inO(yy, z)) continue;
        const w = warm(xF, yy, z), t = rng.range(-0.3, 0.3) + 0.25 * Math.sin(z * 0.9 + yy * 0.7), hl = rng.range(0.11, 0.17) * dense;
        let col = pick(pal).clone(); if (rng.chance(0.12)) col.lerp(H('#3F6AA8'), 0.5); else if (rng.chance(0.08)) col.lerp(H('#4A3A6A'), 0.5);
        col.lerp(H('#C08040'), 0.5 * sstep(0.14, 0.4, w));
        S.add(xF + side * (0.02 + rng() * 0.02), yy, z, 0, Math.cos(t) * hl, Math.sin(t) * hl, rng.range(0.04, 0.055) * dense, col, 0, side, 0, 0);
      }
      for (const [oz0, oz1, y0, y1, lit] of opens) {
        const zc = (oz0 + oz1) / 2, hz = (oz0 - oz1) / 2, yc = (y0 + y1) / 2, hy = (y1 - y0) / 2;
        const n = (lit === 2 ? 90 : 40) * (dense > 1 ? 0.5 : 1);
        for (let i = 0; i < n; i++) S.add(xF + side * 0.01, rng.range(y0 + 0.08, y1 - 0.08), rng.range(oz1 + 0.08, oz0 - 0.08), 0, rng.range(0.1, 0.18) * dense, rng.range(-0.04, 0.04), 0.05 * dense,
          lit ? (rng.chance(0.8) ? pick(LITWIN) : H('#8A3A18')) : mixc(DARK, pick([pick(pal), H('#3A4A8A'), H('#2E6A5A')]), rng.range(0.3, 0.9)), lit ? rng.range(0.8, 1.5) : 0, side, 0, 0);
        if (y0 > 1 && rng.chance(0.85)) for (const s of [-1, 1]) for (let k = 0; k < 2; k++) S.add(xF + side * 0.05, yc, zc + s * (hz + 0.12 + k * 0.17), 0, hy, 0, 0.085, pick(SHUT).clone().lerp(DARK, 0.25), 0, side, 0, 0);
        S.add(xF + side * 0.04, y1 + 0.05, zc, 0, 0, hz + 0.1, 0.05, INK, 0, side, 0, 0);
        if (y0 > 1 && rng.chance(0.2)) for (let k = 0; k < 6; k++) S.add(xF + side * 0.25, y0 - 0.05 + (k % 2) * 0.3, zc + rng.range(-0.1, 0.1), 0, 0, hz + 0.25, 0.022, INK, 0, 0, 0, 0, 0.05);   // a little iron balcony
        if (lit === 2) for (let i = 0; i < 6; i++) S.add(xF + side * 1.2 * rng(), 0.03, zc + rng.range(-0.6, 0.6), side * 0.25, 0, 0, 0.08, pick(WARM_STONE), 0.25, 0, 1, 0);   // its light on the cobbles
      }
      const ch = h - 0.12 + rng.range(-0.08, 0.08);
      for (let z = z0; z > z1; z -= 0.35) S.add(xF + side * 0.12, ch, z, 0, rng.range(-0.02, 0.02), 0.24, 0.13, INK, 0, 0, 1, 0);        // cornice
      if (rng.chance(0.6)) {                                  // a chimney against the sky
        const cz = rng.range(z1 + 1, z0 - 1), cx = xF - side * rng.range(1.5, 4);
        slab(cx, h + 0.7, cz, 0.8, 1.4, 0.8, () => DARK, 2);
        for (let i = 0; i < 8; i++) S.add(cx + side * 0.42, h + rng.range(0.1, 1.3), cz + rng.range(-0.35, 0.35), 0, 0.2, 0, 0.08, pick(pal), 0, side, 0, 0);
      }
    }
    // the end wall of a house that steps out into the street (its face toward the camera)
    function houseReturn(x0, x1, z, h, pal) {
      slab((x0 + x1) / 2, h / 2, z - 0.02, Math.abs(x1 - x0), h, 0.04, () => pal[0].clone().multiplyScalar(0.55), 1.6);
      for (let y = 0.15; y < h; y += 0.24) for (let x = Math.min(x0, x1); x < Math.max(x0, x1); x += rng.range(0.18, 0.24)) {
        const t = rng.range(-0.3, 0.3); S.add(x, y, z + 0.02, Math.sin(t) * 0.22, Math.cos(t) * 0.22, 0, 0.08, pick(pal).clone().lerp(H('#1A2450'), 0.4), 0, 0, 0, 1);
      }
      for (let y = 0.2; y < h; y += 0.12) S.add(Math.max(x0, x1) + 0.01, y, z + 0.03, rng.range(-0.01, 0.01), 0.07, 0, 0.012, INK, 0, 0, 0, 0, 0.05);
    }
    for (let z = 44, i = 0; z > -112; i++) {                 // the right side of the street
      const w = rng.range(6, 10), h = rng.range(8, 15);
      houseFace(6.5 + streetOff(z - w / 2) + rng.range(-0.3, 0.4), -1, z, z - w, h, pick(HOUSE), 0.35);
      z -= w; if (i % 3 === 2) await ctx.yield();
    }
    houseFace(-5.1, 1, 44, CZ0 + 0.1, 12.5, HOUSE[1], 0.3);   // the house before the cafe, behind the camera's start
    for (let z = CZ1, i = 0, xp = -5.2; z > -112; i++) {     // the left side, past the cafe: it steps out where the street turns
      const w = rng.range(6, 10), h = rng.range(9, 15), pal = pick(HOUSE), xF = -5.2 + streetOff(z - w / 2) + rng.range(-0.35, 0.25);
      houseFace(xF, 1, z, z - w, h, pal, 0.3);
      if (xF > xp + 0.15) houseReturn(xp, xF, z, h, pal);
      xp = xF; z -= w; if (i % 3 === 2) await ctx.yield();
    }
    {                                                         // round the bend the street closes on a low house front
      const z = -112, h = 8, ox = streetOff(-112);
      slab(ox, h / 2, z - 3, 26, h, 6, () => H('#1E2A5A').multiplyScalar(0.6), 2);
      for (let y = 0.3; y < h; y += 0.5) for (let x = ox - 12; x < ox + 12; x += rng.range(0.4, 0.55)) S.add(x, y, z + 0.03, Math.sin(rng.range(-0.4, 0.4)) * 0.4, 0.3, 0, 0.16, pick(HOUSE[1]), 0, 0, 0, 1);
      for (let i = 0; i < 6; i++) { const x = ox + rng.range(-8, 8), y = rng.range(1, 6); for (let k = 0; k < 4; k++) S.add(x + rng.range(-0.3, 0.3), y + rng.range(-0.3, 0.3), z + 0.06, 0, 0.25, 0, 0.14, pick(LITWIN), 1.6, 0, 0, 1); }
    }
    await ctx.yield();

    // ---------- the tree at the right, over the street: a real trunk and limbs, foliage laid in clumps of strokes ----------
    {
      const tx = 5.4, tz = -4.5, BARK = ['#2A1A14', '#3A2A1A', '#4A3A24', '#2A2A1E', '#5A4028'].map(H);
      let lx = LAMP.x - tx, lz = LAMP.z - tz; const ll = Math.hypot(lx, lz); lx /= ll; lz /= ll;
      const limb = (x0, y0, z0, x1, y1, z1, r0, r1, seg) => {   // a tapering limb: a dark card, bark strokes, a lit flank
        const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0), m = Math.max(1, Math.ceil(L / seg));
        for (let k = 0; k < m; k++) {
          const t = (k + 0.5) / m, r = r0 + (r1 - r0) * t, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, cz = z0 + (z1 - z0) * t;
          const dx = (x1 - x0) / m * 0.62, dy = (y1 - y0) / m * 0.62, dz = (z1 - z0) / m * 0.62;
          S.add(cx, cy, cz, dx, dy, dz, r * 1.15, H('#120C0A'), 0, 0, 0, 0, rng.range(-0.1, 0.1));
          for (let j = 0; j < 3; j++) {
            const a = rng.range(0, TAU), ox = Math.cos(a) * r * 0.55, oz = Math.sin(a) * r * 0.55, lk = (ox * lx + oz * lz) / r;
            const c = pick(BARK).clone().multiplyScalar(0.9 + 0.3 * rng()); if (lk > 0.2) c.lerp(H('#B07A3A'), 0.45 * lk);
            S.add(cx + ox, cy + rng.range(-0.3, 0.3) * L / m, cz + oz, dx * rng.range(0.6, 0.9), dy * rng.range(0.6, 0.9), dz * rng.range(0.6, 0.9), r * rng.range(0.35, 0.5), c, 0, 0, 0, 0, rng.range(-0.2, 0.2));
          }
        }
      };
      limb(tx, 0, tz, tx - 0.15, 3.6, tz + 0.05, 0.19, 0.13, 0.22);
      const tops = [];
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + rng.range(-0.3, 0.3), out = rng.range(1.2, 2.4), y0 = rng.range(3.0, 3.6);
        const x1 = tx - 0.6 + Math.cos(a) * out * 0.9, z1 = tz + Math.sin(a) * out * 1.1, y1 = y0 + rng.range(1.4, 2.4);
        limb(tx - 0.15, y0, tz + 0.05, x1, y1, z1, 0.09, 0.035, 0.2);
        limb(x1, y1, z1, x1 + rng.range(-0.6, 0.6), y1 + rng.range(0.6, 1.1), z1 + rng.range(-0.6, 0.6), 0.035, 0.015, 0.18);
        tops.push([x1, y1, z1]);
      }
      // foliage: clumps round the limbs; strokes fan out from each clump's heart, a dark core so it is not see-through,
      // lime and ochre where the lamp reaches it (the near, low side), blue-green and near-black above and behind
      const FD = ['#14261E', '#1A3A2A', '#1E4E5A', '#14303A'].map(H), FM = ['#2A5E3A', '#3A6A4A', '#2E5A2E', '#3A5A3A'].map(H), FL = ['#8AA040', '#C0B040', '#A8B848', '#D8C050', '#6A9A50'].map(H);
      for (let c = 0; c < 46; c++) {
        const t = c < tops.length * 3 ? tops[c % tops.length] : null, a = rng.range(0, TAU), r = Math.sqrt(rng());
        const cx = t ? t[0] + rng.range(-0.7, 0.7) : tx - 0.7 + Math.cos(a) * r * 2.6, cz = t ? t[2] + rng.range(-0.7, 0.7) : tz + Math.sin(a) * r * 3.1;
        const cy = t ? t[1] + rng.range(-0.2, 0.9) : rng.range(4.4, 7.4), R = rng.range(0.45, 0.75);
        const toL = ((LAMP.x - cx) * lx + (LAMP.z - cz) * lz > 0 ? 1 : 0) * sstep(7.2, 4.2, cy), lk = sstep(0.1, 0.6, toL * (1 - r * 0.3) + rng.range(-0.15, 0.15));
        S.add(cx, cy - R * 0.1, cz, 0, R * 0.5, 0, R * 0.75, pick(FD).clone().multiplyScalar(0.6), 0, 0, 0, 0, 0.2);
        for (let i = 0; i < 70; i++) {
          const u = rng.range(0, TAU), v = rng.range(-1, 1), q = Math.sqrt(rng()), ox = Math.cos(u) * q * R, oz = Math.sin(u) * q * R, oy = v * R * 0.7;
          const low = sstep(0.2, -0.7, v), hl = rng.range(0.09, 0.15), dir = Math.atan2(oy + 0.2, Math.hypot(ox, oz) + 0.01);
          let col = low > 0.5 && rng.chance(0.6) ? pick(FD).clone().multiplyScalar(0.8) : pick(rng.chance(0.5) ? FM : FD).clone();
          if (lk > 0 && rng.chance(0.75 * lk)) col = mixc(col, pick(FL), 0.5 + 0.4 * lk * (1 - 0.5 * low));
          S.add(cx + ox, cy + oy, cz + oz, Math.cos(u) * Math.cos(dir) * hl, Math.sin(dir) * hl, Math.sin(u) * Math.cos(dir) * hl, rng.range(0.035, 0.055), col, 0, 0, 0, 0, rng.range(-0.4, 0.4), [0.01, 0.007, 0.01, 0.9]);
        }
      }
    }
    await ctx.yield();

    // ---------- stars: in the slot of sky between the roofs, each its own size and brightness: a hot core, a few
    // broad petals and the concentric halo rings of pale yellow and green-blue he laid round the big ones ----------
    const SK = makeSet(rng), O = new THREE.Vector3(0.5, 0, -30);
    {
      const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      const PET = ['#F8F0C0', '#E8F0A0', '#FFF8E0', '#D8E8C0', '#F6E070'].map(H), HALO = [['#F6E070', '#E8F0A0', '#FFF0B0'], ['#C8E0C0', '#A8D0E8', '#D8E8C0'], ['#7FB2E5', '#5A8AD0', '#A8C8E8']].map((a) => a.map(H));
      const star = (az, el, R, bright, rings) => {
        dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
        const c = O.clone().addScaledVector(dir, 280);
        e1.crossVectors(up, dir).normalize(); e2.crossVectors(dir, e1);
        const at = (a, r) => c.clone().addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r);
        const a0 = rng.range(0, TAU);
        for (let i = 0; i < 2; i++) { const a = a0 + i * 1.7; SK.add(c.x, c.y, c.z, (e1.x * Math.cos(a) + e2.x * Math.sin(a)) * R * 0.14, (e1.y * Math.cos(a) + e2.y * Math.sin(a)) * R * 0.14, (e1.z * Math.cos(a) + e2.z * Math.sin(a)) * R * 0.14, R * 0.2, H('#FFFCE8'), 2.4 * bright); }
        const np = rng.int(4, 8);
        for (let i = 0; i < np; i++) {
          const a = a0 + (i + rng.range(-0.3, 0.3)) / np * TAU, rr = R * rng.range(0.35, 0.55), p = at(a, rr), d = at(a + rng.range(-0.4, 0.4), rr + 1).sub(p);
          SK.add(p.x, p.y, p.z, d.x * R * 0.2, d.y * R * 0.2, d.z * R * 0.2, R * rng.range(0.09, 0.14), pick(PET), 1.3 * bright * rng.range(0.7, 1.1), 0, 0, 0, 0.2);
        }
        if (rings > 0) {                                         // the halo: a field of short tangential dashes round it,
          const Rout = R * (1.05 + 0.4 * rings), nd = Math.round(40 * rings + 3 * R * rings);   // yellow, then green, then blue
          for (let i = 0; i < nd; i++) {
            const q = Math.pow(rng(), 0.8), rr = R * 0.5 + (Rout - R * 0.5) * q, a = a0 + rng.range(0, TAU), p = at(a, rr), d = at(a + 0.05, rr).sub(p).normalize();
            const pal = HALO[clamp(Math.floor(q * 2.6 + rng.range(-0.3, 0.3)), 0, 2)], L = rr * rng.range(0.1, 0.2);
            SK.add(p.x, p.y, p.z, d.x * L, d.y * L, d.z * L, R * rng.range(0.05, 0.09), pick(pal), (1.0 - 0.75 * q) * bright * rng.range(0.75, 1.1), 0, 0, 0, 0.2);
          }
        }
      };
      const D2R = Math.PI / 180;
      for (let i = 0; i < 9; i++) star(rng.range(-28, 28) * D2R, rng.range(16, 84) * D2R, rng.range(8, 14), rng.range(0.85, 1.25), rng.int(2, 3));
      for (let i = 0; i < 22; i++) star(rng.range(-45, 45) * D2R, rng.range(10, 88) * D2R, rng.range(3.5, 7), rng.range(0.6, 1.0), rng.int(0, 1));
      for (let i = 0; i < 80; i++) star(rng.range(-70, 70) * D2R, rng.range(8, 88) * D2R, rng.range(0.9, 2.6), rng.range(0.35, 0.85), 0);
    }

    // ---------- moving: the horse cart coming up the street, and the walkers ----------
    const movers = [];
    function mover(build, at) { const s = makeSet(rng); build(s); const m = s.mesh(nearMat); scene.add(m); movers.push({ m, at }); }
    mover((s) => {                                            // horse and cart, facing +z (toward the camera)
      const horse = H('#4A2A18'), dark = H('#1A1410');
      s.add(0, 1.25, 0, 0, 0.12, 0.75, 0.32, horse, 0);
      s.add(0, 1.6, 0.85, 0, 0.32, 0.2, 0.13, horse, 0);
      s.add(0, 1.85, 1.1, 0, -0.05, 0.22, 0.11, horse, 0);
      for (const [lx, lz] of [[0.14, 0.55], [-0.14, 0.55], [0.14, -0.55], [-0.14, -0.55]]) s.add(lx, 0.5, lz, 0, 0.48, 0, 0.06, dark, 0, 0, 0, 0, 0, [0, 0, 0.16, -5.5]);
      s.add(0, 1.15, -0.85, 0, -0.3, -0.12, 0.06, dark, 0, 0, 0, 0, 0, [0.04, 0, 0, 2.5]);
      for (let i = 0; i < 16; i++) s.add(rng.range(-0.6, 0.6), rng.range(1.0, 1.7), rng.range(-3.6, -1.6), 0, 0.2, 0.1, 0.12, pick([H('#5A3A20'), H('#3A2A1A'), H('#6A4A2A')]), 0);
      for (const sx of [-0.75, 0.75]) for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU; s.add(sx, 0.7 + Math.sin(a) * 0.6, -2.6 + Math.cos(a) * 0.6, 0, Math.cos(a) * 0.16, -Math.sin(a) * 0.16, 0.04, dark, 0, 1, 0, 0);
      }
      s.add(0, 2.15, -2.0, 0, 0.3, 0, 0.17, H('#1E2A5A'), 0); s.add(0, 2.6, -2.0, 0, 0.1, 0, 0.09, dark, 0);
      s.add(0.65, 1.9, -1.6, 0, 0.08, 0, 0.06, H('#F6C84A'), 2.2);
    }, (t, m) => { const z = -86 + 0.75 * t; m.position.set(1.6 + streetOff(z), 0, z); m.rotation.y = -Math.atan(0.0056 * Math.max(0, -50 - z)); });
    const walkC = [[INK, INK], [H('#1E2A5A'), INK], [H('#3A2418'), H('#141C3A')], [H('#5A2A20'), INK]];
    for (const [x0, z0, v] of [[3.2, -44, 0.45], [3.55, -44.3, 0.45], [-3.6, -52, -0.35], [2.0, -66, 0.4], [4.6, -30, -0.3]]) {
      mover((s) => { const [body, legs] = pick(walkC); figure(0, 0, 0, 'walk', v > 0 ? 0 : Math.PI, { coat: body, legs, woman: rng.chance(0.35) }, s);
      }, (t, m) => { const z = z0 + v * t; m.position.set(x0 + streetOff(z), 0, z); });
    }

    // ---------- assemble ----------
    const baseMesh = new THREE.Mesh(mergeGeometries(bases), paintMat); baseMesh.frustumCulled = false; baseMesh.name = 'painted-bases';
    for (const g of bases) g.dispose();
    const strokes = S.mesh(nearMat); strokes.name = 'cafe-strokes';
    const stars = SK.mesh(skyMat); stars.name = 'flower-stars';
    scene.add(baseMesh, strokes, stars);
    await ctx.yield();

    // ---------- the finale's planets (parts/vg-blasts.js) in the slot of sky down the street: none burst here unless a
    // journey's schedule says so (ctx.vary.blasts); then points of light, star-whirls of the earlier bursts ----------
    const PLACE = [
      // the journey's two bursts here sit where the lens looks up at them: cafe low and large in the slot at the street's far end, emerald
      // high up the street, over the rise to the window
      { id: 'rose', az: -16, el: 30, dist: 420, ang: 7 }, { id: 'cafe', az: 5, el: 7, dist: 400, ang: 15 },
      { id: 'emerald', az: -3, el: 22, dist: 420, ang: 9.5 }, { id: 'violet', az: 24, el: 31, dist: 450, ang: 7 },
      // the journey's drop, a double burst, over the roofs either side of the street, seen from the rooftop hold
      { id: 'cobalt', az: 17, el: 15, dist: 430, ang: 11 }, { id: 'sunflower', az: -17, el: 12, dist: 430, ang: 10 },
    ];
    const blasts = await buildBlasts(ctx, { scene, uniforms: SU, eye: new THREE.Vector3(-0.6, 1.4, -6), place: PLACE, schedule: scheduleFrom(ctx, { before: [], here: [], hide: PLACE.map((p) => p.id) }),
      hero, seed: 'vg-cafe:planets', fine: FINE, boost: 1.9, pointScale: 1.5, flashFrom: new THREE.Vector3(0, 0, -20), flashGain: 0.45, flashCap: 1.2, heat: 0.15, glowGain: 0.6 });   // the terrace lights up with each burst
    const ctrOf = (id) => (blasts.planets.find((p) => p.id === id) || { ctr: new THREE.Vector3(0, 200, -400) }).ctr;
    for (const p of PLACE) { const m = scene.getObjectByName('planet-' + p.id); if (m) { m.material.fog = false; m.material.needsUpdate = true; } }   // far beyond the street's haze
    const camP = new THREE.Vector3(), bufSize = new THREE.Vector2();
    // two fixed looks only, so the gaze never re-aims: along the terrace it follows the straight street; from the end of the
    // awning it rests on one point of the sky down the street (every burst here sits round it) through the crane and the
    // hold; then it turns once, left and down, to the lit window
    const SKY = new THREE.Vector3(-0.6, 1.4 + 400 * Math.sin(13 * Math.PI / 180), -6 - 400 * Math.cos(13 * Math.PI / 180));   // az 0, el 13 from the burst anchor
    const pois = [
      { at: SKY, from: 0.38, to: 0.9, fade: 0.16, weight: 0.96, arc: true },
      { at: [-5, 6.45, -WIN_Z], from: 0.82, to: 1.0, fade: 0.45, weight: 0.95, arc: true },   // (a long ease: the turn peaked at 43 deg/s)
    ];
    return {
      scene, path, duration: DURATION, pois,
      // quick along the terrace, steady up the crane, a slow hold at the roofs (the bursts), then down to the window
      pace: (u) => 1.9 - 0.9 * sstep(0.42, 0.52, u) - 0.65 * sstep(0.70, 0.76, u) + 0.55 * sstep(0.83, 0.88, u),
      title: 'The Café Terrace at Night',
      ride: 'none', style: 'none',
      camera: { fov: 58, near: 0.08, far: 3000, lookAhead: 6, sway: 0.08, bank: 0.1 },
      // the opening is the glass of the lit window (a bare pane, the exact window): its warm light gives way to the room
      portal: { shape: 'rect', width: 1.05, height: 1.7, frame: 0, lens: 0, color: '#F6D54A', veil: '#E8B84A', revealDistance: 9, drawWithin: 12, drawIn: 0, onlyWithNext: true },
      // the journey's hour (vg-hours.js): dusk, the blue hour lifting the shadows, gone to full night by the star
      postAt: ctx.vary && ctx.vary.hour === 'dusk' ? function (u) { return hourPost(this.post, [[0, { exposure: 1.18, tint: '#d8ccf0', shadowTint: '#141638' }], [0.6, { exposure: 1.12, tint: '#ece0ee', shadowTint: '#0a0e2c' }], [1, { exposure: 1.08, tint: '#fff3dc', shadowTint: '#050a24' }]], u); } : undefined,
      post: {
        exposure: 1.08,
        bloom: { strength: 0.42, radius: 0.55, threshold: 0.95 },
        grade: { saturation: 1.12, contrast: 1.05, tint: '#fff3dc', shadowTint: '#050a24', vignette: 0.34, grain: 0.035, aberration: 0 },
      },
      update(dt, time, camera) {
        camP.setFromMatrixPosition(camera.matrixWorld); if (camP.lengthSq() === 0) camP.copy(camera.position);
        hero.update(dt, time * 0.35, camera);              // a calm sky: a slow drift, never a fast swirl
        ctx.renderer.getDrawingBufferSize(bufSize);
        SU.uWeave.value = 1.5708 * Math.min(1, 1080 / Math.max(1, bufSize.y));
        SU.uTime.value = time;
        for (const mv of movers) mv.at(time, mv.m);
        blasts.update(time, camP);
      },
      explodeAt: blasts.explodeAt,
      dispose() { hero.dispose(); },
    };
  },
};
