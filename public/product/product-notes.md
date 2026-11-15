## Simpler page and no dragging (2026-11-04)
At the owner's request the page has fewer blocks: four feature cards (two rows), extras as one 3 + 3 chip row, "Not in Botdom yet" moved into the FAQ, and the demo band merged with the first-brief finale into one closing block. Images and Bots can no longer be dragged or selected (it made clicks feel sticky). Section ids are unchanged.

## Page light, cursor and sound (2026-11-04)
`site-fx.js`: eased page-wide ambient light; a pointer spotlight and glowing edge on every block (nav, flow, mini screens, tiles, band, FAQ, brief, buttons, chips); a scroll progress line under the nav; a branded cursor (royal dot + eased ring that grows gold over controls, waves 👋 over Bots, ripples on click). Sound: off by default, toggle in the nav (remembered as `botdom.home.sound`); Web Audio synthesized cues for hovering any control or Bot (soft, throttled to 70 ms), messages (pitch per member), handoff, stamp, done, typing, clicks and Bot hellos; suspended when the app hides the page. Fine pointers only for light and cursor; reduced motion restores the native cursor.

## Light, motion and Bot reactions (2026-11-04)
Hero aura and pointer spotlight; preview window tilt, sheen and halo; five seats peeking over the window (Writer, Researcher, Lead centred, Reviewer, You) where the working one rises; Bots' eyes follow the pointer, hop when they speak, bob while working and show a check when done; a gold spark flies sender to receiver in the member list; the first brief types into the composer before sending; tiles have a pointer spotlight; buttons a light sweep; sections fade up; demo-band Bots say hello on click. Pointer effects are fine-pointer only; reduced motion turns motion off.

**Tool list (owner decision, 2026-11-04):** Codex, OpenCode, DeepSeek Harness, Claude Code, WorkBuddy, Pi Agent. In this build the registry enables CodeBuddy Code (CLI; its note says it is separate from the WorkBuddy desktop app) and Cursor Agent, and keeps Pi disabled as a synthetic-only spec. Reconcile the page and the shipped harnesses before publishing.

