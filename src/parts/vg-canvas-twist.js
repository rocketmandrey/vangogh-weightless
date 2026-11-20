// VG CANVAS TWIST: the Rhône finale's last seconds as real paint. At the Earth blast the frame is kept (a snapshot) and
// laid out again as a field of flat impasto dabs, each one colour sampled at its own start point; from then on the dabs
// themselves travel along a counter-clockwise flow round the blast and turn to lie along it. Every dab keeps its crisp
// edge, bristle grooves and relief (the-turning-night's STROKE_FS): nothing is warped, blurred or smeared. The blast's
// light stays to the end as a warm core. A pure function of the seconds since the blast.
//   mode 0 'a' whirlpool: the whole painting twists round the blast, inner faster than outer (a Starry Night whirl)
//   mode 1 'b' great swirl: the dabs re-flow into one giant spiral with two arms; the light is its eye
//   mode 2 'c' into the light: the paint spirals inward and is drawn into the light, which opens over the whole frame
//   mode 3 'd' turning canvas: the flat painting turns as one rigid canvas (~160 deg), its dabs curling along; ends still
//   mode 4 'e' unfurling: spiral arms unfurl outward from the light (a sun), the colours part into bands of pure pigment
//   mode 5 'a2' dark whirlpool: no blast and no light; the LIVE night frame (re-sampled every frame) turns, the dabs come in
//     over its first 2 s on top of the frame they copy, small at first, and the whirl is inner-fast; no exposure ramp
// The smear endings (f..j), all on the live night frame like a2, no light anywhere: each dab is dragged along its own path
// like wet oil paint, a curved streak from where it was uLag ago to where it is (SMEAR_VS: the dab's own crisp edge, bristle
// grooves and relief along the whole streak), on an exponential ease-in: a drop of a drag for a long time, then quickening
// into a smear that carries everything round at the end.
//   mode 6 'f' river: the vortex on the far water (the old blast point)
//   mode 7 'g' sky: the vortex at the big star in the sky, drawing river and boats up into it as it turns
//   mode 8 'h' long: as f from the last planet burst, ~15 s of drift before it quickens
//   mode 9 'i' wet colours: as f, the streaks mix the paint they are dragged over (pigment mixing: new hues)
//   mode 10 'j' palette knife: as f, the dabs merge into fewer, wider, flatter bands: a few broad curved knife strokes at the end;
//     no spin-up at the end: from 251.5 the bands are dragged round at a steady pace (accepted, the default ending)
// Aspect space throughout: x in -asp/2..asp/2, y in -.5...5 (the frame), the blast at uC.
import * as THREE from 'three';
import { makeRng, hashSeed } from '../kit/core.js';
import { STROKE_FS } from '../worlds/the-turning-night.js';

export const TWIST_MODES = ['a', 'b', 'c', 'd', 'e', 'a2', 'f', 'g', 'h', 'i', 'j'];

