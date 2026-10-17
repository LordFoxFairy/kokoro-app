# ui/composer — 输入区

## 职责
消息输入框 + 发送/停止、模式切换、模型/agent 选择器、固定技能条、通用展开对话框。纯受控组件，状态由 shell 持有。

## 公开件
- `Composer`（`composer.tsx`）+ `MAX_INPUT_LENGTH`：受控输入区；draft/回调/候选全由 props 注入。
- mode 元数据（`mode-options.ts`）：模式 → 菜单文案、图标和合法值收窄。
- `ComposerMenu`：通用 Composer 的附属子件；桌面 User Web 使用 Manus 式内联编辑器，不挂载独立放大对话框入口。
- `environmentSelectorPlacement`：项目线程桌面态可将环境入口锚定到编辑器上方；默认仍位于工具行。

## 协作者
上游：`@/ui/shell`（draft、submit/keydown、selectors）；typed Skill source 选择尚无正式 UI 入口。

## 陷阱
- Enter 发送 / Shift+Enter 换行；IME 合成期 Enter 只确认候选词不发送。
- 首条消息后模式/模型/agent 锁定（`modeLocked`）：由 shell 传入，组件不自持锁态。

- Send 的可见性只由运行态与非空 draft 决定；disabled 消费上游 engine admission，非空但暂不可提交时保留按钮与草稿，Stop 不受该判定阻断。
## 显式技能选择

`SelectedSkillPill` 仅显示 shell 传入的真实选择名称并提供键盘/触屏移除入口；不管理安装或 source 授权。清除只影响未来消息，不修改 engine 已冻结的未知提交。选择名不写入提示词充当能力身份。

项目未显式选择时由engine保留省略并交BFF继承默认，不在Composer重新解析安装/版本；试用pill的用户清除为显式[]，生命周期退休恢复作用域默认。
