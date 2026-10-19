# MACKORN 液压圆锥破选型 MCP 服务器
#
# 为什么有这个 Dockerfile（R85）：
#   Glama（MCP 目录，awesome-mcp-servers 的自动评估方）需要能【构建并启动】服务器
#   才能算出质量分。它页面上写着 "This server cannot be deployed" ——
#   而我们又没有 Dockerfile，于是它无从下手，质量分一直是 '?'。
#   而维护者明确说：「任何等级都行 —— 只要它被设置出来」就能合并 PR。
#
#   所以这个文件的作用不是"我们自己要部署"，而是**让自动评估器能跑起来我们**。
#
# 零依赖：只需 Node 运行时与仓库里的源码。
FROM node:20-alpine

# 无 npm 依赖，所以不用 npm install —— 直接把源码放进去即可
WORKDIR /app

# 只拷运行必需的部分（镜像小、构建快）
COPY package.json ./
COPY plugin ./plugin
COPY skills ./skills
COPY knowledge ./knowledge

# MCP over stdio：不监听端口，通过标准输入输出通信
# 评估器会用 `docker run -i` 的方式喂 JSON-RPC
ENTRYPOINT ["node", "plugin/mcp-server.mjs"]

# 便于人工自检：
#   docker build -t mackorn-cone-crusher .
#   docker run --rm -i mackorn-cone-crusher --list
#   docker run --rm mackorn-cone-crusher --selftest
