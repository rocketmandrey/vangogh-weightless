# Deterministic render of a whole journey (worlds flown in order, every crossing the engine's own portal, no cuts).
#   uv run --with playwright==1.61.0 python tools/render_journey.py --suite van-gogh --out /tmp/j.mp4
# The page runs with opts.hold (the engine draws nothing by itself); this script steps engine.frame(1/fps) per frame and
# grabs the canvas in the same task. After every crossing it waits (wall clock only) until the next world is built and
# warmed, so the flight never meets an unready portal: the picture is a function of the frame index alone.
# Generic: --suite or --tour (any world list), --hours / --durations JSON overrides ({id: hour} / {id: seconds}),
# --start (begin at a world of the list), --t0/--t1 (grab only that window), --offset (added to printed times, for a
# second half rendered on its own), --tail (seconds flown into the last world), --nofade, --dry (no grabbing, just the times).
import argparse, asyncio, base64, json, subprocess, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument('--suite'); ap.add_argument('--tour', help='comma list of world ids (instead of --suite)')
ap.add_argument('--hours', help='JSON {id: hour}'); ap.add_argument('--durations', help='JSON {id: seconds}')
ap.add_argument('--blasts', help='JSON {id: {before, here, hide}} (parts/vg-blasts.js schedules)')
ap.add_argument('--start', help='world id of the list to start from')
ap.add_argument('--out', default='/tmp/journey.mp4'); ap.add_argument('--times', help='write crossing times JSON here (default: <out>.times.json)')
ap.add_argument('--w', type=int, default=960); ap.add_argument('--h', type=int, default=540); ap.add_argument('--fps', type=int, default=30)
ap.add_argument('--t0', type=float, default=0); ap.add_argument('--t1', type=float, default=1e9)
ap.add_argument('--tail', type=float, default=6, help='seconds into the last world before stopping')
ap.add_argument('--offset', type=float, default=0); ap.add_argument('--seed', type=int, default=7)
ap.add_argument('--port', type=int, default=8016); ap.add_argument('--dry', action='store_true')
ap.add_argument('--nofade', action='store_true', help='no fade up from black at the start (a later part of a journey)')
ap.add_argument('--fadein', type=float, default=0.5, help='seconds of the fade up from black at the start (the engine lifts it 0.6/s)')
ap.add_argument('--crf', help='constant quality (libx264 -crf) instead of --bitrate; capped by --maxrate/--bufsize only when they are given'); ap.add_argument('--bitrate', default='2.6M'); ap.add_argument('--maxrate'); ap.add_argument('--bufsize')
ap.add_argument('--extra', default='', help='extra query string, e.g. &aa=4')
A = ap.parse_args()

INIT = """(() => { const o = %s; let e;
  Object.defineProperty(window, '__engine', { configurable: true, get: () => e, set: (v) => { e = v; v.opts.hold = true;
    if (o.hours) v.opts.tourHours = Object.assign({}, v.opts.tourHours || {}, o.hours);
    if (o.durations) v.opts.tourDurations = Object.assign({}, v.opts.tourDurations || {}, o.durations);
    if (o.blasts) v.opts.tourBlasts = Object.assign({}, v.opts.tourBlasts || {}, o.blasts); } });
  addEventListener('DOMContentLoaded', () => { const s = document.createElement('style');
    s.textContent = 'body > *:not(#view){display:none!important} #view{cursor:none}'; document.head.appendChild(s); });
})();"""

# (v, w: the camera's velocity (m/s) and turn (rad/s) over the frame, in its own axes [right, up, back]; across a crossing the
# last pose is carried into the new world's space first, so a seam's jolt shows as a step in them)
STEP = """([dt, grab]) => { const e = window.__engine, c = e.camera, A0 = e.cur, B0 = e.next, p0 = c.position.clone(), q0 = c.quaternion.clone();
  e.frame(dt);
  if (e.cur !== A0 && e.cur === B0) { const M = c.matrixWorld.clone().multiplyMatrices(B0.entry, A0.exitInv), mq = q0.clone(), ms = p0.clone(); M.decompose(ms, mq, ms.clone()); p0.applyMatrix4(M); q0.premultiply(mq); }
  const qi = c.quaternion.clone().invert(), v = c.position.clone().sub(p0).applyQuaternion(qi).multiplyScalar(dt > 0 ? 1 / dt : 0);
  const dq = q0.clone().invert().multiply(c.quaternion), an = 2 * Math.acos(Math.min(1, Math.abs(dq.w))), sn = Math.sqrt(Math.max(1e-12, 1 - dq.w * dq.w)) * Math.sign(dq.w || 1);
  const w = [dq.x / sn * an / dt, dq.y / sn * an / dt, dq.z / sn * an / dt].map((x) => (Number.isFinite(x) && an > 1e-7 ? +x.toFixed(4) : 0));
  const B = e.next && e.next.ready ? e.next : null;
  return { id: e.cur.def.id, n: e.count, ready: !!B, err: (window.__errors || []).length,
           t: e.cur.time, u: e.cur.dist / e.cur.path.length, v: [v.x, v.y, v.z].map((x) => +x.toFixed(4)), w, ex: e.cur.world.explodeAt || null, nid: B ? B.def.id : null, nt: B ? B.time : 0, nex: B ? B.world.explodeAt || null : null,
           img: grab ? e.renderer.domElement.toDataURL('image/jpeg', 0.93) : null }; }"""

