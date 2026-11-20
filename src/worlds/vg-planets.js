// VG PLANETS: a music-clip pilot. The Turning Night's valley seen from the ground. Four planets hang in the swirling
// sky as real planets do, small coloured points of light among the painted stars (Venus warm white, Mars reddish,
// Jupiter yellowish, Saturn pale), and they burst one after another (EXPLODE_AT, seconds): each point erupts into a
// Van Gogh explosion in its planet's own pigments (cobalt bands, sunflower, viridian cypress flame, café orange).
// Built on the-turning-night (its whole valley, sky dome and moon, same seed every time) plus, per planet, one
// instanced mesh of impasto strokes in the valley's STROKE fragment shader:
//   the point (a few strokes and a small halo, twinkling, flickering up as a tell before its blast);
//   the blast strokes, flung out from the point on curling spiral paths with drag, most of them raining down and
//   fading, the rest turning round a new star; the star itself, a short dense core of yellow dashes and concentric
//   counter-rotating rings of chrome-yellow and cerulean strokes.
// The dome's flow field swirls and sends a shock ring of yellow strokes out round each blast (uBlast in
// parts/the-turning-night.js) and a warm light from the sky washes the valley (uFlash). Pure function of world time.
// The planets themselves (roster, strokes, sky reaction, schedule) live in parts/vg-blasts.js.
import * as THREE from 'three';
import { makeRng, makeNoise, hashSeed, makePath } from '../kit/core.js';
import TN from './the-turning-night.js';
import { buildBlasts, scheduleFrom } from '../parts/vg-blasts.js';
import { buildBridge } from '../parts/vg-bridge.js';

// blast times in seconds of world time: retime these to the music's beats
export const EXPLODE_AT = [6, 10.5, 15, 19.5];
export const DURATION = 24;
// the valley runs on a slow clock: sky vortices, star wheels and wheat turn at SLOW of the-turning-night's pace;
// a blast spins its patch of sky up BOOST x harder (still slower than real time), then settles. FINE: brushwork (vary.fine)
const SLOW = 0.28, BOOST = 1.9, FINE = 2;

const D2R = Math.PI / 180;

