function SimpleMemoryFile() {
  let cursor = 0;
  let usedBytes = 0;
  let contents = new Uint8Array(256);
  return {
    'contents': function () {
      return contents.slice(0, usedBytes);
    },
    'seek': function (offset) {
      // offset in bytes
      cursor = offset;
    },
    'write': function (memory, pointer, size) {
      expand(cursor + size);
      contents.set(memory.subarray(pointer, pointer + size), cursor);
      cursor += size;
      usedBytes = Math.max(usedBytes, cursor);
      return size;
    },
  };

  function expand (newCapacity) {
    var prevCapacity = contents.length;
    if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
    // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
    // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
    // avoid overshooting the allocation cap by a very large margin.
    var CAPACITY_DOUBLING_MAX = 1024 * 1024;
    newCapacity = Math.max(
      newCapacity,
      (prevCapacity *
        (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) >>>
        0
    );
    if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
    const oldContents = contents;
    contents = new Uint8Array(newCapacity); // Allocate new storage.
    if (usedBytes > 0) contents.set(oldContents.subarray(0, usedBytes), 0);
  }
}

Module['create_buffer'] = function create_buffer (size) {
  return Module['_malloc'](size);
};

Module['free_buffer'] = function create_buffer (pointer) {
  return Module['_free'](pointer);
};

// Expose simpler end-user API for encoding
Module['create'] = function createEncoder(settings = {}) {
  const width = settings['width'];
  const height = settings['height'];
  const stride = settings['stride'] || 4;
  if (!width || !height) throw new Error("width and height must be > 0");

  const file = SimpleMemoryFile();

  let _yuv_pointer = null;
  let _rgb_pointer = null;

  let ended = false;

  const cfg = Object.assign({}, settings);
  delete cfg['stride'];
  const encoder_pointer = Module['create_encoder'](cfg, write);

  function getYUV () {
    if (_yuv_pointer == null && !ended) {
      _yuv_pointer = Module['create_buffer']((width * height * 3) / 2);
    }
    return _yuv_pointer;
  }

  function getRGB () {
    if (_rgb_pointer == null && !ended) {
      _rgb_pointer = Module['create_buffer'](width * height * stride);
    }
    return _rgb_pointer;
  }

  return {
    'memory': function () {
      return Module['HEAPU8'];
    },
    'getYUVPointer': getYUV,
    'getRGBPointer': getRGB,
    'end': function () {
      if (ended) {
        throw new Error('Attempting to end() an encoder that is already finished');
      }
      ended = true;
      Module['finalize_encoder'](encoder_pointer);
      if (_yuv_pointer != null) Module['free_buffer'](_yuv_pointer);
      if (_rgb_pointer != null) Module['free_buffer'](_rgb_pointer);
      return file['contents']();
    },
    'encodeRGBPointer': function () {
      const rgb = getRGB();
      const yuv = getYUV();
      Module['encode_rgb'](encoder_pointer, rgb, stride, yuv);
    },
    'encodeYUVPointer': function () {
      const yuv = getYUV();
      Module['encode_yuv'](encoder_pointer, yuv);
    },
    'encodeRGB': function (buffer) {
      if (buffer.length !== (width * height * stride)) {
        throw new Error('Expected buffer to be sized (width * height * ' + stride + ')');
      }
      const rgb = getRGB();
      const yuv = getYUV();
      Module['HEAPU8'].set(buffer, rgb);
      Module['encode_rgb'](encoder_pointer, rgb, stride, yuv);
    },
    'encodeYUV': function (buffer) {
      if (buffer.length !== (width * height * 3) / 2) {
        throw new Error('Expected buffer to be sized (width * height * 3) / 2');
      }
      const yuv = getYUV();
      Module['HEAPU8'].set(buffer, yuv);
      Module['encode_yuv'](encoder_pointer, yuv);
    },
  };

  function write(pointer, size, offset) {
    file['seek'](offset);
    return file['write'](Module['HEAPU8'], pointer, size) != size;
  }
}

Module['locateFile'] = function locateFileDefault (path, dir) {
  if (Module['simd']) {
    path = path.replace(/\.wasm$/i, '.simd.wasm');
  }
  if (Module['getWasmPath']) {
    return Module['getWasmPath'](path, dir, Module['simd']);
  } else {
    return dir + path;
  }
};