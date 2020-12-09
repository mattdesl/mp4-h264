# mp4-h264

Standalone MP4 (H264) encoder compiled with Emscripten into WASM.

> ✨ [Live Demo](https://codepen.io/mattdesl/full/MWjeJMg)

Features:

- Encode RGB or YUV data into H264 contained in a MP4 file
- Fully client-side MP4/H264 encoding, works in most modern browsers
- Also works in Node.js
- Memory efficient: can be used for very large video files
- Relatively small footprint (~130 - 150KB before gzip)
- Very fast encoding with optional SIMD support

Possible Future Features:

- Audio encoding
- MP4 demuxing
- ASM.js support for legacy browsers

## Example in a Web Browser

You can import the module directly as an ES Module using `<script type="module">` in your HTML. You can use `unpkg` for easy access, like so:

```js
// Import latest
import loadEncoder from "https://unpkg.com/mp4-h264";

// Or, import a specific npm version
// import loadEncoder from "https://unpkg.com/mp4-h264@1.0.3";

(async () => {
  // Load the WASM module first
  const Encoder = await loadEncoder();

  // Create a new encoder interface
  const encoder = Encoder.create({
    width: 256,
    height: 256,
    fps: 30
  });

  // Encode each frame, typically in an animation loop
  for (... each frame ...) {
    const rgba = /* get some Uint8Array of flat RGBA data */;
    encoder.encodeRGB(rgba);
  }

  // Finish encoder to get back uint8 MP4 data
  const mp4 = encoder.end();
  
  // Optionally convert to URL for <video> tag, download, etc...
  const url = URL.createObjectURL(new Blob([mp4], { type: "video/mp4" }));
  ...
})();
```

See [./test/simple.html](./test/simple.html) for a working example, or a [live demo on CodePen](https://codepen.io/mattdesl/full/MWjeJMg).

If you want to host your own files, copy the following from the `build` directory: `mp4-encoder.js`, `mp4-encoder.wasm`, and optionally `mp4-encoder.simd.wasm` (if you plan to use it). Save them in a folder (e.g. `vendor`), then you can import the JavaScript directly:

```js
import loadEncoder from './vendor/mp4-encoder.js`;
```

## Example with SIMD (Browser Only)

Ideally you should use the SIMD version for faster encoding, if the browser supports it (only Chrome at the time of writing, and only via a flag). In Chrome, go to `about:flags` and turn on `#enable-webassembly-simd`, then reboot.

In code, you need to detect SIMD — if you try to load SIMD WASM in an unsupported browser you might run into crashes or errors. You can use [wasm-feature-detect](https://github.com/GoogleChromeLabs/wasm-feature-detect) for this.

```js
import { simd } from "https://unpkg.com/wasm-feature-detect?module";
import loadEncoder from "https://unpkg.com/mp4-h264";

(async () => {
  // Detect SIMD
  const isSIMD = await simd();

  // Load the WASM module
  const Encoder = await loadEncoder({
    simd: isSIMD
  });
})();
```

## Example with Node.js

The default main export of this module is a Node.js compatible WASM build, so this works with newer versions of Node.js. Note that there is no SIMD build for Node.js at the moment.

```js
const loadEncoder = require("mp4-h264");

(async () => {
  const Encoder = await loadEncoder();
  // ... same API as web ...
})();
```

## API Structure

There are two APIs exposed by this module:

- [Simple API](#simple-api)
  - A simple wrapper for common usage; this will buffer the output MP4 in memory as it's being written
- [Direct API](#direct-api)
  - Direct control over the C/C++ pointers and functions, allowing you to write bytes directly to a file or response stream as they are encoded

## Simple API

#### `promise<Encoder> = loadEncoder(config = {})`

Loads the WASM encoder and returns the Encoder (web assembly) module. Options:

- `simd` (default false) - set to true and the WASM lookup path will be replaced with `.simd.wasm`, this may lead to crashes/errors in environments that cannot load WASM SIMD modules
- `getWasmPath` - an optional function that you can use to override the lookup path, for example if you stored the WASM file in a different place

```js
(async () => {
  const Encoder = await loadEncoder({
    getWasmPath (fileName, scriptDir, isSIMDRequested) {
      return '/my-wasm-files/' + fileName;
    }
  });
})();
```

#### `encoder = Encoder.create(opt = {})`

Creates a new encoder interface with options:

- `width` (required) - width in pixels of the video
- `height` (required) - height in pixels of the video
- `stride` (default 4) - the number of RGB(A) channels used by the `encodeRGB()` function
- `fps` (default 30) - output FPS of the video
- `speed` (default 10) - where 0 means best quality and 10 means fastest speed `[0..10]`
- `kbps` (default 0) - the bitrate in kbps relative to the frame_rate. Overwrites *quantizationParameter* if not 0
- `quantizationParameter` (default 10) - higher means better compression, and lower means better quality `[10..51]`
- `groupOfPictures` (default 20) - how often a keyframe occurs (key frame period, also known as GOP)
- `desiredNaluBytes` (default 0) - each NAL unit will be approximately capped at this size (0 means unlimited)
- `temporalDenoise` (default false) - use temporal noise supression
- `sequential` (default false) - set to true if you want MP4 file to be written to sequentially (with no seeking backwards), see [here](https://github.com/lieff/minimp4#muxing)
- `fragmentation` (default false) - set to true if you want MP4 file to support HLS streaming playback of the file, see [here](https://github.com/lieff/minimp4#muxing)

#### `encoder.encodeRGB(pixels)`

Encode RGB(A) pixels, a flat Uint8Array or Uint8ClampedArray. This will use the same `stride` that you specified when creating the encoder (default 4). Use a `stride` of 3 if you only have flat RGB bytes, or a stride of 4 if you have RGBA bytes (which is what you get from `<canvas>` APIs).

#### `encoder.encodeYUV(yuv)`

Encodes a YUV image. See [./test/util/RGBAtoYUV.js](./test/util/RGBAtoYUV.js) for an example of how to go from RGB to YUV.

#### `uint8 = encoder.end()`

Ends the encoding and frees any internal memory used by this encoder interface, returning a final Uint8Array which contains the full MP4 file in bytes. After calling `end()`, you can no longer use this interface, and instead you'll have to create a new encoder.

#### `uint8 = encoder.memory()`

Alias for accessing `Encoder.HEAPU8` - note this storage may change as memory is allocated, so you should always access it directly via `encoder.memory()` rather than storing it as a variable.

#### `ptr = encoder.getRGBPointer()`

Allocates if necessary, then returns a pointer into the encoder's internal uint8 memory for an RGB(A) buffer (created using `stride` option).

This might be useful if you have an API that writes pixels directly into an existing buffer with an offset, such as WebGL2's `readPixels`, to avoid a second data copy.

```js
const ptr = encoder.getRGBPointer();

... render each frame ...
  // read pixels directly into WASM memory
  gl.readPixels(... options ..., encoder.memory(), ptr);
  // trigger an encode from memory
  encoder.encodeRGBPointer();
```

#### `ptr = encoder.getYUVPointer()`

Allocates if necessary, then returns a pointer into the encoder's internal uint8 memory that can be used for faster YUV image transfer. See above.

#### `encoder.encodeRGBPointer()`

Assuming RGB(A) bytes have already been written into the memory heap at the RGB(A) pointer location, it will then encode those bytes directly.

#### `encoder.encodeYUVPointer()`

Assuming YUV bytes have already been written into the memory heap at the YUV pointer location, it will then encode those bytes directly.

## Direct API

Instead of returning an interface with functions, the direct API returns pointers into `Encoder.HEAPU8` memory, and then all functions act on the pointer into the encoder's struct.

- `ptr = Encoder.create_encoder(settings, write)` - allocates and creates an internal struct holding the encoder, the `settings` are the same as in the Simple API but `{ stride }` is ignored. The `write` is a write callback that allows you to handle byte writing, with the signature:
  - `error = write(data_ptr, data_size, file_seek_offset)`
- `ptr = Encoder.create_buffer(byteLength)` - creates a pointer to a buffer, for RGB(A) or YUV data, this must be freed manually
- `Encoder.free_buffer(ptr)` - frees a created buffer pointer
- `Encoder.HEAPU8` - access the current Uint8Array storage of the encoder
- `Encoder.encode_rgb(encoder_ptr, rgba_ptr, stride, yuv_ptr)` - converts RGB into YUV and then encodes it
- `Encoder.encode_yuv(encoder_ptr, yuv_ptr)` - encodes YUV directly
- `Encoder.finalize(encoder_ptr)` - finishes encoding the MP4 file and frees any memory allocated internally by the encoder structure

```js
const outputs = [];

const settings = {
  sequential: true,
  width: 256,
  height: 256
};

function write (ptr, size, offset) {
  // take a chunk of memory and push it to stack
  // offset is ignored as we are using { sequential }
  const buf = Encoder.HEAPU8.slice(ptr, size);
  outputs.push(buf);
  return 0; // 0 == success, 1 == error
}

const encoder_ptr = Encoder.create_encoder(settings, write);

const stride = 4; // stride of our RGBA input
const rgb_ptr = Encoder.create_buffer(width * height * stride);
const yuv_ptr = Encoder.create_buffer((width * height * 3) / 2);

for (.. each frame ..) {
  const pixels = /* Uint8Array */;
  Encoder.HEAPU8.set(rgb_ptr, pixels);
  Encoder.encode_rgb(encoder_ptr, rgb_ptr, stride, yuv_ptr);
}

// finish & free memory
Encoder.finalize_encoder(encoder_ptr);
Encoder.free_buffer(rgb_ptr);
Encoder.free_buffer(yuv_ptr);

const mp4File = Buffer.concat(outputs);
```

## Tips for Speed

- Use SIMD if the environment supports it
- Use a worker to split the rendering and encoding into two threads
- Use pointers (`encoder.encodeRGBPointer()`) where possible to avoid unnecessary data copies in and out of WASM memory
- You can use WebGL2 to read RGB(A) pixels directly into HEAPU8 memory with `gl.readPixels`
  - If you are rendering a WebGL2 app, you might be able to do this directly from your app's rendering context to avoid any copies
- Use OffscreenCanvas if supported and your rendering doesn't need to be visible to the user

## More Advanced Examples

See the [./test](./test) folder for examples including SIMD, multi-threading, fast pixel access, and more.

## TODOs

- Better support for Webpack, Parcel, esbuild, Rollup etc.

## Contributing

If you think you can help, please open an issue.

## Credits

This was originally based on [h264-mp4-encoder](https://github.com/TrevorSundberg/h264-mp4-encoder), but it's been modified quite a bit to reduce the size (~1.7MB to ~150KB), use a different architecture for faster encoding and streamed writing, and use different C libraries (minimp4 instead of libmp4v2).

Also see [minimp4](https://github.com/lieff/minimp4) and [minih264](https://github.com/lieff/minih264/) by @lieff, which are the lightweight C libraries powering this module.

## License

MIT, see [LICENSE.md](http://github.com/mattdesl/mp4-h264/blob/master/LICENSE.md) for details.
