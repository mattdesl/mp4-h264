(async () => {
  const { simd } = await import("https://unpkg.com/wasm-feature-detect?module");
  const isSimdSupported = await simd();
  const loadEncoder = (await import("/build/mp4-encoder.js")).default;

  const Encoder = await loadEncoder({
    simd: isSimdSupported,
  });

  let encoder;
  let sab;

  self.addEventListener("message", ({ data }) => {
    if (data.event === "start") start(data.settings);
    else if (data.event === "frame") next(data.buffer);
    else if (data.event === "finish") finish();
  });

  self.postMessage({ event: "ready" });

  function start(settings) {
    sab = settings.sab;
    uint8 = new Uint8Array(sab);
    encoder = Encoder.create(settings);
  }

  function next(buffer) {
    // console.log(buffer);
    encoder.encodeRGB(uint8);
  }

  function finish() {
    const buffer = encoder.end();
    self.postMessage({ event: "end", buffer }, [buffer.buffer]);
  }
})();
