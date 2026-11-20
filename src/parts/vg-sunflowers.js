// VG SUNFLOWERS, the plants: Van Gogh sunflowers, irises and marigolds built only of impasto strokes.
// Every stroke is drawn by the-turning-night's STROKE_FS (ragged bristle ends, ridge relief, gallery light, canvas
// weave) through PLANT_VS below, which adds what a field needs: a stroke can curve (a parabola with a sagitta vector),
// it sways with its plant in the wind (a pure function of uTime, the root and the stroke's height up the plant), and
// a stroke on the sky or the hills can drift very slowly along itself (aX.w metres, a 30 s period).
// Emissive is steady (no twinkle), so the sun and its rays glow calmly.
//
// A plant set: set.plant(x, y, z, H, amp, phase) starts a plant (root, height, sway amplitude in metres at the top);
// set.seg(a, b, hw, colour, bend, em, drift) lays one stroke from a to b (THREE.Vector3) of half width hw; bend is the
// sagitta (Vector3 or null). A negative hw lays an under-stroke: pushed back from the eye, so the strokes over it leave
// only its edges showing (a dark contour round a stalk, a leaf, a petal). set.mesh(material, segs) bakes it into one instanced mesh.
import * as THREE from 'three';

const TAU = Math.PI * 2, GA = Math.PI * (3 - Math.sqrt(5));
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);

export const PLANT_VS = /* glsl */`
attribute vec4 aP, aD, aC, aR, aX; attribute vec2 aS;
uniform float uTime, uMinW;
uniform vec4 uWind; uniform vec2 uFade;
varying vec2 vUv; varying vec4 vCol; varying float vId; varying vec3 vSideV, vAxisV;
#include <fog_pars_vertex>
vec3 vgSway(vec3 p){
  if (aS.x <= 0.0) return vec3(0.0);
  float h = clamp((p.y - aR.y)/aR.w, 0.0, 1.4); h *= h;
  float t = uTime, ph = aS.y;
  float gust = 0.6 + 0.4*sin(t*0.23 + dot(aR.xz, vec2(0.05, 0.037)));
  vec2 w = uWind.xy, q = vec2(-w.y, w.x);
  float a = 0.5 + 0.5*sin(t*0.85 + ph + dot(aR.xz, w)*0.45);
  float b = sin(t*1.31 + ph*1.9)*0.35 + sin(t*2.1 + ph*3.1)*0.1;
  vec2 o = (w*a + q*b)*gust*aS.x*h;
  return vec3(o.x, 0.0, o.y);
}
vec3 vgAt(float l){ return aP.xyz + aD.xyz*l + aX.xyz*(1.0 - l*l); }
void main(){
  float l = position.x;
  vec3 drift = aD.xyz/max(length(aD.xyz), 1e-4)*sin(uTime*0.21 + aP.w*40.0)*aX.w;
  vec3 P = vgAt(l), P2 = vgAt(l + 0.04);
  P += vgSway(P) + drift; P2 += vgSway(P2) + drift;
  vec3 ax = normalize(P2 - P + vec3(0.0, 1e-6, 0.0));
  vec3 toC = cameraPosition - P; float dist = max(length(toC), 1e-3);
  vec3 side = normalize(cross(ax, toC/dist) + vec3(1e-5, 0.0, 0.0));
  float hw = max(abs(aD.w), dist*uMinW), sc = 1.0 - smoothstep(uFade.x, uFade.y, dist);
  if (aD.w < 0.0) P -= toC/dist*abs(aD.w)*1.3;   // an under-stroke (negative width): sits behind the strokes laid over it
  P += side*position.y*hw*sc;
  vec4 mvPosition = viewMatrix*vec4(P, 1.0);
  gl_Position = sc < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix*mvPosition;
  vUv = position.xy; vCol = aC; vId = aP.w;
  vSideV = mat3(viewMatrix)*side; vAxisV = mat3(viewMatrix)*ax;
  #include <fog_vertex>
}`;

