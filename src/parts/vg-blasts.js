// VG BLASTS: the planets that burst over the Van Gogh finale, shared by every world of it (vg-planets, vg-rhone,
// vg-road, vg-sower, vg-olives ...). One fixed ROSTER of eight planets (id, pigments, point colour, brightness, turn);
// each world places the ones it shows in its own sky and gives a schedule, so one continuous flight through several
// paintings can burst them one by one and every later sky remembers the earlier bursts:
//   before  planets that burst in an earlier world: from t = 0 they are settled star-whirl remnants (turning rings and
//           core, a few strokes still drifting), as if burst `age` seconds before this world's t = 0
//   here    [{ id, t }] the planets that burst in this world, at world time t
//   hide    planets not shown at all; every other placed planet is a point of light that does not burst here
// Each planet is one instanced mesh of impasto strokes in the-turning-night's STROKE fragment shader:
//   the point (a few strokes and a small halo, twinkling, flickering up as a tell before its blast);
//   the blast strokes, flung out from the point on curling spiral paths with drag, most of them raining down and
//   fading, the rest turning round a new star; the star itself, a short dense core of yellow dashes and concentric
//   counter-rotating rings of chrome-yellow and cerulean strokes.
// With a turning-night hero dome (opts.hero) the sky reacts: up to four planets get a uBlast slot (a vortex that spins
// up and settles, a shock ring of yellow strokes, a glow); `here` planets first, then the most recent `before` ones.
// With opts.water (a level y) each planet also lays a column of broken horizontal dashes on the water under it, its
// reflection: a faint flicker under the point, a long bright zig-zag of its pigments in the blast, a calm gold after.
// Pure function of world time; built from a seeded rng (opts.seed), never Math.random.
//
// API  const B = await buildBlasts(ctx, opts); then every frame B.update(time, camP, skyTime?)
//   opts.scene        THREE.Scene to add the meshes to
//   opts.uniforms     shared uniforms for STROKE_FS: uTime, uGain, uWeave, uFlash, uFine (+ uFlashD, read by PAINT_FS):
//                     update() writes uFlash (warm wash colour x strength) and uFlashD (direction the light comes from)
//   opts.eye          THREE.Vector3: the anchor the az/el placements are measured from (the middle of the camera run)
//   opts.place        [{ id, az, el, dist, ang }]: az/el degrees (az 0 = -Z, + toward +X), dist m, ang = angular radius
//                     of the blast in degrees. Build order = this order.
//   opts.schedule     { before: [id | { id, age }], here: [{ id, t }], hide: [id] } (see scheduleFrom)
//   opts.hero         optional turning-night hero (its uniforms.uBlast/uBlastK/uBlastG drive the sky reaction)
//   opts.pointScale   size of the points of light (1);  opts.seed  rng seed string;  opts.fine  brushwork (1 = coarse, 2 = vg-planets);  opts.boost (1.9)
//   opts.flashFrom    THREE.Vector3: the point of the land the flash direction is measured to (default eye)
//   opts.flashColor   THREE.Color of the warm wash;  opts.flashGain (0.45);  opts.flashCap: soft ceiling on the summed flash
//   opts.tell         seconds the point of light flares up before its blast (0.6; longer: a glow that builds)
//   opts.glowGain     scale of the sky's burst glow (1);  opts.skyScale: size of the sky's vortex and shock ring (1);  opts.heat: how far fresh blast strokes go white-hot (0.35)
//   schedule.pulse    optional [t0, t1] world s: the peak, when every burst star-whirl brightens and turns up, then settles
//   opts.water        optional { y, dim (1), width (0.035 rad half width), near (4 m), far (160 m) }: reflection columns
//                     on a level water surface (uniforms.uTime drives their shimmer)
//   returns { planets: [{ id, P, ctr, R, tE, pu }], explodeAt: the here times, update(time, camP) -> flash strength }
// scheduleFrom(ctx, def) reads the schedule from ctx.vary.blasts / ctx.opts.blasts / the URL (&blasts=), else def.
//   URL form: &blasts=before:cafe@30,cobalt;here:sunflower@6,cypress@11;hide:rose   (before id@age, here id@t)
import * as THREE from 'three';
import { makeRng, hashSeed } from '../kit/core.js';
import { HEX, STROKE_FS } from '../worlds/the-turning-night.js';
import { dirToP } from './the-turning-night.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const K = {}; for (const k in HEX) K[k] = new THREE.Color(HEX[k]);
const mix = (a, b, t, s = 1) => a.clone().lerp(b, t).multiplyScalar(s);
const white = new THREE.Color(0.78, 0.82, 0.74), ochre = new THREE.Color('#B8892A');
const madder = new THREE.Color('#B8323A'), rose = new THREE.Color('#E88A9A'), violet = new THREE.Color('#5A3A9A'), lilac = new THREE.Color('#A890D8');
const veronese = new THREE.Color('#2E9A6A'), lemon = new THREE.Color('#E8E45A'), turq = new THREE.Color('#5AC8C0');

