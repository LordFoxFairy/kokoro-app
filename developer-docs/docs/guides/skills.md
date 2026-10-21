# 技能读取与精确版本

`GET /v1/skill.list` 对齐Manus公开技能列表：本地保留 `/v1` 命名，方法、查询与返回结构见[自动生成的技能API参考](/reference/v1/generated/skills#list-skills)，不另维护字段表。

## 个人与项目

省略 `project_id` 读取个人安装；提供时先核当前项目资格，再返回个人与项目并集。同一系列按已确认Kokoro规则采用项目安装完整表示，即使它较旧或停用；不逐字段混合、不按latest排序、不自动升级。个人独有项仍保留，返回前重新核项目访问权。任一路失败不回半份成功；分页由既有owner完整读取，合并后仍受项数和总预算限制。

## 读取不是执行授权

列表包含停用项，但读取不启用、不修改安装，不赋予项目执行资格。展示ID是稳定series；精确安装、项目默认和消息冻结仍使用各自正式引用。修改／发布／撤回、导入、包读取分别使用参考页中相应operation，不把分享或目录可见性当运行授权。

成功包是 `{ok, request_id, data}`，不是旧的统一data/meta包装；错误走该接口的 `{ok, request_id, error}`。`owner_type`只投影正式归属与获取事实，字段presence／类型及Unix秒时间以生成schema为准，不推造device或app来源。

## 当前完成边界

本人历史使用[版本列表](/reference/v1/generated/skills#list-personal-skill-versions)按精确版本锚点读取。当前标记来自 publication，而非最大修订；选择旧版本只读原包，不改变安装。恢复通过既有创建新版本、原ZIP上传扫描校验及发布流程生成新UID，旧历史与安装保持；发布使用确认时冻结的 publication 与 draft 状态前置条件。它不是管理员解除隔离，也没有新增“恢复服务”。个人系列永久删除仍未实现，不用撤回或后台删除草稿替代。

Product人类准入已有实现，外部API Key／Open App／trusted client映射仍待正式接线。源码、正常加载、真实页面验收分别记录；示例fixture或文档生成通过不等于Agent执行已验，也不触发模型、工具或积分扣减。
