# 群聊降噪、检查点与并发验证

日期：2026-11-12。代码位置：`/Volumes/DISK/projects/botdom-next`，`botdom` 分支。本文只记录这次工作的改动和隔离测试，不代表当前正在运行的服务已经加载新代码。

## 先看结论

1. 员工工作时，可以通过 `@主管` 向空闲主管提问。隔离测试中，两名员工都还在运行，主管已经开始并完成了回答。主管自己正在回答时，接下来的问题会排队，空闲后处理；员工不必先结束。实际回答质量与模型、服务可用性有关。
2. 同一群里的不同 Bot 确实可以同时执行。测试在两名员工的完成闸门都没有放行时，观察到两个独立、同时处于运行中的执行，再让其中一个先完成。一次目标派工最多同时安排四个不同员工；依赖关系、同一 Bot 忙碌、运行额度和执行器限制仍会导致等待或排队。并行开始不等于必然更快，也不表示结果已验收。
3. 主管的例行派工提示已调整为尽量不再附带重复的面向用户的进度发言，仍须回答用户问题，并在完成、重要阻碍或需要用户决定时说明。这是对模型的行为要求，不保证所有模型每次都完全遵守；员工的派工记录和最终回报仍保留。
4. 已减少一处明确的重复上下文：员工报告如果已经作为**经过任务板核对的完整消息**出现在主管本次可见的上下文窗口，就用一条短引用替代内部交接里的第二份全文。消息没在窗口、身份或内容不一致、报告未经核对等情况下，仍发送完整原文。原消息、任务状态和用户请求不删除。

## 检查点：分别解决什么问题

项目已有的持久化派工检查点记录主管已作出的决定和派工阶段，供服务中断后核对，目的是避免重复派工。它不是聊天摘要，也不能证明任务已经完成。仅满足既定作用域、时效、成员、权限、任务板和聊天分支等条件，且整批派工尚未开始时才可能恢复；派工已经认领或状态不确定时不自动重做，应先核对聊天、工作区及任务板。

本次新增的“报告引用检查点”是**仅在组装下一轮输入时计算的临时投影**，不新增持久化摘要，不改变上述恢复机制。它用任务板的 `reportMessageId` 找到报告，核对作者 Bot、完整原文和本轮窗口中的实际内容；都一致且同名不会造成混淆时引用上下文中的报告，否则回退到原来的完整交接。短报告的引用如果更长，也保留原文。

这不是把长对话压缩成一段由模型生成的摘要，因此不会为了生成摘要额外调用模型，也不会在这一处丢掉失败原因或完整报告。它只消除已验证的重复副本：主管仍会看到任务、各员工的完整报告和必要的失败信息。

项目还已有另一套会话增量与上下文压缩机制；会话增量默认关闭，并有执行器和恢复条件限制。本次没有全局打开它，也没有修改其恢复策略。

## 节省量和边界

隔离测试构造了两份较长的英文报告。仅比较原来交接里的两份报告文本与两条短引用，该部分从 4,145 个字符降到 125 个字符，少 4,020 个字符。聊天上下文中的原始报告各保留一次；这不是整个请求或整次任务的降幅。

这是测试样本的字符数，不是供应商返回的实际 token 数或费用。不同语言、模型分词、缓存命中、报告长度和上下文窗口都会影响实际收益；短报告、不在窗口中的报告不会强行去重。当前没有拿真实供应商的用量账单做前后对照，因此不能声称固定节省百分比。

## 测试结果

所有操作使用临时数据目录、隔离后端和脚本化的假执行器，没有向正在使用的群发送消息，也没有访问真实模型或修改真实工作区。测试覆盖实际后端路由、任务板、执行队列、报告归档和服务重启；它不能替代真实供应商性能测试。

| 验证 | 结果 |
| --- | --- |
| 两名员工尚未结束时 `@主管`；主管忙时第二条问题排队，稍后在员工结束前得到回答 | 通过 |
| 两名不同员工同时开始、分别持有执行 ID；先后结束后主管只汇总一次 | 通过 |
| 中断与真实的隔离服务进程重启；明确指定原任务后继续，避免静默重复执行 | 通过 |
| 两份完整报告在主管输入中各出现一次；派工阶段没有额外的主管说明 | 通过 |
| 报告缺失、窗口移出、正文变更、作者不符、外部消息及失败回退 | 通过 |
| 派工检查点恢复、会话增量及安全回退 | 通过 |

验证命令及结果：

```sh
./node_modules/.bin/vitest run server/supervisor-parallel.e2e.test.ts server/group-goal-parallel.e2e.test.ts server/room-peer-notify.parallel.e2e.test.ts
# 14 passed
./node_modules/.bin/vitest run server/room-sessions.e2e.test.ts server/goal-checkpoint.e2e.test.ts
# 20 passed
./node_modules/.bin/vitest run src/lib/botdom-guide.test.ts server/host/room-transcript.test.ts server/group-goal-report-checkpoint.test.ts server/group-goal-run.test.ts server/group-goal-run.board.test.ts server/group-goal-parallel.test.ts server/goal-checkpoint.test.ts
# 65 passed
./node_modules/.bin/tsc -p tsconfig.server.json --pretty false
# passed
./node_modules/.bin/oxlint --deny-warnings server/group-goal-run.ts server/group-goal-report-checkpoint.ts server/group-goal-report-checkpoint.test.ts server/supervisor-parallel.e2e.test.ts server/room-sessions.e2e.test.ts server/index.ts
# passed
```

初测发现两类旧断言与现有行为不一致：重启测试重新派工时没有明确指定要继续的旧任务，而新规则要求提供旧任务的准确 ID 和完整标题；会话测试把回复中有意保留的引用片段当作第二条原消息。已修改测试以明确引用旧任务、区分原消息和引用，再重跑通过；没有为了让测试通过而放宽任务身份或移除引用。

使用指南 `public/guide/content.json` 已同步更新中英文说明。本次没有更改界面布局，不需要新增演示截图。

## 开源调研与借鉴

- DeepSeek 官方 [dsh-superagent-prototype 执行设计](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/003-execution.md)：路由与执行分开，任务可并发运行；中断后通过恢复说明要求执行器检查工作目录、Git 和外部状态，避免盲目重做。其[领域模型](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/001-domain.md)也区分用户输入、任务、派工和报告。这里借鉴的是明确的状态边界和可恢复性；不能把本次的报告去重描述成 DeepSeek 官方提供的摘要算法。
- [LangGraph 的持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence)把线程范围的状态检查点与长期记忆区分开。Botdom 同样应区分“能否安全恢复派工”和“向模型提供哪些上下文”，避免用自然语言摘要代替执行事实。
- [Anthropic 的上下文编辑](https://platform.claude.com/docs/en/build-with-claude/context-editing)讨论对历史工具上下文的管理；[OpenAI 的压缩示例](https://developers.openai.com/cookbook/examples/agents_sdk/building_reliable_agents_memory_compaction)展示在上下文边界进行压缩。生成式压缩可能漏掉约束，也可能增加一次模型调用；本次先实施可以逐条验证、失败即回退的去重，没有默认启用额外摘要。

## 如何生效

本次没有重启用户的 8820 后端，也没有提交现有工作区的未提交改动。检查时 8820 上的进程早于本次修改启动，后端改动需要在确认没有正在执行的任务后安全重启服务才能生效；不要在群里工作期间强制重启。重启后可用独立测试群发送两项互不依赖的任务，并在两名员工仍显示运行时 `@主管` 提问，观察回复和任务板；这一步需要真实模型，受模型和执行环境影响。