// the eight planets of the finale. pal: the pigments flung out as its debris [colour, weight]; point: the colour of its
// point of light; bright: its magnitude; swirl: how far its debris curls (rad); hand: turn sense; dark: a dark planet
// (barely lights the paint, burns green-gold)
export const ROSTER = {
  cobalt: { swirl: 2.2, hand: 1, point: new THREE.Color('#FFF1D6'), bright: 1.3,
    pal: [[K.cobalt, 3], [mix(K.ultra, K.cobalt, 0.4, 1.5), 2], [K.cer, 3], [mix(K.cer, white, 0.5), 2], [K.yel, 0.6]] },
  sunflower: { swirl: 1.8, hand: -1, point: new THREE.Color('#F4DEA0'), bright: 1.0,
    pal: [[K.yel, 4], [ochre.clone().multiplyScalar(1.05), 2], [K.org, 2], [mix(K.yel, white, 0.35), 1.5], [mix(ochre, K.vir, 0.35, 0.7), 0.8]] },
  cypress: { swirl: 2.6, hand: 1, point: new THREE.Color('#F2E8C0'), bright: 1.2,
    // the valley's own cypress pigments: dark black-green flame, a little lit viridian and ochre
    pal: [[mix(K.vir, K.cer, 0.04, 1.15), 3], [mix(K.vir, K.cyp, 0.5, 1.35), 3], [mix(K.cyp, K.ultra, 0.15, 1.2), 2], [mix(K.vir, K.cobalt, 0.3, 0.9), 1],
      [mix(K.vir, K.yel, 0.3, 1.25), 1.5], [ochre.clone().multiplyScalar(0.5), 0.8]], dark: true },
  cafe: { swirl: 2.0, hand: -1, point: new THREE.Color('#F2A07A'), bright: 1.05,
    pal: [[K.org, 4], [K.yel.clone().multiplyScalar(0.95), 2.5], [ochre, 1.5], [mix(K.org, new THREE.Color('#C0502A'), 0.5), 1.5], [K.cobalt, 1.2], [mix(K.ultra, K.cobalt, 0.5, 1.4), 0.8]] },
  rose: { swirl: 2.1, hand: 1, point: new THREE.Color('#F6D2C8'), bright: 1.1,
    pal: [[madder, 3], [rose, 3], [mix(rose, white, 0.45), 2], [K.org, 1], [K.vir.clone().multiplyScalar(1.3), 1], [K.yel, 0.6]] },
  violet: { swirl: 2.4, hand: -1, point: new THREE.Color('#E6DEF6'), bright: 1.15,
    pal: [[violet, 3], [lilac, 3], [mix(K.ultra, violet, 0.5, 1.6), 2], [mix(lilac, white, 0.4), 1.5], [K.yel, 1.0]] },
  emerald: { swirl: 1.9, hand: 1, point: new THREE.Color('#E2F4D2'), bright: 1.05,
    pal: [[veronese, 3], [lemon, 2.5], [mix(veronese, K.cer, 0.4), 2], [mix(lemon, white, 0.4), 1.5], [K.cobalt, 0.8]] },
  ice: { swirl: 2.3, hand: -1, point: new THREE.Color('#EAF4FF'), bright: 1.25,
    pal: [[K.cer, 3], [mix(K.cer, white, 0.6), 3], [turq, 2], [white.clone().multiplyScalar(1.1), 1.5], [K.cobalt, 1.2], [K.yel, 0.5]] },
};

