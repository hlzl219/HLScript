/**
 * #小程序://雀巢会员/4EpKApLxlhQhsiu
 *
 * 改造说明：
 * 1. 已彻底剔除原作者的 initScript/sudojia 依赖，改为纯净 axios 及标准 Env 运行[cite: 1, 4]
 * 2. 已修改为 WXID 网关聚合模式 + 修正独立签到问题[cite: 4]
 * 3. 完美适配同目录下的 wcs.js 获取 code[cite: 2, 4]
 * 
 * 环境变量配置：
 * export NESTLE_WXID='wxid_1&wxid_2'         # 填入你的微信标识，支持&、换行或逗号分隔
 * export WX_SERVER_URL='http://127.0.0.1:8110' # 你的微信授权网关
 * export WX_AUTH='你的auth鉴权值'            # 你的网关鉴权 auth 值
 *
 * cron: 28 8 * * *
 */
const { Env } = require("../tools/env.js"); // 换回标准的 Env[cite: 1]
const $ = new Env("雀巢会员");
const axios = require("axios");
const WeChatCodeServer = require('./wcs.js');

const APPID = "wxc5db704249c9bb31";
const WX_SERVER_URL = process.env.WX_SERVER_URL || process.env.wx_server_url || "";
const WX_AUTH = process.env.WX_AUTH || process.env.wx_auth || ""; 
const rawList = process.env.NESTLE_WXID || process.env.NESTLE_TOKEN || "";
const nestleList = rawList.split(/[\n&,]/).map(i => i.trim()).filter(Boolean);

let message = '';
const baseUrl = 'https://crm.nestlechinese.com';
// 替换掉 sudojia 的随机 UA，使用固定的标准微信 UA[cite: 1, 4]
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) MicroMessenger/3.9.12 MiniProgramEnv/Windows WindowsWechat/WMPF";

let headers = {
    'User-Agent': USER_AGENT,
    'content-type': 'application/json',
    'referer': 'https://servicewechat.com/wxc5db704249c9bb31/353/page-frame.html',
};

!(async () => {
    if (!WX_SERVER_URL) {
        $.log("❌ 未配置 WX_SERVER_URL 网关地址，请检查环境变量");
        return;
    }
    if (nestleList.length === 0) {
        $.log("❌ 未找到有效账号配置，请配置 NESTLE_WXID 环境变量");
        return;
    }

    $.log(`\n📱 共加载 ${nestleList.length} 个雀巢账户 (WXID 模式)`);

    for (let i = 0; i < nestleList.length; i++) {
        const wxid = nestleList[i];
        const index = i + 1;
        $.log(`\n*****第[${index}]个账号 (WXID: ${mask(wxid)})*****`);
        
        // 1. 请求网关获取 code (通过 wcs.js)
        const code = await getCode(wxid);
        if (!code) {
            $.log(`❌ 账号[${index}] 获取 code 失败，跳过执行`);
            continue;
        }
        $.log(`✅ 成功获取 code: ${code}`);

        // 2. 用 code 换取雀巢 Token
        const token = await getNestleToken(code);
        if (!token) {
            $.log(`❌ 账号[${index}] 换取雀巢 Token 失败，跳过执行`);
            continue;
        }
        $.log(`✅ 成功换取 Token`);

        // 3. 赋值 Token 并开始任务流程
        headers.authorization = `Bearer ${token}`;
        message += `📣====${$.name}账号[${index}]====📣\n`;
        await main();
        
        // 替换掉 sudojia 的随机等待，使用标准 $.wait[cite: 4]
        await $.wait(2000); 
    }
    
    if (message) {
        // 如果你的环境支持青龙的标准推送，可以在这里拓展。为了纯净，此处仅打印日志
        $.log(`\n========== 最终运行结果 ==========\n${message}`);
    }
})().catch((e) => $.log(`运行异常: ${e.message}`)).finally(() => $.done());

// 辅助掩码函数
function mask(value) {
    value = String(value || "");
    if (value.length <= 12) return value;
    return `${value.slice(0, 6)}***${value.slice(-6)}`;
}

// 替代 sudojia.sendRequest 的通用请求函数
async function requestApi(url, method, data = {}) {
    try {
        const config = {
            method: method,
            url: url,
            headers: headers,
            timeout: 15000
        };
        if (method.toLowerCase() === 'post') {
            config.data = data;
        }
        const res = await axios(config);
        return res.data;
    } catch (e) {
        $.log(`请求 API 发生异常 -> ${e.message}`);
        return {};
    }
}

// ================= 网关与授权核心 =================

