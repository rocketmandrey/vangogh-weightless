// VG HOURS: the time of day of the Van Gogh journey (SUITES 'van-gogh': almond at dawn, sunflowers by day, the crows at
// sunset, the café at dusk, the bedroom and the valley by night). A world honours its hour only when the journey names
// one (ctx.vary.hour); a single-world visit keeps the world's own look. The hour drifts along the flight (u, 0..1)
// toward the next world's, so each crossing joins two matching lights; the engine reads world.postAt(u) every frame.
import * as THREE from 'three';

const _a = new THREE.Color(), _b = new THREE.Color();
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// keys: [[u, { exposure, tint, shadowTint, saturation, contrast }], ...] in order of u. Returns a post spec (as a world's
// `post`) for u: the base with the keyed grade values eased between the two keys around u.
export function hourPost(base, keys, u) {
  let i = 0; while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [u0, k0] = keys[i], [u1, k1] = keys[Math.min(i + 1, keys.length - 1)], t = u1 > u0 ? sstep(u0, u1, u) : 0;
  const g = { ...(base.grade || {}) }, out = { ...base, grade: g };
  const num = (k) => { const a = k0[k] ?? (k === 'exposure' ? base.exposure : g[k]), b = k1[k] ?? a; return a == null ? undefined : a + (b - a) * t; };
  if (k0.exposure != null) out.exposure = num('exposure');
  for (const k of ['saturation', 'contrast']) if (k0[k] != null) g[k] = num(k);
  for (const k of ['tint', 'shadowTint']) if (k0[k] != null) g[k] = '#' + _a.set(k0[k]).lerp(_b.set(k1[k] ?? k0[k]), t).getHexString();
  return out;
}

// a palette (array of THREE.Color, written in place) as base[i] lerped toward `to` by w[i] * k
export function tintPalette(out, base, to, w, k) {
  _b.set(to);
  for (let i = 0; i < out.length; i++) out[i].copy(base[i]).lerp(_b, Math.min(1, Math.max(0, (w[i] ?? 0) * k)));
}
