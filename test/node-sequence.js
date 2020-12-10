const loadEncoder = require("../");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const writeFile = promisify(fs.writeFile);
const getPixels = promisify(require("get-pixels"));

const sequenceDir = path.resolve(__dirname, "sequence");

let files = fs
  .readdirSync(sequenceDir)
  .filter((f) => /\.(png|jpg|jpeg)$/.test(f));

files = files.map((f) => {
  const num = path.basename(f, path.extname(f));
  return {
    file: f,
    frame: parseInt(num),
  };
});
files.sort((a, b) => a.frame - b.frame);
files = files.slice(0, 30);

(async () => {
  const Encoder = await loadEncoder();
  let encoder;
  const fps = 30;

  console.time("encoding");
  await files.reduce(async (p, f) => {
    await p;
    const file = f.file;
    const rgba = await getPixels(path.resolve(sequenceDir, file));
    const [width, height, stride] = rgba.shape;

    // 1 sec = 1 mb
    // (1 * 8192) / 1
    const desiredMBs = 1;
    const seconds = 1;
    if (!encoder) {
      // const vbv_kbits = 100;
      // const bitrate_kbits = 6000;
      // const bitrate_bytes = (bitrate_kbits * 1000) / 8;
      // const bitrate_per_frame_bytes = Math.floor(bitrate_bytes / fps);

      // we first determine
      const kbps = 24000;
      encoder = Encoder.create({
        width,
        height,
        fps,
        stride,
        kbps,
        qpMin: 10,
        qpMax: 30,
        temporalDenoise: true,
        groupOfPictures: fps,
        // temporalDenoise: true,
        // speed: 0,
        // frameBytes: bitrate_per_frame_bytes,
        // qpMin: 10,
        // qpMax: 30,
        // vbvSize: (vbv_kbits * 1000) / 8,
      });
    }

    console.log("Encoding", f.frame, files.length);
    encoder.encodeRGB(rgba.data);
  }, Promise.resolve());
  console.timeEnd("encoding");

  const buf = encoder.end();
  await writeFile(path.resolve(__dirname, "node-output.mp4"), buf);
})();

function draw(t, width, height, stride = 3) {
  const pixels = new Uint8Array(width * height * stride);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = x + y * height;

      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const k = Math.sin((dist / width) * 4 + t * Math.PI * 2) * 0.5 + 0.5;
      const a = Math.sin((dist / width) * 2 - t * Math.PI * 2) * 0.5 + 0.5;

      const L = y / height;
      const r = k * 255 * L;
      const g = a * 255 * L;
      const b = (Math.sin(t * Math.PI * 2) * 0.5 + 0.5) * 255 * L;
      pixels[i * stride + 0] = r;
      pixels[i * stride + 1] = g;
      pixels[i * stride + 2] = b;
    }
  }
  return pixels;
}
