export default function RGBAtoYUV420(rgb, width, height, stride = 4, buffer) {
  const image_size = width * height;
  let upos = image_size;
  let vpos = upos + Math.floor(upos / 4);
  let i = 0;
  if (!buffer) buffer = new Uint8Array(Math.floor((width * height * 3) / 2));
  for (let line = 0; line < height; ++line) {
    if (!(line % 2)) {
      for (let x = 0; x < width; x += 2) {
        let r = rgb[stride * i];
        let g = rgb[stride * i + 1];
        let b = rgb[stride * i + 2];
        buffer[i++] = ((66 * r + 129 * g + 25 * b) >> 8) + 16;
        buffer[upos++] = ((-38 * r + -74 * g + 112 * b) >> 8) + 128;
        buffer[vpos++] = ((112 * r + -94 * g + -18 * b) >> 8) + 128;
        r = rgb[stride * i];
        g = rgb[stride * i + 1];
        b = rgb[stride * i + 2];
        buffer[i++] = ((66 * r + 129 * g + 25 * b) >> 8) + 16;
      }
    } else {
      for (let x = 0; x < width; x += 1) {
        let r = rgb[stride * i];
        let g = rgb[stride * i + 1];
        let b = rgb[stride * i + 2];
        buffer[i++] = ((66 * r + 129 * g + 25 * b) >> 8) + 16;
      }
    }
  }
  return buffer;
}
