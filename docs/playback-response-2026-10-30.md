# 曲终后停止切歌：2026-10-30

## 原因

`onStatesFetchResponseReceived` 提前调用原始 `Response.json()`，消耗响应体，随后只覆盖实例的 `.json()` 方法。

这与同机开启的 AdBlock 6.51.0 的 `replace-fetch-response` 拦截冲突：其 `content-main.js` 对返回值调用 `clone().text()`，再创建新的 Response。原响应已被消费，克隆失败，Spotify 收不到 HTTP 200 响应内的后续状态机。已有缓冲曲目仍可播放，状态耗尽后停在歌尾，界面仍显示正在播放。

现场日志同时出现 HTTP 200 与缺失的 HTTP 状态机处理日志；原始逻辑的本地复现中 `.text()`、`.arrayBuffer()`、`.clone()` 均失败。

## 修复

- 在副本上解析与修改，返回有完整响应体的新 Response，保留状态码、响应头及请求层所需元数据。
- 网络请求在队列外执行，只将状态修改排队，避免转换过程等待自身所在队列。
- 处理失败保留原始响应；超时回退数据与仍运行的修改任务隔离。
- 忽略不携带状态机的冲突处理命令。
- 保留此前未提交的媒体日志及扩展上下文失效保护。

## 验证

`node --test tests/state-response.test.cjs`：12 项通过，包括五种读取入口、AdBlock 式克隆重建、实际广告状态替换、错误透传、失败回退与超时隔离。

Edge 中保持 AdBlock 和 Spotify Ad Skip 同时开启，歌曲定位到结束前五秒后，让媒体自然触发 ended，依次验证：

1. Lament → Nowhere, Never
2. Nowhere, Never → Mom Piano
3. Mom Piano → eau
4. 播放转回并刷新原 Spotify 网页应用：eau → Gusts of Wind Blowing in Different Directions

原应用日志确认 fetch 拦截已生效、队列为空，以及 ended 后紧接着下一曲的 loadstart / playing / before_track_load / started_playing。

本轮未覆盖数小时播放、电脑睡眠唤醒或真实广告插入；广告替换逻辑由本地回归用例覆盖。
