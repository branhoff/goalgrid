# Uniform task interface (see AGENTS.md). Every verb runs in the standard Linux
# dev container (Dockerfile): on a host, `make <verb>` delegates to
# scripts/dev.sh; inside the container (GOALGRID_CONTAINER=1) it runs the tools.
# Opt out on a machine that already has the toolchain: GOALGRID_CONTAINER=1 make verify
MAKEFLAGS += --no-builtin-rules
.SUFFIXES:
.DEFAULT_GOAL := help

VERBS := check verify test coverage mutation lint format format-check typecheck structure \
         deadcode clean

.PHONY: help setup hooks shell live config config-local config-prod review $(VERBS)

# Host-only: the live service check needs the host network and the host emulator.
EMULATOR ?= emery
PROFILE ?= local

help:
	@echo ""
	@echo "Usage (runs inside the dev container; first run builds the image):"
	@echo "  make setup         Build the dev image and enable git hooks"
	@echo "  make check         Fast gate: typecheck + lint + format-check + tests + coverage"
	@echo "  make verify        check + structural checks + dead-code check"
	@echo "  make test          Unit tests (C under ASan/UBSan, JS, Python)"
	@echo "  make coverage      Tests with enforced coverage thresholds"
	@echo "  make mutation      Grade test quality with mutation testing (slow)"
	@echo "  make lint          clang-tidy, cppcheck, ruff, node --check"
	@echo "  make format        Auto-format in place"
	@echo "  make format-check  Check formatting without writing"
	@echo "  make typecheck     Strict host warnings (-Werror) + 7-platform Pebble build"
	@echo "  make structure     habit-hooks structural checks"
	@echo "  make deadcode      Unused functions / imports"
	@echo "  make shell         Interactive shell in the dev container"
	@echo "  make clean         Remove build artifacts"
	@echo ""
	@echo "Host-only (needs the host network + a running emulator):"
	@echo "  make config        Point the watch at a config profile, then reinstall to apply"
	@echo "    make config PROFILE=prod   (or: make config-local / make config-prod)"
	@echo "  make live          Fetch /grid live and push it to the watch"
	@echo "    AUTH_TOKEN=... GOALGRID_URL=https://... [EMULATOR=emery] make live"
	@echo "  make review        Local LLM reviewer pass over the uncommitted change set"
	@echo ""

setup: hooks
	scripts/dev.sh true
	@echo "Setup complete."

hooks:
	git config core.hooksPath .githooks
	@echo "git hooks enabled (core.hooksPath -> .githooks)"

# Runs directly on the host (not in the container): it talks to the deployed service and
# the running emulator. Fetches /grid with AUTH_TOKEN, validates it, and pushes it to the
# watch through the real wire pipeline.
live:
	@test -n "$(AUTH_TOKEN)" || { echo "Set AUTH_TOKEN=... (the service bearer token)"; exit 1; }
	@test -n "$(GOALGRID_URL)" || { echo "Set GOALGRID_URL=https://... (the service base URL)"; exit 1; }
	node tools/live_grid.js "$(GOALGRID_URL)" --push --emulator $(EMULATOR) --out shots/live_response.json

# Swap the watch between data sources (config/profiles.json). Writes the profile into the
# emulator's localStorage, then reinstalls so PebbleKit JS restarts and refetches from it.
config:
	python3 tools/set_config.py $(PROFILE) --emulator $(EMULATOR)
	pebble install --emulator $(EMULATOR)

config-local:
	@$(MAKE) config PROFILE=local

config-prod:
	@$(MAKE) config PROFILE=prod

# Local, on-demand reviewer pass (AGENTS.md rule #9). Deliberately not in CI or the
# pre-commit hook: an LLM review is slow, costs tokens, and is non-deterministic. Run it
# yourself before committing a substantial change. REF overrides the base (default HEAD).
review:
	scripts/review.sh

ifndef GOALGRID_CONTAINER

shell:
	@scripts/dev.sh

$(VERBS):
	@scripts/dev.sh make $@

else

C_FILES := $(shell find src tests -name '*.c' -o -name '*.h')
HOST_C := $(wildcard src/c/model/*.c) $(wildcard tests/*.c)
COV_LINES ?= 90
COV_BRANCHES ?= 85
PY_COV ?= 90
JS_TEST := "tests/*.test.js"
JS_COVERAGE := --experimental-test-coverage --test-coverage-include=src/pkjs/wire.js --test-coverage-include=src/pkjs/calendar.js \
               --test-coverage-include=src/pkjs/service.js --test-coverage-include=src/pkjs/config.js \
               --test-coverage-include=web/onboard.js --test-coverage-include=web/goals.js \
               --test-coverage-lines=90 --test-coverage-branches=85 --test-coverage-functions=90

CMAKE_HOST = cmake -S . -B out/host -G Ninja -DCMAKE_BUILD_TYPE=Debug

check: typecheck lint format-check test coverage

verify: check structure deadcode

typecheck:
	$(CMAKE_HOST) >/dev/null
	cmake --build out/host
	pebble clean
	pebble build

lint:
	$(CMAKE_HOST) >/dev/null
	clang-tidy -p out/host --quiet $(HOST_C)
	cppcheck --enable=warning,style,performance,portability --suppressions-list=.cppcheck-suppressions \
	  --error-exitcode=1 --quiet src/c tests
	ruff check tools
	for f in src/pkjs/*.js tools/*.js web/*.js; do node --check $$f || exit 1; done

format:
	clang-format -i $(C_FILES)
	ruff format tools

format-check:
	clang-format --dry-run -Werror $(C_FILES)
	ruff format --check tools

test:
	cmake -S . -B out/san -G Ninja -DGOALGRID_SANITIZE=ON >/dev/null
	cmake --build out/san
	ctest --test-dir out/san --output-on-failure

coverage:
	rm -rf out/cov
	cmake -S . -B out/cov -G Ninja -DGOALGRID_COVERAGE=ON >/dev/null
	cmake --build out/cov
	ctest --test-dir out/cov --output-on-failure -R goalgrid
	gcovr --root . --filter 'src/c/model/' --object-directory out/cov \
	  --fail-under-line $(COV_LINES) --fail-under-branch $(COV_BRANCHES) --print-summary
	python3 -m coverage run --branch --source=tools/habit-hooks-c/src -m unittest discover \
	  -s tools/habit-hooks-c/tests
	python3 -m coverage report --fail-under=$(PY_COV)
	node --test $(JS_COVERAGE) $(JS_TEST)

structure:
	scripts/habit.sh --all

deadcode:
	cppcheck --enable=unusedFunction --suppressions-list=.cppcheck-suppressions \
	  --error-exitcode=1 --quiet src/c tests

mutation:
	tools/mutation.sh

clean:
	pebble clean
	rm -rf out/* .coverage

endif
