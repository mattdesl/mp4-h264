import { createCanvas } from "./canvas.js";

export default function PixelReader(context, opts = {}) {
  let context2DAttributes = {
    antialias: true,
    alpha: false,
    desynchronized: true,
    powerPreference: "high-performance",
  };

  const canvas = context.canvas;
  const {
    reuseBuffer = false,
    webgl: useGL = true,
    webgl2 = true,
    bitmap: useBitmap = true,
  } = opts;
  const { width, height } = canvas;

  const usingBitmap =
    useBitmap && useGL && typeof canvas.transferToImageBitmap === "function";

  // seems like RGB is only possible in a cross-platform way with webgl2 ?
  // if (!useGL || !webgl2) format = "rgba";
  // const channels = format === "rgb" && useGL ? 3 : 4;
  let channels = 4;
  let format = "rgba";
  let gl, glFormat, glInternalFormat;
  if (useGL) {
    const { canvas: webgl, context: _gl } = createCanvas(
      webgl2 ? "webgl2" : "webgl",
      32,
      32,
      {
        alpha: false,
        desynchronized: true,
        antialias: false,
        depth: false,
        powerPreference: "high-performance",
        stencil: false,
      },
      true
    );
    gl = _gl;

    const texture = gl.createTexture();

    const colorReadFormat = gl.getParameter(
      gl.IMPLEMENTATION_COLOR_READ_FORMAT
    );
    const colorReadType = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);

    if (
      colorReadType === gl.UNSIGNED_BYTE &&
      (colorReadFormat === gl.RGB || colorReadFormat === gl.RGBA)
    ) {
      glFormat = glInternalFormat = colorReadFormat;
      if (colorReadFormat === gl.RGB) {
        format = "rgb";
        channels = 3;
      }
    } else {
      glFormat = glInternalFormat = gl.RGBA;
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(
      gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
      gl.BROWSER_DEFAULT_WEBGL
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
    // initial setup
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      glInternalFormat,
      width,
      height,
      0,
      glFormat,
      gl.UNSIGNED_BYTE,
      null
    );
  }

  const bufferSize = width * height * channels;
  let buffer = reuseBuffer ? new Uint8Array(bufferSize) : null;

  let sharedCanvas;
  let sharedContext;

  return {
    buffer,
    bufferSize,
    channels,
    readInto(memory, pointer) {
      if (useGL && webgl2) {
        let input;
        if (usingBitmap) {
          input = canvas.transferToImageBitmap();
        } else {
          input = canvas;
        }
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          width,
          height,
          glFormat,
          gl.UNSIGNED_BYTE,
          input
        );
        gl.readPixels(
          0,
          0,
          width,
          height,
          glFormat,
          gl.UNSIGNED_BYTE,
          memory,
          pointer
        );
        if (usingBitmap) input.close();
      } else {
        const buf = this.read();
        memory.set(buf, pointer);
      }
    },
    read(sharedGLBuffer = buffer) {
      if (useGL) {
        const buf = sharedGLBuffer || new Uint8Array(bufferSize);
        let input;
        if (usingBitmap) {
          input = canvas.transferToImageBitmap();
        } else {
          input = canvas;
        }
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          width,
          height,
          glFormat,
          gl.UNSIGNED_BYTE,
          input
        );
        gl.readPixels(0, 0, width, height, glFormat, gl.UNSIGNED_BYTE, buf);
        if (usingBitmap) input.close();
        return buf;
      } else {
        if (typeof context.getImageData === "function") {
          return context.getImageData(0, 0, width, height).data;
        } else {
          if (!sharedCanvas) {
            let result = createCanvas(
              "2d",
              width,
              height,
              {
                ...context2DAttributes,
              },
              true
            );
            sharedCanvas = result.canvas;
            sharedContext = result.context;
          }
          sharedContext.clearRect(0, 0, width, height);
          sharedContext.drawImage(canvas, 0, 0, width, height);
          return sharedContext.getImageData(0, 0, width, height).data;
        }
      }
    },
  };
}
