// VG FIGURE: Van Gogh's small figures (Cafe Terrace, Road with Cypress, Starry Night over the Rhone) as a handful of
// brush marks, for the flat-stroke sets of vg-night / vg-cafe (set.add(p, d, hw, col, em, n, bend, wiggle, hash)).
// Each mass (coat, skirt, a limb) is a dark Prussian card a little wider than the mass, so it reads as a contour from
// every side, with a ring of broad strokes round it that follow the mass's taper (drapery fans out, a coat hangs),
// lighter and orange-touched on the lit side, cool ultramarine in the shade. No face: the head is a dark dab with one
// warm dab on the face side, under a straw or felt hat. Idle sway / walking legs ride the set's wiggle (aW).
import * as THREE from 'three';

const H = (h) => new THREE.Color(h);
export const FIG = {
  ink: H('#0A1230'),
  coat: ['#1B2A5C', '#223A7A', '#2A4A8A', '#1E2E66'].map(H),               // Prussian / ultramarine
  coatWarm: ['#3A2A20', '#4A3424', '#2A2430'].map(H),                       // the odd brown jacket
  legs: ['#1A2048', '#24305E', '#2A2A3A'].map(H),
  dress: ['#2A3A7A', '#5A2430', '#2A4A40', '#3A2A4A', '#1E2A5A'].map(H),
  straw: ['#E0B848', '#E8C860', '#D8A838'].map(H),
  felt: ['#141826', '#1E2232', '#2A2A3A'].map(H),
  cap: ['#E8E0C8', '#D8D0B0'].map(H),
  skin: H('#C8804A'),
  hair: H('#2A1E18'),
  hot: H('#E8923A'), ochre: H('#E0B04A'), cool: H('#3A56B0'),
  white: ['#ECEAD8', '#DCDCC8', '#F2EEDC'].map(H),
};

