---
description: "Web 图形界面的俄语语言包：注册 ru 语言，以及从固定上游 tag 生成的各命名空间字典；供面向俄语用户的部署使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-locale-ru

[English](README.md) | 中文

## 概述

本包在不改动各功能包自有字典的前提下，把俄语加入可选界面语言。它注册 `ru` 语言与每个命名空间的一份字典，俄语浏览器因此直接以俄语启动，缺失的键逐键回落到英文。本包只提供浏览器文案，不进入任何模型请求。

## Table of Contents

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [Model Experience](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

把本包挂到面向俄语用户的部署的浏览器插件清单即可。它没有配置项：语言出现在语言下拉中，请求 `ru` 的浏览器自动选中它，每个已注册命名空间都用俄语解析，未翻译的键回落英文。

如果部署自带翻译来源，就不要挂载本包；除此之外没有别的变化，因为本包只增加一门语言与各命名空间的字典。

-----

<a id="understand-the-implementation"></a>
## 实现说明

<details>
<summary>实现细节——点击展开</summary>

[`src/client/dicts.ts`](src/client/dicts.ts) 由 `custom/scripts/extract-locale-ru.mjs` 从 `RU_LOCALE_REF` 记录的上游 tag 生成，并带上覆盖率测试要读的「命名空间 → 字典文件」映射。[`src/client/overrides.ts`](src/client/overrides.ts) 存放本 fork 还在渲染、但上游尚未翻译的键，重新生成不会覆盖。[`src/client/dictionaries.ts`](src/client/dictionaries.ts) 合并两者，[`src/client/index.ts`](src/client/index.ts) 把语言与各命名空间注册为受管副作用，插件销毁时撤回语言并释放每个 `ru` 槽位。

覆盖率测试在三处失败：英文键没有俄语对应、`{占位符}` 集合漂移、以及仓库内字典开始自带俄语 —— 后者说明上游发布已经让本包冗余。

</details>

-----

<a id="model-experience"></a>
## Model Experience

无：本包只提供浏览器文案，不进入任何模型请求。

#### KV Cache effect

无：本包既不组装也不发送供应商请求。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- **在上游发布前是临时的** —— 字典来自未发布的上游 tag；上游正式版把俄语带进仓库后，在合并它的同一次改动里删除本包。
- **没有复数形式** —— 文案原样沿用上游翻译，没有引入按语言规则变化的复数处理。
