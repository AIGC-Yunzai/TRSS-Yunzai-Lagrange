import moment from "moment"
import puppeteer from "../../lib/puppeteer/puppeteer.js"

const _path = process.cwd()

export class speakRank extends plugin {
  constructor() {
    super({
      name: "发言榜",
      dsc: "#发言榜(num天)?",
      event: "message",
      rule: [
        {
          reg: "^#发言(排行)?榜",
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
      const img = await this.generateRankImage(rankData, rankCount, totalMessages, groupId, days, this.e.user_id, groupName)
      if (!img) return false
      return this.reply(img)
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

  async generateRankImage(rankData, rankCount, totalMessages, groupId, days, currentUserId, groupName) {
    const topUsers = rankData.slice(0, rankCount)
    const dateStr = moment().format("YYYY-MM-DD HH:mm")

    // 构建排名项 HTML
    let rankItems = ""
    for (let i = 0; i < topUsers.length; i++) {
      const user = topUsers[i]
      const percentage = ((user.total / totalMessages) * 100).toFixed(1)

      let rankHtml = `<div class="rank-num" data-rank="#${i + 1}"></div>`
      let itemClass = "item"
      let barColor = "#9f7aea"

      if (user.userId == currentUserId) {
        itemClass += " highlight"
      }

      if (i === 0) {
        rankHtml = `<div class="rank rank-1">🥇</div>`
        itemClass += " top-3 top-1"
        barColor = "linear-gradient(90deg, #ecc94b 0%, #f6e05e 100%)"
      } else if (i === 1) {
        rankHtml = `<div class="rank rank-2">🥈</div>`
        itemClass += " top-3"
        barColor = "linear-gradient(90deg, #a0aec0 0%, #cbd5e0 100%)"
      } else if (i === 2) {
        rankHtml = `<div class="rank rank-3">🥉</div>`
        itemClass += " top-3"
        barColor = "linear-gradient(90deg, #ed8936 0%, #f6ad55 100%)"
      }

      rankItems += `
        <div class="${itemClass}">
          ${rankHtml}
          <img class="avatar" src="https://q1.qlogo.cn/g?b=qq&nk=${user.userId}&s=640" />
          <div class="info">
            <div class="name-row">
              <div class="nickname">${user.nickname}</div>
              <div class="percent-tag">${percentage}%</div>
            </div>
            <div class="progress-bg">
              <div class="progress-bar" style="width: ${percentage}%; background: ${barColor}"></div>
            </div>
          </div>
          <div class="count-col">
            <span class="count-val">${user.total}</span>
            <span class="count-lbl">条</span>
          </div>
        </div>`
    }

    const data = {
      _path,
      tplFile: "./plugins/other/resources/speakRank.html",
      rankCount,
      days,
      dateStr,
      rankItems,
      totalMessages,
      totalUsers: rankData.length,
      groupName
    }

    const img = await puppeteer.screenshot("speakRank", data)

    if (!img) {
      logger.error("[发言榜]图片生成失败")
      return false
    }

    return img
  }
}
