# 🔄 已收录平台更新包（自动生成）

> 生成时间：2026-10-21T10:46:28.327Z
> 用途：每 3 天同步一次元数据，防止平台缓存过期（如 Glama 显示 19 tools 而实际 29）

## 当前最新状态（要同步给各平台）

```
工具数：29
版本：  0.2.2
语言：  12
描述：  液压圆锥破选型、破碎筛分整线配置、磨矿选矿方法推荐与流程仿真。29 个工具，12 语言。
```

## 逐平台更新动作（8 个）

### GitHub（listed）

```
更新方式：node tools/finish_all.mjs --write（需 GITHUB_TOKEN）
检查方式：node tools/directory_checker.mjs --only github
```

### npm registry（listed）

```
更新方式：npm version patch && npm publish
检查方式：node tools/directory_checker.mjs --only npm
```

### Official MCP Registry（listed）

```
更新方式：更新 server.json 版本后重新发布
检查方式：node tools/directory_checker.mjs --only mcp-registry
```

### Smithery（listed）

```
更新方式：更新 npm 版本后自动同步
检查方式：node tools/directory_checker.mjs --only smithery
```

### skills.sh（listed）

```
更新方式：更新 skills/ 目录后自动同步
检查方式：node tools/directory_checker.mjs --only skills-sh
```

### Glama（listed）

```
更新方式：修 DNS+SSL 后去 Glama 后台点 Refresh / Re-evaluate
检查方式：node tools/directory_checker.mjs --only glama
⚠️ 阻塞：DNS：裸域 mackorn.cn 无 A 记录 / SSL：证书 2026-10-14 已过期
```

### punkpeye/awesome-mcp-servers（pr-open）

```
更新方式：修 DNS+SSL → Glama 评分 → PR 补评论催促合并
检查方式：node tools/directory_checker.mjs --only awesome-mcp
⚠️ 阻塞：DNS：裸域 mackorn.cn 无 A 记录
```

### awesome-dsh-plugin（merged）

```
更新方式：已合并，如需更新内容再提 PR
检查方式：node tools/directory_checker.mjs --only awesome-dsh
```

## ⚠️ 已知缓存问题

- **Glama**：缓存过期，需重新抓取
  → 修 DNS+SSL 后去 Glama 后台点 Refresh / Re-evaluate
