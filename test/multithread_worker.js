(async () => {
  const { simd } = await import("https://unpkg.com/wasm-feature-detect?module");
  const isSimdSupported = await simd();
  const loadEncoder = (await import("/build/mp4-encoder.js")).default;

  const Encoder = await loadEncoder({
    simd: isSimdSupported,
  });

  let encoder;

  self.addEventListener("message", ({ data }) => {
    if (data.event === "start") start(data.settings);
    else if (data.event === "frame") next(data.buffer);
    else if (data.event === "finish") finish();
  });

  self.postMessage({ event: "ready" });

  function start(settings) {
    encoder = Encoder.create(settings);
  }

  function next(buffer) {
    encoder.encodeRGB(buffer);
  }

  function finish() {
    const buffer = encoder.end();
    self.postMessage({ event: "end", buffer }, [buffer.buffer]);
  }
})();
