(async () => {
  const { simd } = await import("https://unpkg.com/wasm-feature-detect?module");
  const isSimdSupported = await simd();
  const loadEncoder = (await import("/build/mp4-encoder.js")).default;

  const Encoder = await loadEncoder({
    simd: isSimdSupported,
  });

  const memory = Encoder.wasmMemory;
  let encoder;
  let rgb_pointer;
  let yuv_pointer;

  self.addEventListener("message", ({ data }) => {
    if (data.event === "start") {
      start(data.settings);
      self.postMessage({ event: "pointers", memory: memory, rgb_pointer });
    } else if (data.event === "frame") next(data.buffer);
    else if (data.event === "finish") finish();
  });

  self.postMessage({ event: "ready" });

  function start(settings) {
    encoder = Encoder.create(settings);
    rgb_pointer = encoder.getRGBPointer();
    yuv_pointer = encoder.getYUVPointer();
  }

  function next() {
    encoder.encodeRGBPointer();
  }

  function finish() {
    const buffer = encoder.end();
    self.postMessage({ event: "end", buffer }, [buffer.buffer]);
  }
})();
