import moment from "moment"
import puppeteer from "puppeteer"

export class speakRank extends plugin {
  constructor() {
    super({
      name: "发言榜",
      dsc: "#发言榜(num天)?",
      event: "message",
      rule: [
        {
          reg: "^#发言榜",
          fnc: "speakRank",
        },
      ],
    })
  }

  /** "^#发言榜" */
  async speakRank() {
    // 默认配置
    /** 发送图片还是合并转发 */
    const sendAsImage = true
    /** 统计天数 */
    let days = 7
    /** 排名人数 */
    let rankCount = 20

    // 获取群消息统计数据
    const groupId = this.e.group_id
    if (!groupId) {
      return this.reply("[发言榜]请在群聊中使用此功能")
    }

    // 解析天数参数，默认7天
    const matchDays = this.e.msg.match(/(\d+)天/)
    if (matchDays && matchDays[1]) {
      days = parseInt(matchDays[1])
      if (days <= 0 || days > 365) {
        return this.reply("[发言榜]天数范围应在 1-365 之间")
      }
    }

    // 解析人数参数，默认20人
    const matchCount = this.e.msg.match(/(\d+)人/)
    if (matchCount && matchCount[1]) {
      rankCount = parseInt(matchCount[1])
      if (rankCount <= 0 || rankCount > 100) {
        return this.reply("[发言榜]人数范围应在 1-100 之间")
      }
    }

    // 获取最近N天的日期
    const dates = []
    const d = moment()
    for (let i = 0; i < days; i++) {
      dates.push(d.format("YYYY:MM:DD"))
      d.add(-1, "days")
    }

    // 收集用户发言数据
    const userData = {}

    // 获取群内所有成员列表
    let memberList = []
    if (this.e.group) {
      try {
        memberList = await this.e.group.getMemberList()
      } catch (e) {
        logger.warn("[发言榜]获取群成员列表失败", e)
        return this.reply("[发言榜]获取群成员列表失败，请稍后再试")
      }
    }

    if (memberList.length === 0) {
      return this.reply("[发言榜]无法获取群成员列表")
    }

    // 获取每个群成员在指定日期的发言记录
    for (const userId of memberList) {
      for (const date of dates) {
        // 使用群+用户的组合键，获取该用户在当前群的发言数
        const key = `Yz:count:receive:msg:group:${groupId}:user:${userId}:${date}`
        const count = parseInt(await redis.get(key)) || 0

        if (count > 0) {
          if (!userData[userId]) {
            userData[userId] = { userId, total: 0, nickname: "" }
          }
          userData[userId].total += count
        }
      }
    }

    // 统计 Bot 自己的发言（Bot 发送的消息）
    const botId = this.e.self_id
    if (botId) {
      for (const date of dates) {
        const sendKey = `Yz:count:send:msg:group:${groupId}:user:${botId}:${date}`
        const sendCount = parseInt(await redis.get(sendKey)) || 0

        if (sendCount > 0) {
          if (!userData[botId]) {
            userData[botId] = { userId: botId, total: 0, nickname: "" }
          }
          userData[botId].total += sendCount
        }
      }
    }

    // 转换为数组并排序
    let rankData = Object.values(userData)
    if (rankData.length === 0) {
      return this.reply("[发言榜]暂无发言数据")
    }

    rankData.sort((a, b) => b.total - a.total)

    // 获取昵称信息
    if (this.e.group) {
      for (const user of rankData) {
        try {
          // 如果是 Bot 自己，使用特殊标识
          if (user.userId == this.e.self_id) {
            user.nickname = `${Bot[this.e.self_id]?.nickname || "Bot"} [Bot]`
          } else {
            const memberInfo = await this.e.group.pickMember(user.userId).getInfo()
            user.nickname = memberInfo?.card || memberInfo?.nickname || user.userId
          }
        } catch (e) {
          user.nickname = user.userId
        }
      }
    }

    const totalMessages = rankData.reduce((sum, user) => sum + user.total, 0)

    if (sendAsImage) {
      // 生成图片
      const imgPath = await this.generateRankImage(rankData, rankCount, totalMessages, groupId, days)
      return this.reply(segment.image(imgPath))
    } else {
      // 发送文本
      const topUsers = rankData.slice(0, rankCount)
      let msg = [`群 ${groupId} 发言榜（近${days}天）\n发言总数: ${totalMessages}\n━━━━━━━━━━━━━━\n`]

      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i]
        const percentage = ((user.total / totalMessages) * 100).toFixed(2)
        msg.push(`第${i + 1}名：${user.nickname}·${user.total}次（${percentage}%）\n`)
      }

