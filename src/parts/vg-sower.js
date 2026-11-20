// VG SOWER / VG OLIVES: shaders shared by the two finale scenes of the Van Gogh clip ("The Sower", 1888, and the
// Saint-Remy "Olive Trees", 1889; worlds src/worlds/vg-sower.js and src/worlds/vg-olives.js).
// The same hand as the-turning-night through vg-crows (TN_COMMON: stroke relief, bristle ends, gallery light, weave):
//   SKY_FS     a dome of three coats of short strokes on a slow curl current (vg-crows' layering) whose pigments the
//              world sets every frame (uHor / uZen / uAcc), so one sky can go from the Sower's yellow-green noon through
//              orange to deep night blue. On it: a sun disc of concentric strokes with strokes radiating round it
//              (uSun), a warm horizon glow (uGlow), stroke stars (uStars: yellow-white cores, alternating rings), a band
//              of painted hills on the horizon (uHills, the Alpilles) and the sky's answer to each planet's blast:
//              a vortex in the current, a shock ring of the planet's own pigment and a glow (uBlast*, as in
//              parts/the-turning-night.js).
//   TINT_FS    vg-crows' STROKE2_FS with the light of the hour (uTint) and the blasts' light (uFlash) on top.
//   GROUNDT_FS vg-crows' painted underlayer with the same two lights.
//   FIELD_VS / BLOOM_VS / DOME_VS: the stroke vertex shaders of vg-crows and vg-almond, unchanged.
import * as THREE from 'three';
import { TN_COMMON, STROKE2_FS, GROUND_FS, FIELD_VS, DOME_VS } from './vg-crows.js';
import { BLOOM_VS } from './vg-almond.js';

export { FIELD_VS, DOME_VS, GROUND_VS } from './vg-crows.js';
export { BLOOM_VS };

const swap = (src, a, b, who) => { if (!src.includes(a)) throw new Error('vg-sower: ' + who + ' has changed shape'); return src.replace(a, b); };
export const TINT_FS = swap(swap(STROKE2_FS, 'uniform vec3 uFlash;', 'uniform vec3 uFlash, uTint;', 'STROKE2_FS'),
  'gl_FragColor = vec4((tnGallery(alb, emis, nv, 1.0) + alb*uFlash)*uGain*tnWeave(uWeave), 1.0);',
  'gl_FragColor = vec4((tnGallery(alb, emis, nv, 1.0)*uTint + alb*uFlash)*uGain*tnWeave(uWeave), 1.0);', 'STROKE2_FS');
export const GROUNDT_FS = swap(swap(GROUND_FS, 'uniform vec4 uWind;', 'uniform vec4 uWind;\nuniform vec3 uFlash, uTint;', 'GROUND_FS'),
  'gl_FragColor = vec4(tnGallery(col, vec3(0.0), nv, 0.2)*uGain*tnWeave(uWeave), 1.0);',
  'gl_FragColor = vec4((tnGallery(col, vec3(0.0), nv, 0.2)*uTint + col*uFlash)*uGain*tnWeave(uWeave), 1.0);', 'GROUND_FS');

