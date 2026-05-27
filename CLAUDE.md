# 项目名称

多人协作旅行 AA 记账 PWA

---

# 项目目标

这是一个供朋友/私人使用的多人旅行记账工具。

核心目标：

- 支持 iPhone / Android 浏览器
- 支持 PWA 安装到手机桌面
- 不发布 App Store / Google Play
- 支持多人协作
- 支持多币种旅行记账
- 支持 AA 分账
- 支持旅行结束统一结算
- 支持即时结算
- 支持个人消费统计
- 支持消费可见性控制
- 移动端优先
- 类似 Splitwise + 旅行记账

项目强调：

- 简单
- 稳定
- 易维护
- AI 辅助开发友好
- 避免过度工程化

---

# 技术栈

## 前端

- Next.js App Router
- React
- TypeScript
- Tailwind CSS

## 状态管理

- Zustand

## 表单

- React Hook Form
- Zod

## 后端

- Supabase

## 数据库

- PostgreSQL

## 部署

- Vercel

---

# 禁止事项

不要使用：

- Redux
- Flutter
- React Native
- 微服务
- Docker（除非必要）
- CQRS
- Event Sourcing
- 复杂 DDD 架构
- 复杂状态机

项目应保持轻量。

---

# 用户系统

## 登录方式

不要使用：

- Google 登录
- Apple 登录
- 邮箱验证

用户仅需要：

- nickname（昵称）
- password（密码）

实现方式：

- 使用 Supabase Auth
- 前端自动生成 fake email
- 格式：
  nickname@app.local

例如：

alice
→
alice@app.local

nickname 必须唯一。

---

# 核心业务模型

系统包含两种消费类型：

## 1. personal（个人消费）

特点：

- 仅属于个人
- 不参与 AA
- 不产生债务
- 用于个人消费统计

例如：

- 自己购物
- 自己买饮料

---

## 2. shared（共享消费）

特点：

- 存在付款人 payer
- 存在多个参与分摊成员
- 会产生债务
- 支持 AA

例如：

- 聚餐
- 打车
- 酒店
- 门票

---

# 消费可见性

所有消费必须支持 visibility。

## 1. private

仅创建者本人可见。

旅行其他成员不可见。

适用于：

- 私人购物
- 私人消费

---

## 2. trip_visible

旅行成员可见。

适用于：

- 想共享展示的个人消费
- shared AA 消费

---

# 可见性规则

## shared

必须为：

- trip_visible

## personal

允许：

- private
- trip_visible

---

# 多币种规则

必须支持：

- CNY
- JPY
- USD
- EUR

并允许未来扩展任意币种。

每条消费必须存储：

- 原始金额 amount
- 原始币种 currency
- 当时汇率 exchange_rate
- 转换后的基准货币金额 base_amount

重要原则：

历史汇率绝不能动态变化。

必须保存“录入时汇率快照”。

---

# 汇率规则

系统需要支持：

- 获取当日汇率
- 保存消费创建时的汇率快照

推荐：

- 使用公开汇率 API
- 避免复杂金融系统设计

---

# 分账规则

shared 消费必须支持：

## 平均分摊

equal split

## 自定义金额分摊

custom split

未来允许扩展：

- 百分比分摊

---

# 结算模式

shared 消费支持：

## immediate

当日即时结算。

## end_of_trip

旅行结束统一结算。

---

# 债务计算原则

不要直接存储“谁欠谁”。

债务必须动态计算：

用户净余额 =
用户实际垫付金额
-
用户应承担金额

最终生成：

- 最简转账路径
- 类似 Splitwise 的 debt simplification

---

# 数据库设计原则

系统核心表：

## profiles

用户信息。

## trips

旅行信息。

## trip_members

旅行成员关系。

## expenses

所有消费记录。

包含：

- personal
- shared

两种类型。

同时包含：

- visibility
- 多币种信息
- 汇率快照

---

## expense_participants

shared 消费参与人。

支持：

- 平均分摊
- 自定义金额分摊

---

## settlements

实际已完成结算记录。

注意：

settlement 是“已经转账”的记录。

不是“理论债务”。

---

# 权限原则（RLS）

## trip_visible

旅行成员可见。

## private

仅创建者本人可见。

---

# 统计需求

旅行结束后：

用户需要查看：

## 个人总支出

包括：

- personal 消费
- shared 实际承担金额

---

## 分类统计

例如：

- 餐饮
- 交通
- 购物

---

## AA 统计

例如：

- 实际垫付金额
- 实际承担金额
- 净结算金额
- 欠款关系

---

# UI/UX 原则

- 移动端优先
- 类似 iOS 原生 App
- 极简设计
- 底部 Tab 导航
- 大按钮
- 单手操作友好
- 表单输入体验优先
- 页面避免复杂后台风格

---

# 开发原则

- 优先 MVP
- 优先可维护性
- 避免过度抽象
- 优先生成完整可运行代码
- 不要生成伪代码
- 组件小而可复用
- TypeScript 强类型
- 函数式 React 组件优先

---

# 开发阶段

## 第一阶段（MVP）

1. 登录
2. 创建旅行
3. 旅行成员
4. 添加消费
5. AA 分账
6. 结算页面

---

## 第二阶段

7. 实时同步
8. 汇率 API
9. 图表统计
10. 图片上传

---

## 第三阶段

11. OCR 小票识别
12. AI 分类
13. 离线缓存

---

# AI 代码生成要求

生成代码时：

- 优先完整实现
- 不要只给思路
- 保持目录结构清晰
- 保持组件职责单一
- 尽量减少依赖
- 保持代码易读
- 保持适合长期 AI 协作维护
