#include <emscripten/bind.h>
#include <emscripten/val.h>

#define ALIGNED_ALLOC(n, size) aligned_alloc(n, (size + n - 1) / n * n)
#define TIMESCALE 90000

#define H264E_MAX_THREADS 0

#ifdef EMSCRIPTEN_SIMD_ENABLED
  #define MINIH264_ONLY_SIMD 1
  #define H264E_ENABLE_NEON 0
#endif

#define MINIH264_IMPLEMENTATION
#define MINIMP4_IMPLEMENTATION

#include <string>
#include <stdint.h>
#include <functional>
#include "minih264e.h"
#include "minimp4.h"

using namespace emscripten;

typedef struct MP4Muxer {
  MP4E_mux_t *mux = nullptr;
  mp4_h26x_writer_t writer;
  float fps;
  std::function<int(const void *buffer, size_t size, int64_t offset)> callback;
} MP4Muxer;

typedef struct Encoder {
  uint32_t width;
  uint32_t height;
  bool rgb_flip_y;

  H264E_io_yuv_t yuv_planes;
  H264E_run_param_t run_param;

  uint32_t muxer_handle;

  H264E_persist_t *enc = nullptr;
  H264E_scratch_t *scratch = nullptr;
} Encoder;


static std::map<uint32_t, Encoder*> mapEncoder;
static uint32_t mapEncoderHandle = 1;

static std::map<uint32_t, MP4Muxer*> mapMuxer;
static uint32_t mapMuxerHandle = 1;

static void _write_nal (MP4Muxer *muxer, const uint8_t *data, size_t size)
{
  mp4_h26x_write_nal(&muxer->writer, data, size, TIMESCALE/(muxer->fps));
}

static void nalu_callback (const uint8_t *nalu_data, int sizeof_nalu_data, void *token)
{
  MP4Muxer *muxer = (MP4Muxer *)token;

  uint8_t *data = const_cast<uint8_t *>(nalu_data - STARTCODE_4BYTES);
  const int nal_size = sizeof_nalu_data + STARTCODE_4BYTES;

  // HME_CHECK_INTERNAL(nal_size >= 5);
  // HME_CHECK_INTERNAL(data[0] == 0 && data[1] == 0 && data[2] == 0 && data[3] == 1);

  // TODO check status MP4E_STATUS_OK
  _write_nal(muxer, data, nal_size);
}

static int write_callback (int64_t offset, const void *buffer, size_t size, void *token)
{
  MP4Muxer *muxer = (MP4Muxer *)token;
  uint8_t *data = (uint8_t*)(buffer);
  return muxer->callback(
    data,
    (uint32_t)size,
    (uint32_t)offset
  );
}

void mux_nal (uint32_t muxer_handle, uintptr_t nalu_ptr, int nalu_size)
{
  MP4Muxer* muxer = mapMuxer[muxer_handle];
  uint8_t* data = reinterpret_cast<uint8_t*>(nalu_ptr);
  _write_nal(muxer, data, nalu_size);
}

bool option_exists (val options, std::string key)
{
  return options[key].typeOf().as<std::string>() != "undefined";
}

uint32_t create_muxer(val options, val write_fn)
{
  uint32_t width = options["width"].as<uint32_t>();
  uint32_t height = options["height"].as<uint32_t>();
  float fps = options["fps"].isNumber() ? options["fps"].as<float>() : 30.0f;
  int fragmentation = options["fragmentation"].isTrue() ? 1 : 0;
  int sequential = options["sequential"].isTrue() ? 1 : 0;
  int hevc = options["hevc"].isTrue() ? 1 : 0;

  #ifdef DEBUG
  printf("Mux Options ---\n");
  printf("width=%d\n", width);
  printf("height=%d\n", height);
  printf("fps=%f\n", fps);
  printf("sequential=%d\n", sequential);
  printf("fragmentation=%d\n", fragmentation);
  printf("hevc=%d\n", hevc);
  printf("\n");
  #endif
  
  MP4Muxer *muxer = (MP4Muxer *)malloc(sizeof(MP4Muxer));
  muxer->fps = fps;
  
  muxer->callback = [write_fn](const void *buffer, uint32_t size, uint32_t offset) -> int {
    uint8_t *data = (uint8_t*)(buffer);
    return write_fn(
      val((uintptr_t)data),
      val((uint32_t)size),
      val((uint32_t)offset)
    ).as<int>();
  };

  uint32_t handle = mapMuxerHandle++;
  mapMuxer[handle] = muxer;

  muxer->mux = MP4E_open(sequential, fragmentation, muxer, &write_callback);
  // TODO: handle MP4E_STATUS_OK status
  mp4_h26x_write_init(&muxer->writer, muxer->mux, width, height, hevc);

  return handle;
}

