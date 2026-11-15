const THREE = require('three');
const { Pass, FullScreenQuad } = require('three/examples/jsm/postprocessing/Pass.js');
const { FlameFeedbackPass } = require('./flame_effect.js');
const { WarpShader } = require('./warp_effect.js');

const quadVS = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

/* --------------------
   Buffer A (feedback) – build colored flames only into an RT
   -------------------- */
const feedbackFS = /* glsl */`
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D source;   // live source (webcam/video/image)
  uniform sampler2D prev;     // previous flame buffer (ping-pong)
  uniform vec2  resolution;
  uniform float time;

  // -------- params (all lowercase) --------
  uniform float decay;     // 0.97..0.995 trail length
  uniform float zoom;      // inward zoom per frame
  uniform float inject;    // fresh edge injection each frame [0..1]
  uniform float drift;     // tiny translation
  uniform float wobble;    // subtle center wander

  uniform float edge_low;    // sobel threshold low
  uniform float edge_high;   // sobel threshold high
  uniform float flame_gain;  // scales injected edge strength
  uniform float flame_gamma; // <1 brightens edge mask
  uniform float sat_boost;   // 1 = no change

  uniform vec3  zoom_rgb;  // per-channel zoom multipliers (e.g. 1.0,1.02,1.04)
  uniform vec3  seed_rgb;  // per-channel wobble seeds
  uniform float first_frame;// 1.0 on first render, else 0.0

  // ---------- helpers ----------
  float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
  vec2 toP(vec2 uv, vec2 R){ vec2 fc = uv*R; return (fc - 0.5*R) / R.y; }
  vec2 toUV(vec2 p, vec2 R){ vec2 uv = p; uv.x *= R.y/R.x; return uv + 0.5; }
  vec2 wrapUV(vec2 uv){ return fract(uv); }

  vec3 sat(vec3 c, float k){ float Y = luma(c); return mix(vec3(Y), c, k); }

  vec3 sobelEdgeRGB(sampler2D tex, vec2 uv, vec2 R){
    vec2 px = 1.0 / R;
    vec3 tl = texture2D(tex, uv + px*vec2(-1.,  1.)).rgb;
    vec3 tc = texture2D(tex, uv + px*vec2( 0.,  1.)).rgb;
    vec3 tr = texture2D(tex, uv + px*vec2( 1.,  1.)).rgb;
    vec3 ml = texture2D(tex, uv + px*vec2(-1.,  0.)).rgb;
    vec3 mc = texture2D(tex, uv + px*vec2( 0.,  0.)).rgb;
    vec3 mr = texture2D(tex, uv + px*vec2( 1.,  0.)).rgb;
    vec3 bl = texture2D(tex, uv + px*vec2(-1., -1.)).rgb;
    vec3 bc = texture2D(tex, uv + px*vec2( 0., -1.)).rgb;
    vec3 br = texture2D(tex, uv + px*vec2( 1., -1.)).rgb;

    vec3 Gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    vec3 Gy =  tl + 2.0*tc + tr - bl - 2.0*bc - br;

    vec3 g = sqrt(Gx*Gx + Gy*Gy);
    g = smoothstep(edge_low, edge_high, g);
    g = pow(clamp(g, 0.0, 1.0), vec3(flame_gamma));
    return g;
  }

  vec2 zoomTransformSeed(vec2 p, vec2 R, float t, float zoomAmt, float seed){
    vec2 centerUV = 0.5 + wobble * vec2(
      sin(0.63*t + seed*1.11),
      cos(0.81*t + seed*1.73)
    );
    vec2 centerP  = (centerUV - 0.5) * vec2(R.x/R.y, 1.0);
    vec2 q = p - centerP;
    q *= (1.0 - zoomAmt);
    q += centerP + drift * vec2(sin(0.7*t + seed*0.3), cos(1.1*t + seed*0.5));
    return q;
  }

  void main(){
    vec2 R = resolution;
    float t = time;

    // current source color (+ optional saturation pop)
    vec3 srcCol = sat(texture2D(source, vUv).rgb, sat_boost);

    // per-channel edges (current frame)
    vec3 e = sobelEdgeRGB(source, vUv, R);

    // aspect-correct p-space for transforms
    vec2 p = toP(vUv, R);

    // sample previous flames with per-channel transforms
    vec2 pPrevR = zoomTransformSeed(p, R, t, zoom * zoom_rgb.r, seed_rgb.r);
    vec2 pPrevG = zoomTransformSeed(p, R, t, zoom * zoom_rgb.g, seed_rgb.g);
    vec2 pPrevB = zoomTransformSeed(p, R, t, zoom * zoom_rgb.b, seed_rgb.b);

    float prevR = texture2D(prev, wrapUV(toUV(pPrevR, R))).r;
    float prevG = texture2D(prev, wrapUV(toUV(pPrevG, R))).g;
    float prevB = texture2D(prev, wrapUV(toUV(pPrevB, R))).b;

    // bootstrap
    prevR *= (1.0 - first_frame);
    prevG *= (1.0 - first_frame);
    prevB *= (1.0 - first_frame);

    // inject edge-masked source color (per channel)
    float injR = srcCol.r * e.r * flame_gain;
    float injG = srcCol.g * e.g * flame_gain;
    float injB = srcCol.b * e.b * flame_gain;

    // accumulate
    float flameR = prevR * decay + injR * inject;
    float flameG = prevG * decay + injG * inject;
    float flameB = prevB * decay + injB * inject;

    gl_FragColor = vec4(flameR, flameG, flameB, 1.0); // flames only
  }
`;

/* --------------------
   Composite – add flames on top of base
   -------------------- */
const compositeFS = /* glsl */`
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D baseTex;   // your base scene (usually readBuffer)
  uniform sampler2D flamesTex; // the accumulated flames RT
  uniform float gain;          // 0 => passthrough
  uniform float flame_view_gamma; // view-only gamma on flames
  uniform float flame_clamp;      // clamp final to [0..1] for LDR

  void main(){
    vec3 src    = texture2D(baseTex,   vUv).rgb;
    vec3 flames = texture2D(flamesTex, vUv).rgb;

    // view shaping for flames only
    flames = pow(clamp(flames, 0.0, 1.0), vec3(flame_view_gamma));

    vec3 outCol = src + flames * gain;        // additive overlay
    outCol = clamp(outCol, 0.0, flame_clamp); // keep LDR pleasant

    gl_FragColor = vec4(outCol, 1.0);
  }
`;

module.exports = { FlameFeedbackPass, WarpShader };