      return this.reply(msg.join(""))
    }
  }

  async generateRankImage(rankData, rankCount, totalMessages, groupId, days) {
    const topUsers = rankData.slice(0, rankCount)

    // 获取群名
    let groupName = groupId
    if (this.e.group) {
      try {
        const info = await this.e.group.getInfo()
        groupName = info.group_name || groupId
      } catch (e) {
        logger.warn("[发言榜]获取群信息失败", e)
      }
    }

    // 构建HTML
    let htmlTemplate = `
<html>
  <head>
    <style>
      * { 
        margin: 0; 
        padding: 0; 
        box-sizing: border-box; 
      }
      body {
        background: linear-gradient(135deg, #fafafa 0%, #f5f5f7 100%);
        padding: 48px 40px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      .container {
        max-width: 900px;
        margin: 0 auto;
      }
      .title-section {
        text-align: center;
        margin-bottom: 48px;
      }
      .main-title {
        font-size: 56px;
        font-weight: 700;
        background: linear-gradient(135deg, #1d1d1f 0%, #494949 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        letter-spacing: -1.5px;
        margin-bottom: 12px;
        line-height: 1.1;
      }
      .subtitle {
        font-size: 21px;
        color: #1d1d1f;
        font-weight: 600;
        margin-bottom: 8px;
        letter-spacing: -0.3px;
      }
      .group-id {
        font-size: 15px;
        color: #86868b;
        font-weight: 400;
      }
      .stats-bar {
        background: linear-gradient(135deg, #ffffff 0%, #fafafa 100%);
        border-radius: 20px;
        padding: 24px 32px;
        margin-bottom: 20px;
        display: flex;
        justify-content: space-around;
        align-items: center;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
        border: 0.5px solid rgba(0, 0, 0, 0.04);
      }
      .stats-item {
        text-align: center;
        flex: 1;
      }
      .stats-label {
        font-size: 13px;
        color: #86868b;
        font-weight: 500;
        margin-bottom: 6px;
        letter-spacing: 0.3px;
        text-transform: uppercase;
      }
      .stats-value {
        font-size: 32px;
        font-weight: 700;
        background: linear-gradient(135deg, #007aff 0%, #0051d5 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        letter-spacing: -0.5px;
      }
      .user-list {
        background: linear-gradient(135deg, #ffffff 0%, #fafafa 100%);
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
        border: 0.5px solid rgba(0, 0, 0, 0.04);
      }
      .user-item {
        display: flex;
        align-items: center;
        padding: 18px 24px;
        border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
        background: transparent;
      }
      .user-item:last-child {
        border-bottom: none;
      }
      .user-item-highlight {
        display: flex;
        align-items: center;
        padding: 18px 24px;
        border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
        background: linear-gradient(90deg, rgba(0, 122, 255, 0.08) 0%, rgba(0, 122, 255, 0.02) 100%);
        position: relative;
      }
      .user-item-highlight::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: linear-gradient(180deg, #007aff 0%, #0051d5 100%);
      }
      .user-item-highlight:last-child {
        border-bottom: none;
      }
      .rank {
        width: 48px;
        font-size: 22px;
        font-weight: 700;
        color: #86868b;
        text-align: center;
        flex-shrink: 0;
      }
      .rank-top {
        background: linear-gradient(135deg, #007aff 0%, #0051d5 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-size: 24px;
      }
      .avatar {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        margin: 0 18px;
        flex-shrink: 0;
        background: linear-gradient(135deg, #f5f5f7 0%, #e8e8ed 100%);
        border: 2px solid rgba(255, 255, 255, 0.8);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      }
      .info {
        flex: 1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        min-width: 0;
      }
      .name-section {
        flex: 1;
        min-width: 0;
        padding-right: 20px;
      }
      .nickname {
        font-size: 18px;
        color: #1d1d1f;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: -0.2px;
      }
      .stats {
        text-align: right;
        flex-shrink: 0;
      }
      .count {
        font-size: 22px;
        color: #1d1d1f;
        font-weight: 700;
        margin-bottom: 2px;
        letter-spacing: -0.3px;
      }
      .percentage {
        font-size: 13px;
        color: #86868b;
        font-weight: 500;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="title-section">
        <div class="main-title">发言榜</div>
        <div class="subtitle">${groupName}</div>
        <div class="group-id">群号 ${groupId}</div>
      </div>
      <div class="stats-bar">
        <div class="stats-item">
          <div class="stats-label">Days</div>
          <div class="stats-value">${days}</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">Messages</div>
          <div class="stats-value">${totalMessages}</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">Users</div>
          <div class="stats-value">${rankData.length}</div>
        </div>
      </div>
      <div class="user-list">`

    for (let i = 0; i < topUsers.length; i++) {
      const user = topUsers[i]
      const percentage = ((user.total / totalMessages) * 100).toFixed(2)
      const isCurrentUser = user.userId == this.e.user_id
      const itemClass = isCurrentUser ? "user-item-highlight" : "user-item"
      const rankClass = i < 3 ? "rank rank-top" : "rank"

      htmlTemplate += `
        <div class="${itemClass}">
          <div class="${rankClass}">${i + 1}</div>
          <img class="avatar" src="https://q1.qlogo.cn/g?b=qq&nk=${user.userId}&s=640" />
          <div class="info">
            <div class="name-section">
              <div class="nickname">${user.nickname}</div>
            </div>
            <div class="stats">
              <div class="count">${user.total}</div>
              <div class="percentage">${percentage}%</div>
            </div>
          </div>
        </div>`
    }

    htmlTemplate += `
      </div>
    </div>
  </body>
</html>`

    // 启动浏览器生成图片
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    const page = await browser.newPage()

    await page.setViewport({ width: 900, height: 1 })
    await page.setContent(htmlTemplate.replace(/[\n\t]/g, ''), {
      waitUntil: 'networkidle0'
    })

    // 等待头像加载
    try {
      logger.info(`[发言榜]正在等待用户头像加载`)
      await page.waitForFunction(() => {
        const avatars = Array.from(document.querySelectorAll('img.avatar'))
        return avatars.every(img => img.complete && img.naturalWidth > 0)
      }, {
        timeout: 5000,
        polling: 200
      })
    } catch (err) {
      logger.warn(`[发言榜]头像加载超时: ${err}`)
    }

    // 动态调整页面高度
    const bodyHeight = await page.evaluate(() => {
      return document.body.scrollHeight
    })
    await page.setViewport({ width: 900, height: bodyHeight })

    // 截图
    const screenshotPath = `./temp/speak_rank_${groupId}_${Date.now()}.png`
    await page.screenshot({
      path: screenshotPath
    })

    await browser.close()
    return screenshotPath
  }
}