// aA: lon, lat (burst direction) | angle, -, radius (x R for rings and core, metres for the point), kind
// aB: half length m, half width m, hash, tangential (point strokes)   aC: rgb, emissive
// aE: burst speed m/s, drag 1/s, swirl rad (rings: -, open rate, turn rate)   aF: xyz tilt of the curl axis, sink m/s (rings: x = turn sign)
// kinds: 1 blast stroke  2 star ring  3 star core  4 the point of light before the blast
const PSTROKE_VS = /* glsl */`
attribute vec4 aA, aB, aC, aE, aF;
uniform float uTime, uTB, uHand, uR, uPulse, uPulseI, uHeat, uTell;
uniform vec3 uCtr, uHot;
varying vec2 vUv; varying vec4 vCol; varying float vId; varying vec3 vSideV, vAxisV;
#include <fog_pars_vertex>
#define KEEP 0.07
vec3 rotA(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.0 - c); }
vec3 toCam(){ return normalize(cameraPosition - uCtr); }
vec3 burst(vec3 dr, float s){
  float k = aE.y, e = 1.0 - exp(-k*s), Dm = aE.x/k, r0 = 0.02*uR;
  // the whole cloud turns together at first (every stroke on one spiral), then the inside keeps turning faster
  float th = uHand*(aE.z*e + 0.2*s*pow(uR*1.2/(r0 + Dm), 1.3));
  vec3 p = rotA(dr*(r0 + Dm*e), normalize(toCam() + aF.xyz), th);
  p.y -= aF.w*(step(fract(aB.z*7.31), KEEP) > 0.5 ? 0.12 : 1.0)*(min(s, 40.0) - e/k);   // most rain slowly down as they fade
  return uCtr + p;
}
void main(){
  float kind = aA.w, l = position.x, hl = aB.x, hw = aB.y, hs = aB.z, sc = 1.0, tb = uTB, s = max(tb, 0.0);
  vec3 col = aC.rgb; float em = aC.a;
  vec3 z = toCam(), b1 = normalize(cross(vec3(0.0, 1.0, 0.0), z)), b2 = cross(z, b1);
  vec3 P, ax; bool curved = false;
  if (kind < 1.5){
    sc = step(0.0, tb)*(1.0 - step(KEEP, fract(hs*7.31))*smoothstep(1.8 + 2.2*fract(hs*3.7), 3.6 + 2.2*fract(hs*3.7), s));
    float cl = cos(aA.y); vec3 dr = vec3(cl*cos(aA.x), sin(aA.y), cl*sin(aA.x));
    P = burst(dr, s); vec3 P2 = burst(dr, s + 0.02);
    ax = normalize(P2 - P + dr*1e-3);
    hl *= clamp(1.0 + length(P2 - P)/0.02*0.008, 1.0, 3.5);   // the fastest strokes are dragged long
    float heat = exp(-s*3.0);
    col = mix(col, hs < 0.7 ? uHot : mix(uHot, vec3(1.0), 0.6), heat*uHeat); em = max(em, uHeat*heat);
    hw *= 0.5 + 0.5*(1.0 - heat);                            // thin while fast: the burst stays strokes, not a glare
  } else if (kind < 3.5){
    sc = step(0.0, tb)*smoothstep(0.0, 0.12, tb);
    if (kind < 2.5){                                          // star ring: opens fast, then turns for ever
      float k = aE.y, e = 1.0 - exp(-k*s);
      float r = uR*aA.z*e*(1.0 + 0.03*sin(uTime*2.6 + hs*50.0) + 0.09*uPulse) + 0.5;
      float a = aA.x + aF.x*uHand*(aE.z/k*e + aE.z*0.02*s + 0.45*uPulseI) + l*hl/r;
      P = uCtr + (b1*cos(a) + b2*sin(a))*r;
      ax = b2*cos(a) - b1*sin(a); curved = true;
      em *= (1.0 + 1.2*exp(-s*1.3))*(1.0 + 1.8*uPulse); hw *= (1.0 + 0.6*exp(-s*1.5))*(1.0 + 0.45*uPulse);
    } else {                                                  // core: long spikes in the flash, a short dense core after
      float a = aA.x + uHand*(uTime*0.12 + 0.6*uPulseI);
      vec3 rad = b1*cos(a) + b2*sin(a);
      hl *= 0.3 + 2.8*exp(-2.0*s) + 0.9*uPulse;
      P = uCtr + rad*uR*aA.z*(0.35 + 0.65*(1.0 - exp(-5.0*s)))*(0.6 + 0.4*exp(-s)); ax = rad;
      em *= 0.55 + 1.2*exp(-1.6*s) + 0.9*uPulse;
      col = mix(vec3(1.0, 0.98, 0.9), col, smoothstep(0.0, 1.2, s));
    }
  } else {                                                    // the point of light: twinkles, flickers up before its blast
    sc = 1.0 - step(0.0, tb);
    float a = aA.x + uHand*uTime*0.08, tell = smoothstep(-uTell, 0.0, tb);
    vec3 rad = b1*cos(a) + b2*sin(a);
    P = uCtr + rad*aA.z*(1.0 + 0.5*tell); ax = aB.w > 0.5 ? b2*cos(a) - b1*sin(a) : rad;
    em *= (0.82 + 0.18*sin(uTime*(2.0 + 3.0*hs) + hs*40.0))*(1.0 + tell*(1.4 + 0.9*sin(uTime*47.0 + hs*9.0)));
    hl *= 1.0 + 0.6*tell;
  }
  if (!curved) P += ax*l*hl;
  vec3 toC = cameraPosition - P; float dist = max(length(toC), 1e-3);
  vec3 side = normalize(cross(ax, toC/dist) + vec3(1e-5, 0.0, 0.0));
  hw = max(hw, dist*0.0016);
  P += side*position.y*hw*sc;
  vec4 mvPosition = viewMatrix*vec4(P, 1.0);
  gl_Position = sc < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix*mvPosition;
  vUv = position.xy; vCol = vec4(col, em*(0.85 + 0.15*sin(uTime*(3.0 + 7.0*hs) + hs*90.0))); vId = hs;
  vSideV = mat3(viewMatrix)*side; vAxisV = mat3(viewMatrix)*ax;
  #include <fog_vertex>
}`;