export const SKY_FS = /* glsl */`
varying vec3 vDir;
uniform float uTime, uGain, uWeave, uBump, uSeed, uCell, uStars, uSwirl;   // uSwirl: strength of the curl current (1 = vg-crows)
uniform vec3 uHor[3], uZen[3], uAcc[2];  // horizon tones, zenith tones (mixed by elevation), the light rivers' accents
uniform vec4 uSun; uniform vec3 uSunDir, uSunC[3];   // sun: chart xy, true angular radius, strength | dir | core, body, halo
uniform vec4 uGlow; uniform vec3 uGlowC;              // warm horizon glow: chart dir xy, strength, height (rad) | pigment
uniform vec4 uHills; uniform vec3 uHillC[3];          // hills: strength, mean height, ripple, seed | far, lit, contour
uniform vec4 uBlast[4], uBlastK[4], uBlastG[4];       // as parts/the-turning-night.js
uniform vec3 uBlastC[4];                              // each blast's shock-ring pigment
uniform vec3 fogColor;
${TN_COMMON}
vec4 vsHash4(vec2 p){ vec4 p4 = fract(p.xyxy*vec4(.1031,.1030,.0973,.1099)); p4 += dot(p4, p4.wzxy+33.33); return fract((p4.xxyz+p4.yzzw)*p4.zywx); }
#define VC_CELL uCell
#define VC_LIFE 7.0
vec3 vsDir(vec2 c){ float th = length(c); vec2 a = c/max(th, 1e-5); return vec3(sin(th)*a.x, cos(th), sin(th)*a.y); }
float vsPsi(vec2 p){
  vec2 K[5]; K[0] = vec2(3.1, 1.7); K[1] = vec2(-2.3, 4.1); K[2] = vec2(5.3, -2.9); K[3] = vec2(-6.7, -4.3); K[4] = vec2(9.1, 6.2);
  float s = 0.0;
  for (int i = 0; i < 5; i++){ float fi = float(i); s += 0.0048/(1.0 + 0.55*fi)*sin(dot(K[i], p) + uSeed*(1.7 + fi) + uTime*(0.025 + 0.012*fi)); }
  return s;
}
float vsHill(vec2 p){                               // the hills' crest elevation (rad) toward chart point p
  float a = atan(p.y, p.x) + uHills.w;
  return uHills.y + uHills.z*(0.55*sin(a*3.0 + 1.0) + 0.3*sin(a*7.3 + 2.0) + 0.15*sin(a*17.0) + 0.5*max(0.0, sin(a*1.3 - 0.4)));
}
vec2 vsVel(vec2 p){
  vec2 v = vec2(0.0);
  vec2 K[5]; K[0] = vec2(3.1, 1.7); K[1] = vec2(-2.3, 4.1); K[2] = vec2(5.3, -2.9); K[3] = vec2(-6.7, -4.3); K[4] = vec2(9.1, 6.2);
  for (int i = 0; i < 5; i++){
    float fi = float(i), A = 0.0048*uSwirl/(1.0 + 0.55*fi);
    float c = cos(dot(K[i], p) + uSeed*(1.7 + fi) + uTime*(0.025 + 0.012*fi));
    v += A*c*vec2(K[i].y, -K[i].x);
  }
  float th = length(p);
  v += vec2(-p.y, p.x)*0.012*smoothstep(0.9, 1.5, th);       // along the horizon low down
  // the sun: concentric strokes on the disc, strokes radiating round it (in true angles, not the chart's)
  if (uSun.w > 0.0){
    float ts = length(uSun.xy); vec2 pr = uSun.xy/max(ts, 1e-4), pt = vec2(-pr.y, pr.x);
    float k = sin(ts)/max(ts, 1e-4);
    vec2 d = p - uSun.xy, dl = vec2(dot(d, pt)*k, dot(d, pr));
    float r = length(dl) + 1e-5, x = r/uSun.z; vec2 rn = dl/r;
    vec2 vl = vec2(-rn.y, rn.x)*0.03*smoothstep(1.12, 0.85, x) + rn*0.034*smoothstep(0.9, 1.15, x);
    v = mix(v, pt*vl.x/k + pr*vl.y, smoothstep(3.4, 1.6, x)*min(uSun.w, 1.0));
  }
  for (int i = 0; i < 4; i++){
    vec4 b = uBlast[i], Kb = uBlastK[i];
    if (b.z <= 0.0) continue;
    vec2 d = p - b.xy; float r = length(d) + 1e-4; vec2 rn = d/r; float x = r/b.z;
    v += vec2(-rn.y, rn.x)*b.w*Kb.x*exp(-x*x*0.5)*(r/(r + 0.25*b.z)) + rn*Kb.y*exp(-pow((r - Kb.z)/(0.35*b.z), 2.0));
  }
  float sp = length(v); if (sp > 0.05) v *= 0.05/sp;
  return v;
}
void vsLayer(vec2 p, vec2 v, vec2 fd, float sp, float ph, float seed, inout float bestZ, inout vec2 bestC, inout vec2 bestAL, inout vec2 bestD, inout vec4 bestH){
  float cyc = floor(ph), fr = ph - cyc; cyc = mod(cyc, 61.0);
  float grow = smoothstep(0.0, 0.3, 1.0 - abs(2.0*fr-1.0));
  vec2 q = (p - v*(fr-0.5)*VC_LIFE*0.22)/VC_CELL;   // a short drift: a steep current would tear the coat into seams
  vec2 ic = floor(q);
  float hl = 0.7*(1.0 + 9.0*sp);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 cell = ic + vec2(float(i), float(j));
    vec4 h = vsHash4(cell + vec2(seed*37.7 + cyc*5.13, cyc*9.71 - seed*11.3));
    vec2 d = q - (cell + 0.5 + (h.xy-0.5)*0.7);
    vec2 sd = normalize(fd + vec2(-fd.y,fd.x)*(h.z-0.5)*0.6);
    float L = min(1.15, hl*(0.75+0.5*h.w))*(0.72 + 0.28*grow), W = 0.24*(0.7+0.6*h.z)*(0.75+0.25*grow);
    float l = dot(d,sd)/max(L,1e-3), a = dot(d, vec2(-sd.y,sd.x))/W;
    float al = abs(l), aa = abs(a);
    if (aa < 1.0 && al < 1.0 && grow > 0.12){
      float en = 1.0 - 0.3*tnHash1(floor(a*4.0+4.0) + h.x*71.0);
      float z = fract(h.x*7.13 + h.y*3.71 + seed*0.37);
      if (al < en && aa < 1.0 - 0.45*pow(al/en, 5.0) && z > bestZ){ bestZ = z; bestC = p - d*VC_CELL; bestAL = vec2(a, l); bestD = sd; bestH = h; }
    }
  }
}
// the nearest stroke star: distance in star radii, its hash
float vsStar(vec2 p, out vec4 sh){
  float G = 0.15, best = 99.0; vec2 ic = floor(p/G); sh = vec4(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 cell = ic + vec2(float(i), float(j));
    vec4 h = vsHash4(cell*1.37 + uSeed*3.1 + 17.0);
    if (h.x > 0.5) continue;
    vec2 c = (cell + 0.2 + 0.6*h.yz)*G;
    float s = length(p - c)/(0.009 + 0.022*h.w*h.w);
    if (s < best){ best = s; sh = h; }
  }
  return best;
}
void vsPigment(vec2 cp, vec4 h, out vec3 c1, out vec3 c2, out float em){
  em = 0.0;
  float e = 1.5708 - length(cp), r = h.x, k = h.z;
  float g = smoothstep(0.0, 0.95, e + 0.05*sin(cp.x*6.0 + uSeed) + 0.04*sin(cp.y*9.0 - uSeed));
  vec3 A0 = mix(uHor[0], uZen[0], g), A1 = mix(uHor[1], uZen[1], g), A2 = mix(uHor[2], uZen[2], g);
  float psi = vsPsi(cp), b = 0.5 + 0.5*sin(psi*620.0 + 1.5*sin(psi*170.0 + 1.0));
  if (r < b*b*b*0.5 + 0.05){ c1 = k < 0.55 ? mix(A2, uAcc[0], 0.6) : mix(A1, uAcc[1], 0.6); c2 = k < 0.5 ? A2 : mix(A1, uAcc[0], 0.4); }
  else if (r < 0.6){ c1 = A0; c2 = k < 0.5 ? A1 : A2; }
  else if (r < 0.9){ c1 = A1; c2 = k < 0.5 ? A0 : mix(A1, A2, 0.5); }
  else { c1 = mix(A0, A1, 0.5)*0.78; c2 = A0*0.9; }
  // the warm glow low over the horizon where the sun went down
  float gd = dot(normalize(cp + vec2(1e-5, 0.0)), uGlow.xy);
  float ga = uGlow.z*exp(-pow(max(e, 0.0)/uGlow.w, 2.0))*smoothstep(-0.6, 1.0, gd);
  if (h.y < ga){ c1 = mix(c1, uGlowC*(k < 0.5 ? 1.0 : 1.15), 0.8); c2 = mix(c2, uGlowC, 0.55); }
  // stars
  if (uStars > 0.0 && e > 0.06){
    vec4 sh; float s = vsStar(cp, sh), on = uStars*smoothstep(0.06, 0.2, e);
    vec3 yel = vec3(0.86, 0.74, 0.26), wht = vec3(0.86, 0.86, 0.74), cer = vec3(0.44, 0.62, 0.78);
    if (s < 0.4 && h.w < on*1.2){ c1 = mix(yel, wht, 0.5 + 0.4*k); c2 = wht; em = 0.7*on; }
    else if (s < 1.25 && h.w < on){
      bool warm = mod(floor(s*2.6), 2.0) < 0.5 ^^ sh.w > 0.6;
      c1 = warm ? mix(yel, wht, 0.2) : mix(cer, wht, 0.4); c2 = warm ? yel : cer; em = (warm ? 0.3 : 0.12)*on;
    }
  }
  // the hills: lit lilac-blue strokes under a dark contour
  if (uHills.x > 0.0){
    float hc = vsHill(cp);
    if (e < hc){
      float dep = (hc - e)/max(hc, 1e-3);
      c1 = k < 0.45 ? uHillC[0] : (k < 0.8 ? mix(uHillC[0], uHillC[1], 0.6) : uHillC[1]);
      c2 = mix(uHillC[0], uHillC[2], 0.35 + 0.3*dep);
      if (hc - e < 0.006 + 0.004*h.w){ c1 = uHillC[2]; c2 = mix(uHillC[2], uHillC[0], 0.3); }
      c1 = mix(c1, uHillC[2], 0.25*smoothstep(0.4, 1.0, dep)*step(0.5, h.y));
    }
  }
  // the sun: concentric rings of chrome yellow and lemon, a halo of radiating yellow strokes
  if (uSun.w > 0.0){
    float x = acos(clamp(dot(vsDir(cp), uSunDir), -1.0, 1.0))/uSun.z;
    if (x < 1.0){
      float ring = mod(floor(x*4.0 + 0.5*h.y), 2.0);
      c1 = ring < 0.5 ? uSunC[0] : uSunC[1]; c2 = k < 0.5 ? uSunC[1] : uSunC[0]*1.05;
      em = max(em, (0.22 + 0.2*(1.0 - x))*uSun.w);
      if (x > 0.9){ c1 = mix(c1, uSunC[1]*0.8, 0.6); em *= 0.6; }                     // the darker rim of the disc
    } else if (h.y < 0.97*smoothstep(2.9, 1.0, x)*min(uSun.w, 1.0)){
      c1 = k < 0.4 ? uSunC[2] : (k < 0.75 ? mix(uSunC[1], uSunC[2], 0.5) : mix(uSunC[2], A2, 0.5)); c2 = mix(c1, A0, 0.45); em = max(em, 0.22*smoothstep(2.3, 1.0, x)*uSun.w);
    }
  }
  // the blasts: a shock ring of the planet's pigment running out
  for (int i = 0; i < 4; i++){
    vec4 bb = uBlast[i], Kb = uBlastK[i];
    if (bb.z <= 0.0 || Kb.w <= 0.0) continue;
    float rb = length(cp - bb.xy);
    float shock = exp(-pow((rb - Kb.z)/(0.16*bb.z), 2.0))*min(1.0, Kb.w);
    if (h.y < shock*0.85){ c1 = k < 0.55 ? uBlastC[i] : mix(uBlastC[i], vec3(0.9, 0.85, 0.6), 0.5); c2 = mix(uBlastC[i], vec3(0.88, 0.76, 0.3), 0.4); em = max(em, 0.8*Kb.w); }
  }
  float j = 0.86 + 0.28*h.w; c1 *= j; c2 *= j;
}
void main(){
  vec3 dir = normalize(vDir);
  float th = acos(clamp(dir.y,-1.0,1.0));
  vec2 az = normalize(dir.xz + vec2(1e-5,0.0));
  vec2 p = az*th;
  vec2 v = vsVel(p); float sp = length(v); vec2 fd = v/max(sp,1e-5);
  float bestZ = -1.0; vec2 bestC = p, bestAL = vec2(0.0), bestD = fd; vec4 bestH = vec4(0.0);
  float ph = uTime/VC_LIFE;
  vsLayer(p, v, fd, sp, ph, 0.0, bestZ, bestC, bestAL, bestD, bestH);
  vsLayer(p, v, fd, sp, ph + 0.333, 1.0, bestZ, bestC, bestAL, bestD, bestH);
  vsLayer(p, v, fd, sp, ph + 0.667, 2.0, bestZ, bestC, bestAL, bestD, bestH);
  vec3 alb, emis = vec3(0.0), bump = vec3(0.0); float mask = 0.0;
  float e = 1.5708 - th, g = smoothstep(0.0, 0.95, e);
  if (bestZ >= 0.0){
    vec3 c1, c2; float em; vsPigment(bestC, bestH, c1, c2, em);
    float a = bestAL.x, l = bestAL.y;
    float bi = floor(a*3.5 + 3.5), hb = tnHash1(bi + bestH.z*91.0);
    float load = smoothstep(0.25, 0.75, hb + 0.35*l*(bestH.w - 0.5));
    alb = mix(c1, c2, load*0.85);
    float hb3 = tnHash1(bi*5.7 + bestH.x*33.0);
    alb = mix(alb, mix(c1, vec3(0.9, 0.88, 0.76), 0.35), step(0.86, hb3)*smoothstep(-0.2, 0.6, l)*0.5);   // a third tone on a few bristles
    alb *= 0.86 + 0.22*tnHash1(bi*3.1 + bestH.y*57.0) + 0.06*sin(l*14.0 + bi*2.0);
    alb *= 1.0 - 0.28*smoothstep(0.6, 0.97, abs(a)) - 0.2*smoothstep(0.75, 1.0, abs(l));                  // the darker rim
    float sl = tnSlope(a, bestH.w) + 0.12*sin(a*11.0 + bestH.x*30.0);
    vec2 gg = vec2(-bestD.y, bestD.x)*sl;
    vec3 eth = vec3(az.x*cos(th), -sin(th), az.y*cos(th)), eph = vec3(-az.y, 0.0, az.x);
    bump = eth*dot(gg,az) + eph*dot(gg, vec2(-az.y,az.x));
    mask = 1.0;
    emis = alb*em*(0.7 + 0.5*tnProf(a, bestH.w));
  } else {
    alb = mix(uHor[0], uZen[0], g)*0.72;
    if (uHills.x > 0.0 && e < vsHill(p)) alb = mix(uHillC[0], uHillC[2], 0.5)*0.8;
  }
  // per pixel: the sun's glow, the white centre of each star, the blasts' glow
  if (uSun.w > 0.0){
    float x = acos(clamp(dot(dir, uSunDir), -1.0, 1.0))/uSun.z;
    emis += uSunC[1]*uSun.w*(0.08*smoothstep(1.02, 0.6, x) + 0.05*exp(-x*0.9));
  }
  if (uStars > 0.0){
    vec4 sh; float s = vsStar(p, sh);
    emis += vec3(1.1, 1.05, 0.85)*uStars*smoothstep(0.06, 0.2, e)*0.9*exp(-s*s*30.0);
  }
  for (int i = 0; i < 4; i++){
    vec4 bb = uBlast[i]; float gl = uBlastG[i].x;
    if (bb.z <= 0.0 || gl <= 0.0) continue;
    float x = length(p - bb.xy)/bb.z;
    emis += (uBlastC[i]*0.7 + vec3(0.22))*gl*(0.35*exp(-x*x*3.0) + 0.06*exp(-x*1.5))*(0.5 + alb*1.2);
  }
  vec3 n = normalize(-dir - bump*uBump);
  vec3 nv = normalize(mat3(viewMatrix)*n);
  vec3 col = tnGallery(alb, emis, nv, mask)*uGain;
  col = mix(col, fogColor, 0.3*smoothstep(0.08, -0.02, dir.y));
  gl_FragColor = vec4(col*tnWeave(uWeave), 1.0);
}`;

