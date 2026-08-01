/**
 * #小程序://奇妙积木/125/page-frame.html
 *
 * 脚本说明：奇妙积木小程序 每日签到
 * 运行环境：青龙面板 (需要配合 wcs.js 网关获取 code)
 * 
 * 环境变量配置：
 * export QIMIAO_WXID='wxid_1&wxid_2'         # 填入你的微信标识，支持&、换行或逗号分隔
 * export WX_SERVER_URL='http://127.0.0.1:8110' # 你的微信授权网关
 * export WX_AUTH='你的auth鉴权值'            # 你的网关鉴权 auth 值
 *
 * cron: 15 9 * * *
 */
const { Env } = require("../tools/env.js");
const $ = new Env("奇妙积木签到");
const axios = require("axios");
const WeChatCodeServer = require('./wcs.js');

const APPID = "wx0eba2ee197088c3f";
const BASE_URL = "https://smp-api.iyouke.com";
const WX_SERVER_URL = process.env.WX_SERVER_URL || process.env.wx_server_url || "";
const WX_AUTH = process.env.WX_AUTH || process.env.wx_auth || ""; 
const rawList = process.env.QIMIAO_WXID || "";
const accountList = rawList.split(/[\n&,]/).map(i => i.trim()).filter(Boolean);

let message = '';
const USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.75(0x18004b47) NetType/WIFI Language/zh_CN";

// 基础请求头
let baseHeaders = {
    'User-Agent': USER_AGENT,
    'content-type': 'application/json',
    'appId': APPID,
    'envVersion': 'release',
    'version': '2.36.21',
    'xy-extra-data': `appid=${APPID};version=2.36.21;envVersion=release;senceId=1271`,
    'Accept-Encoding': 'gzip,compress,br,deflate',
    'Referer': `https://servicewechat.com/${APPID}/125/page-frame.html`,
};

!(async () => {
    if (!WX_SERVER_URL) {
        $.log("❌ 未配置 WX_SERVER_URL 网关地址，请检查环境变量");
        return;
    }
    if (accountList.length === 0) {
        $.log("❌ 未找到有效账号配置，请配置 QIMIAO_WXID 环境变量");
        return;
    }

    $.log(`\n📱 共加载 ${accountList.length} 个奇妙积木账户 (WXID 模式)`);

    for (let i = 0; i < accountList.length; i++) {
        const wxid = accountList[i];
        const index = i + 1;
        $.log(`\n*****第[${index}]个账号 (WXID: ${mask(wxid)})*****`);
        
        // 1. 请求网关获取 code
        const code = await getCode(wxid);
        if (!code) {
            $.log(`❌ 账号[${index}] 获取 code 失败，跳过执行`);
            continue;
        }
        $.log(`✅ 成功获取 code: ${code}`);

        // 2. 用 code 换取 Token
        const tokenData = await getToken(code);
        if (!tokenData || !tokenData.access_token) {
            $.log(`❌ 账号[${index}] 登录失败，跳过执行`);
            continue;
        }
        $.log(`✅ 登录成功，获取到 Token`);

        // 3. 开始签到任务
        message += `📣====${$.name}账号[${index}]====📣\n`;
        await doSign(tokenData);
        
        await $.wait(2000); 
    }
    
    if (message) {
        $.log(`\n========== 最终运行结果 ==========\n${message}`);
    }
})().catch((e) => $.log(`运行异常: ${e.message}`)).finally(() => $.done());

// 辅助掩码函数
function mask(value) {
    value = String(value || "");
    if (value.length <= 12) return value;
    return `${value.slice(0, 6)}***${value.slice(-6)}`;
}

// 动态获取当天的日期字符串 (格式: YYYY/MM/DD)
function getTodayDateStr() {
    const now = new Date();
    // 强制转换为北京时间（东八区）避免服务器时区差导致签到日期错乱
    const beijingTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (8 * 3600000));
    const year = beijingTime.getFullYear();
    const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
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

// 获取奇妙积木 Token
async function getToken(code) {
    try {
        const url = `${BASE_URL}/dtapi/appLogin`;
        const payload = {
            "appType": 1,
            "principal": code
        };

        const res = await axios.post(url, payload, {
            headers: baseHeaders,
            timeout: 15000
        });
        
        if (res.data && res.data.access_token) {
            return res.data;
        }
        $.log(`登录接口返回异常: ${JSON.stringify(res.data)}`);
    } catch (e) {
        $.log(`登录时发生异常 -> ${e.message}`);
    }
    return null;
}

// ================= 任务逻辑区 =================

async function doSign(tokenData) {
    try {
        $.log(`开始【每日签到】任务`);
        
        const { access_token, token_type } = tokenData;
        const authPrefix = token_type || "bearer";
        const signHeaders = {
            ...baseHeaders,
            'Authorization': `${authPrefix}${access_token}`
        };

        // 拼接新的签到接口，并动态带上 date 参数
        const url = `${BASE_URL}/dtapi/pointsSign/user/sign`;
        const todayStr = getTodayDateStr();

        const res = await axios.get(url, {
            headers: signHeaders,
            params: {
                date: todayStr
            },
            timeout: 15000
        });
        
        const data = res.data || {};
        
        // 解析真实的签到返回体
        if (data.success === true && data.error === 0) {
            const reward = data.data?.signReward || 0;
            const seriesDay = data.data?.seriesDay || 0;
            const extraReward = data.data?.extraSignReward || 0;
            
            let logMsg = `签到成功 -> 获得 ${reward} K币，当前连签 ${seriesDay} 天`;
            if (extraReward > 0) {
                logMsg += `，额外连签奖励 ${extraReward} K币！`;
            }
            
            $.log(logMsg);
            message += `${logMsg}\n`;
            
        } else {
            // 处理异常或重复签到
            const msg = data.msg || data.message || JSON.stringify(data);
            if (/已签|重复|already/i.test(String(msg))) {
                $.log(`签到状态 -> 今日已签到过`);
            } else {
                $.log(`签到结果 -> 失败：${msg}`);
            }
        }
    } catch (e) {
        $.log(`签到时发生异常 -> ${e.message}`);
        if (e.response && e.response.data) {
             $.log(`接口返回错误: ${JSON.stringify(e.response.data)}`);
        }
    }
}