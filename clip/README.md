# Van Gogh × Weightless

A 4:16 music clip: one continuous camera flight through ten Van Gogh paintings, drawn entirely by code on top of Ethan Mollick's **Portals** engine ([emollick/ai-portals](https://github.com/emollick/ai-portals), CC BY-NC-SA 4.0: non-commercial, credit the author, share alike).

- Track: «Weightless» (Suno cad29003), 120.19 BPM, by Rocketmandrey.
- Video: 1920x1080 in this repo's [Releases](../../../releases).

## The world library

This branch is the full Portals site (471+ worlds in `src/worlds/`, with their parts in `src/parts/`), plus the Van Gogh worlds made for the clip:

| World | Painting | Seam into the next one |
|---|---|---|
| `vg-almond` | Almond Blossom / Orchard in Blossom | the wind tears a cloud of petals off the tree |
| `vg-sunflowers` | Sunflowers, Irises | field to field |
| `vg-crows` | Wheatfield with Crows | through the wheat |
| `vg-sower` | The Sower | violet tulips grow out of the furrows; dive into a tulip cup |
| `vg-olives` | Olive Trees | through the olive leaves |
| `vg-cafe` | Café Terrace at Night | rise over the roofs, then into the lit upstairs window |
| `vg-bedroom` | The Bedroom | out through the window |
| `vg-road` | Road with Cypress and Star | glide over the wheat to the horizon |
| `vg-rhone` | Starry Night over the Rhône | finale: palette-knife smear, counter-clockwise |
| `vg-planets` | (valley, not in the final cut) | |

Shared pieces:

| Part | What it does |
|---|---|
| `src/parts/the-turning-night.js` | paint and impasto stroke shaders |
| `vg-blasts.js` | painted planets that stay invisible until they burst |
| `vg-figure.js` | people painted as stroke silhouettes |
| `vg-hours.js` | time of day across the suite |
| `vg-canvas-twist.js` | the final paint vortex |

The suite id is `van-gogh` (`src/worlds/index.js`). It holds the per-world durations, the hours and the burst schedule.

## Run

```bash
node tools/serve.mjs . 8000            # then open http://localhost:8000/?suite=van-gogh
```

One world, frozen and grabbable:

```
?world=vg-rhone&freeze&grab&nopose&quality=high
```

Then call `window.__pose(u,t)` and read `window.__png`.

**Endings.** The default is `j` (palette knife). Other variants:

- `&ending=a..i` and `a2`: the earlier vortex variants;
- `&ending=v8`: the 2D flatten.

The sower ending defaults to `d` (tulips); `&sowerEnd=a|b|c` switches to poppies, white flowers or star flowers.

## Render (deterministic, headless Chromium)

```bash
uv run --with playwright==1.61.0 python tools/render_journey.py --suite van-gogh --tail 60 --t1 256 \
  --w 1920 --h 1080 --crf 17 --maxrate 22M --bufsize 44M --out final.mp4
```

Then mux the audio with ffmpeg.

`render_journey.py` writes three sidecar files:

| File | Contents |
|---|---|
| `.times.json` | seam times |
| `.bursts.json` | burst times |
| `.log.json` | per-frame camera pose |
