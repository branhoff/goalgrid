#!/bin/sh
# Volumes can be created root-owned (Apple's `container` does); fix the build
# mount points, then drop privileges to devuser for the actual command.
set -e
WORK=/home/devuser/workspace
for dir in "$WORK/build" "$WORK/out" /home/devuser/.cache; do
	[ -d "$dir" ] && chown devuser:devuser "$dir"
done
export HOME=/home/devuser USER=devuser LOGNAME=devuser
exec setpriv --reuid=1000 --regid=1000 --init-groups "$@"
