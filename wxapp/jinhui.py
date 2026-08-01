# -*- coding: utf-8 -*-
"""
小程序://金辉/78/page-frame.html
脚本说明：金辉小程序 每日签到 (Python版)
运行环境：青龙面板或本地 Python 环境

环境变量配置：
export JINHUI_WXID='wxid_1&wxid_2'           # 填入你的微信标识，支持&、换行或逗号分隔
export WX_SERVER_URL='http://127.0.0.1:8110'   # 你的微信授权网关
export WX_AUTH='你的auth鉴权值'              # 你的网关鉴权 auth 值 (如果不填则默认使用 wxid 作为 auth)

cron: 30 8 * * *
"""

import os
import re
import time
import requests

APPID = "wxe2932fc606c1272d"
BASE_URL = "https://ucodeprod-openapi.jinhuijiu.com.cn"
USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.75(0x18004b47) NetType/WIFI Language/zh_CN"

# 基础请求头
BASE_HEADERS = {
    'User-Agent': USER_AGENT,
    'content-type': 'application/json',
    'version': '1.0.106',
    'appId': APPID,
    'Accept-Encoding': 'gzip,compress,br,deflate',
    'Referer': f'https://servicewechat.com/{APPID}/78/page-frame.html',
}

def mask_wxid(wxid):
    """辅助函数：掩码显示 wxid"""
    wxid_str = str(wxid)
    if len(wxid_str) <= 12:
        return wxid_str
    return f"{wxid_str[:6]}***{wxid_str[-6:]}"

def get_code(wxid, server_url, auth):
    """请求网关获取微信 Code (替代原 wcs.js 的功能)"""
    url = f"{server_url.rstrip('/')}/mywc"
    headers = {'auth': auth if auth else wxid}
    params = {'wxid': wxid, 'appId': APPID}
    
    try:
        res = requests.get(url, params=params, headers=headers, timeout=20)
        data = res.json()
        # 兼容 wcs.js 的嵌套返回格式
        if data.get("status") == "ok" and data.get("code"):
            return data.get("code")
        elif data.get("status") is True and data.get("data", {}).get("code"):
            return data["data"]["code"]
            
        print(f"网关返回异常: {data}")
    except requests.RequestException as e:
        print(f"请求网关超时或失败: {e}")
    return None

def get_jinhui_token(code):
    """用 code 换取金辉 Token"""
    url = f"{BASE_URL}/auth/mp/login"
    params = {
        'appId': APPID,
        'code': code,
        'source': '1089',
        'businessSource': ''
    }
    try:
        res = requests.get(url, params=params, headers=BASE_HEADERS, timeout=15)
        data = res.json()
        if data and data.get("token"):
            return data
        print(f"登录接口返回异常: {data}")
    except requests.RequestException as e:
        print(f"登录时发生异常 -> {e}")
    return None

def do_sign(auth_data):
    """执行签到任务"""
    print("开始【每日签到】任务")
    
    token = auth_data.get("token", "")
    open_id = auth_data.get("openId", "")
    serial_id = auth_data.get("serialId", "")
    
    sign_headers = BASE_HEADERS.copy()
    sign_headers.update({
        'openId': open_id,
        'Authorization': f'Bearer {token}',
        'serialId': serial_id
    })
    
    url = f"{BASE_URL}/lottery/checkIn"
    params = {
        'longitude': '112.9267822265625',
        'latitude': '28.137536892361112'
    }
    payload = {
        "promotionCode": "signIn",
        "promotionId": 1001867,
        "longitude": 112.9267822265625,
        "latitude": 28.137536892361112
    }
    
    try:
        res = requests.post(url, params=params, json=payload, headers=sign_headers, timeout=15)
        data = res.json()
        
        if data.get("isHit") is True:
            award_name = data.get("award", {}).get("name", "未知奖励")
            print(f"签到成功 -> 获得 {award_name}")
            return f"签到成功，获得: {award_name}\n"
        else:
            msg = data.get("msg") or data.get("message") or str(data)
            if re.search(r'已经参与过|重复|已经签到', str(msg)):
                print("签到状态 -> 今日已签到过")
            else:
                print(f"签到结果 -> 未中奖或失败：{msg}")
                
    except requests.RequestException as e:
        print(f"签到时发生异常 -> {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"接口返回错误: {e.response.text}")
    return ""

def main():
    wx_server_url = os.environ.get("WX_SERVER_URL") or os.environ.get("wx_server_url") or ""
    wx_auth = os.environ.get("WX_AUTH") or os.environ.get("wx_auth") or ""
    raw_list = os.environ.get("JINHUI_WXID") or ""
    
    # 兼容 &、逗号、换行符分割
    account_list = [x.strip() for x in re.split(r'[\n&,]', raw_list) if x.strip()]
    
    if not wx_server_url:
        print("❌ 未配置 WX_SERVER_URL 网关地址，请检查环境变量")
        return
        
    if not account_list:
        print("❌ 未找到有效账号配置，请配置 JINHUI_WXID 环境变量")
        return
        
    print(f"\n📱 共加载 {len(account_list)} 个金辉账户 (WXID 模式)")
    
    final_message = ""
    
    for i, wxid in enumerate(account_list):
        index = i + 1
        print(f"\n*****第[{index}]个账号 (WXID: {mask_wxid(wxid)})*****")
        
        # 1. 获取 Code
        code = get_code(wxid, wx_server_url, wx_auth)
        if not code:
            print(f"❌ 账号[{index}] 获取 code 失败，跳过执行")
            continue
        print(f"✅ 成功获取 code: {code}")
        
        # 2. 登录换取 Token
        auth_data = get_jinhui_token(code)
        if not auth_data or not auth_data.get("token"):
            print(f"❌ 账号[{index}] 登录金辉失败，跳过执行")
            continue
        print("✅ 登录成功，获取到 Token")
        
        # 3. 签到
        final_message += f"📣====金辉签到账号[{index}]====📣\n"
        sign_result = do_sign(auth_data)
        if sign_result:
             final_message += sign_result
             
        # 延迟防黑
        time.sleep(2)
        
    if final_message.strip():
        print(f"\n========== 最终运行结果 ==========\n{final_message}")

if __name__ == "__main__":
    main()