## Home page redesign (2026-11-04)
`index.html` is now a product-style page (structure inspired by OpenBot's site; no code or copy taken): sticky nav with scroll-spy, a hero with a live sample app window (6 messages, member status, files; pause / step / replay), a 4-step flow with mini screens, a 3-column grid of working mini screens (tools, local data, versions + review labels, queue controls, extras, limits), a demo band, FAQ and a copyable first brief. Styles `home.css`, script `site-home.js`; Chinese via `copy.zh.js`. The old map page is kept as `legacy-kingdom.html` (unlinked); the stop rail, emblem bands and earlier polish layers below describe that legacy page. Checked in English at 1440 and in Chinese at 390; no horizontal overflow.

## Product tour polish layer (2026-11-04)

`tour-redesign.css` loads after `botdom-map.css` and only restyles; markup, copy and the road script are untouched. Hero: gold pill kicker, gold underline under the wordmark, warm glow behind the castle, tool line-up as quiet chips. Stops: gold-topped sheets and role-coloured record cards. Throne Room: the court at dusk (indigo stage, gold arcs and spark). Chinese headings use normal tracking. Update the same day: the hero is one centred, mirror-symmetric column (kicker, wordmark, title, buttons, tool chips, castle on one axis; residents in a symmetric formation), and the left/right zigzag of stops was removed: every stop is a centred landmark above a centred 900px card, so the road runs straight down the page. Checked at 1440 and 390 wide in English only; the Chinese layout and the other nine stops have not been re-inspected. No screenshots in the in-app guide were regenerated.

---

# Botdom 产品说明

## Botdom product page, map edition (2026-11-03)

Rebuilt from scratch. The page is one illustrated map of the kingdom: a road runs from the castle at the top to the keep at the bottom, and the crowned lead Bot walks it as you scroll. Each stop is a landmark with its own drawing and an italic place name; the top bar says where you are and the Map button opens the list of places.

**Stops (anchors kept for links and tests):** I The Castle (`top`, with the Throne Room sample court below it), II The Royal Road (`meeting`), III The Guild Hall (`harnesses`), IV The Archive Tower (`checks`), V The Gatehouse (`controls`), VI The Workshops (`more`), VII The City Walls (`local`), VIII The Edge of the Map (`limits`), IX The Training Grounds (`collaboration`), X The Notice Board (`faq`), then the Keep (`start-now`) with the copyable first brief.

**Look:** lilac map paper with faint contour rings, indigo ink line drawings, gold for the road, seals and calls to action, the four Bot colours for roles. Serif for the wordmark, headings and place names; the app's rounded sans for body text. The Bots are the app's own 3D bodies (`../../bot-3d/assets/*.png`) with live CSS eyes. No moon, night-sky or starfield motifs.

**Throne Room:** a new sample replay (`botdom-map.js`), not the old `site.js` one. Six steps you can jump between, play/pause, a gold spark flying between seats, the file chip and the review seal. It autoplays once when it comes into view, never under reduced motion, and stops when the guide hides the page. The full messages stay in the step buttons for screen readers.

**Copy rules:** unchanged from the previous edition: headlines may use the kingdom metaphor, body text keeps the verified facts; the @ sentence stays word for word; Sample and Illustration labels stay on every sample.

**Tool list (owner decision, 2026-11-03):** the page lists Codex, OpenCode, DeepSeek Harness, Claude Code, CodeBuddy Code and Pi Agent, without per-tool test badges or the mixed-relay test notes. Check that Pi Agent is enabled as a harness in the shipped build before publishing; in `release/botdom` it exists only as an RPC transport (`pi_rpc.py`).

**Files:** `index.html`, `botdom-map.css`, `botdom-map.js`, `copy.zh.js` (English → Chinese, applied by `product-language.js`). `landing.css`, `site.js`, `replay-wire.js`, `tour-light.*`, `conversation-card.*` are no longer loaded by this page; they stay for tests and older tooling. `workspace.html` (the interactive demo) is unchanged.

---

## Botdom product page (English, 2026-11-01)

The Botdom product tour is available in English and Chinese, alongside a bilingual interactive collaboration demo.

**What the page covers, in order:** the idea (01), how a group runs (02: brief the lead, the lead assigns, members hand off, you check), supported harnesses and what was tested (03), checks you can open: registered versions, receipts and independent review (04), controls: queue, pause, stop, restarts, approvals and the Full Access caution (05), other included features (06), where data goes (07), what is not available yet (08), the collaboration demo (09), questions (10), then a closing call to action with a copyable first message.

**Look:** "the Bots' meeting room". Cream background, the four Bot colours (lilac lead, sage researcher, peach writer, light-blue reviewer), rounded system fonts, stickers and speech bubbles. The Bot characters are the same figures as in the app. They blink, float, wave on hover and react in the replay; all motion stops under reduced motion and pauses when the guide hides the page.

**Truthfulness notes**
- The hero "sample meeting" is an illustration with sample messages. It calls no models and touches no workspace. Its tool line-up (a Codex lead with Codex, DeepSeek Harness and OpenCode members) mirrors the mixed relay recorded in `OPENBOT-REVIEW.md` (2026-10-30 and 2026-10-31). Several isolated runs of that relay delivered all three files, including one recovery after an injected start-up fault. Several failed: OpenCode asked for a path one character off, and in another run DeepSeek Harness read the working file instead of the registered version. Each pass is one sample, not a reliability guarantee.
- Claude Code and CodeBuddy Code can be connected (model IDs entered by hand), but they have not had an equivalent mixed-relay test. The page says so on their badges.
- Saving a connection doesn't prove sign-in, model access or quota. Data stays in local project data, but model calls still go to the configured services.
- New Codex, DeepSeek Harness and OpenCode Bots default to Full Access; the page states this as a caution, together with "stopping doesn't undo changes".
- The "not yet" list (no built-in browser, cloud hosting, phone notifications, team accounts, public Bot marketplace, payments or automatic provider fallback) follows the guide's boundaries and browser chapters.
- Samples on the page (documents, receipts, review sticker) are labelled "Illustration" or "Sample".
- The interactive collaboration demo (`workspace.html`) is reached from section 09 and follows the application language.
- The user tutorial is available in English and Chinese.
- The page contains no metrics, customer counts, rankings or competitor-superiority claims.

**Files:** `index.html` (markup and English copy), `landing.css` (all page styles), `site.js` (replay, agenda highlighting, frozen-copy toggle, copy brief, pausing), `assets/muster-mark.svg` (logo). `landing.js` from an aborted earlier draft was removed. `style.css`, `readability.css`, `guide-integration.css`, `transfer-motion.*` and `collaboration.js` now serve `workspace.html` only.

**i18n convention (for the Chinese version):** every visible text leaf in `index.html` has `data-i18n="<key>"`; attributes are listed in `data-i18n-attr="attr:key;attr:key"`; JS strings live in `data-msg-*` attributes on `#replay`, `#copyBrief` and `#versionToggle`, so `site.js` holds no English UI text. Keys match `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`, are unique, and are prefixed by section (`meta.`, `nav.`, `hero.`, `replay.`, `meeting.`, `harness.`, `checks.`, `controls.`, `more.`, `local.`, `limits.`, `demo.`, `faq.`, `close.`, `footer.`). The Chinese version will add one key → string table (for example `copy.zh.js`) and a small applier that runs when `<html lang="zh-CN">`, without duplicating layout. The applier is not built yet.

---

以下为原中文产品说明，供中文版介绍页参考。

更新：2026-10-29。面向个人创作者与小团队。本文是产品介绍，不替代应用中的完整使用指南。

## 一句话介绍

Botdom 是本机多 Bot 协作工作空间。你提出目标，群主管组织具有不同职责的 Bot 分工、咨询、交接，再根据实际回报汇总成果。

## 核心价值

- 长期角色：Bot 保留名称、形象、职责和独立会话，可以在不同项目中继续使用。
- 主管协调：共同目标由本群主管协调，独立工作可以并行，有依赖的工作需要咨询与交接。
- 项目规则：基础 Skill（原群外 Skill）用于私聊与所有群，各群在其上补充要求。分别维护、执行时合并，不共享私聊历史。
- 可核对的交付：任务、回报、成果文件与历史版本可以追溯。模型声称已完成不等同于系统确认已完成。
- 人保留决策权：需要确认的目标、外部操作和不确定结果，不应被演示或模型回复替代。

这些是相对于手动组织多个独立对话的具体价值，不是对所有竞品的独占性或性能领先结论。

## 第一次协作

1. 在「设置 → 模型与连接」中添加并核对本机执行工具，例如 Codex、OpenCode 或 DeepSeek Harness。模型和登录状态取决于工具自身的配置；找到工具不代表已验证登录或模型可用。已有 Bot 的旧 API 连接继续保留。
2. 新建群聊，可以暂不选择成员。系统会创建本群专属主管。
3. 先与主管讨论岗位、职责、输出和验收标准。
4. 明确要求创建 Bot 并加入本群，或自己邀请已有成员。核对成员列表和真实回执。
5. 说明共同目标、已有材料和执行边界，要求主管安排分工。
6. 在「成员协作」和「群管理 → 任务与成果」查看实际进展。打开文件核对成果，再决定后续工作。

### 可复制的起步指令

> 我想为新产品准备一份介绍。先与我讨论需要哪些岗位，每个岗位交付什么，不要立即执行。确认后，再由资料研究员核对产品能力，内容创作者准备初稿，质量审阅员检查依据与表达。未经确认不要发布到外部平台。

## 重要概念

- Bot：长期角色，不等于一次性任务。
- 群聊：一个协作范围，拥有专属主管、成员、记录和规则。
- 侧栏分组：整理入口的文件夹，不是群聊；放入分组不代表已经加入群。
- Skill：该范围的工作要求，不会凭空增加工具、账号权限或跨会话访问权。

## 已有功能

私聊与群聊、主管建队与分工、成员咨询与成果交接、按 Bot / 群配置模型、独立 Skill、任务记录、文件预览和交付版本、定时任务、失败与结果不明的区别处理、用户授权的跨 Bot 信息读取、同源图文指南。

## 使用指南在哪里

Botdom 左下角「使用指南」直接在当前对话页面内展开；不会跳转到新网址或新标签页。搜索和章节跳转在内嵌区域中完成；截图原地放大；「返回对话」回到原来的聊天。原聊天 DOM 和草稿不因打开指南而被替换。

人和 Bot 使用同一份章节内容。Bot 按需读取，不需要把整篇指南重复塞进每次消息；阅读指南不会扩大操作权限。

## 当前边界

- 本机电脑与后台必须运行，关闭网页不会主动终止已启动任务；不等于电脑关机后仍能工作。
- 定时任务不是云端常驻执行或手机推送。
- 模型目录中的项目不代表当前账号一定有调用权限或额度。
- 私聊与各群会话独立，跨 Bot 读取需要明确授权。
- 结果不确定时先核查，不能通过盲目重试避免核查。
- 停止任务不会撤销已经发生的文件修改或外部调用。
- 尚无企业管理、支付和公开市场的交付承诺。
- 任务完成不等于论文质量、文案事实或其他专业结论已经通过独立验收。

## 宣传材料的真实性说明

协作演示（`workspace.html`）中的协作画布、阶段事件和下载文件是显式标记的交互概念演示：纯前端，不调用模型，不读取或改变用户真实工作空间，也没有把模拟结果称为真实回执。中英文介绍页的会议回放同样是标注过的插图。

未采用未经实测的效率倍数、成本节省比例、客户数量、行业排名或竞品优劣承诺。


## 2026-11-02 update

The replay draws the dotted handoff line above the message bubble and keeps the user at the upper left; each handoff draws a fresh path around messages and labels, with a moving dot, then fades out; file and result markers stay below the stage, and the four-step overview centres each marker on its step. The illustration remains synthetic and does not call a model. The concise user tutorial and product overview have Chinese and English text. The separate interactive workspace remains Chinese-only.


The public product page has no tutorial, chapter or internal-document links. Its calls to action open the replay or the isolated interactive demo. Internal Bot documentation remains available through the existing application reference mechanism.

## Stop rail and limits grid (2026-11-04)
- `tour-rail.js` adds a text-free button row to the foot of every stop card: previous, the ten stops as numerals (current one filled), next. It reads names from the map legend, so it follows the page language and adds no copy. First and last stops show a dimmed arrow so the row stays symmetric.
- "Not in Botdom yet" chips are an even 3 + 3 grid (one column on phones).
- Checked in English at 1440 and 390: rails centred in every card, no horizontal overflow. Chinese and in-app guide screenshots not re-checked.

## Emblem bands (2026-11-04)
- `tour-ornaments.js` adds a text-free, mirror-symmetric badge band to nine stops (decorative, `aria-hidden`, no new copy, so nothing to translate): Royal Road relay of you and the four Bots around the lead; Guild Hall pennant garland; Archive Tower sheets with a wax seal; Gatehouse five round control keys with Stop in the centre; Workshops six icon badges; City Walls battlement; Edge of the Map fading fog; Training Grounds six step dots around a play key; Notice Board six pinned notes.
- Reuses existing `.bd-bot`, `.bd-seal-icon` and `.bd-room-icon` art. Checked in English at 1440 only; 390 and Chinese not re-checked after this change; in-app guide screenshots not regenerated.

## Home entry (2026-11-04)
This page is the app's Home: it opens from its own sidebar entry (`static/guide/home.js`) and is no longer a tab inside the usage guide. The site lives in `Luna-Bot/home-site/` and is served read-only at `/home/` on the app's port.
