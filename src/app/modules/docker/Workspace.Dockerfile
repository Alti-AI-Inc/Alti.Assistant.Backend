FROM alpine:3.19

# Install Node.js, NPM, Python3, PIP, Go, Bash, shadow, and essential build tools
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    py3-pip \
    go \
    bash \
    shadow \
    build-base \
    git

# Create a secure non-root user and group
RUN groupadd -g 1001 sandbox && \
    useradd -u 1001 -g sandbox -m -s /bin/bash sandbox

# Configure /workspace and set permissions
WORKDIR /workspace
RUN chown -R sandbox:sandbox /workspace

# Install uv (fast Python package manager) for high performance inside sandbox
ENV PYTHONUNBUFFERED=1
RUN pip3 install --no-cache-dir --break-system-packages uv

# Run as sandbox user for strict privileges isolation
USER sandbox

# Keep the sandbox container active and waiting for dynamic exec operations
CMD ["sleep", "infinity"]
