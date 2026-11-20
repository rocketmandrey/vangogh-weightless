// VG ALMOND: shaders for "Almond Blossom" (world: src/worlds/vg-almond.js).
// The same hand as the-turning-night, through vg-crows: its stroke fragment (STROKE2_FS: ragged bristle ends, ridge
// relief, two pigments across the bristles, gallery light, canvas weave) on every instanced stroke, and its storm
// dome (three coats of short strokes on a slow curl current) repainted here as the flat turquoise sky of the 1890
// canvas: new pigments (vaPigment), a finer cell, darker rims and a third tone on the bristles, no clouds.
//   SKY_FS     the dome fragment (DOME_VS from vg-crows is the vertex).
//   BLOOM_VS   instanced strokes in three manners, all swaying with their branch (aS: amplitude, phase):
//              tube  (aT.y = radius > 0) laid across a branch's silhouette at aT.x of its radius and pushed onto the
//                    near face of the cylinder, so from any side a branch is a bundle of strokes with dark edges;
//              flat  (|aN.xyz| = 1) lying in a plane (petals in the flower's own plane), aN.w a slight arc;
//              free  billboards (buds, calyces, stamens); aT.w = 1 makes a drifting petal that tumbles down
//                    through the box uBox/uBoxS (wrapping, faded at the walls); aT.w = 2 a petal the gust tears off
//                    (sits at its flower aP until aS.x s, then flies on a swirl to aN.xyz in aT.x s and drifts on downwind,
//                    the nearer the lens the smaller, so a cloud of them never puts a slab over the lens).
//              uGust (dir.x, dir.z, front, strength): a gust whose front runs along dir (front = how far along dir it has
//              come); what it passes bends downwind by its sway amplitude, in a wave and then a lean. A negative
//              amplitude marks a blade of grass: it sways and bends from its foot (the stroke's -1 end) instead of moving whole.
//              (worlds that do not set uGust read it as 0: no gust)
import { DOME_FS, STROKE2_FS } from './vg-crows.js';

export { DOME_VS, STROKE2_FS } from './vg-crows.js';

// ---------------- the sky ----------------
// uSky: 0 deep blue, 1 underpaint, 2 dark underpaint, 3 soft blue, 4 dawn pink, 5 pale yellow,
// 6 cerulean, 7 blue-green, 8 cream. uLight: xz chart direction of the lighter part of the sky, strength.
const PIGMENT = /* glsl */`
uniform vec3 uLight;
void vcPigment(vec2 cp, vec4 h, out vec3 c1, out vec3 c2){
  vec3 deep = uSky[0], tq = uSky[3], ltq = uSky[4], pale = uSky[5], cer = uSky[6], bg = uSky[7], cream = uSky[8];
  float e = 1.5708 - length(cp);
  // big soft patches of the same blue laid at different times: lighter, greener, bluer
  float pa = sin(cp.x*5.3 + 1.7*sin(cp.y*3.1 + uSeed)) + sin(cp.y*4.7 - 1.3*sin(cp.x*2.3 - uSeed));
  float pb = sin(cp.x*9.1 - cp.y*7.3 + uSeed*2.0) + 0.6*sin(cp.x*13.7 + cp.y*11.1);
  float lit = uLight.z*smoothstep(-0.4, 1.0, dot(normalize(cp + vec2(1e-5, 0.0)), uLight.xy))*smoothstep(1.2, 0.0, e);
  float L = clamp(0.38 + 0.2*pa + 0.5*lit - 0.25*smoothstep(0.5, 1.4, e), 0.0, 1.0);
  float r = h.x, k = h.z;
  float yl = smoothstep(0.9, 0.15, e);                  // dawn: pale yellow low over the horizon, pink above it
  if (r < L*0.75){                                       // the light strokes
    c1 = k < 0.35 ? mix(ltq, pale, yl) : (k < 0.6 ? mix(cream, pale, yl) : (k < 0.85 ? mix(pale, ltq, 0.35) : mix(cer, cream, 0.5)));
    c2 = k < 0.5 ? mix(c1, tq, 0.4) : mix(ltq, pale, 0.5);
  } else if (r < 0.94){                                  // the body of the sky
    c1 = k < 0.5 ? tq : (k < 0.75 ? mix(tq, cer, 0.5 + 0.3*sin(pb)) : mix(tq, bg, 0.6));
    c2 = k < 0.4 ? ltq : (k < 0.8 ? mix(tq, cer, 0.6) : bg);
    if (pb > 0.9) c1 = mix(c1, cer, 0.45);
  } else {                                               // the few dark ones
    c1 = k < 0.5 ? mix(cer, deep, 0.5) : mix(bg, deep, 0.4);
    c2 = mix(tq, cer, 0.5);
  }
  float j = 0.88 + 0.24*h.w; c1 *= j; c2 *= j;
}
`;
const p0 = DOME_FS.indexOf('void vcPigment'), p1 = DOME_FS.indexOf('void main');
const SD_A = 'vec2 sd = normalize(fd + vec2(-fd.y,fd.x)*(h.z-0.5)*0.5);';
const RIM_A = 'alb = mix(c1, c2, load*0.85);';
const RIM_B = `alb = mix(c1, c2, load*0.85);
    float hb3 = tnHash1(bi*5.7 + bestH.x*33.0);
    alb = mix(alb, uSky[5]*0.95, step(0.86, hb3)*smoothstep(-0.2, 0.6, l)*0.55);      // a third tone on a few bristles
    alb *= 1.0 - 0.26*smoothstep(0.6, 0.97, abs(a)) - 0.2*smoothstep(0.75, 1.0, abs(l));  // the darker rim of a loaded stroke`;
