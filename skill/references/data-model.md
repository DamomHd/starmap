# 数据模型与插件一致性约束

skill 与 Chrome 扩展**读写同一份数据**。改这里之前，先在扩展侧确认对应实现
（`better-stars/src/lib/` 下的 `gist.ts` / `github.ts` / `merge.ts` / `cleanup.ts`），
否则两边会悄无声息地互相覆盖。

## Gist 结构

Gist 中只有一个文件：

```json
{
  "version": 1,
  "lastPushedAt": "2026-10-27T08:00:00Z",
  "annotations": {
    "123456": {
      "repo_id": 123456,
      "tags": ["待研究", "Rust"],
      "note": "读源码参考",
      "full_name": "tokio-rs/tokio",
      "updatedAt": 1761552000000
    }
  }
}
```

| 字段 | 约束 |
|---|---|
| 文件名 | 固定 `better-stars-annotations.json`。**插件靠这个名字识别自己的 Gist**，改名会找不到旧文件而新建空的，用户看到的是「数据全丢了」 |
| `version` | 目前恒为 `1`。结构不兼容地变更时才递增，且需两边同时改 |
| `lastPushedAt` | 人类可读标记，**不参与合并** |
| `annotations` 的键 | `repo_id` 的**字符串形式**（JSON 键只能是字符串） |
| `tags` | 不带 `#` 前缀。前端展示时才加 `#` |
| `note` | 纯文本，空字符串表示无备注 |
| `full_name` | `owner/repo`，冗余存储。插件星标页注入时只能从 DOM 拿到名字、拿不到 id，靠它兜底 |
| `updatedAt` | epoch **毫秒**。不是秒——秒级会和插件的 `Date.now()` 差三个数量级，合并时永远判本地更新 |

`favorite` 字段是插件早期功能的遗留，已废弃。读取时忽略即可，不要写。

## 合并

**注解级，不是字段级。**

```
两边都有 → updatedAt 严格大于才用远端；相等或缺失保留本地
只在一边 → 直接用
```

为什么不做字段级：用户改标签和改备注通常一起发生。拆到字段级会合并出
「标签来自 A 设备、备注来自 B 设备」的四不像。整条取新，语义是「谁的版本更新用谁的」。

**已知代价**：A 设备只改备注、B 设备只改标签时，后写的会覆盖另一条。
插件的 Push/Pull 手动同步是可用的兜底。

skill 的实现：每次写之前重新读远端、只改本次涉及的 key、再写回。
因为 GitHub API 没有条件更新（没有 ETag/If-Match 支持），
两个进程同时写的窗口无法完全消除——这是刻意接受的，注解写入频率很低，
且合并规则保证了即使撞上也不会丢太多（丢的是被覆盖那一条的新改动）。

## 注解清理规则

| 时机 | 行为 |
|---|---|
| `tags` 和 `note` 都为空 | 删除该条目，不留空对象 |
| `unstar` 成功 | 同步删除对应注解（`--keep-annotations` 可保留） |
| `unstar` 失败 | **保留**注解——star 还在，注解就该还在 |

## 清理判定（review 命令）

与插件 `src/lib/cleanup.ts` 同一套规则。一个仓库只归入**一个**组，按确定性从高到低：

| 顺序 | 组 | 判定 |
|---|---|---|
| 1 | 已归档 | `archived == true` |
| 2 | 镜像 | `mirror_url` 非空 |
| 3 | Fork | `fork == true` |
| 4 | 长期不更新 | 最后提交距今 > 730 天 |
| 5 | 从未标注 | star 超过 365 天且无标签无备注 |

**有标签或备注的仓库一律跳过。** 那代表用户当时是真的在意，
把它们列为「可清理」会显得工具不懂事。

## 仓库类型（`--type`）

对齐 GitHub 原生筛选：

| 值 | 判定 |
|---|---|
| `source` | `!fork && !mirror_url && !is_template` |
| `fork` | `fork` |
| `mirror` | `mirror_url` 非空 |
| `template` | `is_template` |
| `public` / `private` | 按 `private` 取反 / 取真 |

## API 注意

- `/user/starred` **必须**带 `Accept: application/vnd.github.star+json`，
  否则返回的是裸 repo 对象，没有 `starred_at`，年份维度全废
- 取消 star 是 `DELETE /user/starred/{owner}/{repo}`，返回 204
- 认证请求限额 5000/小时；写操作更严，`unstar` 批量执行时脚本会串行加间隔
- GitHub 没有给 star 附加元数据的官方 API——标签/备注**只存在于本地和 Gist**，
  永远不会出现在 GitHub 服务器上。这是插件和 skill 共同的根本限制，不是 bug
