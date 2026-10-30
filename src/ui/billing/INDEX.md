## 设置积分卡复用与读取（2026-10-26）

账户概览和用量页均使用 `BillingSummary embedded`；紧凑卡片的样式由自身标识决定，不再依赖用量页祖先。账户页仅挂载摘要，不读取历史。`AccountReadSnapshotBoundary` 在当前打开的设置、可信主体/准入代际、同一 BillingClient 内保留确认摘要并合并仍在途的读取；页签卸载不取消共享读取，整个设置关闭、主体/代际或客户端换代则退休。完成后再次进入仍后台重新读取，不设 TTL 或持久缓存；同 scope 已知值在等待/失败时保留，未知保持 `—`。余额刷新与历史请求各自结束；历史慢不让已确认余额继续 busy。沿用同源客户、10 秒预算、精确十进制金额、现有准入及 missing-account 初始化契约。

## 套餐目录被动读取（2026-10-26）

`pricing-panel` 保留稳定内容区；加载及读取失败仅提供无障碍状态，不再展示 skeleton、红色错误卡或重试按钮。初次未知与成功空目录分开；退出重开沿原准入 scope 发起新 GET，无后台轮询或自动重试。目录当前只有挂载读取，不新增缓存或刷新框架；10 秒预算、取消、主体/代际/客户端退休及迟到结果保护保持。真实 not_configured 和购买禁用原因保留，checkout 不调用。

## 未开放资源用量的用户呈现（2026-10-23）

网站／电脑分类移除内部“服务未接通、费用额度记录不可读”的实现说明。每个面板只显示一处本地化“暂未开放”；网站三卡以 `—` 表示未知值，并通过 `aria-describedby` 关联原因，不伪造 0 或暂无记录。未接入筛选的日期控件禁用，删除无效本地日期状态。既有分类、任务真实 summary/ledger、身份隔离、分页、电话弹窗和禁用交易不变。九语言同步维护；此项只修正展示，不代表资源用量服务交付。

## 积分流水的用户文案（2026-10-22）

`billing-model.reasonKey`只负责只读展示映射：正式来源`admin_credit`在用户侧显示“积分到账”，不暴露管理员身份或声称现金支付；未识别来源统一为“积分变动”，不猜成充值／消费。九语言均维护独立词条，`billing-ledger`的嵌入／独立两种视图共用；API原source_kind、金额、符号、排序、过滤和分页不变。两视图九语言回归及实际正常页面已验，详见CURRENT本次局部修复。

<!-- 2026-10-22 continuation retirement correction -->
积分客户端每次续发 PUT 或核实 GET 前复验调用方 `getCurrent`；真实账户/用量/rail传入现 controller/current 与发起时已准入subject的marker一致性检查。只更新storage、无rerender/focus仍会抑制旧续发；marker丢失、不匹配或读取异常一律退休。marker只抑制，不授予session权限；非UI调用可不传callback，初次GET契约保持，无新store/轮询/锁。

## 当前租户积分无感初始化（2026-10-22）

现 `BillingClient` 仅在严格匹配 request-id 的 missing-account GET 后发送一次天然幂等 PUT 空对象，再重读原 GET；summary/ledger 并发由 owner 幂等承接，无浏览器锁或新全局 store。未知 PUT ACK（含502/503）先 GET 核实且不自动重放；同一10秒预算、外部取消和原UI身份退休贯穿全程。UI不再显示“未开户”，失败可显式重试，不伪造0，首次读取只留稳定无文字/大骨架的可访问占位。充值、计量、扣费和支付未启用。下方旧“未开户”描述为历史。

订阅周期使用现 Radix Select 浏览 all/month/year/once，资源分类沿现 Tabs 统一局部排版；控件、价格与详情仍消费原目录，无新增交易行为。

订阅在 pricing-panel 内仅按正式目录的 month/year/once 字段过滤；pricing-plan-details-dialog 展示原金额、币种、周期及积分，不折算年费或推断优惠。周期切换不重读目录，购买仍禁用并说明支付未接通，身份退休沿现宿主 key。

设置内用量分类现在可本地切换：现 billing-panel 的任务读取、分页与身份退休保持；billing-resource-content 负责网站与游戏的三类未知用量卡及禁用日期筛选、居中的不可用云电脑引导和复用电话说明弹窗。三卡桌面同行、窄屏纵排，未开放提示只显示一次，日期不提供未接通的交互。缺少服务时不显示费用、额度或虚构空列表，自动充值/电脑创建仍禁用；无新客户端、业务请求或开户实现。订阅真实空目录使用中性图标、原空态文案和显式重新读取，复用原单飞 retry、预算和身份退休，不自动重试或触发支付。

SET26 review correction: formal plans owns the actual body reader; one absolute deadline and parent retirement cancel it and release its lock. Response.json plus locked body.cancel is rejected. Checkout and all wire behavior remain protected.

## SET26 用量与套餐可信读取（2026-10-15；正式D0，先tests-only）

正式Web基线a9183585ab403797f79b522aedb120de562a64e9、939 tracked clean。仅现Web Billing/Pricing/settings消费接缝，runtime_audit唯一writer，17具名路径/914保护/Root8；Root独占设计/docs/Git/资源/正常运行/CUA。候选独审无确定阻断P1/P2。Skills/连接器、owner契约/SQL/generated/依赖、checkout源码与全局QueryStore保护；无新源文件/模块/owner。

