// VG CROWS: shaders for "Wheatfield with Crows" (world: src/worlds/vg-crows.js).
// Painted by the same hand as the-turning-night: its stroke relief, bristle-cut ends and gallery light (the GLSL
// helpers are taken straight out of that world's STROKE_FS, so a change there carries over here), its canvas weave.
// Three pieces:
//   STORM_DOME  the storm sky: a dome of short swirling impasto strokes on a slow curl-noise current (three
//               layers, so the coverage is dense), deep ultramarine overhead, cobalt and cerulean lower down, two
//               pale cloud masses that turn slowly on themselves. Each stroke carries 2-3 tones across its bristles.
//   FIELD_VS    instanced capsule strokes: 0 static (crows, flat dashes), 1 wheat stalk/ear bent by travelling
//               gusts of wind that also lighten the crest of each wave, parting round the lens.
//   STROKE2_FS  the turning-night stroke fragment with bristle streaks and a second pigment across the bristles.
//   GROUND_*    the painted underlayer of the field: brick-laid dashes in the vertex colour, mostly hidden.
import { STROKE_FS } from '../worlds/the-turning-night.js';

// tnHash1, tnProf, tnSlope, tnGallery, tnWeave: the turning night's own brush, lifted from its fragment shader
const i0 = STROKE_FS.indexOf('float tnHash1'), i1 = STROKE_FS.indexOf('void main');
export const TN_COMMON = i0 >= 0 && i1 > i0 ? STROKE_FS.slice(i0, i1) : '';
if (!TN_COMMON) throw new Error('vg-crows: the-turning-night STROKE_FS has changed shape');

const HASH4 = /* glsl */`vec4 vcHash4(vec2 p){ vec4 p4 = fract(p.xyxy*vec4(.1031,.1030,.0973,.1099)); p4 += dot(p4, p4.wzxy+33.33); return fract((p4.xxyz+p4.yzzw)*p4.zywx); }`;

