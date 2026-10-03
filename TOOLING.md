# TOOLING.md — concrete tools per capability

`AGENTS.md` names capabilities; this file maps each to the tool this project uses and
records where the standard template had no good option for C.

| Capability | C (watch + model) | JavaScript (pkjs, ES5) | Python (`tools/`) |
| ---------- | ----------------- | ---------------------- | ----------------- |
| **Formatter** | `clang-format` (`.clang-format`) | none — see note 1 | `ruff format` |
| **Linter** | `clang-tidy` (`.clang-tidy`) + `cppcheck` | `node --check` + ES5 guard test | `ruff check` |
| **Type check** | `-Wall -Wextra -Wpedantic -Wconversion -Wshadow -Werror` + `pebble build` (7 platforms) | n/a | n/a |
| **Tests** | CTest; C built with ASan + UBSan | `node --test` (wire, service, config, ES5 guard, fixture tool) | `unittest` |
| **Coverage (enforced)** | `gcovr` (lines 90 / branches 85) on `src/c/model` | Node built-in on wire/service/config (90 / 85 / 90); `index.js` is Pebble wiring, excluded | `coverage.py` (90) |
| **Mutation** | `universalmutator` on the model, seeded sample, `MUTATION_MIN` | not used — see note 2 | not used |
| **Dead code** | `cppcheck --enable=unusedFunction` | — | `ruff` (F401/F841) |
| **Structure** | `habit-hooks` + the local **habit-hooks-c** plugin | not scanned — see note 3 | `habit-hooks` generic |

## Notes and known gaps

1. **JS formatter:** the pkjs is ~300 lines. A formatter (prettier) would add an npm
   dependency tree larger than the code. Compensation: `node --check`, an ES5 guard
   test, and review. Revisit if the pkjs grows.
2. **Mutation beyond C:** the JS and Python here are small and fully covered; mutation
   is applied where the risk is (date math, buffer indexing).
3. **habit-hooks has no C plugin.** It ships generic, Python, TypeScript, PHP, Java,
   and Ruby only. `tools/habit-hooks-c/` adds the smells the house rules need
   (function size/params/nesting, narrating comments) using habit-hooks' own smell
   names and coaching guides; file size and duplicated code come from its generic
   plugin (`jscpd`). It is a candidate to contribute upstream.
4. **Firmware files have no unit coverage.** `main.c` and `matrix_layer.c` need the
   Pebble runtime. They are compiled under the strict flags, built for all 7
   platforms, linted by `cppcheck`, and reviewed on the emulator.
5. **Sanitizers** are part of the C test build (not in the template's C row). They
   catch out-of-bounds and undefined behavior that warnings cannot.
6. **Emulation:** the dev image is linux/amd64. On Apple Silicon it is emulated; some
   syscalls are unimplemented (`tar` extraction fails), so scripts use `cp`.
7. **Pinned by image, not by machine:** tool versions come from the Ubuntu 26.04 image
   (apt) and `uv tool install` (pebble-tool, habit-hooks, ruff, universalmutator).
