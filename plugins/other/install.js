import { Restart } from "./restart.js"

const GitHubMirror = "https://ghfast.top/";

let insing = false
const list = {
  // "Atlas":"https://gitee.com/Nwflower/atlas",
  "genshin": "https://gitee.com/Misaka21011/Yunzai-genshin",
  // "DF-Plugin":"https://gitee.com/DenFengLai/DF-Plugin",
  // "ws-plugin":"https://gitee.com/xiaoye12123/ws-plugin",
  "TRSS-Plugin": "https://Yunzai.TRSS.me",
  "miao-plugin": "https://gitcode.com/TimeRainStarSky/miao-plugin.git",
  "Philia-Plugin": "https://gitee.com/TRSSo/Yunzai-Philia-Plugin",
  "Guoba-Plugin": "https://gitee.com/guoba-yunzai/guoba-plugin",
  "yenai-plugin": GitHubMirror + "https://github.com/misaka20002/yenai-plugin.git",
  // "flower-plugin" :"https://gitee.com/Nwflower/flower-plugin",
  // "xianyu-plugin" :"https://gitee.com/suancaixianyu/xianyu-plugin",
  // "earth-k-plugin":"https://gitee.com/SmallK111407/earth-k-plugin",
  // "useless-plugin":"https://gitee.com/SmallK111407/useless-plugin",
  // "StarRail-plugin"   :"https://gitee.com/hewang1an/StarRail-plugin",
  "xiaoyao-cvs-plugin": GitHubMirror + "https://github.com/misaka20002/xiaoyao-cvs-plugin.git",
  // "trss-xianxin-plugin"   :"https://gitee.com/snowtafir/xianxin-plugin",
  "Telegram-Plugin": "https://gitee.com/TimeRainStarSky/Yunzai-Telegram-Plugin",
  "Discord-Plugin": "https://gitee.com/TimeRainStarSky/Yunzai-Discord-Plugin",
  "WeChat-Plugin": "https://gitee.com/TimeRainStarSky/Yunzai-WeChat-Plugin",
  "QQBot-Plugin": "https://gitee.com/TimeRainStarSky/Yunzai-QQBot-Plugin",
  "Route-Plugin": "https://gitee.com/TimeRainStarSky/Yunzai-Route-Plugin",
  "ICQQ-Plugin": "https://gitee.com/TimeRainStarSky/Yunzai-ICQQ-Plugin",
  "KOOK-Plugin": "https://gitee.com/TimeRainStarSky/Yunzai-KOOK-Plugin",
  "chatgpt-plugin": GitHubMirror + "https://github.com/misaka20002/chatgpt-plugin.git",
  "ap-plugin": GitHubMirror + "https://github.com/misaka20002/ap-plugin.git",
  "xiaofei-plugin": GitHubMirror + "https://github.com/misaka20002/xiaofei-plugin.git",
  "siliconflow-plugin": GitHubMirror + "https://github.com/AIGC-Yunzai/siliconflow-plugin.git",
}
const map = {}
for (const i in list) map[i.replace(/-[Pp]lugin$/, "")] = i

export class install extends plugin {
  constructor() {
    super({
      name: "安装插件",
      dsc: "#安装插件 #卸载插件 #安装TRSS-Plugin",
      event: "message",
      priority: -Infinity,
      rule: [
        {
          reg: `^#安装(插件|${Object.keys(map).join("|")})(-[Pp]lugin)?$`,
          fnc: "install",
          permission: "master",
        },
        {
          reg: "^#卸载(.+?)(-[Pp]lugin)?$",
          fnc: "uninstall",
          permission: "master",
        },
      ],
    })
  }

