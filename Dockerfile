# MACKORN Hydraulic Cone Crusher Selection MCP Server
#
# Why this Dockerfile exists (R85, revised R144 on 2026-10-22):
#   Glama (MCP directory, the auto-evaluator behind awesome-mcp-servers) must be
#   able to BUILD AND START this server to compute a quality score.
#   Without a buildable container it reports "This server cannot be deployed"
#   and the quality score stays '?'.
#
#   Glama official doc (blog 2026-03-15):
#     "A Glama release is not a GitHub release. It is a containerized build of
#      your MCP server that Glama uses to run security checks and to let users
#      deploy the server."
#
#   So this file is NOT for our own deployment. It exists so the evaluator can
#   run us. This is INDEPENDENT of our website's SSL certificate.
#
# Zero external dependencies: only the Node runtime plus the source in this repo.
# MCP over stdio: no listening port, JSON-RPC via stdin/stdout.

FROM node:20-alpine

# No npm dependencies, so no npm install step is needed.
WORKDIR /app

# Copy only what is needed at runtime (keeps the image small, build fast).
# knowledge/ is required because several knowledge tools read it at runtime.
COPY package.json ./
COPY plugin ./plugin
COPY skills ./skills
COPY knowledge ./knowledge

# MCP over stdio. The evaluator feeds JSON-RPC via `docker run -i`.
ENTRYPOINT ["node", "plugin/mcp-server.mjs"]

# Manual self-check:
#   docker build -t mackorn-cone-crusher .
#   docker run --rm -i mackorn-cone-crusher --list
#   docker run --rm mackorn-cone-crusher --selftest
