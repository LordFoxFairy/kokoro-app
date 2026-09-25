import { iamInteractionDocument } from "./iam-interaction-page"

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character)
}

export function invitationSignInPage(input: Readonly<{
  action: string
  signInToken: string
  signUpToken: string
  message?: string
  failedAction?: "sign-in" | "sign-up"
  email?: string
  name?: string
}>): string {
  const action = escapeHtml(input.action)
  const notice = input.message === undefined ? "" : `<p class="form-error" role="alert">${escapeHtml(input.message)}</p>`
  const forms = `<form class="auth-form" method="post" action="${action}">
    ${input.failedAction === "sign-in" ? notice : ""}
    <input type="hidden" name="csrf_token" value="${escapeHtml(input.signInToken)}">
    <input type="hidden" name="decision" value="sign-in">
    <label class="field" for="invite-email">邮箱<input id="invite-email" name="email" type="email" autocomplete="username" value="${input.failedAction === "sign-in" ? escapeHtml(input.email ?? "") : ""}" required></label>
    <label class="field" for="invite-password">密码<input id="invite-password" name="password" type="password" autocomplete="current-password" required></label>
    <div class="actions single"><button type="submit">登录并查看邀请</button></div>
  </form><details class="invitation-register"${input.failedAction === "sign-up" ? " open" : ""}><summary>没有账号？创建 Kokoro 账号</summary>
    <form class="auth-form" method="post" action="${action}">
      ${input.failedAction === "sign-up" ? notice : ""}
      <input type="hidden" name="csrf_token" value="${escapeHtml(input.signUpToken)}">
      <input type="hidden" name="decision" value="sign-up">
      <label class="field" for="invite-name">姓名<input id="invite-name" name="name" type="text" autocomplete="name" value="${input.failedAction === "sign-up" ? escapeHtml(input.name ?? "") : ""}" required></label>
      <label class="field" for="invite-register-email">邮箱<input id="invite-register-email" name="email" type="email" autocomplete="email" value="${input.failedAction === "sign-up" ? escapeHtml(input.email ?? "") : ""}" required></label>
      <label class="field" for="invite-register-password">密码<input id="invite-register-password" name="password" type="password" autocomplete="new-password" minlength="8" required></label>
      <div class="actions single"><button type="submit">创建账号</button></div>
    </form>
  </details>`
  return iamInteractionDocument({ title: "邀请", heading: "加入 Kokoro",
    description: "登录后查看你的邀请。新用户请先创建账号并验证邮箱。",
    trustedFormHtml: forms, variant: "compact-invitation" })
}

export function invitationPreviewPage(input: Readonly<{
  action: string
  acceptToken: string
  rejectToken: string
  tenantName: string
  roles: readonly string[]
  expiresAt: string
}>): string {
  const roles = input.roles.map((role) => `<li>${escapeHtml(role)}</li>`).join("")
  const content = `<ul class="scope-list"><li><strong>工作空间</strong><br>${escapeHtml(input.tenantName)}</li>
    <li><strong>邀请有效期至</strong><br><time datetime="${escapeHtml(input.expiresAt)}">${escapeHtml(input.expiresAt)}</time></li></ul>
    <h2 class="invitation-subheading">你的角色</h2><ul class="scope-list">${roles}</ul>
    <div class="actions"><form method="post" action="${escapeHtml(input.action)}">
      <input type="hidden" name="decision" value="accept"><input type="hidden" name="csrf_token" value="${escapeHtml(input.acceptToken)}">
      <button type="submit">接受邀请</button></form>
      <form method="post" action="${escapeHtml(input.action)}">
      <input type="hidden" name="decision" value="reject"><input type="hidden" name="csrf_token" value="${escapeHtml(input.rejectToken)}">
      <button class="secondary" type="submit">拒绝邀请</button></form></div>`
  return iamInteractionDocument({ title: "查看邀请", heading: "你收到一份邀请",
    description: "这份邀请仅对当前登录的收件人可见。", trustedFormHtml: content,
    variant: "compact-invitation" })
}

export function invitationStatusPage(heading: string, description: string): string {
  return iamInteractionDocument({ title: heading, heading, description, trustedFormHtml: "", variant: "compact-invitation" })
}
