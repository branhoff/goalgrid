cmake_minimum_required(VERSION 3.21)
project(goalgrid VERSION 1.0.0 LANGUAGES C)

# The watchface itself is built by the Pebble SDK (waf, via the `pebble` CLI).
# CMake has two jobs here:
#   1. Build and test the pure model code (src/c/model) on the host.
#   2. Provide one entry point for the Pebble workflow (build/install/screenshot).

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

option(GOALGRID_SANITIZE "Build host code with AddressSanitizer + UBSan" OFF)
option(GOALGRID_COVERAGE "Instrument host code with gcov" OFF)
option(GOALGRID_BUILD_TESTS "Build host unit tests" ON)
set(GOALGRID_EMULATOR "emery" CACHE STRING "Pebble emulator platform used by the pebble-* targets")

# --- Host-side model library ---------------------------------------------------
add_library(goalgrid_model STATIC src/c/model/goalgrid.c)
target_include_directories(goalgrid_model PUBLIC src/c)

# One shared set of strict flags/instrumentation for all host targets.
add_library(goalgrid_flags INTERFACE)
target_compile_options(goalgrid_flags INTERFACE
  -Wall -Wextra -Wpedantic -Wconversion -Wshadow -Wstrict-prototypes -Werror)
if(GOALGRID_SANITIZE)
  target_compile_options(goalgrid_flags INTERFACE -fsanitize=address,undefined -fno-omit-frame-pointer)
  target_link_options(goalgrid_flags INTERFACE -fsanitize=address,undefined)
endif()
if(GOALGRID_COVERAGE)
  target_compile_options(goalgrid_flags INTERFACE --coverage -O0 -g)
  target_link_options(goalgrid_flags INTERFACE --coverage)
endif()
target_link_libraries(goalgrid_model PUBLIC goalgrid_flags)

if(GOALGRID_BUILD_TESTS)
  include(CTest)
  add_subdirectory(tests)
endif()

# --- Pebble workflow -----------------------------------------------------------
include(cmake/Pebble.cmake)
