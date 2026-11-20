// VG BRIDGE: a journey's hand-off hidden in a stand of painted stalks that the lens pushes through at the end of a flight
// (with a bare exit pane that fades in behind them, portal.fadeIn), for a world with no stroke kit of its own to make one
// (vg-planets). The stalks are vg-sower's field strokes (FIELD_VS, TINT_FS): a stalk and a fat ear each, leaning a little,
// set round the path over [from, to] metres before its end. Deterministic (its own seeded rng).
//   const b = buildBridge({ scene, path, ground: (x, z) => y, from: 1.2, to: 4, n: 900, spread: 0.3, height: [1.3, 1.8],
//     colors: ['#C8A040', ...], tint: '#ffffff', seed: 'vg-planets:bridge' });  then each frame b.uniforms.uTime.value = time
import * as THREE from 'three';
import { makeRng, hashSeed } from '../kit/core.js';
import { FIELD_VS, TINT_FS, fieldSet } from './vg-sower.js';

export function buildBridge(o) {
  const rng = makeRng(hashSeed(o.seed || 'vg-bridge')), L = o.path.length, at = new THREE.Vector3();
  const [h0, h1] = o.height || [1.3, 1.8], cols = (o.colors || ['#C8A040', '#E0C060', '#A8802E', '#D8B050', '#8A7A30']).map((h) => new THREE.Color(h));
  const U = {
    uTime: { value: 0 }, uGain: { value: 1.08 }, uWeave: { value: 1.5708 }, uMinW: { value: 0.0016 }, uFlash: { value: new THREE.Vector3() },
    uTint: { value: new THREE.Color(o.tint || '#ffffff') }, uFine: { value: 2 }, uFlashD: { value: new THREE.Vector3(0, 1, 0) },
    uWind: { value: new THREE.Vector4(1, 0, 0.12, 0.35) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), U), vertexShader: FIELD_VS, fragmentShader: TINT_FS, side: THREE.DoubleSide, fog: o.fog !== false });
  const set = fieldSet(), pick = () => cols[Math.floor(rng() * cols.length)], jit = (c) => c.clone().multiplyScalar(rng.range(0.85, 1.15));
  for (let i = 0; i < (o.n || 900); i++) {
    o.path.pointAt((L - rng.range(o.from ?? 1.2, o.to ?? 4)) / L, at);
    // o.hole: no stalk within that many metres of the line (the lens goes down a gap, no stalk fills the frame flat)
    let dx, dz; do { dx = rng.gauss() * (o.spread ?? 0.3); dz = rng.gauss() * (o.spread ?? 0.3); } while (dx * dx + dz * dz < (o.hole || 0) ** 2);
    const x = at.x + dx, z = at.z + dz, y = o.ground(x, z) - 0.05;
    const H = rng.range(h0, h1), lx = rng.gauss() * 0.12, lz = rng.gauss() * 0.12, c = jit(pick()), ce = jit(pick()).lerp(new THREE.Color('#F2E6A0'), 0.25);
    set.add(1, x, y, z, lx, H * 0.7, lz, rng.range(0.02, 0.034), c, pick(), rng.range(0.4, 1), rng(), 0, rng.range(0.5, 1.2));
    set.add(1, x, y, z, lx, H, lz, rng.range(0.03, 0.05), ce, c, rng.range(0.4, 1), rng(), 0.62, rng.range(0.5, 1.2));
  }
  const mesh = set.mesh(mat, 4); mesh.name = 'journey-bridge'; o.scene.add(mesh);
  return { mesh, uniforms: U };
}
