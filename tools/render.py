# render a world's flight to mp4: python render.py world out.mp4 t0 t1 dur [W H fps extra]
# frame i -> world time t = t0 + i/fps, path u = t/dur (ponytail: linear u, ignores the world's pace curve)
import asyncio, base64, sys, subprocess, time
from playwright.async_api import async_playwright
world, out, t0, t1, dur = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:6])
W, H, FPS = (int(sys.argv[6]), int(sys.argv[7]), int(sys.argv[8])) if len(sys.argv) > 8 else (1280, 720, 30)
EXTRA = sys.argv[9] if len(sys.argv) > 9 else ''
async def main():
    srv = subprocess.Popen(['node', 'tools/serve.mjs'], cwd='..', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1.5)
    enc = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', str(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', out], stdin=subprocess.PIPE)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
            pg = await b.new_page(viewport={'width': W, 'height': H})
            await pg.goto(f'http://localhost:8000/?world={world}&freeze&grab&nopose&quality=high&pr=1&seed=7{EXTRA}', timeout=120000)
            await pg.wait_for_function('window.__shotReady === true', timeout=300000)
            n = int(round((t1 - t0) * FPS)); s = time.time()
            for i in range(n):
                t = t0 + i / FPS
                await pg.evaluate(f'window.__pose({t/dur}, {t})')
                enc.stdin.write(base64.b64decode((await pg.evaluate('window.__png')).split(',')[1]))
            print(world, n, 'frames', f'{time.time()-s:.0f}s')
            await b.close()
    finally:
        enc.stdin.close(); enc.wait(); srv.kill()
asyncio.run(main())
