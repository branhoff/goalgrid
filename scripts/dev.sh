#!/bin/sh
# Build the dev image and run a command (default: a shell) inside it.
#   scripts/dev.sh                      interactive shell
#   scripts/dev.sh make verify          run the gate in the container
# Works with docker, podman, or Apple's `container` CLI; override with
# CONTAINER_RUNTIME=<name>.
set -eu

IMAGE="${IMAGE:-goalgrid-dev}"
# amd64 everywhere: pebble-tool depends on stpyv8, which has no Linux arm64
# wheel. On Apple Silicon this runs under emulation (slower, but it works).
PLATFORM="${PLATFORM:-linux/amd64}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

runtime="${CONTAINER_RUNTIME:-}"
if [ -z "$runtime" ]; then
	for candidate in docker podman container; do
		if command -v "$candidate" >/dev/null 2>&1; then
			runtime="$candidate"
			break
		fi
	done
fi
if [ -z "$runtime" ]; then
	echo "No container runtime found (looked for docker, podman, container)." >&2
	exit 1
fi

"$runtime" build --platform "$PLATFORM" -t "$IMAGE" -f "$ROOT/Dockerfile" "$ROOT"

# Source is bind-mounted; build output lives on Linux-native volumes so it never
# collides with the host's own build/ and out/ directories (and is faster).
WORK=/home/devuser/workspace
flags="--rm --platform $PLATFORM -v $ROOT:$WORK -v $IMAGE-build:$WORK/build -v $IMAGE-out:$WORK/out -v $IMAGE-cache:/home/devuser/.cache"
[ -t 0 ] && flags="$flags -it"
if [ "$#" -eq 0 ]; then
	set -- /bin/bash
fi
# shellcheck disable=SC2086
exec "$runtime" run $flags "$IMAGE" "$@"
