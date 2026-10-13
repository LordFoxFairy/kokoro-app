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
