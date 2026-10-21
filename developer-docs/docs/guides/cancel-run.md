# 取消 run

对 session 和 run 的 control operation 发送 `run.cancel`。

<<< ../../examples/curl/cancel-run.sh{bash}

`202` control receipt 只表示取消 command 已被接纳。继续读取 AG-UI stream 或 session snapshot，直到 run 进入终态。如果 run 在取消生效前已经完成，它仍然是 terminal；网络超时不是取消失败的证据。

同一 cancel 请求的结果不确定时，使用相同 idempotency key 和相同 body 重试。不要用新的 key 并行发起第二个取消 command。
