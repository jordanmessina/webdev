# WebDev Dockerfile
# Next.js app with tmux and CLI tools for terminal sessions

FROM node:22

# Install tmux, curl, and build dependencies for node-pty
RUN apt-get update && apt-get install -y \
    tmux \
    curl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Gemini CLI globally (as root)
RUN npm install -g @google/gemini-cli

WORKDIR /app

# Copy package files and install dependencies as root first
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Create directories that will be mounted as volumes and set ownership
RUN mkdir -p /home/node/.webdev /home/node/.claude /home/node/.gemini \
    && chown -R node:node /home/node/.webdev /home/node/.claude /home/node/.gemini

# Change ownership to node user
RUN chown -R node:node /app

# Switch to node user for Claude install and runtime
USER node

# Install Claude Code CLI as node user
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude to PATH (installed to ~/.local/bin)
ENV PATH="/home/node/.local/bin:$PATH"

EXPOSE 3000

# Run the custom server in production mode
CMD ["npm", "run", "start"]
