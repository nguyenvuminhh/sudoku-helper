# Emscripten build of the l2sg hint solver + bindings.cpp.
#
# This is an alternative to build.sh for people who prefer CMake. It expects the
# l2sg sources next to this file (build.sh clones them into ./l2sg):
#
#   git clone https://github.com/rafaelfassi/l2sg.git l2sg
#   emcmake cmake -B build -S .
#   cmake --build build
#
# Output (l2sg.js + l2sg.wasm) is written to ../frontend/public/wasm/.
cmake_minimum_required(VERSION 3.13)
project(l2sg_hint_wasm LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(L2SG_DIR "${CMAKE_CURRENT_SOURCE_DIR}/l2sg" CACHE PATH "Path to the l2sg checkout")
set(L2SG_LIB "${L2SG_DIR}/lib")

# Only the solver translation units are needed (no app/, no generator).
file(GLOB L2SG_TECHNIQUES "${L2SG_LIB}/src/techniques/*.cpp")
set(SOURCES
    "${L2SG_LIB}/src/Grid.cpp"
    "${L2SG_LIB}/src/Solver.cpp"
    "${L2SG_LIB}/src/Enums.cpp"
    "${L2SG_LIB}/src/Logs.cpp"
    ${L2SG_TECHNIQUES}
    "${CMAKE_CURRENT_SOURCE_DIR}/bindings.cpp"
)

add_executable(l2sg ${SOURCES})
target_include_directories(l2sg PRIVATE
    "${L2SG_LIB}/include"
    "${L2SG_LIB}/include/l2sg"
    "${L2SG_LIB}/src"
)

# Emscripten link flags: embind, a worker/web-friendly modularized factory named
# createL2sgModule, growable memory, no filesystem.
target_compile_options(l2sg PRIVATE -O3)
target_link_options(l2sg PRIVATE
    -O3
    --bind
    -sMODULARIZE=1
    -sEXPORT_NAME=createL2sgModule
    -sENVIRONMENT=web,worker
    -sALLOW_MEMORY_GROWTH=1
    -sFILESYSTEM=0
    "-sEXPORTED_RUNTIME_METHODS=[]"
)
set_target_properties(l2sg PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../frontend/public/wasm"
)
