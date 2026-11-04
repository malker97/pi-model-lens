# Pi Model Lens

**看清请求了哪个模型，以及服务端报告了哪个模型。**

[English](README.md) · [版本下载](https://github.com/malker97/pi-model-lens/releases) · [发布流程](docs/RELEASING.md)

这是独立的 Pi 扩展。每条已完成的 OpenAI Codex 回复上方，右对齐显示响应型号和一个状态灯：

```text
                                                        gpt-6-astra ●
```

不需要代理、不发送探测提示词、不改写回答正文，也不会把标签加入下一轮模型上下文。

## 安装

需要 **Pi 1.5**、**Node.js 22.19 或更高版本**。目前测试的是 Pi 1.5.0、Node 22/24，以及普通和全屏两种终端模式。

```sh
pi install git:github.com/malker97/pi-model-lens@v0.0.1
```

现有会话执行 `/reload`；新会话自动加载。这个命令固定版本标签，不会自动漂移到未来版本。

**npm 发布单独审批，目前请先使用 GitHub 安装。** 等 npm 确实存在该版本后，也可以使用：

```sh
pi install npm:pi-model-lens@0.0.1
```

本地开发安装：

```sh
pi install /absolute/path/to/pi-model-lens
```

本地安装引用目录而不是复制文件，不要移走该目录。切换本地、Git 或 npm 来源前，先用 `pi list`
查看来源，再用 `pi remove <原来源>` 移除旧安装，避免重复加载。

从旧的 `openusage-routing.ts` 迁移时，先把旧文件移出 Pi 的 `extensions` 自动发现目录，备份到别处。
检测到重复采集器时，新插件会暂停自身采集并提示，而不是写入重复记录。

## 灯色

| 灯色 | 含义 |
|---|---|
| 绿 | 服务端报告的型号标识与请求一致 |
| 黄 | 返回了项目明确配置的升级型号 |
| 红 | 其余型号不一致，包括跨系列 |
| 灰 | 信息不足、不完整、冲突或记录无效，无法可靠比较 |

当前黄色映射只有 **`gpt-6-astra` → `gpt-6.2-astra`**。这是项目维护者约定的策略，**不是 OpenAI 官方评级或性能测评**。
反向返回，以及 `gpt-6-astra` → `gpt-6.1-sol` 等其他情况显示红灯。不根据版本号大小自动判断好坏。

红灯表示“不是请求的型号标识”，不等于性能更差；绿灯也不是模型权重验证。没有确定响应型号时显示 `Unknown`。

按 Pi 的展开快捷键（默认 **Ctrl+O**）查看完整请求型号、证据、响应 ID 和完成时间：

- `Response Model Field Only`：只有响应体的 `response.model`。
- `Server Model Metadata`：收到了 `openai-model` / `x-openai-model` 元数据，且没有冲突。
- `Conflicting Model Fields`：字段报告了不同型号，保留冲突，不替服务端选择一个答案。

黄色升级在完整详情中仍属于“标识不同”。`/model-lens` 可查看最近记录，不会发送请求；旧命令 `/openusage-routing` 保留为迁移别名。

## 范围与限制

- 目前只采集 Pi 的 `openai-codex` / `openai-codex-responses` 路径，支持其 WebSocket 和 SSE 事件。
- 回复成功完成后才显示。发起工具调用的助手回复会显示，但本地工具结果不是另一条模型回复。
- 预热、内部调用、失败、取消和截断响应不作为成功回复标注。
- 有历史采集记录的回复可以恢复显示；没有保存过的信息无法追溯。
- 暂不覆盖额外账号 provider ID、直接运行的 Codex CLI、OpenAI API-key provider、Claude 或 DeepSeek。
- Pi 新版本需重新验证兼容性。这里只能观察服务端报告的身份，无法独立验证模型权重。

## 隐私与独立性

插件沿用 Pi 的认证、传输和用量处理，只记录型号标识、证据来源、响应 ID、完成时间与状态。
不在这些记录中加入提示词、回答、思考内容、工具参数、Cookie 或凭据，也不上传记录。
如果你另外分享或导出 Pi 会话，这些自定义元数据可能随会话文件一起分享。

历史记录类型 `openusage.model-routing` 和 schema 1 保持兼容，但这不构成运行依赖。
**不需要安装或启动 OpenUsage**；其他工具只是可以自行读取同一格式。

## 常见问题

- **没显示标签**：先 `/reload`，确认 provider 受支持且回复成功完成；旧会话可能没有采集信息。
- **提示重复安装**：移除旧脚本或重复的包来源，再重载。
- **灰灯**：展开或运行 `/model-lens` 看原因，不会拿配置里的模型名冒充响应型号。
- **只有响应体证据**：服务端不一定返回模型头，插件不会把 `response.model` 当成官方模型头。
- **终端很窄**：型号会截短，状态点保留；展开可读完整字段。

## 开发与发布

详见 [贡献说明](CONTRIBUTING.md)、[发布流程](docs/RELEASING.md)、[安全说明](SECURITY.md)。
CI 会跑类型检查、单元/集成测试和真实 Pi 终端冒烟测试，测试只用合成记录和本地模拟服务。
推送代码不会自动发布 npm；实际 npm 发布需要手动触发、仓库开关和环境审批。

采用 [MIT 许可证](LICENSE)：允许商用、修改、分发和闭源使用，但须保留版权与许可声明；不提供担保。
