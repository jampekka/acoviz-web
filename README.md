# acoviz-web

Browser versions of three interactive exhibition simulations, Siliävuori, Hiidenkirnukivi and Pirunkirkko. They run the exhibition's scene code and virtual instrument, with its audio processing in Web Audio.

## Run and build

Requires Node.js; `npm run serve` uses Python 3.

    npm install
    npm run build
    npm run serve

`npm run build` writes a static site with relative paths to `dist/`, which can be served from any directory. Open it at http://localhost:8000. `?scene=Hiidenkirnukivi` and `?scene=Pirunkirkko` open the other scenes.

The audio assets are rendered from the exhibition's Csound scenes with native Csound: `csound/render_responses.csd` writes the impulse responses in `assets/responses`, and `csound/render_drums.csd` the drum samples in `assets/drums` (needs the FluidSynth opcodes and the FluidR3 GM soundfont).

## Controls

Click, tap or press Space to drum. Sound moves the scene and silence returns it. The buttons on the left show the virtual instrument, turn on the microphone, which is processed locally, and change the scene.

Third-party licences are in `LICENSES/`.