  async install() {
    if (insing) {
      await this.reply("正在安装，请稍候再试")
      return false
    }

    let name = this.e.msg.replace(/^#安装(.+?)(-[Pp]lugin)?$/, "$1")
    if (map[name]) name = map[name]

    if (name == "插件") {
      let msg = "\n"
      for (const i in list) if (!(await Bot.fsStat(`plugins/${i}`))) msg += `${i}\n`

      if (msg == "\n") msg = "暂无可安装插件\n发送 #卸载插件 查看可卸载的插件"
      else msg = `可安装插件列表：${msg}发送 #安装+插件名 进行安装\n发送 #卸载插件 查看可卸载的插件`

      await this.reply(msg)
      return true
    }

    const path = `plugins/${name}`
    if (await Bot.fsStat(path)) {
      await this.reply(`${name} 插件已安装`)
      return false
    }
    return this.runInstall(name, list[name], path)
  }

  async uninstall() {
    if (insing) {
      await this.reply("正在操作中，请稍候再试")
      return false
    }

    let name = this.e.msg.replace(/^#卸载(.+?)(-[Pp]lugin)?$/, "$1")
    // 如果在预定义列表中有映射，使用映射后的名称，否则直接使用输入的名称
    if (map[name]) name = map[name]

    if (name == "插件") {
      let msg = "\n"
      // 读取 plugins 文件夹下的所有文件夹
      try {
        const fs = await import("node:fs/promises")
        const pluginDirs = await fs.readdir("plugins", { withFileTypes: true })
        const installedPlugins = pluginDirs
          .filter(dirent => dirent.isDirectory() && !["other", "system", "example", "adapter"].includes(dirent.name))
          .map(dirent => dirent.name)

        if (installedPlugins.length === 0) {
          msg = "暂无已安装插件"
        } else {
          for (const plugin of installedPlugins) {
            msg += `${plugin}\n`
          }
          msg = `已安装插件列表：${msg}发送 #卸载+插件名 进行卸载`
        }
      } catch (err) {
        logger.error("读取plugins文件夹错误", err)
        msg = "读取插件列表失败"
      }

      await this.reply(msg)
      return true
    }

    const path = `plugins/${name}`
    if (!(await Bot.fsStat(path))) {
      await this.reply(`${name} 插件未安装`)
      return false
    }
    await this.reply(`请确认是否卸载${name}插件及清空配置文件？回复: #确认/#取消`, true)
    const e_new = await this.awaitContext()
    if (e_new.msg == "#确认")
      return this.runUninstall(name, path)
    else {
      this.reply(`卸载${name}插件 操作已取消`, true)
      return true
    }
  }

  async runInstall(name, url, path) {
    logger.mark(`${this.e.logFnc} 开始安装 ${name} 插件`)
    await this.reply(`开始安装 ${name} 插件`)

    insing = true
    const ret = await Bot.exec(`git clone --depth 1 --single-branch "${url}" "${path}"`)
    if (await Bot.fsStat(`${path}/package.json`)) await Bot.exec("pnpm install")
    insing = false

    if (ret.error) {
      logger.mark(`${this.e.logFnc} ${name} 插件安装错误`)
      this.gitErr(name, ret.error.message, ret.stdout)
      return false
    }
    return this.restart()
  }

  async runUninstall(name, path) {
    logger.mark(`${this.e.logFnc} 开始卸载 ${name} 插件`)
    await this.reply(`开始卸载 ${name} 插件`)

    insing = true

    const success = await Bot.rm(path)
    insing = false

    if (!success) {
      logger.mark(`${this.e.logFnc} ${name} 插件卸载错误`)
      await this.reply(`${name} 插件卸载失败，请检查插件是否正在使用中`)
      return false
    }

    logger.mark(`${this.e.logFnc} ${name} 插件卸载完成`)
    await this.reply(`${name} 插件卸载完成`)
    return this.restart()
  }

  gitErrUrl(error) {
    return error
      .replace(/(Cloning into|正克隆到)\s*'.+?'/g, "")
      .match(/'(.+?)'/g)[0]
      .replace(/'(.+?)'/, "$1")
  }

  async gitErr(name, error, stdout) {
    if (/unable to access|无法访问/.test(error))
      await this.reply(`远程仓库连接错误：${this.gitErrUrl(error)}`)
    else if (
      /not found|未找到|does not (exist|appear)|不存在|Authentication failed|鉴权失败/.test(error)
    )
      await this.reply(`远程仓库地址错误：${this.gitErrUrl(error)}`)
    else await this.reply(`${name} 插件安装错误\n${error}\n${stdout}`)
  }

  restart() {
    return new Restart(this.e).restart()
  }
}
