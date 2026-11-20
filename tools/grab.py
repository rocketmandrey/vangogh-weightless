import asyncio, base64, sys, subprocess, time
from playwright.async_api import async_playwright
world, out, us = sys.argv[1], sys.argv[2], [float(x) for x in sys.argv[3].split(",")]
DUR = float(sys.argv[4]) if len(sys.argv) > 4 else 42
EXTRA = sys.argv[5] if len(sys.argv) > 5 else ""
W, H = 1280, 720
async def main():
    srv = subprocess.Popen(['node', 'tools/serve.mjs'], cwd=__import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.abspath(__file__))), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
            pg = await b.new_page(viewport={'width': W, 'height': H})
            pg.on('console', lambda m: m.type == 'error' and print('console:', m.text[:200]))
            await pg.goto(f'http://localhost:8000/?world={world}&freeze&grab&nopose&quality=high&pr=1{EXTRA}', timeout=120000)
            await pg.wait_for_function('window.__shotReady === true', timeout=300000)
            print('renderer:', await pg.evaluate("(()=>{const g=window.__engine.renderer.getContext();const e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'?'})()"))
            for i, u in enumerate(us):
                t0 = time.time()
                await pg.evaluate(f'window.__pose({u}, {u*DUR})')
                png = await pg.evaluate('window.__png')
                open(f'{out}_{i:02d}.png', 'wb').write(base64.b64decode(png.split(',')[1]))
                print(u, f'{time.time()-t0:.2f}s')
            await b.close()
    finally:
        srv.kill()
asyncio.run(main())