// the dome's uniforms; set(): every pigment and knob from a plain object, each frame
export function makeSky(fogU, weave, seed) {
  const V3 = () => new THREE.Vector3(), C3 = (n) => Array.from({ length: n }, () => new THREE.Color());
  const u = Object.assign(fogU, {
    uTime: { value: 0 }, uGain: { value: 1 }, uWeave: weave, uBump: { value: 0.85 }, uSeed: { value: seed }, uCell: { value: 0.0125 }, uStars: { value: 0 }, uSwirl: { value: 1 },
    uHor: { value: C3(3) }, uZen: { value: C3(3) }, uAcc: { value: C3(2) },
    uSun: { value: new THREE.Vector4(0, 0, 0.1, 0) }, uSunDir: { value: V3() }, uSunC: { value: C3(3) },
    uGlow: { value: new THREE.Vector4(1, 0, 0, 0.2) }, uGlowC: { value: new THREE.Color() },
    uHills: { value: new THREE.Vector4(0, 0, 0, 0) }, uHillC: { value: C3(3) },
    uBlast: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uBlastK: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
    uBlastG: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uBlastC: { value: C3(4) },
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), new THREE.ShaderMaterial({
    uniforms: u, vertexShader: DOME_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: true,
  }));
  dome.renderOrder = -1; dome.frustumCulled = false; dome.name = 'sky';
  return { dome, u };
}