// set: a vg-night/vg-cafe flat set; rng: the figure's own rng (keeps the world's stream untouched)
// o: x, y, z (feet), face (yaw: forward = (sin, cos)), kind 'stand' | 'walk' | 'sit', h (scale), woman, coat, legs, dress,
//    hat 'straw' | 'felt' | 'cap' | null, hatCol, apron, light [lx, lz] (unit, world xz), warm 0..1 (orange on the lit side),
//    hot (highlight pigment), ink (contour), sway (idle amplitude), rate (idle rad/s), stride (walk rad/s), noArm 1 | -1
// returns anchors for props: { sh (shoulder y), hand(sd) [x, y, z], rx, rz, fx, fz }
export function paintFigure(set, rng, o) {
  const pick = (a) => a[Math.floor(rng() * a.length)], R = (a, b) => a + (b - a) * rng();
  const h = o.h ?? 1, fx = Math.sin(o.face || 0), fz = Math.cos(o.face || 0), rx = fz, rz = -fx;
  const [lx, lz] = o.light || [0.6, 0.8], warm = o.warm ?? 0.3, hot = o.hot || FIG.hot, ink = o.ink || FIG.ink;
  const hs = rng(), walk = o.kind === 'walk', sit = o.kind === 'sit';
  const coat = o.coat || pick(FIG.coat), legs = o.legs || pick(FIG.legs), dress = o.dress || pick(FIG.dress);
  const sway = [(o.sway ?? 0.006) * h, 0.002 * h, (o.sway ?? 0.006) * h, o.rate ?? R(0.6, 1.1)];
  const tones = set.tones; set.tones = false;                 // figures carry their own tones
  const P = (a, y, b) => [o.x + (rx * a + fx * b) * h, o.y + y * h, o.z + (rz * a + fz * b) * h];
  const A = (a, y, b, da, dy, db, hw, c, bend = 0, wig = sway) => {
    const [px, py, pz] = P(a, y, b);
    set.add(px, py, pz, (rx * da + fx * db) * h, dy * h, (rz * da + fz * db) * h, hw * h, c, 0, 0, 0, 0, bend, wig, hs);
  };
  const shade = (c, k) => {                                    // k: -1 shade .. 1 lit; a narrow range, so a mass stays one mass
    const t = c.clone().multiplyScalar(0.9 + 0.16 * Math.max(0, k) + R(-0.04, 0.04));
    if (k > 0.55) t.lerp(hot, warm * (k - 0.55) * 0.5);
    else if (k < -0.3) t.lerp(FIG.cool, 0.12);
    return t;
  };
  const dark = (c) => ink.clone().lerp(c, 0.22);
  // a mass from yt (top) to yb (bottom), half widths wt / wb, half depth dp, centre forward bt / bb (a lean)
  const mass = (yt, yb, wt, wb, dp, n, pal, bt = 0, bb = 0, wig = sway) => {
    const hy = (yt - yb) / 2;
    for (let j = 0; j < 3; j++) {                               // the contour card: three dark strokes down the taper
      const f = (j + 0.5) / 3, w = wt + (wb - wt) * f;
      A(0, yt - f * 2 * hy, bt + (bb - bt) * f, 0, hy / 3 * 1.15, (bb - bt) / 6, w + 0.028, dark(pal[0]), 0, wig);
    }
    for (let i = 0; i < n; i++) {                                // broad strokes round it, each over part of the height, a little aslant
      const an = (i + R(0, 0.7)) / n * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
      const k = (rx * ca + fx * sa) * lx + (rz * ca + fz * sa) * lz;
      const t0 = i % 2 ? R(0, 0.15) : R(0.3, 0.45), t1 = Math.min(1, t0 + R(0.5, 0.65)), ya = yt - t0 * 2 * hy, yb2 = yt - t1 * 2 * hy;
      const wa = wt + (wb - wt) * t0, wb2 = wt + (wb - wt) * t1, ba = bt + (bb - bt) * t0, bb2 = bt + (bb - bt) * t1, sk = (i % 2 ? 1 : -1) * R(0.06, 0.18);
      const a0 = (ca * 0.56 + sk) * wa, a1 = (ca * 0.56 - sk) * wb2, d0 = ba + sa * dp, d1 = bb2 + sa * dp;
      A((a0 + a1) / 2, (ya + yb2) / 2, (d0 + d1) / 2, (a1 - a0) / 2, (yb2 - ya) / 2, (d1 - d0) / 2, (wt + wb) / 2 * R(0.42, 0.52), shade(pick(pal), k), R(-0.3, 0.3), wig);
    }
    // one or two loaded highlight strokes down the lit flank
    const la = Math.atan2(lx * fx + lz * fz, lx * rx + lz * rz);
    for (let i = 0, m = warm > 0.15 ? 2 : 1; i < m; i++) {
      const an = la + R(-0.5, 0.5), ca = Math.cos(an), sa = Math.sin(an), y0 = yt - R(0.05, 0.3) * 2 * hy, y1 = y0 - R(0.35, 0.6) * 2 * hy;
      const w0 = wt + (wb - wt) * (yt - y0) / (2 * hy), w1 = wt + (wb - wt) * Math.min(1, (yt - y1) / (2 * hy));
      A(ca * (w0 + w1) / 2 * 0.74, (y0 + y1) / 2, (bt + bb) / 2 + sa * dp * 1.08, ca * (w1 - w0) * 0.37, (y1 - y0) / 2, 0, (wt + wb) / 2 * 0.14, hot.clone().multiplyScalar(0.55 + 0.45 * warm).lerp(pick(pal), 0.25), R(-0.3, 0.3), wig);
    }
  };
  // a limb from p to q (a, y, b): a dark stroke and two narrower coloured ones, one each side of it in depth
  const limb = (p, q, hw, c, wig = sway, k = 0) => {
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], d = [(q[0] - p[0]) / 2, (q[1] - p[1]) / 2, (q[2] - p[2]) / 2];
    A(m[0], m[1], m[2], d[0] * 1.06, d[1] * 1.06, d[2] * 1.06, hw + 0.016, dark(c), 0.05, wig);
    for (const s of [-1, 1]) A(m[0], m[1], m[2] + s * hw * 0.45, d[0] * 0.9, d[1] * 0.9, d[2] * 0.9, hw * 0.52, shade(c, k + R(-0.2, 0.2)), 0.1, wig);
  };
  const dab = (a, y, b, hw, c, wig = sway, dy = 0.02) => A(a, y, b, 0, dy, 0, hw, c, 0.1, wig);
  const lk = (sd) => (rx * sd) * lx + (rz * sd) * lz;           // how lit the side sd is

  let sh, hy, hb = 0, hand = {};
  if (sit) {
    // hips on the seat (0.47), knees forward, shins down, the trunk leaning to the table, forearms on it
    for (const sd of [-1, 1]) {
      const c = o.woman ? dress : legs;
      limb([sd * 0.085, 0.5, 0.02], [sd * 0.09, 0.5, 0.4], 0.046, c, sway, lk(sd));
      limb([sd * 0.09, 0.48, 0.42], [sd * 0.09, 0.06, 0.46], 0.038, c, sway, lk(sd));
      A(sd * 0.09, 0.03, 0.5, 0, 0, 0.06, 0.03, ink, 0, sway);
    }
    if (o.woman) mass(0.62, 0.08, 0.17, 0.25, 0.14, 9, [dress], 0.22, 0.36);
    mass(1.12, 0.5, 0.18, 0.17, 0.1, 6, [o.woman ? dress : coat], 0.14, 0.02);
    sh = 1.08; hy = 1.22; hb = 0.15;
    for (const sd of [-1, 1]) {                                 // upper arm down to the elbow on the table, forearm in
      if (o.noArm === sd) continue;
      const c = o.woman ? dress : coat;
      limb([sd * 0.2, 1.05, 0.14], [sd * 0.2, 0.8, 0.34], 0.04, c, sway, lk(sd));
      limb([sd * 0.2, 0.79, 0.34], [sd * 0.08, 0.79, 0.52], 0.034, c, sway, lk(sd));
      dab(sd * 0.06, 0.8, 0.55, 0.026, shade(FIG.skin, lk(sd) * 0.5 + 0.3));
      hand[sd] = P(sd * 0.06, 0.8, 0.55);
    }
  } else {
    const st = walk ? 0.07 : 0, rate = o.stride ?? 3.2;
    for (const sd of [-1, 1]) {                                 // legs: a walker's swing from the hip (tip-only wiggle)
      const wig = walk ? [fx * 0.15 * sd * h, 0, fz * 0.15 * sd * h, -rate] : sway, ws = walk ? [fx * 0.15 * sd * h, 0.02 * h, fz * 0.15 * sd * h, rate] : sway;
      if (!o.woman) limb([sd * 0.075, 0.86, -st * sd], [sd * 0.085, 0.06, st * sd], 0.05, legs, wig, lk(sd));
      A(sd * 0.085, 0.03, st * sd + 0.05, 0, 0, 0.065, 0.032, ink, 0, ws);
    }
    if (o.woman) {
      mass(0.94, 0.04, 0.15, 0.27, 0.16, 9, [dress, dress.clone().multiplyScalar(1.15)]);
      mass(1.42, 0.9, 0.16, 0.13, 0.09, 8, [o.blouse || dress]);
    } else {
      mass(1.44, 0.78, 0.175, 0.15, 0.1, 7, [coat, coat.clone().multiplyScalar(1.12)]);
    }
    if (o.apron) {                                              // the waiter: a long white apron in front, white sleeves
      mass(1.02, 0.3, 0.15, 0.18, 0.03, 6, FIG.white, 0.1, 0.12);
      mass(1.42, 1.02, 0.08, 0.1, 0.03, 4, FIG.white, 0.1, 0.1);
    }
    sh = 1.4; hy = 1.54;
    const armC = o.apron ? FIG.white[0] : o.woman ? (o.blouse || dress) : coat;
    for (const sd of [-1, 1]) {
      if (o.noArm === sd) continue;
      const wig = walk ? [-fx * 0.09 * sd * h, 0, -fz * 0.09 * sd * h, -(o.stride ?? 3.2)] : sway;
      const ha = [sd * (o.woman ? 0.17 : 0.2), 0.86, walk ? 0 : 0.04];
      limb([sd * (o.woman ? 0.16 : 0.18), 1.36, 0], ha, 0.04, armC, wig, lk(sd));
      dab(ha[0], ha[1] - 0.04, ha[2], 0.026, shade(FIG.skin, lk(sd) * 0.5 + 0.2), walk ? [wig[0], 0, wig[2], -wig[3]] : sway);
      hand[sd] = P(ha[0], ha[1] - 0.04, ha[2]);
    }
  }
  // the head: no face, a dark dab with one warm dab on the face side (hair behind), the hat over it
  dab(0, sh + 0.05, hb - 0.01, 0.05, dark(coat), sway, 0.04);                // the neck, so the head sits on the shoulders
  dab(0, hy, hb, 0.07, dark(FIG.hair), sway, 0.03);
  dab(0, hy - 0.012, hb + 0.04, 0.04, FIG.skin.clone().multiplyScalar(0.62).lerp(hot, warm * 0.25), sway, 0.018);
  dab(0, hy + 0.02, hb - 0.035, 0.05, FIG.hair.clone(), sway, 0.025);
  const hat = o.hat === undefined ? (o.woman ? 'cap' : rng() < 0.35 ? 'straw' : 'felt') : o.hat;
  if (hat) {
    const hc = o.hatCol || pick(hat === 'straw' ? FIG.straw : hat === 'cap' ? FIG.cap : FIG.felt), yb = hy + (hat === 'cap' ? 0.05 : 0.065);
    if (hat === 'cap') { dab(0, yb - 0.01, hb - 0.025, 0.058, shade(hc, 0.2).multiplyScalar(0.8), sway, 0.022); }
    else {
      const R0 = hat === 'straw' ? 0.15 : 0.11;
      for (let i = 0; i < 9; i++) {                             // the brim: flat strokes round it, its dark edge under
        const an = (i + 0.5) / 9 * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
        const [px, py, pz] = P(ca * R0 * 0.7, yb, hb + sa * R0 * 0.7), k = ca * (rx * lx + rz * lz) + sa * (fx * lx + fz * lz);
        set.add(px, py, pz, (-rx * sa + fx * ca) * R0 * 0.45 * h, 0, (-rz * sa + fz * ca) * R0 * 0.45 * h, R0 * 0.34 * h, shade(hc, 0.4 + 0.6 * k), 0, 0, 1, 0, 0.15, sway, hs);
      }
      dab(0, yb + 0.03, hb, 0.064, shade(hc, 0.5), sway, 0.018);
      dab(0, yb + 0.012, hb, 0.066, hat === 'straw' ? FIG.ink.clone().lerp(FIG.cool, 0.4) : hc.clone().multiplyScalar(0.6), sway, 0.012);
    }
  }
  set.tones = tones;
  return { sh, hand: (sd) => hand[sd], rx, rz, fx, fz, hs, sway, P };
}