WAIT_NEXT = """(last) => new Promise((res) => { const e = window.__engine, t0 = performance.now();
  if (e.next && e.next.def && e.next.def.id === last) e.opts.single = true;   // nothing is queued after the last world
  const f = () => { if (e.cur.def.id === last || (e.next && e.next.ready)) { if (e.next && e.next.def && e.next.def.id === last) e.opts.single = true; res(performance.now() - t0); } else setTimeout(f, 30); }; f(); })"""


async def main():
    q = f'?ante=0&hud=0&session={A.seed}&seed={A.seed}&ride=off&companion=off&style=off&quality=high&pr=1&camera=sweeping&maxdt=0.05'
    if A.suite: q += f'&suite={A.suite}'
    elif A.tour: q += f'&tour={A.tour}'
    else: sys.exit('--suite or --tour')
    if A.start: q += f'&start={A.start}'
    q += A.extra
    srv = subprocess.Popen(['node', 'tools/serve.mjs', '.', str(A.port)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1.2)
    enc = None
    if not A.dry:
        enc = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', str(A.fps), '-i', '-',
                                '-vf', 'scale=in_range=pc:out_range=tv', '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-color_range', 'tv', *(['-crf', A.crf] + (['-maxrate', A.maxrate, '-bufsize', A.bufsize or A.maxrate] if A.maxrate else []) if A.crf else ['-b:v', A.bitrate, '-maxrate', A.maxrate or '3.2M', '-bufsize', A.bufsize or '6M']),
                                '-movflags', '+faststart', A.out], stdin=subprocess.PIPE)
    cross = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
            pg = await b.new_page(viewport={'width': A.w, 'height': A.h})
            pg.on('console', lambda m: m.type == 'error' and print('console:', m.text[:300], flush=True))
            pg.on('pageerror', lambda e: print('pageerror:', str(e)[:300], flush=True))
            await pg.add_init_script(INIT % json.dumps({'hours': json.loads(A.hours) if A.hours else None, 'durations': json.loads(A.durations) if A.durations else None, 'blasts': json.loads(A.blasts) if A.blasts else None}))
            await pg.goto(f'http://localhost:{A.port}/{q}', timeout=120000)
            await pg.wait_for_function('window.__engine && window.__engine.cur && window.__engine.next && window.__engine.next.def', timeout=300000, polling=100)
            # the worlds as flown: the one on screen, the one queued behind its portal, then what is left of the tour
            order = await pg.evaluate('(() => { const e = window.__engine; return [e.cur.def.id, e.next.def.id].concat(e.opts.tour || []).filter((x, i, a) => a.indexOf(x) === i); })()')
            last = order[-1]
            print('order:', ' > '.join(order), flush=True)
            await pg.evaluate("(() => { const e = window.__engine; e.time = 0; e.fade = %.4f; e.camInit = false; })()" % (1 if A.nofade else max(0.0, 1 - 0.6 * A.fadein)))
            dt, i, cur, t_last, s0, waited = 1 / A.fps, 0, order[0], None, time.time(), 0.0
            cross.append({'world': cur, 't': A.offset})
            log, bursts, lastT = [], [], {}   # per frame (t, world, world time, next, its time, u on the path, v, w: see STEP); each burst at the first frame its world's time reaches it
            def seen(w, wt, ex, t):
                p = lastT.get(w, -1.0); lastT[w] = wt
                for k, tb in enumerate(ex or []):
                    if p < tb <= wt: bursts.append({'world': w, 'k': k, 'at': tb, 't': round(t + A.offset, 3)}); print(f'  burst {w}#{k} (world {tb}) at {t + A.offset:7.3f}s', flush=True)
            while True:
                if cur != last: waited += await pg.evaluate(WAIT_NEXT, last) / 1000
                t = i / A.fps
                grab = not A.dry and A.t0 <= t < A.t1
                r = await pg.evaluate(STEP, [dt, grab])
                if grab: enc.stdin.write(base64.b64decode(r['img'].split(',')[1]))
                seen(r['id'], r['t'], r['ex'], t)
                if r['nid']: seen(r['nid'], r['nt'], r['nex'], t)
                log.append([round(t + A.offset, 4), r['id'], round(r['t'], 4), r['nid'], round(r['nt'], 4), round(r['u'], 5), r['v'], r['w']])
                if r['id'] != cur:
                    cur = r['id']; cross.append({'world': cur, 't': round(t + A.offset, 3)})
                    print(f'cross -> {cur} at {t + A.offset:7.3f}s (frame {i})  wall {time.time() - s0:.0f}s', flush=True)
                    if cur == last: t_last = t
                i += 1
                if (t_last is not None and t - t_last >= A.tail) or t >= A.t1 or (cur not in order): break
                if i % 300 == 0: print(f'  t={t:6.1f}s {cur} wall {time.time() - s0:.0f}s (waited for builds {waited:.0f}s)', flush=True)
            print(f'{i} frames, {time.time() - s0:.0f}s wall', flush=True)
            await b.close()
    finally:
        if enc: enc.stdin.close(); enc.wait()
        srv.kill()
    tp = A.times or (A.out + '.times.json')
    Path(tp).write_text(json.dumps(cross, indent=1))
    Path(A.out + '.bursts.json').write_text(json.dumps(bursts, indent=1)); Path(A.out + '.log.json').write_text(json.dumps(log))
    print('bursts:'); [print(f"  {b['t']:8.3f}s  {b['world']}#{b['k']}") for b in bursts]
    print('crossings:'); [print(f"  {c['t']:8.3f}s  {c['world']}") for c in cross]

asyncio.run(main())
