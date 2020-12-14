EMSDK="/projects/code/emsdk"
# EMSDK_NODE_BIN="$EMSDK/node/12.18.1_64bit/bin"
EMSCRIPTEN="$EMSDK/upstream/emscripten"
PATH="$EMSDK:$EMSCRIPTEN:$EMSDK_NODE_BIN:${PATH}"
EM_CONFIG="$EMSDK/.emscripten"
EM_PORTS="$EMSDK/.emscripten_ports"
EM_CACHE="$EMSDK/.emscripten_cache"
EMSDK_NODE="$EMSDK_NODE_BIN/node"
EMCC_WASM_BACKEND=1
EMCC_SKIP_SANITY_CHECK=1

cd src/mp4-encoder
mkdir -p embuild
cd embuild

rm -rf *.js

cmake -DUSE_SIMD=ON -DWEB=ON -DCMAKE_TOOLCHAIN_FILE=$EMSCRIPTEN/cmake/Modules/Platform/Emscripten.cmake ..
cmake --build .

# cmake -DUSE_SIMD=OFF -DWEB=ON -DCMAKE_TOOLCHAIN_FILE=$EMSCRIPTEN/cmake/Modules/Platform/Emscripten.cmake ..
# cmake --build .

# cp mp4-encoder.js ../../../build/mp4-encoder.js
# cp mp4-encoder.wasm ../../../build/mp4-encoder.wasm
# cp mp4-encoder.simd.wasm ../../../build/mp4-encoder.simd.wasm

# cmake -DUSE_SIMD=OFF -DWEB=OFF -DCMAKE_TOOLCHAIN_FILE=$EMSCRIPTEN/cmake/Modules/Platform/Emscripten.cmake ..
# cmake --build .
# cp mp4-encoder.node.js ../../../build/mp4-encoder.node.js
# cp mp4-encoder.node.wasm ../../../build/mp4-encoder.node.wasm