uint32_t create_encoder(val options, val write_fn)
{
  uint32_t width = options["width"].as<uint32_t>();
  uint32_t height = options["height"].as<uint32_t>();
  uint32_t speed = options["speed"].isNumber() ? options["speed"].as<uint32_t>() : 10;
  uint32_t kbps = options["kbps"].isNumber() ? options["kbps"].as<uint32_t>() : 0;
  uint32_t quantizationParameter = options["quantizationParameter"].isNumber() ? options["quantizationParameter"].as<uint32_t>() : 10;
  uint32_t qpMin = options["qpMin"].isNumber() ? options["qpMin"].as<uint32_t>() : 10;
  uint32_t qpMax = options["qpMax"].isNumber() ? options["qpMax"].as<uint32_t>() : 51;
  uint32_t groupOfPictures = options["groupOfPictures"].isNumber() ? options["groupOfPictures"].as<uint32_t>() : 20;
  uint32_t desiredNaluBytes = options["desiredNaluBytes"].isNumber() ? options["desiredNaluBytes"].as<uint32_t>() : 0;
  int vbvSize = options["vbvSize"].isNumber() ? options["vbvSize"].as<int>() : -1;
  int temporalDenoise = options["temporalDenoise"].isTrue() ? 1 : 0;
  bool rgbFlipY = options["rgbFlipY"].isTrue() ? true : false;
  uint32_t default_kbps = kbps ? kbps : 5000;
  // printf("isNum %d\n", options["foobar"].isNumber());

  uint32_t muxer_handle = create_muxer(options, write_fn);
  MP4Muxer *muxer = mapMuxer[muxer_handle];
  float fps = muxer->fps;

  #ifdef DEBUG
  printf("Encoder Options ---\n");
  printf("width=%d\n", width);
  printf("height=%d\n", height);
  printf("fps=%f\n", fps);
  printf("rgbFlipY=%d\n", rgbFlipY);
  printf("speed=%d\n", speed);
  printf("kbps=%d\n", kbps);
  printf("vbvSize=%d\n", vbvSize);
  printf("qpMin=%d\n", qpMin);
  printf("qpMax=%d\n", qpMax);
  printf("quantizationParameter=%d\n", quantizationParameter);
  printf("groupOfPictures=%d\n", groupOfPictures);
  printf("desiredNaluBytes=%d\n", desiredNaluBytes);
  printf("fragmentation=%d\n", fragmentation);
  printf("sequential=%d\n", sequential);
  printf("temporalDenoise=%d\n", temporalDenoise);
  printf("\n");
  #endif

  // Set Options
  Encoder *encoder = (Encoder *)malloc(sizeof(Encoder));
  uint32_t handle = mapEncoderHandle++;
  mapEncoder[handle] = encoder;

  encoder->width = width;
  encoder->height = height;
  encoder->rgb_flip_y = rgbFlipY;
  encoder->muxer_handle = muxer_handle;
  
  // Initialize H264 writer
  H264E_create_param_t create_param;
  memset(&create_param, 0, sizeof(create_param));
  create_param.enableNEON = 0;
  #if H264E_SVC_API
  create_param.num_layers = 1;
  create_param.inter_layer_pred_flag = 1;
  create_param.inter_layer_pred_flag = 0;
  #endif
  create_param.gop = groupOfPictures;
  create_param.height = encoder->height;
  create_param.width = encoder->width;

  // TODO: Expose these to JS API
  create_param.fine_rate_control_flag = 0;
  create_param.const_input_flag = 1;

  // originally was at 100 * 10000 / 8
  create_param.vbv_size_bytes = vbvSize < 0 ? default_kbps * 1000 / 8 * 2 : vbvSize;
  create_param.temporal_denoise_flag = temporalDenoise;
  
  int sizeof_persist = 0;
  int sizeof_scratch = 0;
  int sizeof_result = H264E_sizeof(&create_param, &sizeof_persist, &sizeof_scratch);
  // HME_CHECK(sizeof_result != H264E_STATUS_SIZE_NOT_MULTIPLE_2, "Size must be a multiple of 2");
  // HME_CHECK_INTERNAL(sizeof_result == H264E_STATUS_SUCCESS);

  encoder->enc = (H264E_persist_t *)ALIGNED_ALLOC(64, sizeof_persist);
  encoder->scratch = (H264E_scratch_t *)ALIGNED_ALLOC(64, sizeof_scratch);

  //TODO: H264E_STATUS_SUCCESS status
  H264E_init(encoder->enc, &create_param);

  memset(&encoder->run_param, 0, sizeof(encoder->run_param));
  encoder->run_param.frame_type = 0;
  encoder->run_param.encode_speed = speed;
  encoder->run_param.desired_nalu_bytes = desiredNaluBytes;

  if (kbps)
  {
    encoder->run_param.desired_frame_bytes = kbps * 1000 / 8 / fps;
    encoder->run_param.qp_min = qpMin;
    encoder->run_param.qp_max = qpMax;
  }
  else
  {
    encoder->run_param.qp_min = encoder->run_param.qp_max = quantizationParameter;
  }

  encoder->run_param.nalu_callback_token = muxer;
  encoder->run_param.nalu_callback = &nalu_callback;

  // memset(&encoder->yuv_planes, 0, sizeof(encoder->yuv_planes));
  encoder->yuv_planes.stride[0] = width;
  encoder->yuv_planes.stride[1] = width / 2;
  encoder->yuv_planes.stride[2] = width / 2;
  return handle;
}

