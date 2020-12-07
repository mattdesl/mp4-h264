cmake_minimum_required(VERSION 3.13)
project(mp4-encoder)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fpermissive")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fpermissive")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -lpthread")

add_executable(mp4-encoder
  mp4-encoder.cpp
)

target_include_directories(mp4-encoder PRIVATE
    "minimp4"
    "minih264"
)

if(EMSCRIPTEN)
    set(CMAKE_CXX_FLAGS "\
        ${CMAKE_CXX_FLAGS}\
        -s ALLOW_MEMORY_GROWTH=1\
        -s DISABLE_EXCEPTION_CATCHING=1\
        -s WASM=1\
        -msimd128\
        -msse\
        -msse2\
        -msse3\
        -s IGNORE_MISSING_MAIN\
        -s TEXTDECODER=0\
        -s MODULARIZE=1\
        -s EXPORT_ES6=1\
        -s FILESYSTEM=0\
        -s ASSERTIONS=0\
        -s ENVIRONMENT=web,worker\
        -Wno-invalid-source-encoding\
        -Wno-tautological-pointer-compare\
        --pre-js ../api.js\
        -O3\
        --closure 1\
        -g0\
        --bind\
    ")

    target_compile_options(mp4-encoder
      PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-fno-exceptions>
    )
    
    add_compile_definitions(EMSCRIPTEN_SIMD_ENABLED)

    set_target_properties(
        mp4-encoder
        PROPERTIES
            SUFFIX ".js"
    )
endif()
