import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message } from "@/components/ui/message"
import type { SessionMessage } from "@/core/state"

import styles from "./thread.module.css"

type MessageBubbleProps = {
  message: SessionMessage
}

// 用户消息：右侧柔暖胶囊、无头像无气泡尾。纯文本呈现，不把用户键入的 markdown 记号当语法解析。
export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <Message align="end" className={styles.userMsg}>
      <Bubble align="end" variant="secondary" className={styles.userBubble}>
        <BubbleContent className={styles.userBubbleContent}>
          <p className={styles.userBody} data-slot="user-message-body">{message.content}</p>
        </BubbleContent>
      </Bubble>
    </Message>
  )
}