// ---------------- the storm sky ----------------
export const DOME_VS = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0);
  if (abs(p.w) < 1e-4) p.w = 1e-4;
  gl_Position = p.xyww;
}`;
export const DOME_FS = /* glsl */`
varying vec3 vDir;
uniform float uTime, uGain, uWeave, uBump, uSeed;
uniform vec3 uSky[9];        // deep, ultra, cobalt, cer, pale, white, greenblue, teal-black, ochre
uniform vec4 uCloud[2];      // chart x, y, radius, strength
uniform vec4 uCloudE[2];     // ellipse axis x, y, aspect, spin
uniform vec3 fogColor;
${TN_COMMON}
${HASH4}
#define VC_CELL 0.019
#define VC_LIFE 7.0
// slow current in the azimuthal-equidistant chart (rad/s): curl of a few drifting waves, each cloud a slow eddy,
// and a horizontal drift near the horizon
vec2 vcVel(vec2 p){
  vec2 v = vec2(0.0);
  vec2 K[5]; K[0] = vec2(3.1, 1.7); K[1] = vec2(-2.3, 4.1); K[2] = vec2(5.3, -2.9); K[3] = vec2(-6.7, -4.3); K[4] = vec2(9.1, 6.2);
  for (int i = 0; i < 5; i++){
    float fi = float(i), A = 0.0048/(1.0 + 0.55*fi);
    float c = cos(dot(K[i], p) + uSeed*(1.7 + fi) + uTime*(0.025 + 0.012*fi));
    v += A*c*vec2(K[i].y, -K[i].x);
  }
  for (int i = 0; i < 2; i++){
    vec2 d = p - uCloud[i].xy; float R = uCloud[i].z*1.3;
    float e = exp(-dot(d, d)/(R*R));
    v += uCloudE[i].w*0.035*e*vec2(-d.y, d.x)/R;
  }
  float th = length(p);
  v += vec2(-p.y, p.x)*0.012*smoothstep(0.9, 1.5, th);
  float sp = length(v); if (sp > 0.05) v *= 0.05/sp;
  return v;
}
float vcPsi(vec2 p){
  vec2 K[5]; K[0] = vec2(3.1, 1.7); K[1] = vec2(-2.3, 4.1); K[2] = vec2(5.3, -2.9); K[3] = vec2(-6.7, -4.3); K[4] = vec2(9.1, 6.2);
  float s = 0.0;
  for (int i = 0; i < 5; i++){ float fi = float(i); s += 0.0048/(1.0 + 0.55*fi)*sin(dot(K[i], p) + uSeed*(1.7 + fi) + uTime*(0.025 + 0.012*fi)); }
  return s;
}
void vcLayer(vec2 p, vec2 v, vec2 fd, float sp, float ph, float seed, inout float bestZ, inout vec2 bestC, inout vec2 bestAL, inout vec2 bestD, inout vec4 bestH){
  float cyc = floor(ph), fr = ph - cyc; cyc = mod(cyc, 61.0);
  float grow = smoothstep(0.0, 0.3, 1.0 - abs(2.0*fr-1.0));
  vec2 q = (p - v*(fr-0.5)*VC_LIFE)/VC_CELL;
  vec2 ic = floor(q);
  float hl = 0.7*(1.0 + 9.0*sp);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 cell = ic + vec2(float(i), float(j));
    vec4 h = vcHash4(cell + vec2(seed*37.7 + cyc*5.13, cyc*9.71 - seed*11.3));
    vec2 d = q - (cell + 0.5 + (h.xy-0.5)*0.7);
    vec2 sd = normalize(fd + vec2(-fd.y,fd.x)*(h.z-0.5)*0.5);
    float L = min(1.15, hl*(0.75+0.5*h.w))*(0.72 + 0.28*grow), W = 0.24*(0.7+0.6*h.z)*(0.75+0.25*grow);   // never a speck
    float l = dot(d,sd)/max(L,1e-3), a = dot(d, vec2(-sd.y,sd.x))/W;
    float al = abs(l), aa = abs(a);
    if (aa < 1.0 && al < 1.0 && grow > 0.12){
      float en = 1.0 - 0.3*tnHash1(floor(a*4.0+4.0) + h.x*71.0);
      float z = fract(h.x*7.13 + h.y*3.71 + seed*0.37);
      if (al < en && aa < 1.0 - 0.45*pow(al/en, 5.0) && z > bestZ){ bestZ = z; bestC = p - d*VC_CELL; bestAL = vec2(a, l); bestD = sd; bestH = h; }
    }
  }
}
float vcCloud(vec2 cp){
  float m = 0.0;
  for (int i = 0; i < 2; i++){
    vec2 d = cp - uCloud[i].xy, ex = uCloudE[i].xy, ey = vec2(-ex.y, ex.x);
    vec2 dl = vec2(dot(d, ex), dot(d, ey)*uCloudE[i].z)/uCloud[i].z;
    float ang = atan(dl.y, dl.x), rr = length(dl);
    rr *= 1.0 + 0.22*sin(ang*3.0 + uSeed + float(i)*2.0) + 0.12*sin(ang*7.0 - uSeed*1.3) + 0.08*sin(ang*13.0 + float(i));
    m = max(m, uCloud[i].w*exp(-rr*rr*1.8));
  }
  return m;
}
// two pigments per stroke (main, second across the bristles), chosen at the stroke centre
void vcPigment(vec2 cp, vec4 h, out vec3 c1, out vec3 c2){
  vec3 deep = uSky[0], ultra = uSky[1], cob = uSky[2], cer = uSky[3], pale = uSky[4], wht = uSky[5], gb = uSky[6], tb = uSky[7], och = uSky[8];
  float e = 1.5708 - length(cp);
  float D = smoothstep(0.08, 0.95, e);
  // colour runs along the streamlines: bands of the stream function carry the lighter blues, so the light strokes
  // gather in swirling rivers instead of lying about like snow
  float psi = vcPsi(cp), b = 0.5 + 0.5*sin(psi*620.0 + 1.5*sin(psi*170.0 + 1.0));
  float light = b*b*b*(1.0 - 0.6*D) + 0.06;
  float r = h.x;
  if (r < light*0.8){
    float k = h.z;
    c1 = k < 0.4 ? mix(cer, cob, 0.35 + 0.4*D) : (k < 0.7 ? cob*1.25 : (k < 0.9 ? mix(gb*1.5, cer, 0.4) : mix(cer, pale, 0.4)));
    c2 = k < 0.5 ? cob : mix(cer, cob, 0.6);
  } else {
    float k = fract(r*5.3);
    if (k < 0.34){ c1 = mix(cob, ultra, D); c2 = mix(ultra*1.1, deep, D); }
    else if (k < 0.62){ c1 = mix(ultra*1.25, deep*1.4, D); c2 = mix(cob*0.9, ultra, D); }
    else if (k < 0.82){ c1 = mix(gb, ultra, 0.3 + 0.5*D); c2 = mix(cob, tb*1.4, D); }
    else { c1 = mix(cob*1.1, ultra*1.2, D); c2 = mix(gb, deep*1.3, D); }
  }
  // the lower sky: lighter runs along the horizon (green-blue, cerulean, a pale streak) in slow patches, so it is
  // never one dark band
  float hz = 1.0 - smoothstep(0.03, 0.42, e);
  if (hz > 0.0){
    float azm = atan(cp.y, cp.x);
    float bn = 0.5 + 0.5*sin(azm*5.0 + 2.2*sin(azm*2.0 + uSeed) + e*9.0)*cos(azm*11.0 - e*14.0 + uSeed*0.6);
    float hz2 = fract(h.w*7.7 + h.x*2.3), k = h.z;
    if (hz2 < hz*0.85*smoothstep(0.25, 0.75, bn)){
      c1 = k < 0.35 ? mix(gb*1.7, cer, 0.35) : (k < 0.65 ? cer*1.05 : (k < 0.85 ? mix(cer, pale, 0.45) : mix(gb*1.4, och*1.3, 0.3)));
      c2 = k < 0.5 ? mix(cob, gb*1.5, 0.5) : mix(cer, cob, 0.5);
    } else if (hz2 < hz*0.45){ c1 = mix(cob*1.15, gb*1.3, 0.5); c2 = mix(ultra, tb*1.4, 0.4); }
  }
  float m = vcCloud(cp);
  float hy = fract(h.y*13.7 + h.w*3.1);
  if (hy < smoothstep(0.12, 0.7, m)){
    float k = h.z;
    c1 = k < 0.42 ? pale : (k < 0.66 ? wht : (k < 0.86 ? mix(cer, pale, 0.5) : mix(pale, och*1.6, 0.35)));
    c2 = k < 0.5 ? mix(cer, pale, 0.3) : (k < 0.8 ? pale*0.85 : mix(cob, cer, 0.6));
  } else if (hy < smoothstep(0.02, 0.35, m)*0.9){                 // the cloud's ragged blue-grey rim
    c1 = mix(cer, cob, h.z*0.6); c2 = mix(pale, cer, 0.5);
  }
  float j = 0.84 + 0.32*h.w; c1 *= j; c2 *= j;
}
void main(){
  vec3 dir = normalize(vDir);
  float th = acos(clamp(dir.y,-1.0,1.0));
  vec2 az = normalize(dir.xz + vec2(1e-5,0.0));
  vec2 p = az*th;
  vec2 v = vcVel(p); float sp = length(v); vec2 fd = v/max(sp,1e-5);
  float bestZ = -1.0; vec2 bestC = p, bestAL = vec2(0.0), bestD = fd; vec4 bestH = vec4(0.0);
  float ph = uTime/VC_LIFE;
  vcLayer(p, v, fd, sp, ph, 0.0, bestZ, bestC, bestAL, bestD, bestH);
  vcLayer(p, v, fd, sp, ph + 0.333, 1.0, bestZ, bestC, bestAL, bestD, bestH);
  vcLayer(p, v, fd, sp, ph + 0.667, 2.0, bestZ, bestC, bestAL, bestD, bestH);
  vec3 alb, emis = vec3(0.0), bump = vec3(0.0); float mask = 0.0;
  if (bestZ >= 0.0){
    vec3 c1, c2; vcPigment(bestC, bestH, c1, c2);
    float a = bestAL.x, l = bestAL.y;
    // bristle streaks: each of ~7 bristles carries its own load of the two pigments, thinning toward the tail
    float bi = floor(a*3.5 + 3.5), hb = tnHash1(bi + bestH.z*91.0);
    float load = smoothstep(0.25, 0.75, hb + 0.35*l*(bestH.w - 0.5));
    alb = mix(c1, c2, load*0.85);
    alb *= 0.86 + 0.22*tnHash1(bi*3.1 + bestH.y*57.0) + 0.06*sin(l*14.0 + bi*2.0);
    float sl = tnSlope(a, bestH.w) + 0.12*sin(a*11.0 + bestH.x*30.0);
    vec2 g = vec2(-bestD.y, bestD.x)*sl;
    vec3 eth = vec3(az.x*cos(th), -sin(th), az.y*cos(th)), eph = vec3(-az.y, 0.0, az.x);
    bump = eth*dot(g,az) + eph*dot(g, vec2(-az.y,az.x));
    mask = 1.0;
    emis = alb*0.12*vcCloud(bestC);
  } else {
    alb = mix(uSky[1]*0.95, uSky[2]*0.7, 1.0 - smoothstep(0.1, 0.9, 1.5708 - th));
  }
  vec3 n = normalize(-dir - bump*uBump);
  vec3 nv = normalize(mat3(viewMatrix)*n);
  vec3 col = tnGallery(alb, emis, nv, mask)*uGain;
  col = mix(col, fogColor, 0.3*smoothstep(0.08, -0.02, dir.y));
  gl_FragColor = vec4(col*tnWeave(uWeave), 1.0);
}`;

// ---------------- instanced strokes ----------------
// aP: xyz centre/base, w kind.  aD: xyz half vector (kind 0) or (lean x, height, lean z) (kind 1), w half width.
// aC: rgb pigment, a emissive.  aT: rgb second pigment, a bristle load.  aX: x start fraction along the stalk, y flex.
// aH: x hash, y (kind 1) fraction of the stalk left above the stroke's top.
export const FIELD_VS = /* glsl */`
attribute vec4 aP, aD, aC, aT; attribute vec2 aX, aH;
uniform float uTime, uMinW;
uniform vec4 uWind;          // xy wind direction, z strength, w gust strength
varying vec2 vUv; varying vec4 vCol; varying float vId; varying vec3 vSideV, vAxisV; varying vec4 vCol2;
#include <fog_pars_vertex>
// travelling gusts: wave trains running down the wind with a slowly wandering front, 0..1
float vcGust(vec2 xz){
  float ph = dot(xz, uWind.xy), q = dot(xz, vec2(-uWind.y, uWind.x));
  float g = 0.55*sin(ph*0.19 - uTime*1.55 + 1.4*sin(q*0.045 + uTime*0.21) + 0.6*sin(q*0.13 - ph*0.05))
          + 0.30*sin(ph*0.47 - uTime*2.9 + 0.8*sin(q*0.21))
          + 0.15*sin(ph*1.1 - uTime*4.3 + q*0.3);
  return clamp(0.5 + 0.55*g, 0.0, 1.0);
}
vec3 vcStalk(vec3 C, float t, float H, vec2 lean){
  float lt = length(lean)*t;
  return C + vec3(lean.x*t*t*H, H*t*sqrt(max(0.15, 1.0 - 0.55*lt*lt)), lean.y*t*t*H);
}
void main(){
  float kind = aP.w, l = position.x, hw = aD.w, hs = aH.x;
  vec3 C = aP.xyz, P, ax; vec3 col = aC.rgb, col2 = aT.rgb;
  if (kind < 0.5){
    vec3 d = aD.xyz; float hl = max(length(d), 1e-5); ax = d/hl; P = C + d*l;
  } else {
    float g = vcGust(C.xz);
    vec2 lean = vec2(aD.x, aD.z) + uWind.xy*aX.y*(uWind.z + uWind.w*g)
              + 0.05*aX.y*vec2(sin(uTime*2.7 + hs*40.0), cos(uTime*2.3 + hs*31.0));
    vec2 dc = C.xz - cameraPosition.xz; float dd = length(dc);
    lean += dc/max(dd, 0.05)*1.4*smoothstep(1.5, 0.2, dd)*step(cameraPosition.y - C.y, aD.y*1.8);   // parting round the lens
    float t = mix(aX.x, 1.0 - aH.y, l*0.5 + 0.5);   // aH.y: the stroke stops that far short of the top (a kernel on the ear)
    P = vcStalk(C, t, aD.y, lean);
    ax = normalize(vcStalk(C, min(t + 0.03, 1.03), aD.y, lean) - P + vec3(0.0, 1e-5, 0.0));
    float crest = smoothstep(0.45, 1.0, g);
    col *= 0.86 + 0.34*crest; col2 *= 0.9 + 0.3*crest;        // the crest of a gust shows the pale side of the ears
  }
  vec3 toC = cameraPosition - P; float dist = max(length(toC), 1e-3);
  vec3 side = normalize(cross(ax, toC/dist) + vec3(1e-5, 0.0, 0.0));
  hw = max(hw, dist*uMinW);
  P += side*position.y*hw;
  vec4 mvPosition = viewMatrix*vec4(P, 1.0);
  gl_Position = projectionMatrix*mvPosition;
  vUv = position.xy; vCol = vec4(col, aC.a); vCol2 = vec4(col2, aT.a); vId = hs;
  vSideV = mat3(viewMatrix)*side; vAxisV = mat3(viewMatrix)*ax;
  #include <fog_vertex>
}`;
// the turning night's stroke fragment, with bristle streaks and a second pigment carried by some bristles
export const STROKE2_FS = /* glsl */`
varying vec2 vUv; varying vec4 vCol; varying float vId; varying vec3 vSideV, vAxisV; varying vec4 vCol2;
uniform float uGain, uWeave;
uniform vec3 uFlash;
#include <fog_pars_fragment>
${TN_COMMON}
void main(){
  float a = vUv.y, al = abs(vUv.x);
  float en = 1.0 - 0.28*tnHash1(floor(a*4.0+4.0) + vId*71.0);
  float q = al/en;
  if (al > en || abs(a) > 1.0 - 0.45*q*q*q*q*q) discard;
  vec3 sv = normalize(vSideV + vec3(1e-5,0.0,0.0)), nf = normalize(cross(sv, normalize(vAxisV + vec3(0.0,1e-5,0.0))) + vec3(0.0,0.0,1e-5));
  if (nf.z < 0.0) nf = -nf;
  nf = normalize(mix(nf, vec3(0.0,0.0,1.0), 0.5));
  float bi = floor(a*3.5 + 3.5), hb = tnHash1(bi + vId*91.0);
  float sl = tnSlope(a, vId) + 0.3*sin(a*21.0 + vId*40.0);
  vec3 nv = normalize(nf - sv*sl*0.9);
  float load = smoothstep(0.3, 0.7, hb + 0.4*vUv.x*(fract(vId*7.3) - 0.5))*vCol2.a;
  vec3 alb = mix(vCol.rgb, vCol2.rgb, load);
  alb *= (0.86 + 0.24*tnHash1(bi*3.1 + vId*57.0) + 0.05*sin(vUv.x*12.0 + bi*2.3))*(1.0 - 0.35*smoothstep(0.62, 0.95, abs(a)));
  float pr = tnProf(a, vId);
  vec3 emis = alb*vCol.a*(0.6+0.5*pr);
  gl_FragColor = vec4((tnGallery(alb, emis, nv, 1.0) + alb*uFlash)*uGain*tnWeave(uWeave), 1.0);
  #include <fog_fragment>
}`;

// ---------------- the painted underlayer ----------------
export const GROUND_VS = /* glsl */`
attribute vec3 color;
varying vec3 vW, vC;
#include <fog_pars_vertex>
void main(){
  vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vC = color;
  vec4 mvPosition = viewMatrix*wp;
  gl_Position = projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
export const GROUND_FS = /* glsl */`
varying vec3 vW, vC;
uniform float uGain, uWeave;
uniform vec4 uWind;
#include <fog_pars_fragment>
${TN_COMMON}
vec3 dashes(vec2 uv, float s, out float sl){
  vec2 q = uv/vec2(0.9*s, 0.34*s);
  float row = floor(q.y); q.x += tnHash1(row*1.37 + s)*9.0;
  float cell = floor(q.x), h = tnHash1(cell*7.31 + row*3.17 + s*5.0), h2 = tnHash1(cell*1.93 + row*9.41);
  float a = fract(q.y)*2.0 - 1.0, l = fract(q.x)*2.0 - 1.0;
  vec3 c = vC*(0.7 + 0.55*h);
  c *= mix(vec3(1.0), vec3(0.75, 0.9, 1.25), step(h2, 0.15));
  c *= mix(vec3(1.0), vec3(1.25, 1.1, 0.75), step(0.85, h2));
  if (abs(l) > 1.0 - 0.3*tnHash1(floor(a*3.0+3.0) + h*71.0) || abs(a) > 0.9) c = vC*0.72;
  sl = tnSlope(a, h);
  return c;
}
void main(){
  float dist = length(vW - cameraPosition);
  vec2 w2 = normalize(uWind.xy + vec2(1e-4, 0.0)), q2 = vec2(-w2.y, w2.x);
  vec2 pw = vW.xz + 3.0*vec2(sin(vW.z*0.21), sin(vW.x*0.17));
  vec2 uv = vec2(dot(pw, q2), dot(pw, w2));
  float fp = length(fwidth(vW.xz));
  float lv = log2(max(0.15, fp*14.0)), s = exp2(floor(lv)), f = fract(lv);
  float sa, sb; vec3 col = mix(dashes(uv, s, sa), dashes(uv, s*2.0, sb), f);
  float sl = mix(sa, sb, f)*(1.0 - smoothstep(4.0, 16.0, s));
  col = mix(col, vC*0.92, smoothstep(8.0, 32.0, s));
  vec3 nv = normalize(vec3(0.0, 0.35, 1.0) + vec3(0.0, sl*0.4, 0.0));
  gl_FragColor = vec4(tnGallery(col, vec3(0.0), nv, 0.2)*uGain*tnWeave(uWeave), 1.0);
  #include <fog_fragment>
}`;
