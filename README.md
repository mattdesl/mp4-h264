
:skull: :warning:

## Project Suspended

It has come to my attention that MPEG LA often goes after any distributed software (free / OSS / commercial) that encodes H264 video, and charges huge royalties on it. I don't wish to navigate this legal landscape for this module, so all of the binary and source code surrounding the H264 encoding has now been removed from this project, and the development of the project is suspended until further notice.

However:

- The documentation and examples here will stay as they provide valuable information for speeding up WASM and media handling (not related to H264)

- Chrome is still trialing [WebCodecs](https://github.com/WICG/web-codecs) which already supports encoding H264 without incurring royalties (as it is handled by Chrome's licenses). One part of this project was a WASM-based MP4 muxer (not encumbered by MPEG LA patents), and that will be split off into a new WASM module that only muxes already-encoded H264 data. So, at least in future versions of Chrome, fast client-side media creation should still be possible.

What follows is the previous version of the repository, with all the H264 WASM/C/C++ source code and binary files removed.

---


# mp4-h264

Standalone H264 encoder and MP4 muxer compiled with Emscripten into WASM.

> ✨ Live Demo **(redacted)**

Current Features:

- Encode RGB or YUV data into H264 contained in a MP4 file
- Fully client-side MP4/H264 encoding, works in most modern browsers
- Also works in Node.js
- Memory efficient: can be used for very large video files
- Relatively small footprint (~144 - 160KB before gzip)
- Very fast encoding with optional SIMD support
- Can be used solely as a MP4 muxer, such as alongside the upcoming [WebCodecs API](https://wicg.github.io/web-codecs/) for *much* faster encoding

Possible Future Features:

- Audio muxing
- MP4 demuxing
- ASM.js support for legacy browsers

## Contents

- Examples:

  - [Browser](#example-in-a-web-browser)

  - [Browser + SIMD](#example-with-simd-browser-only)

  - [Node.js](#example-with-nodejs)

  - [As a Muxer Only](#muxing-only)

  - [WebCodecs](#webcodecs)

- [API Docs](#api-structure)

  - [Simple API](#simple-api)

  - [Direct API](#direct-api)

- Tips:

  - [Tips for Speed](#tips-for-speed)

  - [Tips for File Size vs. Quality](#tips-for-file-size-vs-quality)

- [More Advanced Examples](#more-advanced-examples)

- [TODOs](#todos)

- [Contributing](#contributing)

- [Building from C/C++ Source](#building-from-cc-source)

- [Credits](#credits)

- [License](#license)

## Example in a Web Browser

You can import the module directly as an ES Module using `<script type="module">` in your HTML. You can use `unpkg` for easy access, like so:

```js
// Import latest
import loadEncoder from "[redacted]";

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
import loadEncoder from "[redacted]";

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
const loadEncoder = require("[redacted]");

(async () => {
  const Encoder = await loadEncoder();
  // ... same API as web ...
})();
```

## Muxing Only

Let's say you already have H264 data and just want to use this to mux it into an MP4 container, then you'll want to use the lower-level Direct API like so:

```js
const loadEncoder = require('[redacted]');
const fs = require('fs');

(async () => {
  const Encoder = await loadEncoder();
  const stream = fs.createWriteStream('file.mp4');

  const mux = Encoder.create_muxer({
    width,
    height,
    // sequential outputs for simpler 'file write'
    sequential: true,
  }, write);

  for (let chunk of readChunksOfH264FromSomewhere()) {
    // malloc() / free() a pointer
    const p = Encoder.create_buffer(chunk.byteLength);
    // set data in memory
    Encoder.HEAPU8.set(chunk, p);
    // write NAL units with AnnexB format
    // <Uint8Array [startcode] | [NAL] | [startcode] | [NAL] ...>
    Encoder.mux_nal(mux, p, chunk.byteLength);
    Encoder.free_buffer(p);
  }

  // this may trigger more writes
  Encoder.finalize_muxer(mux);

  function write (pointer, size, offset) {
    const buf = Encoder.HEAPU8.slice(pointer, pointer + size);
    stream.write(buf);
    return 0;
  }
})();
```

See [./test/node-mux.js](./test/node-mux.js) for a full example.

## WebCodecs

If your environment supports WebCodecs, you can use it to achieve much faster encoding (i.e. 3 times faster). This is pretty similar to using "Mux Only", see the [./test/webcodecs.html](./test/webcodecs.html) demo for details.

At the time of writing, WebCodecs is behind a command line flag on Chrome Canary:

- enable `chrome://flags/#enable-experimental-web-platform-features`, or
- pass `--enable-blink-features=WebCodecs` flag via command line

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
- `kbps` (default 0) - the desired bitrate in kilobits per second, if set to `0` then a constant `quantizationParameter` will be used instead
- `quantizationParameter` (default 10) - the constant value to use when `kbps` is not set, higher means better compression, and lower means better quality `[10..51]`
- `qpMin` (default 10) - when `kbps` is specified, this is the lower quantization boundary `[10..51]`
- `qpMax` (default 50) - when `kbps` is specified, this is the upper quantization boundary `[10..51]`
- `vbvSize` (default `-1`) - set to a negative value to use a default 2 second buffer, or specify `0` to disable Video Buffering Verifier (VBV), or set to a number to specify the size in bytes of the vbv buffer
- `groupOfPictures` (default 20) - how often a keyframe occurs (key frame period, also known as GOP)
- `desiredNaluBytes` (default 0) - each NAL unit will be approximately capped at this size (0 means unlimited)
- `temporalDenoise` (default false) - use temporal noise supression
- `sequential` (default false) - set to true if you want MP4 file to be written to sequentially (with no seeking backwards), see [here](https://github.com/lieff/minimp4#muxing)
- `fragmentation` (default false) - set to true if you want MP4 file to support HLS streaming playback of the file, see [here](https://github.com/lieff/minimp4#muxing)
- `hevc` (default false) - if true, sets the MP4 muxer to expect HEVC (H.265) input instead of H264, this is only useful for muxing your own H265 data

#### `encoder.encodeRGB(pixels)`

Encode a frame of RGB(A) pixels, a flat Uint8Array or Uint8ClampedArray. This will use the same `stride` that you specified when creating the encoder (default 4). Use a `stride` of 3 if you only have flat RGB bytes, or a stride of 4 if you have RGBA bytes (which is what you get from `<canvas>` APIs).

This will convert RGB to YUV natively (in WASM) in order to write a single H264 frame of video.

#### `encoder.encodeYUV(yuv)`

Encodes an image that is already in YUV layout, saving the need to do the RGB > YUV conversion step.

This may be useful if you already have YUV data, or if you are using a hardware solution to convert RGB to YUV, or if you are multithreading and your renderer thread is idling (in which case you may benefit in memory and performance by converting RGB to YUV in the renderer thread, and then sending that to the encoder thread).

See [./test/util/RGBAtoYUV.js](./test/util/RGBAtoYUV.js) for an example of how to go from RGB to YUV from JavaScript.

#### `uint8 = encoder.end()`

Ends the encoding and frees any internal memory used by this encoder interface, returning a final Uint8Array which contains the full MP4 file in bytes. After calling `end()`, you can no longer use this interface, and instead you'll have to create a new encoder.

#### `uint8 = encoder.memory()`

Alias for accessing `Encoder.HEAPU8` - note this storage may change as memory is allocated, so you should always access it directly via `encoder.memory()` rather than storing it as a variable.

#### `ptr = encoder.getRGBPointer()` (experimental)

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

#### `ptr = encoder.getYUVPointer()` (experimental)

Allocates if necessary, then returns a pointer into the encoder's internal uint8 memory that can be used for faster YUV image transfer. See above.

#### `encoder.encodeRGBPointer()` (experimental)

Assuming RGB(A) bytes have already been written into the memory heap at the RGB(A) pointer location, it will then encode those bytes directly.

#### `encoder.encodeYUVPointer()` (experimental)

Assuming YUV bytes have already been written into the memory heap at the YUV pointer location, it will then encode those bytes directly.

## Direct API

Instead of returning an interface with functions, the direct API returns pointers into `Encoder.HEAPU8` memory, and then all functions act on the pointer into the encoder's struct.

- `enc = Encoder.create_encoder(settings, write)` - allocates and creates an internal struct holding the encoder, the `settings` are the same as in the Simple API but `{ stride }` is ignored. The `write` is a write callback that allows you to handle byte writing, with the signature:
  - `error = write(data_ptr, data_size, file_seek_offset)`
- `ptr = Encoder.create_buffer(byteLength)` - creates a pointer to a buffer, for RGB(A) or YUV data, this must be freed manually. Same as `ptr = Encoder._malloc(len)`
- `Encoder.free_buffer(ptr)` - frees a created buffer pointer, same as `ptr = Encoder._free(len)`
- `Encoder.HEAPU8` - access the current Uint8Array storage of the encoder
- `Encoder.encode_rgb(enc, rgba_ptr, stride, yuv_ptr)` - converts RGB into YUV and then encodes it
- `Encoder.encode_yuv(enc, yuv_ptr)` - encodes YUV directly
- `Encoder.finalize_encoder(enc)` - finishes encoding the MP4 file and frees any memory allocated internally by the encoder structure
- `mux = Encoder.create_muxer(settings, write)` - allocates and creates an internal struct holding the muxer (MP4 only), with settings `{ width, height, [sequential=false, fragmentation=false] }` and a write function
- `Encoder.mux_nal(mux, nal_data, nal_size)` - writes NAL units to the currently open muxer
- `Encoder.finalize_muxer(mux)` - finishes muxing the MP4 file and frees any memory allocated internally

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
  Encoder.HEAPU8.set(pixels, rgb_ptr);
  Encoder.encode_rgb(encoder_ptr, rgb_ptr, stride, yuv_ptr);
}

// finish & free memory
Encoder.finalize_encoder(encoder_ptr);
Encoder.free_buffer(rgb_ptr);
Encoder.free_buffer(yuv_ptr);

const mp4File = Buffer.concat(outputs);
```

## Tips for Speed

- Use WebCodecs where supported
- Use SIMD if the environment supports it
- Use a worker to split the rendering and encoding into two threads
- Use pointers (`encoder.encodeRGBPointer()`) where possible to avoid unnecessary data copies in and out of WASM memory
- You can use WebGL to read RGB(A) pixels directly into HEAPU8 memory with `gl.readPixels`
  - If you are using WebGL1, you can use `encoder.memory()` or `Encoder.HEAPU8` and then `subarray()` to get a view that you can write into
  - If you are using WebGL2, `gl.readPixels` includes an offset parameter for where to write into
- Use OffscreenCanvas if supported and your rendering doesn't need to be visible to the user

## Tips for File Size vs. Quality

The default setting produces high quality video, but with very high file sizes (note: the defaults may change as this module is still a WIP).

If you are concerned about filesize, you should set the `kbps` parameter instead of using a constant `quantizationParameter` (which defaults to `10`, i.e. the best quality).

First, determine what you think would be an acceptable output size based on your video. Let's say you're encoding a 10 second animation and want it to be around 10MB in file size.

```js
const duration = 10; // in seconds
const sizeInMBs = 10; // desired output size
const sizeInKilobits = sizeInMBs * 8000; // conversion

// this is the value passed into the encoder
const kbps = sizeInKilobits / duration;

const encoder = Encoder.create({
  width,
  height,
  fps,
  kbps
})
```

This should produce a video file around 10 MB, with a quality to match. To improve quality, you can try to lower the `{ speed }` option, or lower the upper bound of `{ qpMax }` from 51 to something smaller (although doing so may increase file size beyond your desired amount).

## More Advanced Examples

See the [./test](./test) folder for examples including SIMD, multi-threading, fast pixel access, and more.

## TODOs

- Better error handling
- Explore a more user-friendly and pointer-safe API for writing memory to Emscripten
- Better support for Webpack, Parcel, esbuild, Rollup etc.
- Expose more encoder options from C/C++

## Contributing

If you think you can help, please open an issue.

## Building from C/C++ Source

*NOTE: this has now been removed from the project*

Currently you need Emscripten with SIMD supported. Then modify the paths in `./src/mp4-encoder/build.sh` to your emcc build. Then, from this package's folder, run:

```sh
./src/mp4-encoder/build.sh 
```

## Credits

This was originally based on [h264-mp4-encoder](https://github.com/TrevorSundberg/h264-mp4-encoder) by Trevor Sundberg, but it's been modified quite a bit to reduce the size (~1.7MB to ~150KB), use a different architecture for faster encoding and streamed writing, and use different C libraries (minimp4 instead of libmp4v2).

Also see [minimp4](https://github.com/lieff/minimp4) and [minih264](https://github.com/lieff/minih264/) by @lieff, which are the lightweight C libraries powering this module.

## License

MIT, see [LICENSE.md](http://github.com/mattdesl/mp4-h264/blob/master/LICENSE.md) for details.
