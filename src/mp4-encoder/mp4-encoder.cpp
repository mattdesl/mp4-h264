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
#include "minih264e.h"
#include "minimp4.h"

using namespace emscripten;

typedef struct Encoder {
  uint32_t width;
  uint32_t height;
  uint32_t fps;
  bool rgb_flip_y;
  
  MP4E_mux_t *mux = nullptr;
  mp4_h26x_writer_t mp4writer;
  H264E_io_yuv_t yuv_planes;
  H264E_run_param_t run_param;

  val write;

  H264E_persist_t *enc = nullptr;
  H264E_scratch_t *scratch = nullptr;
} Encoder;

static int write_callback (int64_t offset, const void *buffer, size_t size, void *token)
{
  Encoder *encoder = (Encoder *)token;
  uint8_t *data = (uint8_t*)(buffer);
  return encoder->write(val((uintptr_t)data), val((int)size), val((int)offset)).as<int>();

  // C code might look like:
  // FILE *f = (FILE*)encoder->file;
  // fseek(f, offset, SEEK_SET);
  // size_t r = fwrite(buffer, 1, size, f);
  // return r != size;
}

static void nalu_callback (const uint8_t *nalu_data, int sizeof_nalu_data, void *token)
{
  Encoder *encoder = (Encoder *)token;

  uint8_t *data = const_cast<uint8_t *>(nalu_data - STARTCODE_4BYTES);
  const int nal_size = sizeof_nalu_data + STARTCODE_4BYTES;

  // HME_CHECK_INTERNAL(nal_size >= 5);
  // HME_CHECK_INTERNAL(data[0] == 0 && data[1] == 0 && data[2] == 0 && data[3] == 1);

  // TODO check status MP4E_STATUS_OK
  mp4_h26x_write_nal(&encoder->mp4writer, data, nal_size, TIMESCALE/(encoder->fps));
}

uintptr_t create_buffer (uint32_t length)
{
  return (uintptr_t)(uint8_t *)malloc(length * sizeof(uint8_t));
}

void free_buffer (uintptr_t i)
{
  free(reinterpret_cast<uint8_t*>(i));
}

bool option_exists (val options, std::string key)
{
  return options[key].typeOf().as<std::string>() != "undefined";
}

uintptr_t create_encoder(val options, val write)
{
  uint32_t width = options["width"].as<uint32_t>();
  uint32_t height = options["height"].as<uint32_t>();
  uint32_t fps = option_exists(options, "fps") ? options["fps"].as<uint32_t>() : 30;
  uint32_t speed = option_exists(options, "speed") ? options["speed"].as<uint32_t>() : 10;
  uint32_t kbps = option_exists(options, "kbps") ? options["kbps"].as<uint32_t>() : 0;
  uint32_t quantizationParameter = option_exists(options, "quantizationParameter") ? options["quantizationParameter"].as<uint32_t>() : 10;
  uint32_t groupOfPictures = option_exists(options, "groupOfPictures") ? options["groupOfPictures"].as<uint32_t>() : 20;
  uint32_t desiredNaluBytes = option_exists(options, "desiredNaluBytes") ? options["desiredNaluBytes"].as<uint32_t>() : 0;
  int fragmentation = option_exists(options, "fragmentation") ? options["fragmentation"].as<int>() : 0;
  int sequential = option_exists(options, "sequential") ? options["sequential"].as<int>() : 0;
  int temporalDenoise = option_exists(options, "temporalDenoise") ? options["temporalDenoise"].as<int>() : 0;
  bool rgb_flip_y = option_exists(options, "rgbFlipY") ? options["rgbFlipY"].as<bool>() : false;

  #ifdef DEBUG
  printf("width=%d\n", width);
  printf("height=%d\n", height);
  printf("fps=%d\n", fps);
  printf("rgbFlipY=%d\n", rgb_flip_y);
  printf("speed=%d\n", speed);
  printf("kbps=%d\n", kbps);
  printf("quantizationParameter=%d\n", quantizationParameter);
  printf("groupOfPictures=%d\n", groupOfPictures);
  printf("desiredNaluBytes=%d\n", desiredNaluBytes);
  printf("fragmentation=%d\n", fragmentation);
  printf("sequential=%d\n", sequential);
  printf("temporalDenoise=%d\n", temporalDenoise);
  #endif

  // Set Options
  Encoder *encoder = (Encoder *)malloc(sizeof(Encoder));
  encoder->write = write;
  encoder->width = width;
  encoder->height = height;
  encoder->fps = fps;
  encoder->rgb_flip_y = rgb_flip_y;

  // Initialize MP4 writer
  int is_hevc = 0;
  encoder->mux = MP4E_open(sequential, fragmentation, encoder, &write_callback);
  // TODO: handle MP4E_STATUS_OK status
  mp4_h26x_write_init(&encoder->mp4writer, encoder->mux, encoder->width, encoder->height, is_hevc);

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
  create_param.fine_rate_control_flag = 0;
  create_param.const_input_flag = 1;
  create_param.vbv_size_bytes = 100000 / 8;
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
    encoder->run_param.desired_frame_bytes = kbps * 1000 / 8 / encoder->fps;
    encoder->run_param.qp_min = 10;
    encoder->run_param.qp_max = 50;
  }
  else
  {
    encoder->run_param.qp_min = encoder->run_param.qp_max = quantizationParameter;
  }

  encoder->run_param.nalu_callback_token = encoder;
  encoder->run_param.nalu_callback = &nalu_callback;

  // memset(&encoder->yuv_planes, 0, sizeof(encoder->yuv_planes));
  encoder->yuv_planes.stride[0] = width;
  encoder->yuv_planes.stride[1] = width / 2;
  encoder->yuv_planes.stride[2] = width / 2;
  return (uintptr_t)encoder;
}

void encode_yuv (uintptr_t encoder_ptr, uintptr_t buffer_ptr)
{
  Encoder* encoder = reinterpret_cast<Encoder*>(encoder_ptr);
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

void encode_rgb (uintptr_t encoder_ptr, uintptr_t rgb_buffer_ptr, size_t stride, uintptr_t yuv_buffer_ptr)
{
  Encoder* encoder = reinterpret_cast<Encoder*>(encoder_ptr);
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

  encode_yuv(encoder_ptr, yuv_buffer_ptr);
}

void finalize_encoder (uintptr_t encoder_ptr)
{
  Encoder* encoder = reinterpret_cast<Encoder*>(encoder_ptr);
  MP4E_close(encoder->mux);
  mp4_h26x_write_close(&encoder->mp4writer);
  free(encoder->enc);
  free(encoder->scratch);
  free(encoder);
  encoder = nullptr;
}

EMSCRIPTEN_BINDINGS(H264MP4EncoderBinding) {
  function("create_encoder", &create_encoder);
  function("create_buffer", &create_buffer);
  function("free_buffer", &free_buffer);
  function("encode_yuv", &encode_yuv);
  function("encode_rgb", &encode_rgb);
  function("finalize_encoder", &finalize_encoder);
}
