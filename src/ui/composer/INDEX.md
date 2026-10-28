# ui/composer — 输入区

## 职责
消息输入框 + 发送/停止、模式切换、模型/agent 选择器、固定技能条、通用展开对话框。纯受控组件，状态由 shell 持有。

## 公开件
- `Composer`（`composer.tsx`）+ `MAX_INPUT_LENGTH`：受控输入区；draft/回调/候选全由 props 注入。`emptyWorkspace` 投影 workspace/conversation 的本地布局；项目内已有会话同样走 conversation，不从项目归属猜概览。
- 输入增高同时响应 draft 与自身宽度；宽度 observer 不随 draft 重建、忽略纯高度通知、卸载清理。conversation 的列宽、内边距、焦点和 footer 由本组件维护，Frame 不覆盖 textarea/form 尺寸。项目/新建输入区同样由组件持有16px文字内边距和24px行高；项目只约束最小高度，不把长草稿锁死在120px。
- mode 元数据（`mode-options.ts`）：模式 → 菜单文案、图标和合法值收窄。
- `ComposerMenu`：通用 Composer 的附属子件；桌面 User Web 使用 Manus 式内联编辑器，不挂载独立放大对话框入口。
- `environmentSelectorPlacement`：项目线程桌面态可将环境入口锚定到编辑器上方；默认仍位于工具行。

## 协作者
上游：`@/ui/shell`（draft、submit/keydown、selectors）；已安装 Skill picker 通过 AppFrame 的同一试用生命周期提交当前草稿选择。

## 陷阱
- Enter 发送 / Shift+Enter 换行；IME 合成期 Enter 只确认候选词不发送。
- 首条消息后模式/模型/agent 锁定（`modeLocked`）：由 shell 传入，组件不自持锁态。

- Send 的可见性只由运行态与非空 draft 决定；disabled 消费上游 engine admission，非空但暂不可提交时保留按钮与草稿，Stop 不受该判定阻断。
## 显式技能选择

`SelectedSkillPill` 仅显示 shell 传入的真实选择名称并提供键盘/触屏移除入口；不管理安装或 source 授权。清除只影响未来消息，不修改 engine 已冻结的未知提交。选择名不写入提示词充当能力身份。

项目未显式选择时由engine保留省略并交BFF继承默认，不在Composer重新解析安装/版本；试用pill的用户清除为显式[]，生命周期退休恢复作用域默认。

- 恢复或语音追加的草稿超过现有 4000 字符提交上限时，保留完整草稿，在输入区关联可访问提示并禁用 Send；表单提交也阻断，缩短后自动恢复。有效输入不额外占布局。

- 模型目录保留受控 `modelCatalogStatus` 的加载／成功／失败事实；失败只作 SR 状态，不在 Composer 插入可见错误／重试面板。同 scope 已确认候选和选择保留，首次未知不造候选或默认值；仅完整成功目录校正失效选择（含真正空目录），已锁定会话不改模型。底层 `retryModels` 的显式程序化恢复保持；正常页面重新挂载会重新读取，不宣称同一常驻壳的重入已恢复，也不把此展示修正当读取故障根因修复。明确发送失败仍归原消息／命令反馈，产品模式与业务模型身份保持分离。

## 当前消息的连接来源

`ComposerConnections` 是独立受控Popover：精确Connection行选择、原选glyph、有限分页，Esc回触发器。添加与管理使用独立回调进入目录窗口和原设置，不修改账号enabled或发模型；打开时原读取刷新保留，不额外展示手动刷新或通用重试面板，失败不伪装成功空态。指针打开不自动聚焦首行，键盘打开仍正常聚焦与回焦；`composer-connections.module.css`持有实测menu/pill/26×16switch几何与局部选中token。

## 当前草稿的 Skill picker

`composer-skills-menu.tsx` 用现 Popover/Command 组合资源根菜单、已安装搜索及显式添加/管理；`+` 与单个手输 `/` 共用，仅读 actor-scoped 现 Skills pool，不创建或启用安装。加载/失败/无结果分开，enabled/active/exact pin 校验复用现规则。候选行沿 Manus 2026-10-25 实测50px、6px 8px padding、14px/20px标题与单行描述；独立局部 CSS 负责窄屏逐级面板和滚动。

Composer 仅报告新输入的 slash 范围；成功选择仅移除该范围，保留原文、原会话和光标，不自动 Send。IME、paste、URL/path 与选区替换不打开命令；菜单键盘/Esc 不落入原 Enter-submit。真正 source 选择与首次 Send 承接仍由 `useAppFrameSkillTrial` 单一生命周期持有，旧 actor/scope/route 的结果和迟到 focus 不复活。`SelectedSkillPill` 原样复用，当前仍为 textarea＋controls pill，不冒称行内不可编辑 token 已一比一。
