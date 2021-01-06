const handler = require("serve-handler");
const http = require("http");
const loadEncoder = require("../../");
const from2 = require("from2");
var Readable = require("stream").Readable;

setup();

function hlsStream(Encoder, options, render) {
  const { width, height, stride = 4, fps = 30 } = options;
  options = {
    ...options,
    width,
    height,
    stride,
    sequential: true,
    fragmentation: true,
  };

  let chunks = [];
  let frameInterval = 1 / fps;

  let frameTime = 0;
  const encoder_ptr = Encoder.create_encoder(options, write);

  const poll = () => {
    const rgb_ptr = Encoder.create_buffer(width * height * stride);
    const yuv_ptr = Encoder.create_buffer((width * height * 3) / 2);

    const pixels = render(frameTime, options);
    Encoder.HEAPU8.set(pixels, rgb_ptr);
    Encoder.encode_rgb(encoder_ptr, rgb_ptr, stride, yuv_ptr);

    Encoder.free_buffer(rgb_ptr);
    Encoder.free_buffer(yuv_ptr);

    frameTime += frameInterval;
  };

  // bufferFrames();
  // setInterval(() => {
  //   chunks.shift();
  //   poll();
  // }, 1);

  return ({ start = 0, end }) => {
    const stream = new Readable();
    stream._read = function () {
      poll();
      this.push(data);
    };
    return stream;
    // return from2((size, next) => {
    //   const all = Buffer.concat(chunks);
    //   console.log("from", start, end);
    //   next(null, all.slice(start, end));
    //   // const totalBytes = Math.min(maxChunk, end - start);
    //   // while (data.byteLength < 1024) poll();
    //   // const chunkSize = Math.min(totalBytes, data.byteLength);
    //   // const chunk = data.slice(0, chunkSize);
    //   // data = data.slice(chunkSize);
    //   // console.log("sending chunk", chunk.length, totalBytes);
    //   // next(null, chunk);
    // });
  };

  function bufferFrames() {
    while (chunks.length < fps * 5) poll();
  }

  function write(pointer, size, offset) {
    const buf = Encoder.HEAPU8.slice(pointer, pointer + size);
    // stream.push(buf);
    // Add the chunk to a buffer
    data = buf;
    // data = Buffer.concat([data, buf]);
    // chunks.push(buf);
    return 0;
  }

  // function close () {
  //   // finish & free memory
  //   Encoder.finalize_encoder(encoder_ptr);
  // }
}

async function setup() {
  const Encoder = await loadEncoder();
  const streamer = hlsStream(
    Encoder,
    {
      width: 256,
      height: 256,
      fps: 30,
      stride: 3,
    },
    draw
  );

  const server = http.createServer((req, res) => {
    if (req.url === "/" || /^index(.html?)?$/i.test(req.url)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<video src="/stream.mp4" muted autoplay controls>not supported</video>`
      );
    } else if (req.url === "/stream.mp4") {
      var range = req.headers.range;
      if (!range) {
        // 416 Wrong range
        return res.sendStatus(416);
      }
      var positions = range.replace(/bytes=/, "").split("-");

      console.log("positions", positions);
      var maxChunk = 1024 * 1024;
      var start = parseInt(positions[0], 10);
      var end = positions[1] ? parseInt(positions[1], 10) : maxChunk;
      var chunksize = end - start + 1;

      if (chunksize > maxChunk) {
        end = start + maxChunk - 1;
        chunksize = end - start + 1;
      }

      var total = "*";
      // var total = stats.size;
      // var end = positions[1] ? parseInt(positions[1], 10) : total - 1;
      // var chunksize = (end - start) + 1;

      res.writeHead(206, {
        "Content-Range": "bytes " + start + "-" + end + "/" + total,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/mp4",
      });

      console.log("req", start, end);
      streamer({ start, end }).pipe(res);
      // res.writeHead(200, { "Content-Type": "video/mp4" });
      // stream.pipe(res, { end: false });
    } else {
      return handler(req, res);
    }
  });

  server.listen(3000, () => {
    console.log("Running at http://localhost:3000");
  });
}

function draw(time, { stride, width, height }) {
  const loopDuration = 5;
  const t = (time / loopDuration) % 1;
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
