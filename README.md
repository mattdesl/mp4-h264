# mp4-h264

###### :warning: Currently Under Development

Standalone MP4 (H264) encoder compiled with Emscripten into WASM.

Features:

- Encode RGB or YUV data into H264 contained in a MP4 file
- Works in a web browser (fully client-side MP4 encoding)
- Memory efficient: can be used for very large video files
- Relatively small footprint (~130 - 150KB before gzip)
- Very fast encoding with optional SIMD support

Possible Future Features:

- Audio encoding
- MP4 demuxing
- Node
- ASM.js support for legacy browsers

## Example

```js
import loadEncoder from "https://unpkg.com/mp4-h264@1.0.2/build/mp4-encoder.js";

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
    const rgba = /* Uint8Array of flat rgba data */;
    encoder.encodeRGB(rgba);
  }

  // Finish encoder to get back uint8 MP4 data
  const mp4 = encoder.end();
  
  // Optionally convert to URL for <video> tag, download, etc...
  const url = URL.createObjectURL(new Blob([mp4], { type: "video/mp4" }));
  ...
})();
```

See [./test/simple.html](./test/simple.html) for an easy example.

## Advanced Examples

More details to come. See the [./test](./test) folder for examples including SIMD, multi-threading, fast pixel access, and more.

## Credits

This was originally based on [h264-mp4-encoder](https://github.com/TrevorSundberg/h264-mp4-encoder), but it's been modified quite a bit to reduce the size (~1.7MB to ~150KB), use a different architecture for faster encoding and streamed writing, and use different C libraries (minimp4 instead of libmp4v2).

Also see [minimp4](https://github.com/lieff/minimp4) and [minih264](https://github.com/lieff/minih264/) by @lieff, which are the lightweight C libraries powering this module.

## License

MIT, see [LICENSE.md](http://github.com/mattdesl/mp4-h264/blob/master/LICENSE.md) for details.
