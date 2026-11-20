// VG SUNFLOWERS: a music-clip world. Low through a field of tall painted sunflowers (Van Gogh's Arles heads: thick
// discs of chrome-yellow and orange petal strokes round a dome of brown and ochre seed dabs, some wilting), which
// gives way to a bed of blue-violet irises (sword leaves, curling petals, one white iris, marigolds in the red earth),
// under a cerulean and turquoise day sky of short strokes and a sun of radial rays and rings. Olive trees, three
// cypresses and the blue Alpilles far back.
// Painted by the same hand as the-turning-night: its PAINT shader (world-anchored dash coats, here at a 4x finer
// scale for the close-up ground) on the base meshes, its STROKE_FS on every instanced stroke (plants through
// parts/vg-sunflowers.js PLANT_VS, cypress flames through its own STROKE_VS kind 2).
// One long take of 36 s: nose-close on a big head, weave between the heads, drop into the irises, rise to the sun.
// Space: +Y up, the flight runs toward -Z; the sunflowers fill z 4..-42, the iris bed z -42..-68. Pure function of
// world time; every random choice comes from ctx.rng.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePath } from '../kit/core.js';
import { STROKE_VS, STROKE_FS, PAINT_VS, PAINT_FS } from './the-turning-night.js';
import { PLANT_VS, makePlantSet, sunflower, iris, marigold, PIG } from '../parts/vg-sunflowers.js';
import { hourPost } from '../parts/vg-hours.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const DURATION = 36;

// the PAINT coat at a finer scale (uPS: world is scaled up before the dashes are laid): a dash on the near ground
// is ~0.65 m instead of 2.6 m. Falls back to the plain shader if the source it patches has changed.
const PVS = PAINT_VS.replace('vW = wp.xyz;', 'vW = wp.xyz*uPS;').replace('varying vec3 vW, vN, vC;', 'uniform float uPS;\nvarying vec3 vW, vN, vC;');
const PFS = PAINT_FS.replace('length(vW - cameraPosition)', 'length(vW - cameraPosition*uPS)').replace('uniform float uTime', 'uniform float uPS;\nuniform float uTime');
const SCALED = PVS !== PAINT_VS && PFS !== PAINT_FS && PFS.includes('cameraPosition*uPS');