const FLOW = /* glsl */`
uniform float uS, uEnd, uAsp, uMode, uK; uniform vec2 uC;
const float PI = 3.14159265;
float sst(float a, float b, float x){ float t = clamp((x - a)/(b - a), 0., 1.); return t*t*(3. - 2.*t); }
// the one movement: an eased start, quickening into the last seconds (the turning canvas comes to rest at the end)
float ease(float x){
  // the smears: exponential ease-in (a drop for a long time); the knife holds its pace from x = .72 (251.5) to the end
  if (uMode > 9.5 && x > .72) return (exp(uK*.72) - 1. + uK*exp(uK*.72)*(x - .72))/(exp(uK) - 1.);
  if (uMode > 5.5) return (exp(uK*x) - 1.)/(exp(uK) - 1.);
  if (uMode > 2.5 && uMode < 3.5) return sst(0., 1., pow(x, 1.25));
  return .04*x*x + .96*pow(x, 2.3);
}
float lightR(float x){   // the light's radius (into the light: it opens over the frame at the end)
  if (uMode > 1.5 && uMode < 2.5) return .05 + .08*x + 1.25*pow(sst(.7, 1., x), 1.5);
  if (uMode > 3.5) return .07 + .16*sst(0., 1., x);
  return .055 + .05*x;
}
// where the dab that started at p0 (relative to the blast) is at progress x
vec2 flow(vec2 d0, float x){
  float r0 = length(d0) + 1e-4, f0 = atan(d0.y, d0.x), e = ease(x), r = r0, f = f0;
  if (uMode > 6.5 && uMode < 7.5){   // sky: a whirl round the star, pulling the whole frame in and up toward it
    f += 3.*PI*e/(1. + pow(r0/.24, 1.1));
    r = r0*exp(-.28*e);
  } else if (uMode > 5.5){   // the smears on the river: as the whirlpool, a wider fast middle so the edges are carried too
    f += 3.*PI*e/(1. + pow(r0/.22, 1.1));
    r = r0*(1. - .06*e*exp(-r0*3.));
  } else if (uMode < .5 || uMode > 4.5){   // whirlpool (and the dark one): differential rotation, the middle turning fastest
    f += 3.2*PI*e/(1. + pow(r0/.16, 1.2));
    r = r0*(1. - .06*e*exp(-r0*3.));
  } else if (uMode < 1.5){    // great swirl: log-spiral shear and two arms gathering
    f += 1.25*PI*e*(1.25 - .5*log(r0 + .03));
    r = r0*(1. + .16*e*sin(2.*(f0 - 2.4*log(r0 + .03))));
  } else if (uMode < 2.5){    // into the light: drawn in along a tightening spiral
    r = r0*exp(-.85*e);
    f += 1.75*e*(1.5 + .22/(r0 + .08));
  } else if (uMode < 3.5){    // turning canvas: one rigid turn, a touch faster at the middle
    f += 2.8*e*(1. + .1/(1. + r0/.12));
  } else if (uMode < 4.5){    // unfurling: pushed out from the sun, turning, inner arms first
    r = r0 + .24*e*(1. - .35*smoothstep(.2, 1., r0));
    f += 1.5*PI*e/(1. + r0/.3);
  }
  return vec2(cos(f), sin(f))*r;
}
// the smears: where the paint now at d (relative to the centre) started (the flow undone; the river's slight inward pull ignored)
vec2 unflow(vec2 d, float x){
  float e = ease(x), r = length(d) + 1e-4, sky = uMode > 6.5 && uMode < 7.5 ? 1. : 0., r0 = r*exp(.28*e*sky);
  float f = atan(d.y, d.x) - 3.*PI*e/(1. + pow(r0/mix(.22, .24, sky), 1.1));
  return vec2(cos(f), sin(f))*r0;
}`;

