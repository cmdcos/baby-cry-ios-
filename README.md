# 本地模型文件

这些文件都是**预训练模型**，随 App 本地加载；不训练、不上传。

## 1. 原因模型（已接入）

| 文件 | 说明 | 大小 | SHA-256 |
|---|---|---|---|
| `reason-v0.6.bin` | `manfye/baby-cry-reasoning` v0.6，Extra Trees，6 类 | 8,278,444 B | `17dcfff76704f433ca6bbf25430c75691f280715e8591615fb782995197b7edc` |
| `reason-metadata.json` | 官方训练/评估信息、特征契约、拒绝阈值 | 28,212 B | — |
| `extra-trees.ts` | 官方浏览器运行时（参考/对照） | 9,210 B | — |

- 来源：<https://huggingface.co/manfye/baby-cry-reasoning>
- 许可：CC BY-SA 4.0（模型 artifact、官方 runtime、文档）
- 运行时代码：`../reason-model.js` 是 `extra-trees.ts` 的 JavaScript 移植，同样按 CC BY-SA 4.0 使用。
- 标签：`belly_pain`, `burping`, `discomfort`, `hungry`, `lonely`, `scared`
- 输入契约：16 kHz、49,152 samples（3.072 s）、RMS -23 dBFS、峰值 -1 dBFS
- 指标：开发集 62.34% / balanced 59.82% / macro-F1 62.61%；EnesBabyCries2 外部验证 33.85%；`release_ready=false`

> 官方声明：仅供实验/娱乐，**不能用于诊断、婴儿监测或照护决策**。

## 2. 检测模型（暂未接入）

| 文件 | 说明 | 大小 | SHA-256 |
|---|---|---|---|
| `detection.onnx` | `manfye/baby-cry-detector` v0.2，二分类 cry/non-cry | 435,616 B | `654dd85892bc3f0eccfecdfa8c2466a1b42c22631fbf90629355bf72bf74526b` |
| `detector-metadata.json` | 输入契约、feature mean/std、评估信息 | 28,212 B | — |
| `detector-config.json` | 模型配置 | 443 B | — |

- 来源：<https://huggingface.co/manfye/baby-cry-detector>
- 许可：CC BY-SA 4.0
- 用途：可做 cry/non-cry gate，先筛掉非哭声，再跑原因模型。
- 暂未接入：需要 ONNX Runtime Web（浏览器）或 ONNX Runtime（Flutter/原生）。
- 官方指标：开发验证 99.52% / 回归 97.06% / Enes cry-only recall 97.28%，但属于数据集内评估，不是独立真实世界验证。

## 3. 校验

PowerShell：

```powershell
Get-FileHash .\reason-v0.6.bin -Algorithm SHA256
Get-FileHash .\detection.onnx -Algorithm SHA256
```

Node：

```bash
node ../model-smoke-test.js
```

## 4. 许可与再分发

- 模型文件、官方 runtime 和本文档中的模型说明遵循 **CC BY-SA 4.0**。
- 再分发时保留来源、作者、许可与免责声明；修改过的 runtime（如 `reason-model.js`）按相同许可共享。
- 模型卡里的“不得用于诊断/监测/照护决策”是使用限制，不只是免责声明。
