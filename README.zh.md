# dsh-bubble（中文）

> [English version](./README.md)

一个**站外**(out-of-tree)聊天气泡插件，给 **DeepSeek Harness**（`dsh`）的 Web GUI 用。每当你在某个会话里发一条消息，浏览器右下角就会弹出一个气泡"骂"你一句——文案由你的 LLM 现编，每句都不一样，主题围绕 `敲！又让我干活了！`。

## 功能

- 在窗口右下角固定位置弹出一个深色对话气泡（带小尾巴）
- 每次发消息触发一次，5 秒后自动消失
- 文案由 LLM 实时生成（默认 `dsh-llm` + `deepseek-official / deepseek-v4-flash`，`purpose: "session-title"` 关掉思考以加快响应），失败时回落到 4 条内置备选文案

## 结构

插件是标准的 dsh **双面包**：宿主端（node）注册一个 HTTP 路由，浏览器端拿到这个路由返回的文案后渲染气泡。

| 文件 | 作用 |
|---|---|
| `lib/plugin.js` | 宿主端：注册 `/dsh-bubble/insult` 路由，调用 LLM |
| `lib/grumble.js` | （概念上的）当前内联在 `plugin.js` 里的 LLM prompt 和备选文案 |
| `lib/client.js` | 浏览器端：监听每个会话的收件箱，检测到新消息就 fetch 路由、渲染气泡 |
| `lib/*.d.ts` | 类型桩，让包结构合法 |
| `package.json` | 声明 `dsh.client`（`platform: "web"`）和 `./client` 导出 |

浏览器 bundle 是一个 classic-script 风格的 CJS 工厂，通过 `window.__ModuleLoader__.load({ id, factory })` 注册（和所有其他 dsh 客户端 bundle 同款）。它把自己注册到 `shell.overlay` 列表槽位（由 `ui-layout` 声明），inject 接口暴露一个 `bubble` 宿可观察对象；renderer 把它绑定为 `useBubble` 选择器 hook，气泡组件用它读取要显示的文案。

## 安装（按用户，站外放置）

放在 dsh 工具树之外，这样更新永远不会触碰 harness 仓库。把它放进 profile 解析得到的 `node_modules` 里，让 loader 和 modules node half 都能找到它。

1. 把这个包加入 profile 的 fallback `node_modules`，让 profile 通过它解析 `@dsh-extra/dsh-bubble`：

   ```powershell
   # 把 <DSH_HOME> 替换成你的 dsh 主目录（例如 C:\Users\<你>\.dsh），
   # 把 <REPO> 替换成这个仓库在你本地的路径
   New-Item -ItemType Junction -Path "<DSH_HOME>\profiles\node_modules\@dsh-extra\dsh-bubble" -Target "<REPO>"
   ```

   （用 `@dsh-extra` 作用域是为了避开上游 `@deepseek-ai` 命名空间；healed fallback 会认任意子目录。）

2. 在 profile 的 `cordis.patch.yml` 末尾追加一行（在所有 bundle 层之后，home 层之前）：

   ```yaml
   - insert:
       - id: bubble
         name: '@dsh-extra/dsh-bubble'
   ```

   正在跑的 dsh 的配置文件 watcher 会**热挂载**这一行——宿主端不需要重启。

3. 在浏览器里**硬刷新一次页面**（`Ctrl+Shift+R`）。下次页面加载时，引导清单会把新客户端行捡起来。

之后随便在哪个会话里发条消息，右下角就会冒泡。

## 自定义

- **改文案语气** — 改 `lib/plugin.js` 里的 `SYSTEM` 常量。模型只会看到你写的这段提示。
- **换模型路由** — `lib/plugin.js` 里的 `PROVIDER` 和 `MODEL` 常量。只要你的 dsh 配置了对应适配器就行。
- **不用 LLM** — 把 `lib/plugin.js` 里的 fetch 逻辑改成返回 `FALLBACKS` 里的某一条；气泡照样能用，只是文案是写死的。
- **气泡样式、位置、存活时间** — `lib/client.js` 里的 `bubbleStyle`、`HIDE_AFTER_MS`。

修改 `lib/client.js` 和（拆分后的）`lib/grumble.js` 后，下次刷新页面就生效。宿主端入口 `lib/plugin.js` 在 dsh 进程生命周期内只加载一次，要换宿主代码得重启 dsh（或换新包名）。

## 故障排查

- **`/dsh-bubble/insult` 返回 404** — 包没有被 profile 解析到。检查 `$DSH_HOME/profiles/node_modules` 下的符号链接（或真实目录）是否指向这个仓库，以及 `package.json` 里的 `name` 跟 `cordis.patch.yml` 里那行的 `name` 是否完全一致。
- **完全看不到气泡** — 打开浏览器控制台看错误。宿主路由应该直接响应 `GET http://127.0.0.1:3080/dsh-bubble/insult`；如果通了，那问题在客户端 watcher。当前 watcher 读 `pendingSubmissions[i].requestId` 中 `placement === "transcript"` 的条目；如果未来 dsh 改了字段名，去 `lib/client.js` 改 `latestTranscriptId` 即可。
- **GUI 报 `401 Unauthorized`** — 你的 dsh web profile 启动了 bearer token 墙，访问 GUI 需要用启动时打印的那个带 token 的 URL。气泡插件本身不需要 token，但 GUI 加载需要。

## 许可

MIT。