const TWIST_VS = /* glsl */`
attribute vec4 aA;   // start x, y (aspect space), hash, length scale
attribute vec4 aB;   // half width, start angle, 1 inside the frame (else 0), hash
uniform sampler2D tSnap; uniform float uLen, uWid, uDim;
varying vec2 vUv; varying vec4 vCol; varying float vId; varying vec3 vSideV, vAxisV;
${FLOW}
vec3 snapAt(vec2 p){ vec2 u = vec2(p.x/uAsp + .5, p.y + .5); u = 1. - abs(1. - mod(u, 2.)); return texture2D(tSnap, clamp(u, .001, .999)).rgb; }
void main(){
  float x = clamp(uS/uEnd, 0., 1.), dx = .004;
  vec2 d0 = aA.xy - uC;
  vec2 P = flow(d0, x), P2 = flow(d0, min(1., x + dx)), P1 = flow(d0, max(0., x - dx));
  vec2 v = (P2 - P1)/((min(1., x + dx) - max(0., x - dx))*uEnd);   // aspect units a second
  float sp = length(v);
  // a dab lies along its first brush direction, and turns to lie along the flow as the flow takes it
  vec2 a0 = vec2(cos(aB.y), sin(aB.y)), af = sp > 1e-5 ? v/sp : a0;
  if (dot(af, a0) < 0.) a0 = -a0;
  float k = sst(.0, .12, sp)*(uMode > 2.5 && uMode < 3.5 ? .45 + .4*x : 1.);
  vec2 ax = normalize(mix(a0, af, k) + vec2(1e-5, 0.)), sd = vec2(-ax.y, ax.x);
  if (uMode > 2.5 && uMode < 3.5){ float c = 2.8*ease(x); ax = normalize(mix(vec2(cos(aB.y + c), sin(aB.y + c)), af, k)); sd = vec2(-ax.y, ax.x); }
  // longer along the flow as it quickens (a longer dab, never a blur), a little finer too
  float hl = uLen*aA.w*(1. + min(1.4, sp*1.6)), hw = uWid*aB.x*(1. - .18*min(1., sp*1.2));
  bool dark = uMode > 4.5;
  // the dark whirlpool: each dab comes in over the frame it copies (its own moment in the first 2 s), finer at first
  if (dark){ float g = sst(.0, 1., (uS - 2.*aB.w)/.6), z = mix(.6, 1., sst(0., .5, x)); hl *= z; hw *= z*g; }
  vec3 col = snapAt(aA.xy);
  float rr = length(P), RL = lightR(x), emis = 0.;
  if (uMode > 3.5 && uMode < 4.5){   // pure pigment bands along spiral arms laid in the paint's own start place
    float band = mod(floor((atan(d0.y, d0.x) - 2.2*log(length(d0) + .03))*4./(2.*PI) + 400.), 4.);
    vec3 pg = band < .5 ? vec3(.96, .74, .08) : band < 1.5 ? vec3(.14, .28, .66) : band < 2.5 ? vec3(.95, .93, .86) : vec3(.12, .46, .36);
    col = mix(col, pg, .8*sst(.15, .95, x));
  }
  // paint near the light is lit by it: warm, then pale gold inside it
  float lit = exp(-max(0., rr - RL*.6)*7.);
  float lk = dark ? 0. : uMode > 3.5 ? .3 : uMode > 1.5 && uMode < 2.5 ? .35 : .55; col = mix(col, vec3(1., .86, .55), lk*lit*sst(0., .3, uS)); emis = lk*1.6*lit;
  if (uMode > 1.5 && uMode < 2.5){ float inL = sst(RL + .04, RL - .1, rr); // inside the light every dab turns to light's own paint (gold, cream, pale orange), each still a dab with its relief
    vec3 lp = aB.w < .33 ? vec3(.86, .66, .3) : aB.w < .66 ? vec3(.84, .78, .6) : vec3(.88, .56, .28);
    col = mix(col, lp, .75*inL); emis = mix(emis, .12, inL);
    hw *= 1. - sst(.06, .0, rr); }   // swallowed at the very middle
  if (dark) col *= uDim*(1. + .04*sst(.3, .6, x))*(1. - .12*sst(.86, 1., x));   // (luma held at the start's level: the dabs' rims dim the middle, the quickening whirl brings the lit water round at the end)
  float hide = uMode > 2.5 && uMode < 3.5 && aB.z < .5 ? 1. : 0.;   // the turning canvas is the frame, no more
  vec2 Q = uC + P + ax*position.x*hl + sd*position.y*hw;
  gl_Position = hide > .5 || hw < 1e-5 ? vec4(2., 2., 2., 1.) : vec4(Q.x*2./uAsp, Q.y*2., 0., 1.);
  vUv = position.xy; vCol = vec4(col, emis); vId = aB.w;
  vSideV = vec3(sd, 0.); vAxisV = vec3(ax, 0.);
}`;

