// VG NIGHT: the flat-stroke set of vg-cafe, shared by the finale's night worlds (vg-rhone, vg-road).
// Strokes lie FLAT on their surface (aN = normal) or face the camera (aN = 0); set.tones = true lays a narrower streak
// of a lighter or darker mix along one flank (2-3 tones per stroke). Fragment shader: the-turning-night's STROKE_FS.
import * as THREE from 'three';

// aP: centre xyz, hash | aD: half axis xyz, half width | aN: surface normal xyz (0 = billboard), bend
// aC: rgb, emissive | aW: wiggle amplitude xyz, rad/s (>0 the whole stroke, <0 only its tip: legs)
export const FLAT_VS = /* glsl */`
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

export function makeSet(rng) {
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