// the reflection: flat horizontal dashes on the water in a column from the far bank toward the camera, along the
// planet's azimuth (wind-ruffled water spreads a mirror image into a long broken column, as the lamps in the Rhone).
// aA: u along the column (0 far .. 1 near), across offset (-1..1), hash, kind (0 calm gold, 1 burst pigment, 2 point)
// aC: rgb, emissive. uRefl = (point, burst, calm, -) strengths; uWater = (y, angular half width rad, near m, far m)
const REFL_VS = /* glsl */`
attribute vec4 aA, aC;
uniform float uTime, uTB;
uniform vec3 uCtr; uniform vec4 uRefl, uWater;
varying vec2 vUv; varying vec4 vCol; varying float vId; varying vec3 vSideV, vAxisV;
#include <fog_pars_vertex>
void main(){
  float u = aA.x, hs = aA.z, kind = aA.w, l = position.x;
  vec2 d = uCtr.xz - cameraPosition.xz; float D = length(d); vec2 f = d/max(D, 1e-3), sd = vec2(-f.y, f.x);
  float hc = max(cameraPosition.y - uWater.x, 0.3);
  float dep = mix(atan(hc/uWater.w), atan(hc/uWater.z), pow(u, 1.5)), s = hc/tan(dep);
  float a = kind > 1.5 ? uRefl.x : (kind > 0.5 ? uRefl.y : uRefl.z);
  float wid = uWater.y*(kind > 0.5 && kind < 1.5 ? 1.0 + 1.8*uRefl.y : (kind > 1.5 ? 0.45 : 1.0))*(0.7 + 0.3*u);
  float zz = sin(u*41.0 + uTime*(1.1 + hs) + hs*20.0);                      // the zig-zag of the ripples
  vec2 c = cameraPosition.xz + f*s + sd*s*wid*(aA.y + zz*0.3);
  float hl = s*(0.007 + 0.014*fract(hs*5.3))*(kind > 1.5 ? 0.6 : 1.0);
  vec3 P = vec3(c.x, uWater.x + 0.03, c.y) + vec3(sd.x, 0.0, sd.y)*l*hl;
  float sc = smoothstep(0.02, 0.12, a*(0.4 + 0.6*fract(hs*3.1)))*step(fract(hs*9.7 + uTime*0.11*(0.5 + hs)), min(1.0, a*1.4 + 0.25));
  float hw = s*s/hc*(0.0011 + 0.0009*fract(hs*7.7));                         // a few pixels high even where the water grazes
  P += vec3(f.x, 0.0, f.y)*position.y*hw*sc;
  vec4 mvPosition = viewMatrix*vec4(P, 1.0);
  gl_Position = sc < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix*mvPosition;
  vUv = position.xy; vCol = vec4(aC.rgb, aC.a*a*(1.0 - 0.45*u)*(0.75 + 0.25*sin(uTime*(4.0 + 6.0*hs) + hs*70.0))); vId = hs;
  vSideV = mat3(viewMatrix)*vec3(f.x, 0.0, f.y); vAxisV = mat3(viewMatrix)*vec3(sd.x, 0.0, sd.y);
  #include <fog_vertex>
}`;

