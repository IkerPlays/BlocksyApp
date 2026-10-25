# Trailer tools

Builds the YouTube trailer from real footage (no hardware needed).

1. Web: `cd web && npx vite --config preview/vite.config.mjs`, then `node ../tools/trailer/rec.cjs <dir>` and `rec2.cjs <dir>` (Playwright video, software GL, about 5 fps).
2. 3DS: compile `3ds/preview/anim.c` like `preview.c` (see `3ds/preview/README.md`), run `./preview/anim <world> <frames> <sky>` from `3ds/`, then `OPS=preview/ops_anim.txt python3 preview/render.py <dir>` and crop the top screen (800x480) into `ds/<world>/<world>_NNN.png`.
3. Convert the webm files to 30 fps mp4 into `clips/` and run `python3 build2.py` (needs ffmpeg and Pillow). Captions and cards are in `build2.py`.