void encode_yuv (uint32_t encoder_handle, uintptr_t buffer_ptr)
{
  Encoder* encoder = mapEncoder[encoder_handle];
  uint8_t* yuv = reinterpret_cast<uint8_t*>(buffer_ptr);
  uint32_t width = encoder->width;
  uint32_t height = encoder->height;
  encoder->yuv_planes.yuv[0] = yuv;
  encoder->yuv_planes.yuv[1] = yuv + width * height;
  encoder->yuv_planes.yuv[2] = yuv + width * height * 5 / 4;

  int sizeof_coded_data = 0;
  uint8_t *coded_data = nullptr;
  // TODO: check status H264E_STATUS_SUCCESS
  H264E_encode(encoder->enc,
    encoder->scratch,
    &encoder->run_param,
    &encoder->yuv_planes,
    &coded_data,
    &sizeof_coded_data);
}

void encode_rgb (uint32_t encoder_handle, uintptr_t rgb_buffer_ptr, size_t stride, uintptr_t yuv_buffer_ptr)
{
  Encoder* encoder = mapEncoder[encoder_handle];
  uint8_t* yuv = reinterpret_cast<uint8_t*>(yuv_buffer_ptr);
  uint8_t* rgb = reinterpret_cast<uint8_t*>(rgb_buffer_ptr);

  uint32_t width = encoder->width;
  uint32_t height = encoder->height;
  uint32_t image_size = width * height;
  uint32_t upos = image_size;
  uint32_t vpos = upos + upos / 4;
  uint32_t i = 0;
  bool flip = encoder->rgb_flip_y;
  
  // TODO: this could probably be optimized somehow ... ?
  for (size_t y = 0; y < height; y++)
  {
    if (!(y % 2))
    {
      for (size_t x = 0; x < width; x += 2)
      {
        uint32_t k = flip ? (x + (height - y - 1) * width) : i;
        uint32_t kidx = stride * k;

        uint8_t r = rgb[kidx];
        uint8_t g = rgb[kidx + 1];
        uint8_t b = rgb[kidx + 2];
        yuv[i++] = ((66 * r + 129 * g + 25 * b) >> 8) + 16;
        yuv[upos++] = ((-38 * r + -74 * g + 112 * b) >> 8) + 128;
        yuv[vpos++] = ((112 * r + -94 * g + -18 * b) >> 8) + 128;
        
        kidx = stride * (k + 1);
        yuv[i++] = ((66 * rgb[kidx] + 129 * rgb[kidx+1] + 25 * rgb[kidx+2]) >> 8) + 16;
      }
    }
    else
    {
      for (size_t x = 0; x < width; x += 1)
      {
        uint32_t k = flip ? (x + (height - y - 1) * width) : i;
        uint32_t kidx = stride * k;
        yuv[i++] = ((66 * rgb[kidx] + 129 * rgb[kidx+1] + 25 * rgb[kidx+2]) >> 8) + 16;
      }
    }
  }

  encode_yuv(encoder_handle, yuv_buffer_ptr);
}

void finalize_muxer (uint32_t muxer_handle)
{
  MP4Muxer *muxer = mapMuxer[muxer_handle];
  MP4E_close(muxer->mux);
  mp4_h26x_write_close(&muxer->writer);
  free(muxer);
  mapMuxer.erase(muxer_handle);
  muxer = nullptr;
}

void finalize_encoder (uint32_t encoder_handle)
{
  Encoder *encoder = mapEncoder[encoder_handle];

  // relese muxer
  uint32_t muxer_handle = encoder->muxer_handle;
  finalize_muxer(muxer_handle);

  // release encoder
  free(encoder->enc);
  free(encoder->scratch);
  free(encoder);
  mapEncoder.erase(encoder_handle);
  encoder = nullptr;
}

EMSCRIPTEN_BINDINGS(H264MP4EncoderBinding) {
  function("create_encoder", &create_encoder);
  function("create_muxer", &create_muxer);
  function("encode_yuv", &encode_yuv);
  function("encode_rgb", &encode_rgb);
  function("mux_nal", &mux_nal);
  function("finalize_encoder", &finalize_encoder);
  function("finalize_muxer", &finalize_muxer);
}
