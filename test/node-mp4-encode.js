const loadEncoder = require("../build/mp4-encoder.node.js");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const writeFile = promisify(fs.writeFile);

(async () => {
  const Encoder = await loadEncoder();
  const width = 256;
  const height = 256;
  const duration = 3;
  const fps = 30;
  const stride = 3;

  console.time("encoding");
  const encoder = Encoder.create({
    width,
    height,
    fps,
    stride,
  });

  const totalFrames = Math.round(fps * duration);
  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    const rgb = draw(t, width, height, stride);
    encoder.encodeRGB(rgb);
  }

  const buffer = encoder.end();
  console.timeEnd("encoding");
  await writeFile(path.resolve(__dirname, "node-output.mp4"), buffer);
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

      const r = k * 255;
      const g = a * 255;
      const b = (Math.sin(t * Math.PI * 2) * 0.5 + 0.5) * 255;
      pixels[i * stride + 0] = r;
      pixels[i * stride + 1] = g;
      pixels[i * stride + 2] = b;
    }
  }
  return pixels;
}
