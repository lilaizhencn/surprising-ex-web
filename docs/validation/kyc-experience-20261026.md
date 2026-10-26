# 身份认证体验验收 · 2026-10-26

本轮覆盖用户端认证申请、材料上传/删除、审核状态与外部认证窗口生命周期。沿用现有后端接口，不修改真实审核或资金规则。

- 进度条、状态图标、表单标题和结果操作复用现有主题；覆盖亮色、暗色与 1440×1000、390×844、320×844。
- 状态读取失败与认证要求读取失败分别提示、重试；服务商元数据故障不阻断已通过的认证结果。
- 审核中定时读取按请求完成后再调度，隐藏页面跳过读取，切页/卸载取消请求；支持主动查询。
- 明确区分未认证、审核中、已通过、拒绝、过期。已通过但有效期已过时显示过期和帮助中心，不提供后端禁止的重复申请。
- 上传格式/大小校验、必需材料数量、上传忙态和即时提交锁；文件、材料 ID 与所属用户均校验，材料 ID 全程保留十进制字符串。
- 浏览器实际选择国家/类型/级别、操作日期日历、上传/删除合成文件并提交一次申请；错误材料所属用户不会加入申请。
- 外部 SDK 使用独立生命周期，关闭、刷新和离开认证状态时销毁实例；脚本加载可取消。浏览器使用显式合成 SDK 验证打开/关闭/重开。

复现：

```sh
npm run lint -- --diagnostic-level=error
npm run typecheck
npm test
npm run build
npm run dev -- --host 127.0.0.1 --port 5183
QA_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs QA_CHROMIUM=/path/to/chromium QA_OUTPUT=/path/to/evidence node scripts/kyc-experience-qa.mjs
```

自动化结果、截图名、60 秒观察与命令结果见 [机器记录](kyc-experience-20261026.json)。仅在本机隔离 HTTP/会话/SDK 下验证，合成文件不含个人信息；没有访问真实 KYC 服务或提交真实资料。

未测范围：真实服务商相机授权、人脸认证、真实 PDF 查看器、真实身份审核、后台通知和实际过期档案续期。后端当前禁止 VERIFIED 再提交，前端仅指向现有帮助中心。60 秒观察不代表长时间负载或生产性能结论。全站 UI/功能目标仍在继续验收。

SDK 初始化参考 [Sumsub 官方说明](https://docs.sumsub.com/docs/get-started-with-web-sdk)；销毁方法核对官方发布的 [@sumsub/websdk 2.9.1](https://www.npmjs.com/package/@sumsub/websdk/v/2.9.1) 的类型定义，未新增依赖。