export default {
  id: 'vg-planets',
  name: 'The Planets Burst over the Village',
  category: 'sky',
  weirdness: 0.6,
  media: ['air'],
  async build(ctx) {
    // the same valley every time: the turning night's build on a fixed seed, a clear summer night
    const seed = hashSeed('vg-planets:valley');
    const vctx = { ...ctx, rng: makeRng(seed), noise: makeNoise(seed ^ 0x5bd1e995), vary: { hour: 'night', rare: false, density: 1, weather: 'clear', season: 'summer', mood: 0.5, fine: FINE } };
    const base = await TN.build(vctx);
    const { scene, hero } = base, SU = base.uniforms;
    const gate = scene.getObjectByName('moon-gate'); if (gate) gate.visible = false;   // the moon stays on the dome
    // the moon must not steal the eye from the planets: halo glow at a third and paint at two thirds, its rings 0.65 the size, crescent dimmer
    hero.uniforms.uMoonK.value.set(0.35, 0.65, 0.6);

    // ---------- the camera: low in the wheat above the river, a slow push up toward the sky ----------
    const q = (typeof location !== 'undefined') ? new URLSearchParams(location.search) : null;
    const dbg = q && q.get('vgcam') ? q.get('vgcam').split(',').map(Number) : null;   // dev aid: x,z,eyeH,yawDeg,pitchDeg,travel
    const [CX, CZ, EH, YAW, PITCH, TRAVEL] = dbg || [3, 782, 1.6, -1, 12, 6];
    const gy = base.heightAt(CX, CZ) + EH;
    const gaze = new THREE.Vector3(Math.sin(YAW * D2R) * Math.cos(PITCH * D2R), Math.sin(PITCH * D2R), -Math.cos(YAW * D2R) * Math.cos(PITCH * D2R));
    const side = new THREE.Vector3(-gaze.z, 0, gaze.x).normalize();
    const e0 = new THREE.Vector3(CX, gy, CZ);
    // journey: after the push the lens comes down and on into the wheat ahead (the hand-off hides in it, see the bridge below)
    const flat = new THREE.Vector3(gaze.x, 0, gaze.z).normalize(), e1 = e0.clone().addScaledVector(gaze, TRAVEL);
    const pts = [e0.clone(), e0.clone().addScaledVector(gaze, TRAVEL * 0.5).addScaledVector(side, -0.12), e1];
    for (const [k, h] of [[3, 1.5], [6, 1.15], [8.5, 1.05]]) { const p = e1.clone().addScaledVector(flat, k); p.y = base.heightAt(p.x, p.z) + h; pts.push(p); }
    const path = makePath(pts);
    const uPush = TRAVEL / path.length;
    const eyeMid = e0.clone().addScaledVector(gaze, TRAVEL * 0.5);
    // ---------- the four planets (pigments in parts/vg-blasts.js ROSTER) ----------
    // az/el in degrees from the middle of the camera's run (az 0 = down the valley, -Z); ang = angular radius of the blast
    const PLACE = [
      // (deep pigments, no whites: on the drop they read as two coloured whirls, never a cream disc)
      { id: 'cobalt', az: -26, el: 13, dist: 430, ang: 13, pal: [['#2348A8', 3], ['#1A2A8A', 2], ['#4A8AD8', 3], ['#7FB2E5', 1.5], ['#F6D54A', 0.8]].map(([h, w]) => [new THREE.Color(h), w]) },          // the drop's pair: large, either side of the moon, well in frame
      { id: 'sunflower', az: 22, el: 18, dist: 470, ang: 10.5, pal: [['#F6C83A', 3], ['#F08A24', 3], ['#C8862A', 2], ['#C0502A', 1.2], ['#2348A8', 0.8]].map(([h, w]) => [new THREE.Color(h), w]) },
      { id: 'cypress', az: -12, el: 31, dist: 520, ang: 7.5 },
      { id: 'cafe', az: 44, el: 24, dist: 400, ang: 7 },
    ];
    const bridge = buildBridge({ scene, path, ground: base.heightAt, from: 1.2, to: 3.0, n: 1100, spread: 0.36, hole: 0.2, height: [1.3, 1.75], tint: '#cfc8c0',
      colors: ['#C8A040', '#E0C060', '#A8802E', '#D8B050', '#8A7A30', '#B89A3A'], seed: 'vg-planets:bridge' });
    // which planet bursts at which EXPLODE_AT entry (override: &blasts=, see parts/vg-blasts.js)
    const ORDER = ['cafe', 'cobalt', 'sunflower', 'cypress'];
    const schedule = scheduleFrom(ctx, { before: [], here: ORDER.map((id, i) => ({ id, t: EXPLODE_AT[i] })), hide: [] });
    const blasts = await buildBlasts(ctx, { scene, uniforms: SU, eye: eyeMid, place: PLACE, schedule, hero, seed: 'vg-planets:planets', fine: FINE, boost: BOOST,
      flashFrom: new THREE.Vector3(0, -70, 700), flashCap: 1.2, flashGain: 0.3, glowGain: 0.45, heat: 0.15, skyScale: 0.45,
      tell: 3.5 });   // the pair flares up for seconds before the drop: seen from the bedroom, through its window (the portal)   // a warm wash, never a white-out

    const camP = new THREE.Vector3();
    return {
      ...base,
      path, duration: DURATION,
      // through the push the gaze stays up on the sky between the drop's pair (the dip ahead would pull it down to the wheat)
      pois: [{ at: eyeMid.clone().add(new THREE.Vector3(Math.sin(-2 * D2R) * Math.cos(12 * D2R), Math.sin(12 * D2R), -Math.cos(-2 * D2R) * Math.cos(12 * D2R)).multiplyScalar(400)),
        from: 0, to: uPush - 0.04, fade: 0.08, weight: 0.85, steady: true }],
      // the push is slow, the dip into the wheat quick
      pace: (u) => 0.35 + 2.15 * Math.min(1, Math.max(0, (u - uPush + 0.02) / 0.14)),
      title: 'The Planets Burst over the Village',
      camera: { fov: 60, near: 0.3, far: 6500, lookAhead: 3, sway: 0.35, bank: 0 },   // short: the dip ahead must not pull the gaze down early
      // the hand-off hides in the wheat: a bare pane (the exact window, no rim) that fades in while the stalks fill the frame
      portal: { shape: 'rect', width: 10, height: 7, frame: 0, lens: 0, color: '#F6D54A', veil: '#1A2450', revealDistance: 8, blendDistance: 4, drawWithin: 2.3, drawIn: 0, fadeIn: [2.3, 1.4] },
      post: { ...base.post, bloom: { strength: 0.45, radius: 0.6, threshold: 0.95 } },
      explodeAt: blasts.explodeAt,
      update(dt, time, camera, u) {
        base.update(dt * SLOW, time * SLOW, camera, 0.2);   // the valley on a slow clock (calm sky); no drain, no flock
        camP.setFromMatrixPosition(camera.matrixWorld); if (camP.lengthSq() === 0) camP.copy(camera.position);
        blasts.update(time, camP);
        bridge.uniforms.uTime.value = time;
      },
    };
  },
};