export function makePlantSet(rng) {
  const P = [], D = [], C = [], R = [], X = [], S = [];
  let rx = 0, ry = 0, rz = 0, rH = 1, amp = 0, ph = 0;
  const set = {
    count: 0,
    plant(x, y, z, H, a = 0, p = 0) { rx = x; ry = y; rz = z; rH = Math.max(0.05, H); amp = a; ph = p; },
    seg(a, b, hw, col, bend = null, em = 0, drift = 0, j = 0.12) {
      const k = 1 + (rng() * 2 - 1) * j;
      P.push((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, rng());
      D.push((b.x - a.x) / 2, (b.y - a.y) / 2, (b.z - a.z) / 2, hw);
      C.push(col.r * k, col.g * k, col.b * k, em);
      R.push(rx, ry, rz, rH); S.push(amp, ph);
      X.push(bend ? bend.x : 0, bend ? bend.y : 0, bend ? bend.z : 0, drift);
      set.count++;
    },
    mesh(material, segs) {
      const base = new THREE.PlaneGeometry(2, 2, segs, 1), geo = new THREE.InstancedBufferGeometry();
      geo.index = base.index; geo.setAttribute('position', base.getAttribute('position'));
      for (const [nm, arr, n] of [['aP', P, 4], ['aD', D, 4], ['aC', C, 4], ['aR', R, 4], ['aX', X, 4], ['aS', S, 2]]) geo.setAttribute(nm, new THREE.InstancedBufferAttribute(new Float32Array(arr), n));
      geo.instanceCount = set.count;
      const m = new THREE.Mesh(geo, material); m.frustumCulled = false;
      return m;
    },
  };
  return set;
}

const c = (h) => new THREE.Color(h);
export const PIG = {
  chrome: c('#F2C023'), lemon: c('#F8DC48'), orange: c('#E8861A'), ochre: c('#C8962A'), paleY: c('#F8EC98'), deepO: c('#D0661A'),
  wiltO: c('#A87028'), brown: c('#6C4420'), olive: c('#8C8436'), umber: c('#3A2414'), sienna: c('#8E4A1C'), seedG: c('#6E8832'),
  outline: c('#2E5A4C'), outlineB: c('#5A3A1C'),
  viridian: c('#2C7446'), sap: c('#5E9A38'), ygreen: c('#A0B83E'), bgreen: c('#367A78'), dgreen: c('#1C3A36'), stalk: c('#6E9A3A'),
  violet: c('#5646B0'), blue: c('#3A58C2'), ultra: c('#20247A'), lilac: c('#8C7CD6'), paleV: c('#B6AAE6'), beard: c('#F2C83A'),
  white: c('#EEF0E2'), whiteB: c('#C4D2EA'), whiteG: c('#9AAAC8'),
  irisL: c('#2C8A6A'), irisL2: c('#4AA27A'), irisL3: c('#7CBA5A'), irisLd: c('#1C5A50'), irisO: c('#16363A'),
};
const pickW = (rng, list) => { let s = 0; for (const [, w] of list) s += w; let r = rng() * s; for (const [v, w] of list) if ((r -= w) <= 0) return v; return list[0][0]; };

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3(), _bd = new THREE.Vector3();

// a stroke along part [t0, t1] of a parabola from a to b with sagitta s: its own ends and sagitta
function sub(set, a, b, s, t0, t1, hw, col, em = 0) {
  const p = (t, out) => out.copy(a).lerp(b, t).addScaledVector(s, 4 * t * (1 - t));
  p(t0, _a); p(t1, _b);
  set.seg(_a, _b, hw, col, _bd.copy(s).multiplyScalar((t1 - t0) * (t1 - t0)), em);
}

// ---------- sunflower ----------
// o: root, head (centre), n (facing, unit), r (seed disc radius), lod 0|1|2, wilt 0..1, seeds, petals, clear(v) -> bool
export function sunflower(S, Dd, rng, o) {
  const { root, head: hc, n, r, lod } = o, wilt = o.wilt || 0;
  const H = hc.y - root.y;
  const amp = (0.05 + 0.05 * rng()) * (lod === 2 ? 0.7 : 1), ph = rng.range(0, TAU);
  S.plant(root.x, root.y, root.z, H, amp, ph); Dd.plant(root.x, root.y, root.z, H, amp, ph);
  const e1 = new THREE.Vector3().crossVectors(n, UP); if (e1.lengthSq() < 1e-4) e1.set(1, 0, 0); e1.normalize();
  const e2 = new THREE.Vector3().crossVectors(e1, n).normalize();
  const dome = r * 0.22;
  const at = (rho, th, z, out) => out.copy(hc).addScaledVector(e1, Math.cos(th) * rho).addScaledVector(e2, Math.sin(th) * rho).addScaledVector(n, z);
  const P = PIG;

  // stalk and neck: a cubic from the root, up, then over to the back of the head. Painted as a bundle of short
  // directional strokes in several greens over a dark under-stroke whose edges read as the contour on both sides.
  const hb = hc.clone().addScaledVector(n, -r * 0.3);
  const p1 = root.clone().addScaledVector(UP, H * 0.62), p2 = hb.clone().addScaledVector(n, -r * 1.1).addScaledVector(UP, wilt > 0.3 ? r * 0.9 : -r * 0.7);
  const bez = (t, out) => { const s = 1 - t; return out.set(0, 0, 0).addScaledVector(root, s * s * s).addScaledVector(p1, 3 * s * s * t).addScaledVector(p2, 3 * s * t * t).addScaledVector(hb, t * t * t); };
  const ns = lod === 0 ? 16 : lod === 1 ? 6 : 1;
  const stalkC = [[P.stalk, 3], [P.sap, 3], [P.ygreen, 1.4], [P.viridian, 2], [P.bgreen, 1.2], [P.seedG, 0.8]];
  const sideV = new THREE.Vector3().crossVectors(UP, n).normalize(), fwdV = new THREE.Vector3().crossVectors(sideV, UP).normalize();
  const lanes = lod === 0 ? 4 : 3;
  for (let i = 0; i < ns; i++) {
    const t0 = i / ns, t1 = Math.min(1, (i + 1.1) / ns), hw = (lod === 2 ? 0.035 : 0.03) * (1 - 0.3 * t0);
    if (lod === 2) { bez(t0, _a); bez(t1, _b); S.seg(_a, _b, hw, pickW(rng, stalkC), _w.copy(sideV).multiplyScalar(rng.range(-0.012, 0.012))); continue; }
    bez(t0, _a); bez(t1, _b); S.seg(_a, _b, -hw, rng.chance(0.6) ? P.dgreen : P.outline);
    for (let k = 0; k < lanes; k++) {
      const th = (k + rng.range(-0.3, 0.3)) / lanes * TAU, o0 = rng.range(-0.35, 0.1) / ns, o1 = rng.range(-0.1, 0.25) / ns;
      _u.copy(sideV).multiplyScalar(Math.cos(th) * hw * 0.45).addScaledVector(fwdV, Math.sin(th) * hw * 0.45);
      bez(Math.max(0, t0 + o0), _a).add(_u); bez(Math.min(1, t1 + o1), _b).add(_u);
      S.seg(_a, _b, hw * (lod === 0 ? 0.32 : 0.42), pickW(rng, stalkC), _w.copy(sideV).multiplyScalar(rng.range(-0.006, 0.006)));
    }
    if (lod === 0 && rng.chance(0.4)) {          // a short lit dab on the sun side, or a dark knot
      const tt = rng.range(t0, t1); bez(tt, _a).addScaledVector(sideV, hw * rng.range(-0.4, 0.4)); bez(Math.min(1, tt + 0.3 / ns), _b).addScaledVector(sideV, hw * rng.range(-0.4, 0.4));
      S.seg(_a, _b, hw * 0.22, rng.chance(0.7) ? rng.pick([P.ygreen, P.paleY, P.irisL3]) : P.dgreen);
    }
  }

  // leaves: broad drooping hearts on a petiole, laid with curving dabs along the veins (lit near the midrib, darker to
  // the edge), the edge curled under, a broken dark contour stroke round the blade
  const nl = lod === 0 ? rng.int(3, 5) : lod === 1 ? rng.int(2, 3) : rng.int(0, 1);
  const leafC = [[P.viridian, 3], [P.sap, 3], [P.ygreen, 1.2], [P.bgreen, 2], [P.dgreen, 1]];
  const lightC = [P.sap, P.ygreen, P.stalk, P.irisL3], darkC = [P.viridian, P.bgreen, P.dgreen, P.irisLd];
  for (let j = 0; j < nl; j++) {
    const t = rng.range(0.22, 0.75); bez(t, _m);
    const A = _m.clone(), phi = rng.range(0, TAU), out = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi));
    const L = rng.range(0.26, 0.42) * (1 - 0.25 * t), droop = rng.range(0.25, 0.7), curl = rng.range(0.15, 0.45), tw = rng.range(-0.25, 0.25);
    const sd = new THREE.Vector3().crossVectors(out, UP).normalize();
    const A0 = A.clone().addScaledVector(out, L * 0.14).addScaledVector(UP, L * 0.04);     // the blade starts after the petiole
    const surf = (tt, ss, o) => {
      const w = L * 0.46 * Math.pow(Math.sin(Math.PI * Math.min(0.999, Math.pow(tt, 0.72))), 0.85);
      return o.copy(A0).addScaledVector(out, L * 0.86 * tt - Math.abs(ss) * w * 0.12).addScaledVector(DOWN, L * droop * tt * tt - L * 0.14 * Math.sin(Math.PI * tt))
        .addScaledVector(sd, ss * w).addScaledVector(DOWN, (ss * ss * curl - ss * tw) * w);
    };
    if (o.clear && (!o.clear(surf(1, 0, _t)) || !o.clear(surf(0.5, 0, _t)) || !o.clear(surf(0.4, 1, _t)) || !o.clear(surf(0.4, -1, _t)))) continue;
    const base = pickW(rng, leafC);
    if (lod === 2) { surf(0, 0, _a); surf(1, 0, _b); S.seg(_a, _b, L * 0.2, base); continue; }
    S.seg(A, A0, lod === 0 ? 0.008 : 0.012, rng.chance(0.5) ? P.stalk : P.sap);               // petiole
    const nr = lod === 0 ? 7 : 3, nd = lod === 0 ? 4 : 2;
    for (const sg of [-1, 1]) for (let r0 = 0; r0 < nr; r0++) for (let k = 0; k < nd; k++) {
      const tt = (r0 + rng.range(0, 1)) / nr * 0.94, s0 = Math.max(0, (k + rng.range(-0.3, 0.2)) / nd), s1 = Math.min(1, (k + rng.range(1.0, 1.5)) / nd);
      surf(tt, sg * s0, _a); surf(Math.min(0.99, tt + rng.range(0.4, 0.9) / nr), sg * s1, _b);
      const x = s0 + rng.range(-0.3, 0.3) - (sg > 0 ? 0.1 : 0);
      const col = x < 0.3 ? (rng.chance(0.6) ? rng.pick(lightC) : base) : x < 0.7 ? (rng.chance(0.6) ? base : pickW(rng, leafC)) : rng.pick(darkC);
      const sp = Math.min(L * 0.46 / nd, L / nr) * 0.62;
      S.seg(_a, _b, sp, col, _w.copy(out).multiplyScalar(sp * 0.6).addScaledVector(UP, sp * 0.3));
    }
    for (let k = 0; k < (lod === 0 ? 3 : 1); k++) {          // the midrib, pale, in short pieces
      surf(k / 3 * 0.8, 0, _a); surf(Math.min(0.95, (k + 1.1) / 3 * 0.8), 0, _b); _a.addScaledVector(UP, 0.004); _b.addScaledVector(UP, 0.004);
      S.seg(_a, _b, lod === 0 ? 0.0045 : 0.007, rng.chance(0.6) ? P.ygreen : P.paleY);
    }
    if (lod === 0) for (const sg of [-1, 1]) {
      for (let k = 0; k < 3; k++) {                  // lateral veins, pale, from the midrib out and forward
        const tt = (k + 0.6) / 3.6; surf(tt, 0, _a); surf(Math.min(0.97, tt + 0.16), sg * 0.75, _b); _a.addScaledVector(UP, 0.003); _b.addScaledVector(UP, 0.003);
        S.seg(_a, _b, 0.003, rng.chance(0.5) ? P.ygreen : P.irisL3, _w.copy(out).multiplyScalar(-0.01));
      }
      for (let k = 0; k < 5; k++) {                  // broken dark contour round the blade
        if (rng.chance(0.3)) continue;
        surf(k / 5, sg * 1.0, _a); surf(Math.min(1, (k + 1.15) / 5), sg * 1.0, _b);
        S.seg(_a, _b, 0.004, rng.chance(0.4) ? P.outline : P.dgreen);
      }
    }
  }

  // the back: pointed green bracts round the rim and a green cushion behind the disc laid in radial dabs
  const nb = lod === 0 ? 30 : lod === 1 ? 12 : 0, backC = [[P.viridian, 3], [P.sap, 2.5], [P.dgreen, 1.5], [P.ygreen, 1], [P.bgreen, 1.2]];
  for (let i = 0; i < nb; i++) {
    const a = (i + rng.range(-0.3, 0.3)) / nb * TAU; _u.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
    _a.copy(hc).addScaledVector(_u, r * rng.range(0.6, 0.8)).addScaledVector(n, -r * 0.18);
    _b.copy(_a).addScaledVector(_u, r * rng.range(0.35, 0.55)).addScaledVector(n, -r * rng.range(0.15, 0.35));
    S.seg(_a, _b, r * (lod === 0 ? 0.06 : 0.1), pickW(rng, backC), _w.crossVectors(n, _u).multiplyScalar(r * rng.range(-0.06, 0.06)));
  }
  if (lod === 2) { at(0, 0, -r * 0.16, _m); _a.copy(_m).addScaledVector(e1, -r * 0.8); _b.copy(_m).addScaledVector(e1, r * 0.8); S.seg(_a, _b, r * 0.85, P.viridian); }
  else {
    const nk = lod === 0 ? 70 : 22, sk = Math.sqrt(Math.PI / nk);
    for (let k = 0; k < nk; k++) {
      const q = (k + 0.5) / nk, rho = r * Math.sqrt(q) * 0.92, th = k * GA + rng.range(-0.1, 0.1);
      at(rho, th, -r * (0.14 + 0.1 * (1 - q)), _m);
      _u.copy(e1).multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th));
      _a.copy(_m).addScaledVector(_u, -r * sk * 0.75); _b.copy(_m).addScaledVector(_u, r * sk * 0.75).addScaledVector(n, -r * 0.03);
      S.seg(_a, _b, r * sk * 0.55, pickW(rng, backC));
    }
  }

  // petals: one or two rows, each petal laid as two or three strokes side by side in neighbouring tones
  const petalC = wilt > 0.5
    ? [[P.wiltO, 3], [P.ochre, 2], [P.brown, 1.5], [P.olive, 1.2], [P.chrome, 0.6], [P.orange, 0.8]]
    : [[P.chrome, 4], [P.lemon, 2.5], [P.orange, 2], [P.ochre, 1.5], [P.paleY, 0.8], [P.deepO, 0.6]];
  const near = { chrome: [P.lemon, P.orange, P.ochre], lemon: [P.chrome, P.paleY], orange: [P.chrome, P.deepO, P.ochre], ochre: [P.chrome, P.wiltO, P.orange],
    paleY: [P.lemon, P.chrome], deepO: [P.orange, P.sienna], wiltO: [P.ochre, P.brown], brown: [P.wiltO, P.umber], olive: [P.ochre, P.wiltO] };
  const keyOf = (col) => { for (const k in near) if (P[k] === col) return k; return 'chrome'; };
  const rows = lod === 0 ? 2 : 1;
  for (let row = 0; row < rows; row++) {
    const np = Math.round((lod === 2 ? 10 : lod === 1 ? 16 : o.petals || 26) * (row ? 0.8 : 1));
    for (let i = 0; i < np; i++) {
      const a = (i + rng.range(-0.3, 0.3) + row * 0.5) / np * TAU;
      _u.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
      _t.crossVectors(n, _u);
      const len = r * rng.range(0.72, 1.08) * (row ? 0.72 : 1) * (1 - 0.25 * wilt);
      const back = rng.range(0.12, 0.42) + row * 0.15 + wilt * rng.range(0.6, 1.3);
      const base = hc.clone().addScaledVector(_u, r * (0.92 - row * 0.08)).addScaledVector(n, -0.012 - 0.012 * row);
      const dir = _w.copy(_u).multiplyScalar(Math.cos(back)).addScaledVector(n, -Math.sin(back)).clone();
      const tip = base.clone().addScaledVector(dir, len).addScaledVector(DOWN, len * wilt * rng.range(0.2, 0.7));
      const bend = _t.clone().multiplyScalar(len * rng.range(-0.2, 0.2)).addScaledVector(n, -len * 0.06);
      const hw = len * rng.range(0.13, 0.18) * (lod === 2 ? 1.5 : 1), col = pickW(rng, petalC);
      if (lod === 0) {                               // four strokes side by side in neighbouring tones, a dark under-stroke for the rim
        const nb2 = near[keyOf(col)];
        S.seg(base, _b.copy(base).lerp(tip, 0.96), -hw * 1.05, wilt > 0.5 ? P.outlineB : rng.chance(0.5) ? P.ochre : P.deepO, bend);
        const nk = Math.min(8, Math.max(4, Math.round(hw / 0.008)));   // a big near head gets more, narrower strokes
        for (let k = 0; k < nk; k++) {
          const off = (k - (nk - 1) / 2) / ((nk - 1) / 2);
          _a.copy(base).addScaledVector(_t, off * hw * 0.42).addScaledVector(dir, len * rng.range(0, 0.1));
          _b.copy(base).lerp(tip, rng.range(0.72, 1.0) - 0.12 * Math.abs(off)).addScaledVector(_t, off * hw * 0.62);
          S.seg(_a, _b, hw * 1.2 / nk, Math.abs(off) < 0.5 ? (rng.chance(0.55) ? col : rng.pick(nb2)) : rng.pick(nb2), bend);
          if (nk > 5 && rng.chance(0.3)) {           // a short loaded dab near the tip
            _a.copy(base).lerp(tip, rng.range(0.55, 0.8)).addScaledVector(_t, off * hw * 0.55); _b.copy(_a).addScaledVector(dir, len * 0.18);
            S.seg(_a, _b, hw * 0.7 / nk, rng.pick([P.paleY, P.lemon, P.deepO]), bend);
          }
        }
        if (rng.chance(0.3)) {                       // a dark contour along one edge
          const sg = rng.sign(); _a.copy(base).addScaledVector(_t, sg * hw * 0.85); _b.copy(base).lerp(tip, rng.range(0.5, 0.85)).addScaledVector(_t, sg * hw * 0.8);
          S.seg(_a, _b, hw * 0.13, wilt > 0.5 ? P.outlineB : rng.chance(0.6) ? P.outline : P.outlineB, bend);
        }
        continue;
      }
      S.seg(base, tip, hw, col, bend);
      if (lod < 2) {
        const nb2 = near[keyOf(col)];
        _a.copy(base).addScaledVector(_t, hw * 0.75); _b.copy(base).lerp(tip, rng.range(0.7, 0.95)).addScaledVector(_t, hw * 0.55);
        S.seg(_a, _b, hw * 0.55, rng.pick(nb2), bend);
      }
    }
  }

  // the seed disc: a dark ground of broad strokes, then dabs on a sunflower spiral over a low dome
  for (let i = 0; i < (lod === 2 ? 1 : 5); i++) {
    const tt = (i + 0.5) / 5 * 2 - 1, hcd = r * Math.sqrt(1 - tt * tt) * 0.95;
    at(0, 0, dome * 0.35 * (1 - tt * tt), _m).addScaledVector(e2, tt * r * 0.8);
    _a.copy(_m).addScaledVector(e1, -hcd); _b.copy(_m).addScaledVector(e1, hcd);
    Dd.seg(_a, _b, lod === 2 ? r * 0.75 : r * 0.24, lod === 2 ? P.brown : rng.chance(0.6) ? P.umber : P.brown);
  }
  const N = lod === 0 ? (o.seeds || 150) : lod === 1 ? 36 : 0;
  const s = r * Math.sqrt(Math.PI / Math.max(N, 1));
  const midC = wilt > 0.5 ? [[P.brown, 3], [P.umber, 2], [P.sienna, 1.5], [P.olive, 1], [P.ochre, 0.6]]
    : [[P.brown, 3], [P.sienna, 2.5], [P.ochre, 1.6], [P.umber, 1.5], [P.orange, 0.5], [P.seedG, 0.5]];
  for (let k = 0; k < N; k++) {
    const q = (k + 0.5) / N, rho = r * Math.sqrt(q) * 0.97, th = k * GA + rng.range(-0.08, 0.08);
    at(rho, th, dome * (1 - q), _m);
    const da = th + 1.25 + rng.range(-0.3, 0.3);
    _u.copy(e1).multiplyScalar(Math.cos(da)).addScaledVector(e2, Math.sin(da));
    const hl = s * rng.range(0.5, 0.75), hw = s * rng.range(0.3, 0.42);
    const col = q < 0.05 ? rng.pick([P.seedG, P.ochre, P.olive]) : q > 0.8 ? (rng.chance(0.14) ? P.orange : rng.chance(0.6) ? P.umber : P.dgreen) : pickW(rng, midC);
    _a.copy(_m).addScaledVector(_u, -hl); _b.copy(_m).addScaledVector(_u, hl);
    Dd.seg(_a, _b, hw, col);
  }
}