// a palette that changes with time: keys [[t, {name: Color | number}], ...], sampled with smooth steps between keys
export function keyed(keys) {
  return (t, name, out) => {
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const [t0, A] = keys[i], [t1, B] = keys[i + 1];
    let f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); f = f * f * (3 - 2 * f);
    const a = A[name], b = B[name];
    if (typeof a === 'number') return a + (b - a) * f;
    return out.copy(a).lerp(b, f);
  };
}

// stroke-set builders for FIELD_VS (vg-crows' layout) and BLOOM_VS (vg-almond's layout)
function instanced(attrs, count, mat, segs, dynamic) {
  const g0 = new THREE.PlaneGeometry(2, 2, segs, 1), geo = new THREE.InstancedBufferGeometry();
  geo.index = g0.index; geo.setAttribute('position', g0.getAttribute('position'));
  for (const [nm, a, n] of attrs) {
    const b = new THREE.InstancedBufferAttribute(new Float32Array(a), n); if (dynamic) b.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(nm, b);
  }
  geo.instanceCount = count;
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m;
}
export function fieldSet() {
  const P = [], D = [], C = [], T = [], X = [], H = [];
  const s = {
    count: 0,
    // kind 0 static (centre, half vector) | 1 stalk (base, lean x, height, lean z); half width; pigment, second, load, hash, start, flex, emissive
    add(kind, px, py, pz, dx, dy, dz, hw, c1, c2, load, hs, t0 = 0, flex = 0, em = 0) {
      P.push(px, py, pz, kind); D.push(dx, dy, dz, hw); C.push(c1.r, c1.g, c1.b, em); T.push(c2.r, c2.g, c2.b, load); X.push(t0, flex); H.push(hs, 0); s.count++;
    },
    mesh(mat, segs, dynamic) { return instanced([['aP', P, 4], ['aD', D, 4], ['aC', C, 4], ['aT', T, 4], ['aX', X, 2], ['aH', H, 2]], s.count, mat, segs, dynamic); },
  };
  return s;
}
export function bloomSet() {
  const P = [], D = [], N = [], T = [], C = [], C2 = [], S = [];
  const s = {
    count: 0,
    // centre, half axis, half width, plane normal + arc, tube offset/radius/tilt/mode, pigment, emissive, second, load, sway amp, phase, hash
    add(px, py, pz, dx, dy, dz, hw, nx, ny, nz, arc, to, tr, tilt, mode, c1, em, c2, load, amp, ph, hs) {
      P.push(px, py, pz, hs); D.push(dx, dy, dz, hw); N.push(nx, ny, nz, arc); T.push(to, tr, tilt, mode);
      C.push(c1.r, c1.g, c1.b, em); C2.push(c2.r, c2.g, c2.b, load); S.push(amp, ph); s.count++;
    },
    mesh(mat, segs) { return instanced([['aP', P, 4], ['aD', D, 4], ['aN', N, 4], ['aT', T, 4], ['aC', C, 4], ['aC2', C2, 4], ['aS', S, 2]], s.count, mat, segs); },
  };
  return s;
}