if (p0 < 0 || p1 < p0 || !DOME_FS.includes(RIM_A) || !DOME_FS.includes(SD_A) || !DOME_FS.includes('#define VC_CELL 0.019')) throw new Error('vg-almond: vg-crows DOME_FS has changed shape');
const EDDY = /* glsl */`
float vaEddy(vec2 p){ float th = length(p), az = atan(p.y, p.x);
  return 0.0032*sin(az*13.0 + uSeed + 0.04*uTime)*sin(th*13.0 - 0.4 + 0.03*uTime)*smoothstep(0.3, 0.75, th)*smoothstep(1.62, 1.3, th); }
`;
const VEL_A = 'vec2 vcVel(vec2 p){', VEL_B = '  v += vec2(-p.y, p.x)*0.012*smoothstep(0.9, 1.5, th);';
if (!DOME_FS.includes(VEL_A) || !DOME_FS.includes(VEL_B)) throw new Error('vg-almond: vg-crows vcVel has changed shape');
// the almond sky: the crows dome's current plus a chain of slow eddies round the sky a little over the horizon (the
// dawn swirls), the strokes following it closely (uJit low)
export const SKY_FS = (DOME_FS.slice(0, p0) + PIGMENT + DOME_FS.slice(p1))
  .replace(VEL_A, EDDY + VEL_A)
  .replace(VEL_B, VEL_B + '\n  { const float he = 0.002; v += vec2(vaEddy(p + vec2(0.0, he)) - vaEddy(p - vec2(0.0, he)), vaEddy(p - vec2(he, 0.0)) - vaEddy(p + vec2(he, 0.0)))/(2.0*he); }')
  .replace('#define VC_CELL 0.019', 'uniform float uCell, uJit;\n#define VC_CELL uCell')
  .replace(RIM_A, RIM_B)
  .replace(SD_A, 'vec2 sd = normalize(fd + vec2(-fd.y,fd.x)*(h.z-0.5)*uJit);');   // the strokes less tied to the current: patches, not whorls