// the smears: one dab = one ribbon (x along -1..1 in SEG pieces, y across), laid along the dab's own path from progress
// x - uLag s (the tail) to x (the head): short and straight while it hardly moves, a long curved streak as it quickens
const SMEAR_VS = /* glsl */`
attribute vec4 aA; attribute vec4 aB;   // as TWIST_VS (aA.z: for the knife, the order the bands merge in)
uniform sampler2D tSnap; uniform float uLen, uWid, uDim, uLag;
varying vec2 vUv; varying vec4 vCol; varying float vId; varying vec3 vSideV, vAxisV;
${FLOW}
vec3 snapAt(vec2 p){ vec2 u = vec2(p.x/uAsp + .5, p.y + .5); u = 1. - abs(1. - mod(u, 2.)); return texture2D(tSnap, clamp(u, .001, .999)).rgb; }
float LG;   // this dab's lag (progress): the last ~second of its path, longer or shorter per dab
vec2 ctr(vec2 d0, float x, float t, vec2 ax, float hl){ return flow(d0, max(0., x - LG*(.5 - .5*t))) + ax*t*hl; }
void main(){
  float x = clamp(uS/uEnd, 0., 1.), t = position.x, s = .5 + .5*t;
  LG = uLag/uEnd*.8*aA.w;
  vec2 d0 = aA.xy - uC, P = flow(d0, x), v = P - flow(d0, max(0., x - .004)), Pt = flow(d0, max(0., x - LG));
  float mv = length(v), drag = length(P - Pt);   // how far the dab has been dragged (the chord of its streak)
  vec2 a0 = vec2(cos(aB.y), sin(aB.y)), af = mv > 1e-7 ? v/mv : a0;
  if (dot(af, a0) < 0.) a0 = -a0;
  vec2 ax = normalize(mix(a0, af, sst(0., 2.*uLen, drag)) + vec2(1e-5, 0.));   // turns to lie along its drag
  // each dab comes in over the frame it copies (its own moment in the first 4.5 s), fine while it hardly moves
  float g = sst(0., 1., (uS - 3.5*aB.w)/1.), z = mix(.45, 1., sst(0., .12, ease(x)));
  float hl = uLen*aA.w*z, hw = uWid*aB.x*z*g, kp = 0.;
  if (uMode > 9.5){   // palette knife: the bands thin out (aA.z first) and the rest widen, flatter, into a few broad strokes
    kp = sst(0., .4, ease(x)); float keep = 1. - .96*kp;
    hw *= sst(1. - keep - .04, 1. - keep, aA.z)*(1. + 6.*kp); hl *= 1. + 3.*kp;
  }
  float e = 2e-3;
  vec2 c0 = ctr(d0, x, t - e, ax, hl), c1 = ctr(d0, x, t + e, ax, hl), C = .5*(c0 + c1), tg = c1 - c0;
  tg = length(tg) > 1e-9 ? normalize(tg) : ax; vec2 sd = vec2(-tg.y, tg.x);
  float dr = sst(0., .05, drag);
  hw *= mix(1., .6 + .4*s, dr);   // the tail thinner: the brush running out of paint
  // colour: the dab's own paint, picking up the wet paint it is dragged over toward the tail
  // (the paint under it has moved too: its colour is where that paint started)
  vec3 own = snapAt(aA.xy), under = snapAt(uC + unflow(C, x)), col = mix(own, under, .2*(1. - s)*dr);
  if (uMode > 8.5 && uMode < 9.5){   // wet colours: pigments mix (toward the geometric mean: blue and yellow make green), with
    // the paint under it and the paint beside it across the streak (a neighbour on another radius, turning at another speed)
    vec3 nb = snapAt(uC + unflow(C + sd*.035*(aB.w < .5 ? 1. : -1.), x));
    vec3 pg = mix((own + under + nb)/3., pow(own*under*nb, vec3(1./3.)), .75);
    col = mix(own, pg*1.06, min(.9, sst(.01, .2, drag)*(.45 + .55*(1. - s)) + .5*sst(.3, .8, ease(x))));
  }
  if (uMode > 9.5) col = mix(col, under, .25*(1. - s)*kp);
  col *= uDim;
  vec2 Q = uC + C + sd*position.y*hw;
  gl_Position = hw < 1e-6 ? vec4(2., 2., 2., 1.) : vec4(Q.x*2./uAsp, Q.y*2., 0., 1.);
  vUv = position.xy; vCol = vec4(col, 0.); vId = aB.w;
  vSideV = vec3(sd, 0.); vAxisV = vec3(tg, 0.);
}`;

// the canvas under the paint (seen only where paint has moved away) and the blast's light over it
const BASE_FS = /* glsl */`precision highp float;
varying vec2 vUv; uniform sampler2D tSnap;
${FLOW}
void main(){
  if (uMode > 4.5){ gl_FragColor = vec4(texture2D(tSnap, vUv).rgb, 1.); return; }   // the dark whirlpool: the live frame under its dabs
  vec2 p = vec2((vUv.x - .5)*uAsp, vUv.y - .5) - uC; float r = length(p), x = clamp(uS/uEnd, 0., 1.), RL = lightR(x);
  vec3 c = mix(vec3(.04, .06, .17), vec3(.08, .1, .24), smoothstep(.9, 0., r));
  c = mix(c, uMode > 1.5 && uMode < 2.5 ? vec3(.8, .62, .34) : vec3(1., .9, .66), smoothstep(RL + .03, RL - .04, r));
  gl_FragColor = vec4(c, 1.);
}`;
const LIGHT_FS = /* glsl */`precision highp float;
varying vec2 vUv;
${FLOW}
float h21(vec2 p){ vec3 q = fract(vec3(p.xyx)*.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y)*q.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 p = vec2((vUv.x - .5)*uAsp, vUv.y - .5) - uC; float r = length(p), a = atan(p.y, p.x), x = clamp(uS/uEnd, 0., 1.), RL = lightR(x);
  // the flash of the blast, then a core that stays (warm, a little brighter as the twist quickens), rays turning with it
  float flash = .8*exp(-uS*1.6)*exp(-r*r/(.004 + .05*uS));
  float RC = min(RL, .26), core = (.55 + .3*x)*exp(-r*r/(RC*RC*1.1)) + .06*exp(-r/(RC*1.6));
  float rays = smoothstep(.62, 1., vn(vec2((a + 1.2*ease(x)*PI)*30., r*3. - uS*2.)))*exp(-r*3.2)*(.12 + .5*exp(-uS*.9));
  vec3 hot = vec3(1., .78, .4);
  gl_FragColor = vec4(hot*(min(flash, .8) + core + .45*rays), 1.);
}`;