async function getCode(wxid) {
    const wcs = new WeChatCodeServer({
        url: WX_SERVER_URL,
        appid: APPID,
        auth: WX_AUTH || wxid
    });

    try {
        const res = await wcs.getCode(wxid);
        
        if (res.data && res.data.status === true && res.data.data && res.data.data.code) {
            return res.data.data.code;
        }
        $.log(`网关返回异常: ${JSON.stringify(res.data)}`);
    } catch (e) {
        $.log(`请求网关超时或失败: ${e.message}`);
    }
    return null;
}

async function getNestleToken(code) {
    try {
        const loginUrl = `${baseUrl}/openapi/identityservice/connect/token`;
        const payload = new URLSearchParams({
            client_id: "wechatMini",
            client_secret: "secret",
            grant_type: "wechat_auth_code",
            auth_code: code,
        }).toString();

        const res = await axios.post(loginUrl, payload, {
            headers: {
                'User-Agent': headers['User-Agent'],
                'content-type': 'application/x-www-form-urlencoded'
            },
            timeout: 15000
        });
        
        if (res.data && res.data.access_token) {
            return res.data.access_token;
        }
        $.log(`登录接口返回异常或无 Token: ${JSON.stringify(res.data)}`);
    } catch (e) {
        $.log(`换取 Token 时发生异常 -> ${e.message}`);
    }
    return null;
}

// ================= 任务逻辑区 =================

async function main() {
    await getUserInfo();
    await $.wait(1500);
    
    // 调用专属独立签到
    await doSign();
    await $.wait(1500);
    
    await getTaskList();
    await $.wait(1500);
    
    await getUserBalance();
}

async function getUserInfo() {
    try {
        const data = await requestApi(`${baseUrl}/openapi/member/api/User/GetUserInfo`, 'get');
        if (200 !== data.errcode) {
            return $.log(`获取用户信息失败：${data.errmsg}`);
        }
        const {nickname, mobile} = data.data;
        $.log(`用户：${nickname}(${mobile})`);
        message += `用户：${nickname}(${mobile})\n`;
    } catch (e) {
        $.log(`获取用户信息时发生异常 -> ${e.message}`);
    }
}

async function doSign() {
    try {
        $.log(`开始【每日独立签到】任务`);
        const data = await requestApi(`${baseUrl}/openapi/activityservice/api/sign2025/sign`, 'post', {
            "rule_id": 1, 
            "goods_rule_id": 1
        });
        
        if (200 !== data.errcode) {
            const msg = data.errmsg || data.msg || JSON.stringify(data);
            if (/已签|重复|already/i.test(String(msg))) {
                $.log(`签到状态 -> 今日已签到过\n`);
            } else {
                $.log(`签到失败 -> ${msg}\n`);
            }
            return;
        }
        
        const signPoints = data.data?.sign_points || data.data?.points || data.data?.point || '未知';
        $.log(`签到成功 -> 获得巢币 ${signPoints}\n`);
        message += `签到成功，获得巢币: ${signPoints}\n`;
    } catch (e) {
        $.log(`签到时发生异常 -> ${e.message}`);
    }
}

async function getTaskList() {
    try {
        const data = await requestApi(`${baseUrl}/openapi/activityservice/api/task/getlist`, 'post');
        if (200 !== data.errcode) {
            return $.log(`获取任务列表失败：${data.errmsg}`);
        }
        for (const task of data.data) {
            $.log(`开始【${task.task_title}】任务`)
            await doTask(task.task_guid);
            await $.wait(2000);
        }
    } catch (e) {
        $.log(`获取任务列表时发生异常 -> ${e.message}`);
    }
}

async function doTask(task_guid) {
    try {
        const data = await requestApi(`${baseUrl}/openapi/activityservice/api/task/add`, 'post', {
            "task_guid": task_guid
        });
        if (200 !== data.errcode) {
            return $.log(`任务失败 -> ${data.errmsg}`);
        }
        $.log(`完成任务 -> ${data.errmsg}`);
    } catch (e) {
        $.log(`完成任务时发生异常 -> ${e.message}`);
    }
}

async function getUserBalance() {
    try {
        const data = await requestApi(`${baseUrl}/openapi/pointsservice/api/Points/getuserbalance`, 'post');
        if (200 !== data.errcode) {
            return $.log(`获取用户积分余额失败：${data.errmsg}`);
        }
        $.log(`当前巢币：${data.data}`);
        message += `当前巢币：${data.data}\n\n`;
    } catch (e) {
        $.log(`获取用户巢币时发生异常 -> ${e.message}`);
    }
}