// ---------- iris ----------
// o: root, lod, white, clear(v), hue (0..1: the bed's colour patch, blue / violet / lilac), bloom (0..1: share in
// flower), scale (shrinks a plant under the flight line)
export function iris(S, rng, o) {
  const { root, lod } = o, P = PIG, white = !!o.white, sk = o.scale || 1, hue = o.hue === undefined ? rng() : o.hue;
  const H = (white ? 0.78 : rng.range(0.5, 0.8)) * sk;
  S.plant(root.x, root.y, root.z, H, rng.range(0.025, 0.045), rng.range(0, TAU));
  const fa = rng.range(0, TAU), fan = new THREE.Vector3(Math.cos(fa), 0, Math.sin(fa)), perp = new THREE.Vector3(-fan.z, 0, fan.x);
  const nl = lod === 0 ? rng.int(6, 9) : lod === 1 ? rng.int(3, 5) : 2;
  const leafC = hue > 0.66 ? [[P.irisL2, 3], [P.irisL3, 2], [P.irisL, 1.5], [P.sap, 1], [P.irisLd, 0.8]]
    : [[P.irisL, 3], [P.irisL2, 2.5], [P.irisL3, 1.2], [P.irisLd, 1.5], [P.bgreen, 1]];
  for (let i = 0; i < nl; i++) {
    const ang = (nl > 1 ? i / (nl - 1) - 0.5 : 0) * rng.range(0.8, 1.3) + rng.range(-0.08, 0.08);
    const L = rng.range(0.38, 0.75) * (1 - 0.35 * Math.abs(ang)) * (lod === 2 ? 0.9 : 1) * sk;
    const dir = _w.copy(UP).multiplyScalar(Math.cos(ang)).addScaledVector(fan, Math.sin(ang)).addScaledVector(perp, rng.range(-0.15, 0.15)).normalize();
    const base = root.clone().addScaledVector(fan, ang * 0.04), tip = base.clone().addScaledVector(dir, L);
    const bend = fan.clone().multiplyScalar(Math.sign(ang || 1) * L * rng.range(0.04, 0.16)).addScaledVector(perp, L * rng.range(-0.05, 0.05));
    if (o.clear && !o.clear(tip)) continue;
    const col = pickW(rng, leafC);
    if (lod === 0) {
      // a sword: four lengths, two strokes side by side in neighbouring greens over a dark under-stroke (the contour)
      for (let k = 0; k < 4; k++) {
        const t0 = Math.max(0, k / 4 - 0.04), t1 = Math.min(1, (k + 1) / 4 + 0.04), wv = 0.02 * (1 - 0.6 * t0);
        sub(S, base, tip, bend, t0, t1, -wv, rng.chance(0.7) ? P.irisO : P.irisLd);
        for (const sg of [-1, 1]) {
          const p0 = (t, out) => out.copy(base).lerp(tip, t).addScaledVector(bend, 4 * t * (1 - t)).addScaledVector(perp, sg * wv * 0.4);
          p0(t0 + rng.range(0, 0.03), _a); p0(t1 - rng.range(0, 0.03), _b);
          S.seg(_a, _b, wv * 0.45, sg > 0 ? (rng.chance(0.6) ? col : pickW(rng, leafC)) : pickW(rng, leafC), _bd.copy(bend).multiplyScalar(1 / 16));
        }
      }
      if (rng.chance(0.4)) sub(S, base, tip, bend, rng.range(0.2, 0.5), rng.range(0.6, 0.9), 0.004, rng.chance(0.5) ? P.irisL3 : P.ygreen);   // a lit edge
    } else if (lod === 1) {
      sub(S, base, tip, bend, 0, 1, -0.026, P.irisO);
      sub(S, base, tip, bend, 0, 0.6, 0.02, col); sub(S, base, tip, bend, 0.45, 1, 0.014, rng.chance(0.6) ? col : pickW(rng, leafC));
    } else S.seg(base, tip, 0.034, col, bend);
  }
  const bloom = o.bloom === undefined ? 1 : o.bloom;
  const nf = white ? 1 : lod === 0 ? (rng.chance(0.45 * bloom) ? 2 : rng.chance(0.3 + 0.7 * bloom) ? 1 : 0) : rng.chance((lod === 1 ? 0.8 : 0.85) * bloom) ? 1 : 0;
  const hh = hue + rng.range(-0.2, 0.2);
  const pal = white ? { main: P.white, light: P.white, mid: P.whiteB, dark: P.whiteG }
    : hh < 0.33 ? { main: P.blue, light: P.lilac, mid: P.violet, dark: P.ultra }
      : hh < 0.7 ? { main: P.violet, light: P.lilac, mid: P.blue, dark: P.ultra }
        : { main: P.lilac, light: P.paleV, mid: P.violet, dark: P.ultra };
  const pc = [pal.main, pal.main, pal.light, pal.mid];
  for (let f = 0; f < nf; f++) {
    const fh = H * rng.range(0.82, 1.0) * (f ? 0.85 : 1);
    const F = root.clone().addScaledVector(perp, rng.range(-0.06, 0.06)).addScaledVector(fan, rng.range(-0.05, 0.05)); F.y += fh;
    if (o.clear && !o.clear(F)) continue;
    const st = root.clone(); S.seg(st, F, lod === 2 ? 0.012 : 0.008, P.irisL, _w.set(rng.range(-0.02, 0.02), 0, rng.range(-0.02, 0.02)));
    const sz = (white ? 1.75 : 1) * rng.range(0.85, 1.15) * (lod === 2 ? 1.5 : 1) * Math.max(0.6, sk);
    if (lod === 2) {
      _a.copy(F).addScaledVector(UP, -0.02); _b.copy(F).addScaledVector(UP, 0.06 * sz);
      S.seg(_a, _b, 0.045 * sz, pal.main); _a.copy(F).addScaledVector(UP, 0.01); _b.copy(_a).addScaledVector(fan, 0.07 * sz); S.seg(F, _b, 0.028 * sz, pal.dark);
      if (rng.chance(0.75)) { _a.copy(F).addScaledVector(UP, 0.03 * sz); _b.copy(_a).addScaledVector(UP, 0.04 * sz).addScaledVector(perp, 0.02 * sz); S.seg(_a, _b, 0.018 * sz, rng.chance(0.6) ? pal.light : pal.mid); }
      continue;
    }
    const nlS = lod === 0 ? 4 : 2, nlF = lod === 0 ? 5 : 3, a0 = rng.range(0, TAU);
    for (let k = 0; k < 3; k++) {                    // standards: upright, curling in at the tips, a fan of narrow strokes
      const az = a0 + k * TAU / 3; _u.set(Math.cos(az), 0, Math.sin(az)); _t.crossVectors(UP, _u);
      const b0 = F.clone().addScaledVector(UP, 0.008), b1 = F.clone().addScaledVector(UP, 0.08 * sz).addScaledVector(_u, 0.02 * sz);
      const bd = _u.clone().multiplyScalar(0.022 * sz);
      if (lod === 0) S.seg(b0, b1, -0.019 * sz, pal.dark, bd);
      for (let j = 0; j < nlS; j++) {
        const off = nlS > 1 ? j / (nlS - 1) * 2 - 1 : 0;
        _a.copy(b0).addScaledVector(_t, off * 0.005 * sz); _b.copy(b0).lerp(b1, rng.range(0.82, 1.0) - 0.1 * Math.abs(off)).addScaledVector(_t, off * 0.012 * sz);
        S.seg(_a, _b, (lod === 0 ? 0.0062 : 0.009) * sz, Math.abs(off) > 0.7 ? (rng.chance(0.6) ? pal.mid : pal.main) : rng.chance(0.55) ? pal.light : rng.pick(pc), bd);
      }
    }
    for (let k = 0; k < 3; k++) {                    // falls: out and over, darker, veined, a yellow beard at the throat
      const az = a0 + (k + 0.5) * TAU / 3; _u.set(Math.cos(az), 0, Math.sin(az)); _t.crossVectors(UP, _u).normalize();
      const base = F.clone().addScaledVector(_u, 0.01 * sz), tip = F.clone().addScaledVector(_u, 0.09 * sz).addScaledVector(UP, -0.065 * sz);
      const bd = UP.clone().multiplyScalar(0.03 * sz).addScaledVector(_u, 0.012 * sz);
      if (lod === 0) S.seg(base, _b.copy(base).lerp(tip, 0.97), -0.026 * sz, pal.dark, bd);
      for (let j = 0; j < nlF; j++) {
        const off = j / (nlF - 1) * 2 - 1;
        _a.copy(base).addScaledVector(_t, off * 0.007 * sz); _b.copy(base).lerp(tip, rng.range(0.8, 1.0) - 0.12 * off * off).addScaledVector(_t, off * 0.019 * sz);
        S.seg(_a, _b, (lod === 0 ? 0.0068 : 0.01) * sz, Math.abs(off) > 0.6 ? (rng.chance(0.55) ? pal.mid : pal.dark) : rng.chance(0.4) ? pal.main : rng.pick([pal.light, pal.mid, pal.main]), bd);
      }
      if (lod === 0) {
        for (let j = 0; j < 2; j++) {                // dark veins from the throat
          _a.copy(base).addScaledVector(_t, (j - 0.5) * 0.008 * sz); _b.copy(base).lerp(tip, rng.range(0.35, 0.55)).addScaledVector(_t, (j - 0.5) * 0.014 * sz);
          S.seg(_a, _b, 0.0022 * sz, white ? P.whiteG : P.ultra, bd);
        }
        _a.copy(base).addScaledVector(UP, 0.004); _b.copy(base).addScaledVector(_u, 0.03 * sz).addScaledVector(UP, 0.006);
        S.seg(_a, _b, 0.006 * sz, white ? P.beard : rng.chance(0.6) ? P.beard : P.white, null, 0.15);
        _b.addScaledVector(_t, 0.004 * sz); S.seg(_a, _b, 0.003 * sz, P.orange, null, 0.1);
      }
    }
  }
}