export default {
  id: 'vg-sunflowers',
  name: 'Sunflowers and Irises',
  category: 'wilderness',
  weirdness: 0.3,
  media: ['air', 'open'],
  async build(ctx) {
    const { rng, noise } = ctx;
    const detail = Math.min(1.2, Math.max(0.6, (ctx.quality && ctx.quality.detail) || 1));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#8CC0DC');
    scene.fog = new THREE.FogExp2(new THREE.Color('#A6C6DC'), 0.00042);
    const c = (h) => new THREE.Color(h), mix = (a, b, t, s = 1) => a.clone().lerp(b, t).multiplyScalar(s);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const O = V(0, 0, -40);

    // ---------- the flight ----------
    const sunAz = 8 * D2R, sunEl = 21 * D2R;
    const sunDir = V(Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), -Math.cos(sunAz) * Math.cos(sunEl));
    const H0 = V(0, 1.72, 0), N0 = V(0.28, 0.06, 1).normalize();          // the opening head
    const pts = [
      [0.32, 1.74, 1.08], [0.82, 1.71, 0.5], [1.32, 1.68, -0.35], [1.5, 1.66, -1.7], [0.9, 1.75, -4.6],
      [-0.6, 1.9, -8.5], [-1.1, 1.85, -12.5], [0.4, 1.7, -16.5], [1.3, 1.95, -20.5], [0.2, 2.05, -24.5],
      [-1.0, 1.8, -28.5], [-0.6, 1.6, -32.5], [0.5, 1.5, -36.5], [0.6, 1.3, -40.5],
      [0.0, 0.95, -45], [-0.5, 0.66, -50], [-0.2, 0.56, -55], [0.5, 0.6, -60], [0.6, 0.85, -64],
      [0.75, 0.66, -68.5], [0.85, 0.66, -73],   // journey: on low through the irises, into a thick clump of them (the hand-off)
    ];
    const path = makePath(pts, { samples: 1400 });
    const dPath = (v) => path.distanceTo(v.x, v.y, v.z);
    const clearOf = (m) => (v) => dPath(v) > m;

    // ---------- ground ----------
    function heightAt(x, z) {
      const dx = x - O.x, dz = z - O.z, r = Math.hypot(dx, dz), az = Math.atan2(dx, -dz);
      let h = 0.1 * noise.fbm2(x * 0.11, z * 0.11, 3) + 0.8 * noise.fbm2(x * 0.012, z * 0.012, 3) * sstep(40, 160, r);
      h += 7 * sstep(120, 600, r) * (0.5 + 0.5 * noise.fbm2(x * 0.004, z * 0.004, 3));
      const ridge = 0.6 * noise.ridged2(az * 3.1 + 7, 0.5, 4) + 0.4 * (0.5 + 0.5 * noise.fbm2(az * 1.3, 2.1, 3));
      h += sstep(480, 1500, r) * (90 + 300 * ridge) * (0.55 + 0.45 * Math.cos(az * 0.8) ** 2);
      return h;
    }
    const SU = {
      uTime: { value: 0 }, uSwitch: { value: 0 }, uDrain: { value: 0 }, uRain: { value: 0 }, uRare: { value: 0 },
      uFlame: { value: 1.1 }, uMinW: { value: 0.0016 }, uWind: { value: new THREE.Vector4(0.97, 0.24, 0.3, 0) }, uGain: { value: 1.0 },
      uCreep: { value: 0.04 }, uWeave: { value: 1.5708 }, uFlash: { value: new THREE.Vector3() }, uFlashD: { value: new THREE.Vector3(0, 1, 0) },
      uFine: { value: 2 },   // the shared shaders' finer brushwork: bristle tones and dark rims on every stroke
    };
    const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
    const paintMat = (ps, fog = true) => new THREE.ShaderMaterial({
      uniforms: Object.assign(fogU(), SU, { uPS: { value: ps } }), vertexShader: SCALED ? PVS : PAINT_VS, fragmentShader: SCALED ? PFS : PAINT_FS, fog, side: THREE.DoubleSide,
    });
    const strokeMat = (vs, fade, fog = true) => new THREE.ShaderMaterial({
      uniforms: Object.assign(fogU(), SU, { uFade: { value: new THREE.Vector2(fade[0], fade[1]) } }), vertexShader: vs, fragmentShader: STROKE_FS, side: THREE.DoubleSide, fog,
    });
    const groundMat = paintMat(4), baseMat = paintMat(1), domeMat = paintMat(1, false);
    const plantMat = strokeMat(PLANT_VS, [1e6, 2e6]), farMat = strokeMat(PLANT_VS, [1e6, 2e6]), skyMat = strokeMat(PLANT_VS, [1e7, 2e7], false);
    const cypMat = strokeMat(STROKE_VS, [1e6, 2e6]);
    skyMat.depthWrite = false; domeMat.depthWrite = false;

    const P = PIG;
    const earth = c('#8E7A3C'), earthG = c('#6E7E3A'), redE = c('#A4603A'), redE2 = c('#7E6438'), meadow = c('#9AA840'), meadow2 = c('#7A9A3C'), meadowO = c('#B8A050');
    const hillLo = c('#8AA060'), hillMid = c('#7480B8'), hillHi = c('#A4A2D4');
    const inField = (x, z) => z > -42 && z < 5 && Math.abs(x) < 46;
    const inBed = (x, z) => z <= -42 && z > -140 && Math.abs(x) < 34 + Math.max(0, -60 - z) * 0.4;
    {
      const NR = 110, NA = 220, pos = [], col = [], idx = [], cc = new THREE.Color();
      for (let i = 0; i <= NR; i++) {
        const r = 3400 * Math.pow(i / NR, 2.4);
        for (let j = 0; j < NA; j++) {
          const a = j / NA * TAU, x = O.x + Math.sin(a) * r, z = O.z - Math.cos(a) * r, h = heightAt(x, z);
          pos.push(x, h, z);
          const nz = 0.5 + 0.5 * noise.n2(x * 0.15, z * 0.15);
          if (inField(x, z)) cc.copy(earth).lerp(earthG, nz);
          else if (inBed(x, z)) cc.copy(redE).lerp(redE2, nz);
          else if (r < 460) cc.copy(meadow).lerp(meadow2, nz).lerp(meadowO, 0.4 * sstep(0.6, 0.9, 0.5 + 0.5 * noise.n2(x * 0.03, z * 0.03)));
          else cc.copy(hillLo).lerp(hillMid, sstep(30, 150, h)).lerp(hillHi, sstep(170, 330, h));
          col.push(cc.r, cc.g, cc.b);
          if (i < NR) { const a0 = i * NA + j, b0 = i * NA + (j + 1) % NA; idx.push(a0, a0 + NA, b0, b0, a0 + NA, b0 + NA); }
        }
        if (i % 10 === 9) await ctx.yield();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, groundMat); m.frustumCulled = false; m.name = 'ground'; scene.add(m);
    }
    await ctx.yield();

    // ---------- the sky: a painted dome, then short strokes laid along a calm flow, the sun's rays and rings ----------
    const SR = 2800, sky = makePlantSet(rng), skyC = O.clone();
    {
      const g = new THREE.SphereGeometry(SR * 1.02, 64, 32), p = g.getAttribute('position'), cl = new Float32Array(p.count * 3), cc = new THREE.Color(), dv = V(0, 0, 0);
      const zen = c('#3A70C0'), mid = c('#4E96CE'), low = c('#8CCAD0');
      for (let i = 0; i < p.count; i++) {
        dv.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
        cc.copy(low).lerp(mid, sstep(0.0, 0.35, dv.y)).lerp(zen, sstep(0.45, 0.95, dv.y)).lerp(c('#F2DE90'), 0.8 * sstep(0.93, 0.995, dv.dot(sunDir)));
        cl[i * 3] = cc.r; cl[i * 3 + 1] = cc.g; cl[i * 3 + 2] = cc.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.deleteAttribute('uv');
      const dome = new THREE.Mesh(g, domeMat); dome.position.copy(skyC); dome.renderOrder = -1; dome.frustumCulled = false; dome.name = 'sky-dome'; scene.add(dome);
    }
    {
      const cer = c('#4C90D4'), cob = c('#2E62B6'), turq = c('#46AEB8'), pturq = c('#8CCFD0'), cream = c('#E8ECD4'), pgreen = c('#A4D2A8');
      const lem = c('#F4D850'), ygr = c('#D0DC70'), cloudW = c('#EEF0E0'), cloudB = c('#B8D4E8');
      const neigh = new Map([[cer, [cob, turq, pturq]], [cob, [cer, c('#24489A')]], [turq, [cer, pturq, pgreen]], [pturq, [turq, cream, pgreen]], [cream, [pturq, cloudB]], [pgreen, [pturq, turq]],
        [lem, [cream, ygr]], [ygr, [lem, pgreen]], [cloudW, [cloudB, cream]], [cloudB, [cloudW, cer]]]);
      const clouds = [[-38, 33, 0.16, 1], [44, 30, 0.13, -1], [-12, 58, 0.2, -1], [70, 14, 0.12, 1], [-75, 15, 0.14, -1], [160, 30, 0.2, 1]]
        .map(([az, el, rc, sp]) => ({ d: V(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R)), rc, sp }));
      const dir = V(0, 0, 0), te = V(0, 0, 0), tn = V(0, 0, 0), fl = V(0, 0, 0), tmp = V(0, 0, 0), a = V(0, 0, 0), b = V(0, 0, 0), sd = V(0, 0, 0), pc = V(0, 0, 0);
      const NS = Math.round(30000 * detail);
      for (let i = 0; i < NS; i++) {
        const az = rng.chance(0.78) ? rng.gauss() * 0.95 : rng.range(-Math.PI, Math.PI), el = Math.asin(rng.range(-0.04, 0.99));
        dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
        te.set(Math.cos(az), 0, Math.sin(az)); tn.set(-Math.sin(az) * Math.sin(el), Math.cos(el), Math.cos(az) * Math.sin(el));
        const psi = 0.35 * Math.sin(az * 2.3 + el * 6 + 1.1) + 0.22 * Math.sin(az * 5.1 - el * 3);
        fl.copy(te).multiplyScalar(Math.cos(psi)).addScaledVector(tn, Math.sin(psi));
        const sa = Math.acos(Math.min(1, dir.dot(sunDir)));
        if (sa < 0.12) continue;                                  // the sun paints its own disc
        const ws = sstep(0.46, 0.2, sa);
        if (ws > 0) { tmp.crossVectors(sunDir, dir).normalize(); fl.lerp(tmp, ws).normalize(); }
        let cw = 0;
        for (const C of clouds) {
          const ca = Math.acos(Math.min(1, dir.dot(C.d)));
          if (ca > C.rc * 1.7) continue;
          const w = sstep(C.rc * 1.7, C.rc * 0.45, ca);
          tmp.crossVectors(C.d, dir).normalize().multiplyScalar(C.sp).addScaledVector(pc.copy(C.d).sub(dir).normalize(), 0.3).normalize();
          fl.lerp(tmp, w).normalize(); cw = Math.max(cw, w);
        }
        let col;
        if (rng() < ws * (0.3 + 0.75 * (0.5 + 0.5 * Math.sin(sa * 34)))) col = ws < 0.35 ? rng.pick([cream, pturq, pgreen]) : rng.chance(0.55) ? lem : rng.chance(0.5) ? cream : ygr;   // the halo in rings, pale at its rim (no stray yellow)
        else if (rng() < cw * 0.8) col = rng.chance(0.6) ? cloudW : rng.chance(0.6) ? cloudB : cream;
        else {
          const e = dir.y, r = Math.min(0.999, Math.max(0, rng() * 0.6 + (0.5 + 0.5 * noise.n2(az * 1.7 + 3.1, el * 2.6 - 1.3)) * 0.55 - 0.08));   // tones come in patches, not confetti
          col = e < 0.12 ? (r < 0.4 ? pturq : r < 0.65 ? turq : r < 0.8 ? cream : r < 0.92 ? pgreen : cer)
            : e < 0.5 ? (r < 0.42 ? cer : r < 0.7 ? turq : r < 0.84 ? pturq : r < 0.94 ? cob : cream)
              : (r < 0.45 ? cer : r < 0.78 ? cob : r < 0.92 ? turq : pturq);
        }
        const hl = SR * rng.range(0.011, 0.02) * (1 - 0.3 * ws), hw = SR * rng.range(0.0036, 0.0056);
        pc.copy(skyC).addScaledVector(dir, SR);
        a.copy(pc).addScaledVector(fl, -hl); b.copy(pc).addScaledVector(fl, hl);
        sky.plant(0, -1e4, 0, 1, 0, 0);
        const em = (col === lem || col === ygr) ? 0.25 * ws : 0;
        sky.seg(a, b, hw, col, tmp.crossVectors(fl, dir).multiplyScalar(hl * rng.range(-0.12, 0.12)), em, hl * 0.05);
        if (rng.chance(0.55)) {                                  // a second tone along one side of the stroke
          sd.crossVectors(fl, dir).normalize().multiplyScalar(hw * rng.sign() * 0.8);
          a.add(sd).addScaledVector(fl, hl * 0.2); b.add(sd).addScaledVector(fl, -hl * 0.15);
          sky.seg(a, b, hw * 0.45, rng.pick(neigh.get(col)), null, em, hl * 0.05);
        }
        if (i % 3000 === 2999) await ctx.yield();
      }
      // the sun: a disc of radial dabs, rays of chrome and lemon, three rings of tangential dashes
      const e1 = V(0, 0, 0).crossVectors(sunDir, V(0, 1, 0)).normalize(), e2 = V(0, 0, 0).crossVectors(e1, sunDir);
      const S0 = skyC.clone().addScaledVector(sunDir, SR * 0.98), D = SR * 0.98;
      const onSun = (rho, th, out) => out.copy(S0).addScaledVector(e1, Math.cos(th) * rho * D).addScaledVector(e2, Math.sin(th) * rho * D);
      const sunW = c('#FBF4C8'), chrome = c('#F4C430'), lemon = c('#F8E060'), sunO = c('#EEA030');
      for (let i = 0; i < 160; i++) {
        const rho = 0.05 * Math.sqrt(rng()), th = rng.range(0, TAU);
        onSun(rho, th, a); onSun(rho + 0.012, th + rng.range(-0.15, 0.15), b);
        sky.seg(a, b, D * 0.0045, rho < 0.02 ? sunW : rng.chance(0.55) ? lemon : rng.chance(0.6) ? chrome : sunW, null, rng.range(0.45, 0.7));
      }
      for (let i = 0; i < 120; i++) {
        const th = (i + rng.range(-0.3, 0.3)) / 120 * TAU, r0 = rng.range(0.05, 0.065), len = rng.range(0.035, 0.085) * (i % 2 ? 0.7 : 1);
        onSun(r0, th, a); onSun(r0 + len, th, b);
        const col = i % 3 === 0 ? chrome : i % 3 === 1 ? lemon : rng.chance(0.5) ? sunO : sunW;
        sky.seg(a, b, D * rng.range(0.004, 0.0055), col, null, rng.range(0.25, 0.45) * (1 - 2 * len));
        if (rng.chance(0.6)) { onSun(r0 + 0.004, th + 0.01, a); onSun(r0 + len * 0.7, th + 0.012, b); sky.seg(a, b, D * 0.002, rng.pick([sunO, chrome, c('#D86A1C')]), null, 0.2); }
      }
      [[0.165, 48, 0.35], [0.205, 60, 0.22], [0.25, 74, 0.12]].forEach(([rr, nd, em], k) => {
        for (let i = 0; i < nd; i++) {
          const th = (i + rng.range(-0.2, 0.2)) / nd * TAU, hl = 0.36 * TAU / nd;
          onSun(rr * rng.range(0.97, 1.03), th - hl, a); onSun(rr * rng.range(0.97, 1.03), th + hl, b);
          const col = (i + k) % 2 ? (k === 2 ? pturq : ygr) : rng.chance(0.6) ? c('#F0EAB0') : lemon;
          sky.seg(a, b, D * 0.0055, col, tmp.copy(a).add(b).multiplyScalar(0.5).sub(S0).normalize().multiplyScalar(D * rr * hl * hl * 0.5), em * rng.range(0.8, 1.1), D * 0.002);
        }
      });
      const m = sky.mesh(skyMat, 2); m.renderOrder = -0.5; m.name = 'sky-strokes'; scene.add(m);
    }
    await ctx.yield();

    // ---------- far: hills laid in contour strokes, the meadow, olive trees, three cypresses ----------
    const far = makePlantSet(rng), bases = [];
    {
      const a = V(0, 0, 0), b = V(0, 0, 0), nv = V(0, 0, 0), cc = new THREE.Color();
      const hillC = [c('#6E78B8'), c('#8A90C8'), c('#5A9A8A'), c('#B0A070'), c('#9CA0D8'), c('#7AA070'), c('#4E5EA0')];
      for (let i = 0; i < Math.round(20000 * detail); i++) {
        const az = rng.gauss() * 0.75, r = 380 + Math.pow(rng(), 0.8) * 2300;
        const x = O.x + Math.sin(az) * r, z = O.z - Math.cos(az) * r, h = heightAt(x, z);
        const gx = heightAt(x + 4, z) - heightAt(x - 4, z), gz = heightAt(x, z + 4) - heightAt(x, z - 4);
        nv.set(-gz, 0, gx); if (nv.lengthSq() < 1e-6) nv.set(1, 0, 0); nv.normalize();
        const hl = r * rng.range(0.006, 0.011), hw = r * rng.range(0.0022, 0.0034);
        a.set(x - nv.x * hl, 0, z - nv.z * hl); a.y = heightAt(a.x, a.z) + hw * 0.6; b.set(x + nv.x * hl, 0, z + nv.z * hl); b.y = heightAt(b.x, b.z) + hw * 0.6;
        cc.copy(hillLo).lerp(hillMid, sstep(30, 150, h)).lerp(hillHi, sstep(170, 330, h));
        const col = rng.chance(0.55) ? cc.clone() : cc.clone().lerp(rng.pick(hillC), 0.6);
        far.plant(0, -1e4, 0, 1, 0, 0); far.seg(a, b, hw, col, null, 0, hl * 0.03);
        if (i % 3000 === 2999) await ctx.yield();
      }
      // the meadow in patches: wheat-gold, green, a violet shadow, poppy and white dots in clusters; flat dabs laid
      // along the ground plus upright tufts
      const patchC = [[c('#C8A040'), c('#D8B850'), c('#B08A30'), meadowO], [meadow, meadow2, c('#6A8A3A'), c('#C8C060')],
        [c('#8EA848'), c('#A8B860'), c('#D0D8A0'), meadow], [c('#7A9A3C'), c('#5E7E3A'), c('#8A90C8'), c('#4E6A3A')]];
      for (let i = 0; i < Math.round(70000 * detail); i++) {
        const az = rng.gauss() * 0.9, r = 26 + Math.pow(rng(), 1.15) * 640;
        const x = O.x + Math.sin(az) * r, z = O.z - Math.cos(az) * r;
        if (inField(x, z) || inBed(x, z)) continue;
        const h = heightAt(x, z), pn = 0.5 + 0.5 * noise.n2(x * 0.035 + 4, z * 0.035 - 9), pk = Math.min(3, Math.floor(pn * 4.2));
        const pal = patchC[pk], fl = 0.5 + 0.5 * noise.n2(x * 0.09 - 2, z * 0.09 + 6);
        if (rng.chance(0.7)) {                           // a flat dab along the ground, contour-wise
          const L = 0.35 + r * 0.013, th = 0.5 * noise.n2(x * 0.02, z * 0.02) + rng.range(-0.25, 0.25);
          a.set(x - Math.cos(th) * L, 0, z - Math.sin(th) * L); a.y = heightAt(a.x, a.z) + 0.04; b.set(x + Math.cos(th) * L, 0, z + Math.sin(th) * L); b.y = heightAt(b.x, b.z) + 0.04;
          far.plant(0, -1e4, 0, 1, 0, 0); far.seg(a, b, Math.max(0.06, r * 0.0045), rng.pick(pal)); continue;
        }
        const L = 0.25 + r * 0.004, th = rng.range(-0.5, 0.5) + 0.25;
        a.set(x, h + 0.05, z); b.set(x + Math.cos(th) * L * 0.4, h + L, z + Math.sin(th) * L * 0.4);
        far.plant(x, h, z, L, 0.06, rng.range(0, TAU));
        const flower = rng.chance(fl > 0.62 ? 0.3 : 0.03);
        if (flower) b.lerp(a, 0.7);
        far.seg(a, b, flower ? L * 0.1 : Math.max(0.05, r * 0.0015), flower ? (fl > 0.62 && rng.chance(0.7) ? c('#D85A40') : rng.pick([P.orange, P.white, P.lemon])) : rng.pick(pal));
      }
      await ctx.yield();
      // olive trees: twisted violet trunks, crowns of curly silver-green strokes round a dark painted body, blue shadows
      const oliveC = [c('#9AB4A0'), c('#6E9A86'), c('#B8C8A0'), c('#5A7AA0'), c('#C8C080'), c('#4E7A6A')];
      const trunkC = [c('#5E4A60'), c('#7A6A50'), c('#4A4070')], shadowC = [c('#4E5EA8'), c('#5A6EB0'), c('#3E4E90')];
      let made = 0;
      for (let t = 0; t < 400 && made < 46; t++) {
        const az = rng.range(-1.35, 1.35), r = rng.range(40, 420), x = O.x + Math.sin(az) * r, z = O.z - Math.cos(az) * r;
        if (z > -108 || inBed(x, z)) continue;
        made++;
        const y = heightAt(x, z), s = rng.range(0.8, 1.35), cy = y + 3.6 * s, rx = 3.8 * s, ry = 2.5 * s;
        far.plant(x, y, z, 5 * s, 0.05, rng.range(0, TAU));
        for (let k = 0; k < 3; k++) { a.set(x + rng.range(-0.3, 0.3), y, z + rng.range(-0.3, 0.3)); b.set(x + rng.range(-0.8, 0.8), cy - 0.8 * s, z + rng.range(-0.8, 0.8)); far.seg(a, b, 0.2 * s, rng.pick(trunkC), nv.set(rng.range(-0.4, 0.4), 0, rng.range(-0.4, 0.4))); }
        const bg = new THREE.IcosahedronGeometry(1, 2).toNonIndexed(); bg.scale(rx * 0.86, ry * 0.86, rx * 0.86); bg.translate(x, cy, z);
        const bc = new Float32Array(bg.getAttribute('position').count * 3).fill(0); const bcol = c('#466E64');
        for (let k = 0; k < bc.length; k += 3) { bc[k] = bcol.r; bc[k + 1] = bcol.g; bc[k + 2] = bcol.b; }
        bg.setAttribute('color', new THREE.BufferAttribute(bc, 3)); bg.deleteAttribute('uv'); bases.push(bg);
        for (let k = 0; k < 240; k++) {
          const u = rng.range(-1, 1), ph = rng.range(0, TAU), q = Math.sqrt(1 - u * u);
          nv.set(q * Math.cos(ph), u, q * Math.sin(ph));
          const px = x + nv.x * rx, py = cy + nv.y * ry, pz = z + nv.z * rx;
          const tg = V(-nv.z, rng.range(-0.5, 0.5), nv.x).normalize(), hl = rng.range(0.35, 0.65) * s;
          a.set(px, py, pz).addScaledVector(tg, -hl); b.set(px, py, pz).addScaledVector(tg, hl);
          far.seg(a, b, rng.range(0.14, 0.22) * s, rng.pick(oliveC), nv.clone().multiplyScalar(hl * 0.3), 0, 0.04);
        }
        far.plant(0, -1e4, 0, 1, 0, 0);
        for (let k = 0; k < 6; k++) {
          const ox = x + 2.5 + rng.range(-2, 3), oz = z + rng.range(-3, 3), L = rng.range(1.2, 2.2);
          a.set(ox - L, heightAt(ox - L, oz) + 0.15, oz); b.set(ox + L, heightAt(ox + L, oz) + 0.15, oz + rng.range(-0.4, 0.4));
          far.seg(a, b, rng.range(0.3, 0.5), rng.pick(shadowC));
        }
      }
      await ctx.yield();
    }
    // cypresses: the-turning-night's slow black-green flames (STROKE_VS kind 2), calmer here
    const cyp = { P: [], D: [], C: [], X: [], H: [], n: 0 };
    {
      const cypCols = [c('#1E4E3A'), c('#2C5A30'), c('#16302A'), c('#3A6A4A'), c('#5A6A2A')], cb = c('#1A3A2E');
      for (const [x, z, Hh, R, n] of [[-46, -150, 22, 2.6, 1300], [-54, -165, 17, 2.1, 900], [70, -230, 26, 3.0, 1300]]) {
        const y = heightAt(x, z) - 0.4;
        const cg = new THREE.ConeGeometry(R * 0.78, Hh * 0.96, 10, 8).toNonIndexed(); cg.translate(x, y + Hh * 0.48, z);
        const cc = new Float32Array(cg.getAttribute('position').count * 3); for (let k = 0; k < cc.length; k += 3) { cc[k] = cb.r; cc[k + 1] = cb.g; cc[k + 2] = cb.b; }
        cg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); cg.deleteAttribute('uv'); bases.push(cg);
        const tw = rng.sign();
        for (let i = 0; i < Math.round(n * detail); i++) {
          const col = rng.pick(cypCols), j = rng.range(0.82, 1.18);
          cyp.P.push(x, y, z, 2); cyp.D.push(rng.range(0, TAU), rng(), Hh, rng.range(0.2, 0.36)); cyp.C.push(col.r * j, col.g * j, col.b * j, 0);
          cyp.X.push(rng.range(0.7, 1.5), rng.range(0.82, 1.08), tw, 0); cyp.H.push(rng(), R); cyp.n++;
        }
      }
      const base = new THREE.PlaneGeometry(2, 2, 4, 1), geo = new THREE.InstancedBufferGeometry();
      geo.index = base.index; geo.setAttribute('position', base.getAttribute('position'));
      for (const [nm, arr, k] of [['aP', cyp.P, 4], ['aD', cyp.D, 4], ['aC', cyp.C, 4], ['aX', cyp.X, 4], ['aH', cyp.H, 2]]) geo.setAttribute(nm, new THREE.InstancedBufferAttribute(new Float32Array(arr), k));
      geo.instanceCount = cyp.n;
      const m = new THREE.Mesh(geo, cypMat); m.frustumCulled = false; m.name = 'cypresses'; scene.add(m);
    }
    {
      for (const g of bases) g.computeVertexNormals();
      const m = new THREE.Mesh(mergeGeometries(bases), baseMat); m.frustumCulled = false; m.name = 'painted-bases'; scene.add(m);
    }
    scene.add(Object.assign(far.mesh(farMat, 2), { name: 'far-strokes' }));
    await ctx.yield();

    // ---------- the sunflowers ----------
    const S = makePlantSet(rng), Dd = makePlantSet(rng);
    const nv = V(0, 0, 0);
    sunflower(S, Dd, rng, { root: V(H0.x - 0.1, heightAt(H0.x, H0.z), H0.z - 0.25), head: H0, n: N0, r: 0.42, lod: 0, seeds: 760, petals: 36, clear: clearOf(0.3) });
    {
      let tries = 0;
      for (let gz = 4; gz > -44; gz -= 0.95) {
        for (let gx = -46; gx < 46; gx += 0.95) {
          const x = gx + rng.range(-0.38, 0.38), z = gz + rng.range(-0.38, 0.38);
          const fade = sstep(-44, -37, z);
          const nn = path.nearestXZ(x, z), dxz = nn.dist;
          const lod = dxz < 4.8 ? 0 : dxz < 13 ? 1 : 2;
          if (lod === 2 && rng.chance(0.55)) continue;     // the far field is planted thinner
          if (!rng.chance(fade)) continue;
          if (Math.hypot(x - H0.x, z - H0.z) < 1.1) continue;
          if (z > 1.5 && dxz < 3) continue;
          const wilt = rng.chance(0.24) ? rng.range(0.45, 1) : 0;
          const r = rng.range(0.15, 0.29) * (rng.chance(0.08) ? 1.3 : 1);
          let hy = rng.range(1.3, 2.55) * (wilt ? 0.92 : 1);
          const y0 = heightAt(x, z);
          const yaw = (rng.chance(0.1) ? Math.PI : 0) + rng.gauss() * 0.55, pitch = wilt ? -rng.range(0.4, 1.0) * wilt - 0.2 : rng.range(-0.1, 0.35);
          nv.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
          const head = V(x, y0 + hy, z), reach = r * 1.95 + 0.3;
          if (lod < 2 && dPath(head) < reach) {             // too close to the lens: try it lower or higher, else leave a gap
            head.y = y0 + (nn.y - y0 > 1.7 ? nn.y - reach - 0.05 : nn.y + reach + 0.05);
            if (head.y - y0 < 1.0 || head.y - y0 > 2.8 || dPath(head) < reach) continue;
          }
          const root = V(x - nv.x * r * 0.6, y0, z - nv.z * r * 0.6);
          if (lod < 2) { let ok = true; for (let t = 0.2; t < 1; t += 0.2) { const p = root.clone().lerp(head, t); if (dPath(p) < 0.22) { ok = false; break; } } if (!ok) continue; }
          sunflower(S, Dd, rng, { root, head, n: nv.clone(), r, lod, wilt, seeds: Math.round(150 * detail), petals: 26, clear: clearOf(0.3) });
          if (++tries % 60 === 59) await ctx.yield();
        }
      }
    }
    scene.add(Object.assign(S.mesh(plantMat, 4), { name: 'sunflower-strokes' }), Object.assign(Dd.mesh(plantMat, 1), { name: 'sunflower-dabs' }));
    await ctx.yield();

    // ---------- the iris bed ----------
    const I = makePlantSet(rng);
    let uW = 0; { let best = 1e9; const q = V(0, 0, 0); for (let i = 0; i <= 400; i++) { path.pointAt(i / 400, q); if (Math.abs(q.z + 51) < best) { best = Math.abs(q.z + 51); uW = i / 400; } } }
    const WI = (() => { const p = path.pointAt(uW, V(0, 0, 0)); return V(p.x - 0.5, 0, p.z); })();   // the one white iris, left of the line
    for (let i = 0; i < 2; i++) iris(I, rng, { root: V(WI.x - i * 0.12, heightAt(WI.x, WI.z), WI.z - i * 0.2), lod: 0, white: i === 0, clear: clearOf(0.14) });
    {
      let k = 0;
      for (let gz = -40; gz > -140; gz -= (gz > -66 ? 0.42 : 0.55)) {
        const gs = gz > -66 ? 0.42 : 0.55;
        for (let gx = -66; gx < 66; gx += gs) {
          const x = gx + rng.range(-0.4, 0.4) * gs, z = gz + rng.range(-0.4, 0.4) * gs;
          if (!inBed(x, z) || !rng.chance(sstep(-38, -45, z) * sstep(-141, -132, z))) continue;
          const dxz = path.nearestXZ(x, z).dist, d3 = dPath(V(x, heightAt(x, z) + 0.5, z)), lod = d3 < 2.4 ? 0 : d3 < 9 ? 1 : 2;
          if (lod === 2 && rng.chance(0.25)) continue;
          if (Math.hypot(x - WI.x, z - WI.z) < 0.35) continue;
          const root = V(x, heightAt(x, z), z);
          const hue = Math.min(0.999, Math.max(0, 0.5 + 0.75 * noise.n2(x * 0.07 + 11, z * 0.07 - 3))), bloom = 0.55 + 0.45 * sstep(-0.45, 0.3, noise.n2(x * 0.11 - 7, z * 0.11 + 5));
          if (dxz < 0.6) {                                   // under the flight line: low irises and marigolds, no bare lane
            const room = path.nearestXZ(x, z).y - root.y - 0.24;
            if (room < 0.12) continue;
            if (rng.chance(0.18)) { marigold(I, rng, root); continue; }
            iris(I, rng, { root, lod, hue, bloom, scale: Math.min(1, room / 0.8), clear: clearOf(0.14) });
            continue;
          }
          if (rng.chance(0.07)) { marigold(I, rng, root); continue; }
          iris(I, rng, { root, lod, hue, bloom, clear: clearOf(0.14) });
          if (++k % 300 === 299) await ctx.yield();
        }
      }
    }
    // journey bridge: a thick clump of irises on the line over the last metres; the lens pushes through blades and blooms
    // while the exit (a bare pane) fades in behind them (portal.fadeIn)
    {
      const q = V(0, 0, 0), L = path.length;
      for (let i = 0; i < 160; i++) {
        path.pointAt((L - rng.range(1.2, 1.8)) / L, q);
        const ox = rng.gauss() * 0.34;   // across the whole frame; the plants nearest the line are the smallest (no blade passes the lens as a slab)
        const x = q.x + ox, z = q.z + rng.range(-0.15, 0.15), root = V(x, heightAt(x, z), z);
        const hue = Math.min(0.999, Math.max(0, 0.5 + 0.75 * noise.n2(x * 0.07 + 11, z * 0.07 - 3)));
        iris(I, rng, { root, lod: 0, hue, bloom: 1, scale: rng.range(1.05, 1.35) * Math.min(1, Math.max(0.45, Math.abs(ox) / 0.3)) });
      }
    }
    scene.add(Object.assign(I.mesh(plantMat, 4), { name: 'iris-strokes' }));
    await ctx.yield();

    // ---------- ground dabs: loose impasto strokes over the near earth (the coat beneath stays for the distance) ----------
    {
      const G = makePlantSet(rng), a = V(0, 0, 0), b = V(0, 0, 0);
      const fieldC = [[c('#8E7A3C'), 3], [c('#A88A40'), 2], [c('#6E7E3A'), 2], [c('#6A6A98'), 0.6], [c('#C8A040'), 1], [c('#3E5A30'), 1], [c('#5A4A28'), 0.8], [PIG.chrome, 0.2]];
      const bedC = [[c('#A4603A'), 3], [c('#B8743A'), 2], [c('#7E6438'), 1.5], [c('#C88A4A'), 1], [c('#5A8A3A'), 1.2], [c('#6A5A8A'), 0.5], [c('#5E3A22'), 0.8], [PIG.orange, 0.2]];
      const pickC = (list) => { let t = 0; for (const [, w] of list) t += w; let r = rng() * t; for (const [v, w] of list) if ((r -= w) <= 0) return v; return list[0][0]; };
      G.plant(0, -1e4, 0, 1, 0, 0);
      const NG = Math.round(300000 * detail);
      for (let i = 0; i < NG; i++) {
        const x = rng.range(-16, 16), z = rng.range(-104, 4), field = inField(x, z), bed = inBed(x, z);
        if (!field && !bed) continue;
        const nn = path.nearestXZ(x, z), dxz = nn.dist;
        if (nn.y > 6 || !rng.chance(Math.exp(-dxz / 5))) continue;
        const ang = 0.4 + 1.3 * noise.n2(x * 0.25, z * 0.25) + rng.range(-0.3, 0.3), k = 0.6 + dxz * 0.16;
        const hl = rng.range(0.04, 0.09) * k, hw = rng.range(0.013, 0.024) * k, y = heightAt(x, z) + 0.015;
        a.set(x - Math.cos(ang) * hl, y, z - Math.sin(ang) * hl); b.set(x + Math.cos(ang) * hl, y, z + Math.sin(ang) * hl);
        G.seg(a, b, hw, pickC(field ? fieldC : bedC));
        if (i % 20000 === 19999) await ctx.yield();
      }
      scene.add(Object.assign(G.mesh(plantMat, 1), { name: 'ground-dabs' }));
    }
    await ctx.yield();

    const bufSize = new THREE.Vector2();
    const pois = [
      { at: [WI.x, 0.62, WI.z], from: uW - 0.07, to: uW + 0.005, weight: 0.3 },
    ];
    return {
      scene, path, duration: DURATION, heightAt,
      // linger nose-close on the first head, cruise the field, slow among the irises, a steady climb to the sun
      // (+ the journey's dash through the iris clump at the end: the blades cross the lens in a moment)
      pace: (u) => 0.4 + 0.65 * sstep(0.0, 0.07, u) - 0.2 * sstep(0.5, 0.6, u) * (1 - sstep(0.76, 0.86, u)) + 1.4 * sstep(0.93, 0.97, u),
      title: 'Sunflowers and Irises',
      ride: 'none', style: 'none',
      camera: { fov: 58, near: 0.08, far: 6000, lookAhead: 3.5, sway: 0.3, bank: 0.4 },
      pois,
      // the hand-off hides in the irises: a bare pane (the exact window, no rim) that fades in while the clump fills the frame
      portal: { shape: 'rect', width: 10, height: 7, frame: 0, lens: 0, color: '#F8D850', veil: '#C8B060', revealDistance: 12, blendDistance: 8, drawWithin: 1.8, drawIn: 0, fadeIn: [1.8, 1.25] },
      // the journey's hour (vg-hours.js): full day, warming to late gold over the irises and the climb to the sun
      postAt: ctx.vary && ctx.vary.hour === 'day' ? function (u) { return hourPost(this.post, [[0, { exposure: 1.02, tint: '#fff8ec', saturation: 1.12 }], [0.55, { exposure: 1.02, tint: '#fff4e0', saturation: 1.12 }], [1, { exposure: 0.98, tint: '#ffd9a8', saturation: 1.16 }]], u); } : undefined,
      post: {
        exposure: 1.0,
        bloom: { strength: 0.3, radius: 0.5, threshold: 1.05 },
        grade: { saturation: 1.12, contrast: 1.06, tint: '#fff6e4', shadowTint: '#0a1030', vignette: 0.3, grain: 0.03, aberration: 0 },
      },
      update(dt, time) {
        SU.uTime.value = time;
        ctx.renderer.getDrawingBufferSize(bufSize);
        SU.uWeave.value = 1.5708 * Math.min(1, 1080 / Math.max(1, bufSize.y));
      },
      dispose() {},
    };
  },
};
