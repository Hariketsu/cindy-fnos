# #11075 维护者确认门评论草稿（#11048 变基遇到 25b 约束）

> 目标位置：https://github.com/makecindy/cindy/issues/11075
> 状态：草稿，待用户审阅确认后发送。

---

补充一条在把 #11048 变基到最新 `main` 时遇到的架构边界问题，想请维护者一并确认方向（注意到今天 #12678 刚将 Host 路线调整为阶段 1 优先推进无图形 Linux 独立部署）：

### 遇到的问题

`main` 在 #11629（release table 25b）中新增了 Skill 投影账号边界（`apps/host/src/agent/skill-projection-owner.ts`）：
- 常驻 `serve` 启动时必须调用 `refuseSkillProjectionOwnerCommit()`（且有 guard test 守卫），不允许 `serve` 提交 Skill 投影 owner；
- 独立 Host 的 Skill 投影 owner 只能由 `cindy-host login` CLI 进程调用 `commitLoginSessionAndOwner()` 提交。

#11048 的网页首次登录运行在 `serve` 进程内。如果直接变基并跳过 owner 提交，全新 profile 网页登录成功后 Skill 投影边界不会进入 `stable(owner)`；如果改写 `serve` 的拒绝守卫，又直接触及 25b 的审查决议和 guard test。

### 想请维护者确认的方向

1. **方案 A**：在无桌面共存的独立 Host 显式网页登录路径下，允许 `serve` 调用 `commitLoginSessionAndOwner` 提交 owner，并相应收窄 guard test 的适用条件；
2. **方案 B**：保持 `serve` 永不提交的约束，网页登录完成换 token 后，由 `serve` 派生短生命周期子进程执行 session 保存与 Skill 投影 owner 提交，成功后再在 `serve` 内装配运行时；
3. **方案 C**：按 #12678 的新路线，阶段 1 暂只使用 `cindy-host login` CLI 完成首次登录，网页首次登录（#11048）延后至阶段 3 再推进。

确认方向后我会按结论完成 #11048 的变基与回归验证，不擅自改动现有守卫规则。