// ---------- marigold: a little orange star of strokes on a short stem ----------
export function marigold(S, rng, root) {
  const h = rng.range(0.12, 0.3), P = PIG;
  S.plant(root.x, root.y, root.z, h, 0.02, rng.range(0, TAU));
  const F = root.clone(); F.y += h;
  S.seg(root, F, 0.006, P.sap);
  const n = rng.int(6, 8), a0 = rng.range(0, TAU), r = rng.range(0.025, 0.04);
  for (let i = 0; i < n; i++) {
    const a = a0 + i / n * TAU; _u.set(Math.cos(a), rng.range(0.1, 0.4), Math.sin(a)).normalize();
    _b.copy(F).addScaledVector(_u, r * 2);
    const col = rng.chance(0.6) ? P.orange : rng.chance(0.5) ? P.chrome : P.deepO;
    S.seg(F, _b, r * 0.3, col); _a.copy(F).addScaledVector(_u, r * 0.4); _b.lerp(F, 0.15); S.seg(_a, _b, r * 0.16, col === P.chrome ? P.lemon : rng.chance(0.5) ? P.chrome : P.sienna);
  }
  _a.copy(F).addScaledVector(UP, 0.005); _b.copy(_a).addScaledVector(UP, 0.01); S.seg(_a, _b, r * 0.5, P.sienna);
}
