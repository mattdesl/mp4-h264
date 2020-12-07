import loadEncoder from "/build/mp4-encoder.js";
import PixelReader from "./util/PixelReader.js";
import { settings, sketch, show } from "./util/sketch.js";

(async () => {
  const { simd } = await import("https://unpkg.com/wasm-feature-detect?module");
  const isSimdSupported = await simd();
  const Encoder = await loadEncoder({
    simd: isSimdSupported,
  });

  const [width, height] = settings.dimensions;
  const { render, context } = sketch(width, height);
  const { fps = 30, duration } = settings;
  if (!duration) throw new Error("Duration must be > 0");
  const totalFrames = Math.round(fps * duration);
  const pixelReader = PixelReader(context);
  const stride = pixelReader.channels;

  startEncoding();

  function startEncoding() {
    const encoder = Encoder.create({
      ...settings,
      width,
      height,
      fps,
      stride,
    });

    // get an RGB pointer into a memory array
    const rgb = encoder.getRGBPointer();

    let frame = 0;
    console.time("encoding");
    loop();

    function loop() {
      if (next()) {
        requestAnimationFrame(loop);
      }
    }

    function next() {
      if (frame >= totalFrames) {
        end();
        return false;
      } else {
        const playhead = frame / totalFrames;
        console.log("Encoding %d / %d", frame + 1, totalFrames);

        render({ playhead });

        // read WebGL pixels directly into Emscripten memory heap
        pixelReader.readInto(encoder.memory(), rgb);

        // now we can tell emscripten to read from its own memory source
        encoder.encodeRGBPointer();

        frame++;
        return true;
      }
    }

    function end() {
      const buffer = encoder.end();
      console.timeEnd("encoding");
      show(buffer, width, height);
    }
  }
})();
