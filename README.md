# Parity

A free online speedcubing timer: random-state scrambles, a 3D preview that scrambles itself for every event, sessions with WCA-style averages, charts, a PLL / OLL / 2-look / F2L trainer and twenty themes.

Live site: https://disturbedprophet.github.io/parity/

This `source` branch holds the editable code. The `main` branch holds the built site that GitHub Pages serves.

## Layout

- `src/head.html`, `src/head-site.html`: page head for the claude.ai Artifact and for the website (SEO tags, structured data)
- `src/styles.css`: all styles and themes
- `src/body.html`: page markup, including the static Guide page
- `src/js/*.js`: the app, concatenated in file-name order into one module
  - `10-cube.js` NxN sticker model, `20-solver.js` random-state solvers (runs in a Web Worker)
  - `30-scramble.js` events and random-move scramblers, `40-algs.js` trainer algorithm sets
  - `48-puzzles.js` Pyraminx, Skewb, Megaminx, Square-1 and Clock geometry and notation
  - `50-cube3d.js` Three.js renderer, `55-timer.js` timer state machine, `60`–`78` the pages, `90-app.js` app shell
- `src/site/`: robots.txt, llms.txt, favicon, web manifest and social image for the website
- `tools/`: build, deploy, tests and the F2L algorithm generator

## Commands

```sh
sh tools/build.sh                 # build parity.html and site/ (no absolute URLs)
sh tools/deploy.sh "message"      # build for GitHub Pages and push site/ to main
node tools/test-logic.js          # cube model, solvers, scramblers, algorithm sets
node tools/test-puzzles.js        # puzzle geometry, notation, Square-1 legality, random-state checks
node tools/gen-f2l.js             # regenerate the F2L algorithms (prints JSON)
```

To deploy from a fresh clone, first recreate `site/` as a checkout of `main`:

```sh
git clone -b main git@github.com:DisturbedProphet/parity.git site
```

Not affiliated with Rubik's Brand Ltd or the World Cube Association.