职责为现Billing/Pricing/settings读取边界及恢复；源码与测试17路径、Root8索引/设计，scope只局部可信生命周期，目录无全局query变更，单10s/显式retry/disabled交易。新locale仅一个key，其余当前资料保持。

## SET-17 当前目录与退役支付入口

当前固定BFF提供真实目录读取，但不提供checkout。PricingPanel/PricingContent保留loading、error/retry、unavailable、empty和真实金额展示；非空目录首次购买disabled并解释不可用，无checkout/redirect状态。升级按钮仍导航目录。MockPayPanel无orderId prop，只显示不可用、disabled动作及返回工作区；已发布直接pay URL保留，不读取或确认订单。mock-pay同源adapter在配置/Origin/准入守卫后所有环境503，无body消费或owner I/O。Team入口复用现团队标签，仅管理原固定tenant成员，不提供创建团队。

## T-B03.R255-WEB-CREDIT：当前消费者源码候选（待Root集成与真实用户验收）

当前切片只消费个人可用余额/预占及owner journal，不再读by-model或推导Free、每日赠送、quota、低余额阈值。固定BFF `97a99d35c8c78e7ca6e1370fd16ba5d670766095` / public `8.0.0` / OpenAPI全文SHA256 `33971eaa8b43e8aa85a8eef8c3b99e42f0999fe3136dc129705beb7e8bb0e2f4`，owner正式blob原字节复制，现两个generator正规派生；不双读旧wallet。

现 `/api/session/billing/summary` 与 `/api/session/billing/ledger` 复用可信session adapter。strict closed账户/流水data保十进制字符串、BigInt显示尺度10^6与owner UTC Z瞬时点（按用户locale/本地日历展示），disabled展示owner只读值；404/503是error而非零余额。每读10秒总预算覆盖headers/body/parse、真实abort及reader释放；mounted panel独立loading/error/ready，刷新撤旧投影，分页单flight、显式同cursor重试、null终页、重复cursor拒循环与journal去重。现主体marker仅退役结果，不赋权限、不建第二store。

Account与rail popover未知套餐均占位，保身份/订阅入口及原布局；preview仅显式fixture，不是live失败fallback。此节覆盖下方历史消费者状态，原mixed正文不修改。三面D0已批准、D1行为反例已由Root复跑；当前生产/测试候选待Root工程复验、独审与提交。真实Billing账户200、余额/流水翻页/刷新/跨主体浏览器验收尚未执行，正常503退出loading不证明资金旅程完成；70组台账不虚增。

---

# ui/billing — 计费与价格面板

## 职责
余额卡 + 用量透视 + 流水列表（`BillingPanel`）；只读套餐目录（`PricingPanel`）；退役支付不可用页（`MockPayPanel`）。诚实态优先，不放假按钮。

## 公开件
- `BillingPanel` / `BillingContent`（`billing-panel.tsx`）：props `client: BillingClient` / `onClose` / `onOpenPricing?`。
  余额卡（余额/冻结/**配额行**，配额设了才显）+ **低余额预警条**（余额<50 积分引导充值，有 onOpenPricing 才给按钮）+ **余额走势 sparkline**（≥2 笔流水，用入账后余额快照重建）+ **本月按模型消费**（B1d，有消费才渲染：模型名+积分+占比条+对话次数；名由 session 跨 model 解析）+ 流水**按天分组**（组头带当日净额）+ **消费/入账筛选** + 条目显示时间/run 标记。
- `PricingPanel`（`pricing-panel.tsx`）：props `client: PricingClient` / `onClose`。
- `MockPayPanel`（`mock-pay-panel.tsx`）：已发布直接入口不可用说明，无props、订单展示或交易请求。

## 协作者
- `@/billing/client`（session BFF 窄读）、`@/billing/pricing`（storefront）、`@/billing/format`（BigInt 金额换算）、`@/billing/rules`（`isCreditInsufficient` / `planIntervalKey`）。
- `@/lib/query`：余额卡 `useResource("billing/summary")`、按模型分解 `useResource("billing/by-model")`、目录 `useResource("billing/plans")`。

## 陷阱
- 金额全程 BigInt 十进制换算，绝不过 Number（余额可能超 2^53）。`format.creditsToNumber` 仅供 sparkline 几何（相对定位），绝不用于精算/展示金额。
- `created_at` 是 epoch **毫秒**（credit `getTime()` 直透）；日期/时间格式化直接按 ms，勿再 ×1000。
- 流水/目录中的分页列表是本地 accumulator（同 use-session-list 范式），不走 query 层。
- 固定配对checkout不可用，目录购买首次disabled；不得用非空目录推断支付可用。
- 低余额阈值 = 50 积分（`LOW_BALANCE_MICROS`）；配额进度未做（周期已用量需后端聚合，见 B1 挂点）。

## SET46 设置内资源分类（2026-10-15；D0）

现BillingScopedContent在embedded时给既有真实积分读取加资源分类：任务固定选中，网站与游戏/电脑/电话禁用并有可见原因。现Tabs/CSS/九locale承接，不新增组件/状态/请求；独立BillingPanel及账户/流水生命周期保持。正常用户尚无CreditAccount时仍显示未开通，不能以grant或旧账户模型补页面。

SET46验收范围：既有契约/架构/lint/type/build及38项浏览器回归通过；完整4052PASS/8FAIL，新增登录503/采集超时未归因。原字节候选登录夹具未就绪，不与基线六例通过等价；私有串行诊断六例通过不替代完整门。仅可回退本地候选，正常认证CUA另验。
