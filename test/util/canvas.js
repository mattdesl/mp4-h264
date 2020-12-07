export const isOffscreenSupported = (() => {
  if (typeof self.OffscreenCanvas === "undefined") return false;
  try {
    new self.OffscreenCanvas(32, 32).getContext("2d");
    return true;
  } catch (_) {
    return false;
  }
})();

export function createCanvas(name, width, height, attribs, offscreen = true) {
  const isOff = offscreen && isOffscreenSupported;
  const canvas = isOff
    ? new OffscreenCanvas(width, height)
    : document.createElement("canvas");
  const context = canvas.getContext(name, attribs);
  if (!isOff) {
    canvas.width = width;
    canvas.height = height;
  }
  return { canvas, context };
}