// group: the three layers (canvas, paint, light); update(s, end) each frame once the blast has come
export function buildTwist({ tSnap, uniforms, mode, weave, fine = 2, count = 72000, seed = 'vg-canvas-twist' }) {
  const M = TWIST_MODES.indexOf(mode);
  const SM = M >= 6, U = { tSnap: { value: tSnap }, uS: { value: 0 }, uEnd: { value: 5 }, uMode: { value: M }, uK: { value: M === 8 ? 9 : 7 }, uLag: { value: 1.0 }, uAsp: uniforms.uAsp, uC: uniforms.uC,
    uLen: { value: 0.015 }, uWid: { value: 0.0062 }, uDim: { value: 1 }, uGain: { value: 1 }, uWeave: weave, uFlash: { value: new THREE.Vector3() }, uFine: { value: M === 10 ? Math.min(fine, 1.2) : fine } };   // (the knife: flatter, fewer bristle tracks)
  const quad = new THREE.PlaneGeometry(2, 2);
  const full = (fs, order, blending) => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: U, depthTest: false, depthWrite: false, transparent: true, fog: false, blending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: fs }));
    m.frustumCulled = false; m.renderOrder = order; return m; };
  // the dabs: a disc round the frame (rotation never shows an empty corner), and an outer ring only the inward flow uses
  const rng = makeRng(hashSeed(seed)), inner = Math.round(count * 0.62), N = count;
  const A = new Float32Array(N * 4), B = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const R0 = i < inner ? 0 : 1.08, R1 = i < inner ? 1.08 : 1.9;
    const r = Math.sqrt(R0 * R0 + (R1 * R1 - R0 * R0) * rng()), f = rng() * Math.PI * 2;
    const x = r * Math.cos(f), y = r * Math.sin(f);
    // the brush's first direction: a slow field of its own, the way the painting's dabs lie
    const ang = 1.6 * Math.sin(x * 4.1 + 1.3 * Math.sin(y * 5.7)) + 1.1 * Math.cos(y * 6.3 - x * 2.2) + rng.range(-0.35, 0.35);
    A.set([x, y, rng(), rng.range(0.7, 1.45)], i * 4);
    B.set([rng.range(0.8, 1.25), ang, Math.abs(x) <= 0.889 && Math.abs(y) <= 0.5 ? 1 : 0, rng()], i * 4);
  }
  if (M === 10) {   // the knife: drawn in the order the bands merge in, so the ones that stay lie on top
    const o = [...Array(N).keys()].sort((i, j) => A[i * 4 + 2] - A[j * 4 + 2]), A2 = A.slice(), B2 = B.slice();
    o.forEach((k, i) => { A.set(A2.subarray(k * 4, k * 4 + 4), i * 4); B.set(B2.subarray(k * 4, k * 4 + 4), i * 4); });
  }
  const rib = SM ? new THREE.PlaneGeometry(2, 2, 40, 1) : quad;   // (a smear is a ribbon)
  const g = new THREE.InstancedBufferGeometry(); g.index = rib.index; g.setAttribute('position', rib.getAttribute('position'));
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4)); g.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4));
  g.instanceCount = M === 3 ? inner : N;   // (the turning canvas is the frame; the rest reach past every corner)
  const paint = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: SM ? SMEAR_VS : TWIST_VS, fragmentShader: STROKE_FS, depthTest: false, depthWrite: false, transparent: true, fog: false, side: THREE.DoubleSide }));   // (transparent: drawn in the same pass as the canvas and the light, in renderOrder)
  paint.frustumCulled = false; paint.renderOrder = 1e9 + 1;
  const group = new THREE.Group(); group.name = 'canvas-twist';
  group.add(full(BASE_FS, 1e9, THREE.NormalBlending), paint);
  if (M < 5) group.add(full(LIGHT_FS, 1e9 + 2, THREE.AdditiveBlending));   // (the dark whirlpool and the smears have no light)
  group.visible = false;
  return { group, uniforms: U, update(s, end) { U.uS.value = Math.max(0, s); U.uEnd.value = end; }, dispose() { g.dispose(); quad.dispose(); rib.dispose(); } };
}
