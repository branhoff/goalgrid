# Standard Linux development environment. Same base as CI (ubuntu-latest).
# Pinned to amd64: pebble-tool -> pypkjs -> stpyv8 has no Linux arm64 wheel.
# Build/run through scripts/dev.sh, which works with docker, podman or Apple's
# `container` CLI.
ARG UBUNTU_VERSION=26.04
FROM --platform=linux/amd64 ubuntu:${UBUNTU_VERSION}

ARG DEBIAN_FRONTEND=noninteractive

# Pebble SDK runtime deps are the last line (from developer.rebble.io/sdk).
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake ninja-build pkg-config \
      clang clang-format clang-tidy cppcheck gcovr lcov \
      git make curl ca-certificates sudo vim \
      python3-pip python3-venv python3-coverage nodejs npm \
      libsdl1.2debian libfdt1 \
    && rm -rf /var/lib/apt/lists/*

# habit-hooks' duplicate-code detector.
RUN npm install -g jscpd

# ubuntu:24.04 ships a user at UID 1000; replace it so host file ownership matches.
ARG USERNAME=devuser
ARG USER_UID=1000
ARG USER_GID=1000
RUN userdel -r ubuntu \
    && groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m -s /bin/bash $USERNAME \
    && echo "$USERNAME ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt" > /etc/sudoers.d/$USERNAME

# Mount points for the build volumes (see scripts/dev.sh); pre-created so the
# volumes inherit devuser ownership.
RUN mkdir -p /home/$USERNAME/workspace/build /home/$USERNAME/workspace/out \
    && chown -R $USERNAME:$USER_GID /home/$USERNAME

COPY --from=ghcr.io/astral-sh/uv:0.10 /uv /uvx /usr/local/bin/

USER $USERNAME
ENV PATH="/home/$USERNAME/.local/bin:${PATH}" \
    GOALGRID_CONTAINER=1
WORKDIR /home/$USERNAME/workspace

# Toolchain pinned by the project, not by whoever sets up a machine.
RUN uv tool install pebble-tool --python 3.13 \
    && uv tool install habit-hooks \
    && uv tool install ruff \
    && pebble sdk install latest \
    && pebble --version

# Mutation testing for the C model (separate layer: cheap to rebuild).
RUN uv tool install universalmutator

# Start as root only so the entrypoint can fix volume ownership, then drop to devuser.
USER root
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/bin/bash"]
