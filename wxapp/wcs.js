const axios = require("axios");

class WeChatCodeServer {
    constructor(options) {
        this.serverUrl = options.url;
        this.appid = options.appid;
        this.auth = options.auth;
    }
    
    getCode(openid) {
        console.log('等待获取code:');
        return new Promise((resolve, reject) => {
            const url = `${this.serverUrl.trim().replace(/\/$/, '')}/mywc`;
            
            axios.get(url, {
                params: { wxid: openid, appId: this.appid },
                headers: {
                    'auth': this.auth
                },
                timeout: 30 * 1000
            }).then(res => {
                console.log('获取code成功:');
                
                // 修复：多包一层 data 对象，完美匹配 nwdjg.js 中的 let { data: codeRes } = ... 解构
                resolve({
                    data: {
                        status: res.data?.status === "ok",
                        data: {
                            code: res.data?.code
                        }
                    }
                });
            }).catch(err => {
                reject(err);
            });
        });
    }
   
    cloudInit(openid) {
        console.log('等待云函数初始化:');
        return new Promise((resolve, reject) => {
            axios.post(this.serverUrl + '/wx/call/init', { appid: this.appid, openid }, {
                headers: {
                    'auth': this.auth
                },
                timeout: 30 * 1000
            }).then(res => {
                console.log('云函数初始化成功:');
                resolve(res);
            }).catch(err => {
                reject(err);
            });
        });
    }
    
    cloudCall(openid) {
        console.log('等待云函数调用:');
        return new Promise((resolve, reject) => {
            axios.post(this.serverUrl + '/wx/cloud/call', { appid: this.appid, openid }, {
                headers: {
                    'auth': this.auth
                },
                timeout: 30 * 1000
            }).then(res => {
                console.log('云函数调用成功:');
                resolve(res);
            }).catch(err => {
                reject(err);
            });
        });
    }
}

module.exports = WeChatCodeServer;