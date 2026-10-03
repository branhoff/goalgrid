# Thin wrappers around the `pebble` CLI. Pebble builds in-source (./build), so
# CMake's own build tree lives elsewhere (see CMakePresets.json -> ./out).

find_program(PEBBLE_TOOL pebble HINTS "$ENV{HOME}/.local/bin")

if(NOT PEBBLE_TOOL)
  message(STATUS "pebble CLI not found; pebble-* targets disabled "
                 "(install: uv tool install pebble-tool --python 3.13)")
  return()
endif()

message(STATUS "pebble CLI: ${PEBBLE_TOOL}")

function(pebble_target name)
  add_custom_target(${name}
    COMMAND ${PEBBLE_TOOL} ${ARGN}
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    USES_TERMINAL
    VERBATIM)
endfunction()

pebble_target(pebble-build build)
pebble_target(pebble-clean clean)
pebble_target(pebble-install install --emulator ${GOALGRID_EMULATOR})
pebble_target(pebble-logs logs --emulator ${GOALGRID_EMULATOR})
pebble_target(pebble-screenshot screenshot --emulator ${GOALGRID_EMULATOR} --no-open
              ${CMAKE_SOURCE_DIR}/screenshot.png)
pebble_target(pebble-kill kill)

# Installing needs a fresh bundle.
add_dependencies(pebble-install pebble-build)

# Generates ./compile_commands.json with the ARM toolchain flags and Pebble SDK
# headers, so clangd understands <pebble.h>.
pebble_target(pebble-compile-commands compile-commands)