function parseList(s) { return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []; }
// the schedule: ctx.vary.blasts | ctx.opts.blasts (an object like def) | URL &blasts= | def
export function scheduleFrom(ctx, def) {
  const o = (ctx && ((ctx.vary && ctx.vary.blasts) || (ctx.opts && ctx.opts.blasts))) || null;
  if (o && typeof o === 'object') return { ...o, before: o.before || [], here: o.here || [], hide: o.hide || [], pulse: o.pulse || null };   // (other keys pass through to the world: vg-rhone's freeze, earth)
  const q = (typeof location !== 'undefined') ? new URLSearchParams(location.search).get('blasts') : null;
  const src = (o && typeof o === 'string') ? o : q;
  if (!src) return def;
  const r = { before: [], here: [], hide: [] };
  for (const part of src.split(';')) {
    const [k, v] = part.split(':');
    for (const e of parseList(v)) {
      const [id, n] = e.split('@');
      if (k === 'before') r.before.push({ id, age: n === undefined ? 30 : Number(n) });
      else if (k === 'here') r.here.push({ id, t: Number(n) });
      else if (k === 'hide') r.hide.push(id);
    }
  }
  return r;
}

export async function buildBlasts(ctx, opts) {
  const { scene, uniforms: SU, eye, place, hero } = opts;
  const sched = opts.schedule || { before: [], here: [], hide: [] };
  const FINE = opts.fine ?? 2, BOOST = opts.boost ?? 1.9;
  const rng = makeRng(hashSeed(opts.seed || 'vg-blasts'));
  const toV = (az, el) => new THREE.Vector3(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R));
  const fogU = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  const fire = [mix(K.yel, white, 0.3), K.yel, K.org, white.clone().multiplyScalar(1.1)];
  const beforeOf = new Map((sched.before || []).map((b) => typeof b === 'string' ? [b, 30] : [b.id, b.age ?? 30]));
  const hereOf = new Map((sched.here || []).map((h) => [h.id, h.t]));
  const hidden = new Set(sched.hide || []);
  const planets = [];
  for (const PL of place) {
    if (hidden.has(PL.id)) continue;
    const P = Object.assign({ name: PL.id }, ROSTER[PL.id], PL);
    const ctr = eye.clone().addScaledVector(toV(P.az, P.el), P.dist), R = P.dist * Math.tan(P.ang * D2R);
    const pu = { uTell: { value: opts.tell ?? 0.6 }, uPulse: { value: 0 }, uPulseI: { value: 0 }, uHeat: { value: opts.heat ?? 0.35 }, uR: { value: R }, uTB: { value: -99 }, uHand: { value: P.hand }, uCtr: { value: ctr }, uFlash: { value: new THREE.Vector3() }, uHot: { value: P.dark ? mix(K.vir, K.yel, 0.3, 1.6) : new THREE.Color(0.96, 0.8, 0.28) } };
    const yel = P.dark ? mix(K.vir, K.yel, 0.45, 1.5) : K.yel;   // the cypress star burns green-gold, not chrome yellow
    const wsum = P.pal.reduce((a, [, w]) => a + w, 0);
    const pick = () => { let r = rng() * wsum; for (const [c, w] of P.pal) if ((r -= w) <= 0) return c; return P.pal[0][0]; };

    const A = [], B = [], Cc = [], E = [], Fv = [];
    const add = (a0, a1, rm, kind, hl, hw, tang, col, em, v0 = 0, k = 0, w0 = 0, tx = 0, ty = 0, tz = 0, sink = 0) => {
      const j = 0.82 + 0.36 * rng();
      A.push(a0, a1, rm, kind); B.push(hl, hw, rng(), tang); Cc.push(col.r * j, col.g * j, col.b * j, em); E.push(v0, k, w0, 0); Fv.push(tx, ty, tz, sink);
    };
    const hl0 = R * 0.055, hw0 = R * 0.014, fs = Math.pow(FINE, 0.6);   // fs: finer, more numerous debris
    // the blast: the planet's pigments (and some fire) flung out from the point to one to two and a half radii
    const NB = Math.round(3800 * FINE * Math.pow(P.ang / 9, 2));
    for (let i = 0; i < NB; i++) {
      const k = rng.range(2.0, 2.4), Dm = R * Math.pow(rng(), 0.7) * 2.4 + R * 0.15;
      const hot = rng.chance(P.dark ? 0.05 : 0.18);
      let col = (hot ? rng.pick(fire) : pick()).clone(), em = hot ? rng.range(0, 0.5) : 0;
      if (rng.chance(0.03)) col = K.org.clone().multiplyScalar(0.8);
      else if (!P.dark && rng.chance(0.1)) col.lerp(white, 0.3);
      add(rng.range(-Math.PI, Math.PI), Math.asin(rng.range(-1, 1)), 0, 1, hl0 / fs * rng.range(0.7, 1.4), hw0 / fs * rng.range(0.8, 1.3), 0, col, em,
        Dm * k, k, P.swirl * rng.range(0.88, 1.12), rng.gauss() * 0.12, rng.gauss() * 0.12, rng.gauss() * 0.12, rng.range(1.5, 7));
    }
    // the new star: a dense core and concentric rings, alternate chrome yellow and pale cerulean, neighbours counter-rotating
    const RINGS = [0.16, 0.3, 0.55, 0.85];
    for (let k = 0; k < RINGS.length; k++) {
      const rm = RINGS[k], core = rm < 0.5, n = Math.round(core ? 16 + 40 * rm : 30 + 17 * rm), warm = core || k % 2 === 0;
      for (let i = 0; i < n; i++) {
        const col = core ? mix(yel, white, rng.range(0.15, 0.6)) : warm ? (rng.chance(0.8) ? yel.clone().multiplyScalar(1.05) : mix(yel, white, 0.35)) : (rng.chance(0.7) ? mix(K.cer, white, 0.45) : mix(yel, white, 0.4));
        add((i + rng.range(-0.25, 0.25)) / n * TAU, 0, rm * rng.range(0.96, 1.04), 2, TAU * R * rm / n * rng.range(0.3, 0.42), hw0 * rng.range(1.1, 1.6), 0, col,
          (core ? 1.3 : warm ? 0.35 : 0.14) * rng.range(0.8, 1.15), 0, rng.range(1.4, 2.4) / Math.sqrt(rm), rng.range(0.9, 1.6), k % 2 ? 1 : -1, 0, 0, 0);
      }
    }
    for (let i = 0; i < 60; i++) {
      add(rng.range(0, TAU), 0, rng.range(0.02, 0.5), 3, R * rng.range(0.1, 0.2), hw0 * rng.range(1.2, 2.0), 0, rng.chance(0.7) ? yel : mix(yel, white, 0.4),
        rng.range(1.0, 1.5), 0, 0, 0, 0, 0, 0, 0);
    }
    // the point of light: a few short radial strokes round a bright centre and a small ring of dashes for the halo
    const pr = 0.015 * P.dist * Math.sqrt(P.bright) * (opts.pointScale ?? 1);   // under a degree across
    for (let i = 0; i < 7; i++) add(i / 7 * TAU + rng.range(-0.2, 0.2), 0, pr * rng.range(0.05, 0.35), 4, pr * rng.range(0.3, 0.45), pr * 0.16, 0, P.point, 2.4 * P.bright);
    for (let i = 0; i < 10; i++) add(i / 10 * TAU + rng.range(-0.15, 0.15), 0, pr * rng.range(0.85, 1.0), 4, pr * 0.22, pr * 0.1, 1, P.point.clone().lerp(K.cer, 0.35), 0.7 * P.bright);

    const g0 = new THREE.PlaneGeometry(2, 2, 6, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = g0.index; geo.setAttribute('position', g0.getAttribute('position'));
    for (const [nm, arr] of [['aA', A], ['aB', B], ['aC', Cc], ['aE', E], ['aF', Fv]]) geo.setAttribute(nm, new THREE.InstancedBufferAttribute(new Float32Array(arr), 4));
    geo.instanceCount = A.length / 4;
    const sm = new THREE.ShaderMaterial({ uniforms: Object.assign({}, fogU, SU, pu), vertexShader: PSTROKE_VS, fragmentShader: STROKE_FS, side: THREE.DoubleSide, fog: true });
    const strokes = new THREE.Mesh(geo, sm); strokes.frustumCulled = false; strokes.name = 'planet-' + P.name;
    scene.add(strokes);

    // the reflection column on the water (own rng: the strokes above stay what they were without water)
    let ru = null;
    if (opts.water) {
      const W = opts.water, rr = makeRng(hashSeed((opts.seed || 'vg-blasts') + ':refl:' + P.name));
      ru = { uRefl: { value: new THREE.Vector4() }, uWater: { value: new THREE.Vector4(W.y, W.width ?? 0.035, W.near ?? 4, W.far ?? 160) } };
      const RA = [], RC = [];
      const gold = [K.yel, mix(K.yel, white, 0.35), K.org, mix(K.yel, K.org, 0.5)];
      const dim = W.dim ?? 1;
      const radd = (kind, col, em) => { const j = 0.8 + 0.4 * rr(); RA.push(rr(), rr.range(-1, 1) * (kind === 2 ? 0.35 : 1), rr(), kind); RC.push(col.r * j, col.g * j, col.b * j, em * dim); };
      for (let i = 0; i < 120; i++) radd(2, P.point, 1.4 * P.bright);
      const rpick = () => { let r = rr() * wsum; for (const [c, w] of P.pal) if ((r -= w) <= 0) return c; return P.pal[0][0]; };
      for (let i = 0; i < 700; i++) { const hot = rr.chance(0.3); radd(1, hot ? rr.pick(fire) : rpick(), hot ? 1.6 : 0.9); }
      for (let i = 0; i < 260; i++) radd(0, rr.pick(gold), 1.1);
      const rg = new THREE.PlaneGeometry(2, 2, 2, 1), rgeo = new THREE.InstancedBufferGeometry();
      rgeo.index = rg.index; rgeo.setAttribute('position', rg.getAttribute('position'));
      rgeo.setAttribute('aA', new THREE.InstancedBufferAttribute(new Float32Array(RA), 4));
      rgeo.setAttribute('aC', new THREE.InstancedBufferAttribute(new Float32Array(RC), 4));
      rgeo.instanceCount = RA.length / 4;
      const rm = new THREE.Mesh(rgeo, new THREE.ShaderMaterial({ uniforms: Object.assign({}, THREE.UniformsUtils.clone(THREE.UniformsLib.fog), SU, pu, ru), vertexShader: REFL_VS, fragmentShader: STROKE_FS, side: THREE.DoubleSide, fog: true }));
      rm.frustumCulled = false; rm.name = 'planet-reflection-' + P.name; rm.renderOrder = 1;
      scene.add(rm);
    }

    const tE = hereOf.has(P.id) ? hereOf.get(P.id) : beforeOf.has(P.id) ? -beforeOf.get(P.id) : 1e6;   // 1e6: a point that does not burst here
    planets.push({ id: P.id, P, ctr, R, pu, ru, tE, blastP: new THREE.Vector2(), slot: -1 });
    await ctx.yield();
  }
  // the four sky slots: here (build order), then the most recent before, then points
  const cand = [...planets.filter((p) => hereOf.has(p.id)), ...planets.filter((p) => beforeOf.has(p.id)).sort((a, b) => b.tE - a.tE),
    ...planets.filter((p) => !hereOf.has(p.id) && !beforeOf.has(p.id))];
  cand.slice(0, 4).forEach((p, i) => { p.slot = i; });

  const flashCol = opts.flashColor || new THREE.Color(1.0, 0.72, 0.36), flashGain = opts.flashGain ?? 0.45;
  const vc = opts.flashFrom || eye, fd = new THREE.Vector3(), dv = new THREE.Vector3();
  const HU = hero && hero.uniforms, glowGain = opts.glowGain ?? 1, skyK = opts.skyScale ?? 1, flashCap = opts.flashCap || 0;
  // the peak (sched.pulse = [t0, t1] world s): every burst star-whirl brightens and turns up, then settles over ~3 s.
  // pulseI integrates it on a fixed 1/60 s grid (a pure function of time) so the extra turn never jumps
  const PL = sched.pulse, pulseAt = (t) => PL ? sstep(PL[0] - 0.2, PL[0] + 0.6, t) * (1 - sstep(PL[1], PL[1] + 3, t)) : 0;
  const pulseI = (t) => { if (!PL || t <= PL[0] - 0.2) return 0; let a = 0; for (let x = PL[0] - 0.2; x < Math.min(t, PL[1] + 3); x += 1 / 60) a += pulseAt(x) / 60; return a; };
  return {
    planets,
    explodeAt: (sched.here || []).map((h) => h.t),
    // time: world seconds; camP: camera position. Returns the warm flash strength (also written to uniforms.uFlash)
    update(time, camP) {
      let flash = 0; fd.set(0, 0, 0);
      const pe = pulseAt(time), pi = pulseI(time);
      for (const pl of planets) {
        const s = time - pl.tE;
        pl.pu.uTB.value = s;
        pl.pu.uPulse.value = s > 0 ? pe : 0; pl.pu.uPulseI.value = s > 0 ? pi : 0;
        if (pl.ru) {
          const pt = s < 0 ? 0.55 * pl.P.bright * (1 + 1.5 * sstep(-(opts.tell ?? 0.6), 0, s)) : 0;
          const bu = s > 0 ? (pl.P.dark ? 0.55 : 1) * (Math.exp(-s * 0.55) * sstep(0, 0.12, s)) : 0;
          const ca = s > 0 ? 0.65 * sstep(0.3, 2.5, s) * (1 + 0.6 * pe) : 0;
          pl.ru.uRefl.value.set(pt, bu, ca, 0);
        }
        if (s > 0) {
          const f = 2.0 * Math.exp(-s * 2.4) + 0.3 * Math.exp(-s * 0.45);
          flash += f; fd.addScaledVector(dv.copy(pl.ctr).sub(vc).normalize(), f);
        }
        if (!HU || pl.slot < 0) continue;
        const b = HU.uBlast.value[pl.slot], k = HU.uBlastK.value[pl.slot], g = HU.uBlastG.value[pl.slot];
        dirToP(dv.copy(pl.ctr).sub(camP).normalize(), pl.blastP);
        const ang = pl.R / pl.ctr.distanceTo(camP);
        if (s > 0) {
          // the sky: a vortex that spins up and settles to a slow turn, a shock ring of yellow strokes running out, a brief glow
          b.set(pl.blastP.x, pl.blastP.y, ang * 2.2 * skyK * (1 + 0.3 * pe), pl.P.hand);
          k.set((0.11 * Math.exp(-s * 0.45) + 0.09 * pe) * BOOST + 0.008, (0.12 * Math.exp(-s * 0.9) + 0.05 * pe) * BOOST,   // in slow-clock rad/s
            ang * skyK * (1.3 + 3.2 * (1 - Math.exp(-s * 0.7))), Math.exp(-s * 0.6) * sstep(0, 0.15, s));
          g.set((0.35 * glowGain * Math.exp(-s * 1.6) + 0.06 * sstep(0, 1, s) + 0.12 * pe) * (pl.P.dark ? 0.35 : 1), 0, 0, 0);   // the dark planet barely lights the paint
        } else {                                       // before: only a small glow in the paint round the point
          b.set(pl.blastP.x, pl.blastP.y, 0.03, pl.P.hand); k.set(0, 0, 0, 0);
          g.set((0.18 + 0.5 * sstep(-(opts.tell ?? 0.6), 0, s)) * pl.P.bright, 0, 0, 0);
        }
      }
      if (flashCap > 0) flash = flashCap * (1 - Math.exp(-flash / flashCap));   // two at once never wash the frame out
      if (SU.uFlash) SU.uFlash.value.set(flashCol.r, flashCol.g, flashCol.b).multiplyScalar(flash * flashGain);
      if (flash > 0 && SU.uFlashD) SU.uFlashD.value.copy(fd.normalize());
      return flash;
    },
  };
}
