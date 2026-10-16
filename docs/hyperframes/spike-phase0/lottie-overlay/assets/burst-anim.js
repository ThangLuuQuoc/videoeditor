// Hand-written Lottie (bodymovin 5.7) fixture: pulsing ring + spinning bar, 90 frames @ 30fps.
// Exposed as a global so no fetch is needed during render.
window.BURST_ANIM = {
  v: "5.7.4", fr: 30, ip: 0, op: 90, w: 512, h: 512, nm: "burst", ddd: 0, assets: [],
  layers: [
    {
      ddd: 0, ind: 1, ty: 4, nm: "ring", sr: 1, ao: 0, ip: 0, op: 90, st: 0, bm: 0,
      ks: {
        o: { a: 1, k: [
          { t: 0, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
          { t: 60, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
          { t: 90, s: [0] } ] },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [256, 256, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [
          { t: 0, s: [10, 10, 100], i: { x: [0.2, 0.2, 0.2], y: [1, 1, 1] }, o: { x: [0.6, 0.6, 0.6], y: [0, 0, 0] } },
          { t: 45, s: [100, 100, 100] } ] },
      },
      shapes: [{
        ty: "gr", nm: "ring-group", it: [
          { ty: "el", d: 1, nm: "ellipse", s: { a: 0, k: [380, 380] }, p: { a: 0, k: [0, 0] } },
          { ty: "st", nm: "stroke", c: { a: 0, k: [1, 0.9, 0, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 28 }, lc: 2, lj: 2 },
          { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
        ],
      }],
    },
    {
      ddd: 0, ind: 2, ty: 4, nm: "bar", sr: 1, ao: 0, ip: 0, op: 90, st: 0, bm: 0,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 1, k: [
          { t: 0, s: [0], i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } },
          { t: 90, s: [360] } ] },
        p: { a: 0, k: [256, 256, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [{
        ty: "gr", nm: "bar-group", it: [
          { ty: "rc", d: 1, nm: "rect", s: { a: 0, k: [300, 64] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 32 } },
          { ty: "fl", nm: "fill", c: { a: 0, k: [1, 0.25, 0.35, 1] }, o: { a: 0, k: 100 }, r: 1 },
          { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
        ],
      }],
    },
  ],
};