// ---------------- the strokes ----------------
// aP: centre xyz, hash.  aD: half axis xyz, half width.  aN: plane normal xyz (0 = not flat), arc.
// aT: tube offset (-1..1) or, with no tube, a detail distance (see below), tube radius (0 = no tube), tilt off the
// axis, mode (1 = drifting petal).
// aC: rgb, emissive.  aC2: rgb second pigment, bristle load.  aS: sway amplitude (m), sway phase.
export const BLOOM_VS = /* glsl */`
attribute vec4 aP, aD, aN, aT, aC, aC2; attribute vec2 aS;
uniform float uTime, uMinW;
uniform vec3 uBox, uBoxS;
uniform vec4 uGust;
varying vec2 vUv; varying vec4 vCol; varying float vId; varying vec3 vSideV, vAxisV; varying vec4 vCol2;
#include <fog_pars_vertex>
vec3 vaSway(float a, float ph){
  float t = uTime, g = 0.65 + 0.35*sin(t*0.27 + ph*0.13);
  return a*g*vec3(sin(t*0.83 + ph), 0.45*sin(t*1.21 + ph*1.7), cos(t*0.67 + ph*0.6));
}
vec3 vaGust(vec3 C, float a, float ph){
  float x = uGust.z - dot(C.xz, uGust.xy), wave = exp(-pow((x - 1.2)/1.6, 2.0)), lean = 0.4*smoothstep(0.0, 5.0, x);
  float k = 7.0*a*uGust.w;
  return vec3(uGust.x, 0.0, uGust.y)*k*(wave*(1.0 + 0.25*sin(uTime*11.0 + ph*3.0)) + lean*(1.0 + 0.15*sin(uTime*5.0 + ph))) - vec3(0.0, 0.3*k*wave, 0.0);
}
void main(){
  float l = position.x, hs = aP.w, sc = 1.0;
  bool torn = false; vec3 gw = vec3(0.0);
  vec3 C = aP.xyz, d = aD.xyz; float hl = max(length(d), 1e-5); vec3 ax = d/hl;
  if (aT.w > 0.5){
    float t = uTime, ph = aS.y;
    vec3 q = C + vec3(0.05, -0.085, 0.03)*t + 0.1*vec3(sin(t*0.9 + ph), 0.5*sin(t*1.3 + ph*2.0), cos(t*0.7 + ph*1.3));
    vec3 r = mod(q - uBox + uBoxS*0.5, uBoxS) - uBoxS*0.5, e = uBoxS*0.5 - abs(r);
    sc = smoothstep(0.0, 0.35, min(e.x, min(e.y, e.z)));
    C = uBox + r;
    float an = t*(0.7 + hs) + ph;
    ax = normalize(vec3(cos(an), 0.7*sin(an*0.7 + ph), sin(an)));
    if (aT.w > 1.5){                                   // (mode 2: torn by the gust, see above)
      torn = true;
      float tau = clamp((t - aS.x)/aT.x, 0.0, 1.0), ee = 1.0 - (1.0 - tau)*(1.0 - tau), after = max(0.0, t - aS.x - aT.x), go = step(0.0, t - aS.x);
      vec3 W = vec3(uGust.x, 0.0, uGust.y), sd = normalize(cross(W, vec3(0.0, 1.0, 0.0)) + vec3(1e-5, 0.0, 0.0));
      float a2 = ph + 6.0*tau + 1.3*after, sw = 0.35*sin(3.14159*tau)*(0.6 + 0.4*hs);
      C = mix(aP.xyz, aN.xyz, ee) + (sd*cos(a2) + vec3(0.0, 1.0, 0.0)*sin(a2))*sw + W*0.7*after
        + go*0.04*vec3(sin(t*2.1 + ph), sin(t*1.7 + ph*1.3), cos(t*1.9 + ph));
      ax = normalize(mix(normalize(d), ax, go));
      sc = smoothstep(0.02, 0.35, length(cameraPosition - C)); hl *= sc;
    }
  } else { float a = abs(aS.x); vec3 sw0 = vaSway(a, aS.y); gw = vaGust(C, a, aS.y); if (aS.x >= 0.0) C += sw0 + gw; else gw += sw0; }
  vec3 vd = normalize(cameraPosition - C + vec3(1e-6));
  vec3 n = torn ? vec3(0.0) : aN.xyz, side, tint = vec3(1.0);
  if (dot(n, n) > 0.25) side = normalize(cross(n, ax) + vec3(1e-5, 0.0, 0.0));
  else {
    side = normalize(cross(ax, vd) + vec3(1e-5, 0.0, 0.0));
    if (aT.y > 0.0){
      // onto the near face of the branch: across the silhouette by aT.x, forward by the cylinder's depth there
      float o = aT.x, f = sqrt(max(0.0, 1.0 - o*o));
      C += side*o*aT.y + vd*f*aT.y;
      vec3 nrm = normalize(mat3(viewMatrix)*(side*o + vd*f));
      // far off, a twig's edges and inner strokes would only thicken into a dark smear: its underpaint is enough
      if (abs(o) > 0.01 && aT.y < length(cameraPosition - C)*uMinW*0.9) sc = 0.0;
      tint = vec3(0.78 + 0.34*clamp(dot(nrm, normalize(vec3(-0.6, 0.6, 0.5))), 0.0, 1.0));
    }
    if (aT.z != 0.0){ ax = normalize(ax + side*aT.z); side = normalize(cross(ax, vd) + vec3(1e-5, 0.0, 0.0)); }
  }
  // detail by distance (strokes that are not branch tubes): aT.x > 0 fades the stroke out beyond aT.x metres (petal
  // detail, whole flowers thinned in the distance), aT.x < 0 fades it in beyond -aT.x (a far dab that replaces them)
  if (aT.y <= 0.0 && aT.w < 0.5 && aT.x != 0.0){
    float dc = length(cameraPosition - C), cd = abs(aT.x);
    sc *= aT.x > 0.0 ? 1.0 - smoothstep(cd*0.8, cd, dc) : smoothstep(cd*0.8, cd, dc);
  }
  vec3 P = C + ax*l*hl + side*aN.w*(1.0 - l*l)*hl + (aS.x < 0.0 ? gw*(0.5 + 0.5*l) : vec3(0.0));
  float dist = max(length(cameraPosition - P), 1e-3);
  float hw = max(aD.w, dist*uMinW);
  P += side*position.y*hw*sc;
  vec4 mvPosition = viewMatrix*vec4(P, 1.0);
  gl_Position = sc < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix*mvPosition;
  vUv = position.xy; vCol = vec4(aC.rgb*tint, aC.a); vCol2 = vec4(aC2.rgb*tint, aC2.a); vId = hs;
  vSideV = mat3(viewMatrix)*side; vAxisV = mat3(viewMatrix)*ax;
  #include <fog_vertex>
}`;
