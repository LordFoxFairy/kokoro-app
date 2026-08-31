import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { CheckCircle2, ChevronDown, Circle, CircleDot, ListChecks } from "lucide-react"

import { useT } from "@/i18n/context"
import type { SessionTodo } from "@/core/state"

import styles from "./todo-bar.module.css"

type TodoBarProps = {
  todos: SessionTodo[]
}

// 每个 todo 状态对应的细线状态图标（完成 / 进行中 / 待办）。
function todoIcon(status: SessionTodo["status"]) {
  if (status === "completed") {
    return <CheckCircle2 className={styles.todoGlyph} />
  }
  if (status === "in_progress") {
    return <CircleDot className={styles.todoGlyph} />
  }
  return <Circle className={styles.todoGlyph} />
}

// 计划条：钉在输入框上方的可收缩清单。常驻可查、不随对话滚走。
// 无 todo 时不渲染（不在输入框上方留空壳）。
export function TodoBar({ todos }: TodoBarProps) {
  const t = useT()

  if (todos.length === 0) {
    return null
  }

  const doneCount = todos.filter((todo) => todo.status === "completed").length
  const title = t("todo.progress")
  const activeTodo = todos.find((todo) => todo.status === "in_progress")
    ?? todos.find((todo) => todo.status === "pending")
    ?? todos.at(-1)

  return (
    <Collapsible
      className={styles.todobar}
      data-desktop-web="true"
      aria-label={title}
      defaultOpen={false}
    >
      <CollapsibleTrigger asChild>
        <Button variant="secondary" className={styles.toggle} type="button">
          <span className={styles.title}>
            <ListChecks className={styles.titleIcon} />
            <span>{title}</span>
            {activeTodo ? (
              <>
                <span className={styles.separator} aria-hidden="true">|</span>
                <span className={styles.activeStep}>{activeTodo.content}</span>
              </>
            ) : null}
            <span className={styles.count}>
              {`${doneCount} / ${todos.length}`}
            </span>
          </span>
          <ChevronDown className={styles.chevron} />
        </Button>
      </CollapsibleTrigger>

      <div
        className={styles.progress}
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={todos.length}
        aria-valuenow={doneCount}
      >
        <div
          className={styles.progressFill}
          style={{ width: `${(doneCount / todos.length) * 100}%` }}
        />
      </div>

      <CollapsibleContent className={styles.listContent}>
        <div className={styles.list} role="list" aria-label={title}>
          {todos.map((todo, index) => (
            <div
              key={`${index}-${todo.content}`}
              className={styles.todo}
              data-status={todo.status}
              role="listitem"
            >
              <span className={styles.mark} aria-hidden>
                {todoIcon(todo.status)}
              </span>
              <span className={styles.text}>{todo.content}</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
