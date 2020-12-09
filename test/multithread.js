import PixelReader from "./util/PixelReader.js";
import { settings, sketch, show } from "./util/sketch.js";

(async () => {
  const [width, height] = settings.dimensions;
  const { render, context } = sketch(width, height);
  const { fps = 30, duration } = settings;
  if (!duration) throw new Error("Duration must be > 0");

  const totalFrames = Math.round(fps * duration);
  const pixelReader = PixelReader(context);
  const stride = pixelReader.channels;
  const sab = new SharedArrayBuffer(width * height * stride);
  const uint8 = new Uint8Array(sab);

  const worker = new Worker("./multithread_worker.js");
  worker.addEventListener("message", ({ data }) => {
    if (data.event === "ready") startEncoding();
    else if (data.event === "end") {
      console.timeEnd("encoding");
      show(data.buffer, width, height);
    }
  });

  function startEncoding() {
    let frame = 0;

    console.time("encoding");
    worker.postMessage({
      event: "start",
      settings: {
        ...settings,
        sab,
        width,
        height,
        fps,
        stride,
      },
    });

    loop();

    function loop() {
      if (next()) {
        requestAnimationFrame(loop);
      }
    }

    function next() {
      if (frame >= totalFrames) {
        console.log("Finalizing encoding...");
        end();
        return false;
      } else {
        const playhead = frame / totalFrames;
        console.log("Rendering %d / %d", frame + 1, totalFrames);

        render({ playhead });

        pixelReader.readInto(uint8, 0);
        const buffer = sab;
        worker.postMessage({ event: "frame", buffer });

        frame++;
        return true;
      }
    }

    function end() {
      worker.postMessage({ event: "finish" });
    }
  }
})();
