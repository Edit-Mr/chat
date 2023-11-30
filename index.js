/** @format */

import express from "express";
import http from "http";
import { Server } from "socket.io";
import records from "./records.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;
let code = process.env.ROOM_TOKEN || "1234";
const adminPassword = process.env.ADMIN_TOKEN || "password";
let onlineCount = 0;
let blackList = [];
let vote = {};
const userTokenList = [];

app.use((req, res, next) => {
    if (
        req.header("x-forwarded-proto") !== "https" &&
        process.env.NODE_ENV === "production"
    ) {
        res.redirect(`https://${req.header("host")}${req.url}`);
    } else {
        next();
    }
});

app.use("/static", express.static("static"));

const MAX_WRONG_ATTEMPTS = 3;
const BLOCK_DURATION = 60000; // 1 minute in milliseconds
const wrongAttempts = new Map();

app.get("/", (req, res) => {
    const token = req.query.token;
    const ip = req.ip;

    if (wrongAttempts.has(ip) && wrongAttempts.get(ip) >= MAX_WRONG_ATTEMPTS) {
        res.send("嘗試次數過多。請一分鐘後再試。");
        return;
    }

    if (token == code) {
        res.sendFile(__dirname + "/pages/room.html");
        wrongAttempts.delete(ip);
    } else {
        res.sendFile(__dirname + "/pages/index.html");
        console.log("登入失敗:" + token);

        if (wrongAttempts.has(ip)) {
            wrongAttempts.set(ip, wrongAttempts.get(ip) + 1);
        } else {
            wrongAttempts.set(ip, 1);
        }

        if (wrongAttempts.get(ip) >= MAX_WRONG_ATTEMPTS) {
            setTimeout(() => {
                wrongAttempts.delete(ip);
            }, BLOCK_DURATION);
        }
    }
});

app.get("/admin", (req, res) => {
    const token = req.query.token;
    const ip = req.ip;

    if (wrongAttempts.has(ip) && wrongAttempts.get(ip) >= MAX_WRONG_ATTEMPTS) {
        res.send("嘗試次數過多。請一分鐘後再試。");
        return;
    }

    if (token == adminPassword) {
        res.sendFile(__dirname + "/pages/admin.html");
        wrongAttempts.delete(ip);
    } else {
        res.sendFile(__dirname + "/pages/index.html");
        console.log("登入失敗:" + token);

        if (wrongAttempts.has(ip)) {
            wrongAttempts.set(ip, wrongAttempts.get(ip) + 1);
        } else {
            wrongAttempts.set(ip, 1);
        }

        if (wrongAttempts.get(ip) >= MAX_WRONG_ATTEMPTS) {
            setTimeout(() => {
                wrongAttempts.delete(ip);
            }, BLOCK_DURATION);
        }
    }
});

io.on("connection", socket => {
    const ip = socket.handshake.address;
    if (blackList.includes(ip)) {
        console.log(ip + "嘗試連線，但是被黑名單擋下了");
        socket.disconnect(true);
        return;
    }
    // 有連線發生時增加人數
    onlineCount++;
    // 發送人數給網頁
    io.emit("online", onlineCount);

    let token = generateToken();
    while (userTokenList.includes(token)) {
        token = generateToken();
    }

    userTokenList.push(token);
    socket.emit("token", token);

    // 發送紀錄
    socket.emit("chatRecord", records.get());

    // 發送投票結果
    const voteCount = Object.values(vote).filter(v => v).length;
    io.emit("voteCount", voteCount);

    socket.on("greet", () => {
        socket.emit("greet", onlineCount);
    });

    socket.on("send", msg => {
        msg.ip = ip;
        // 如果 msg 內容鍵值小於 2 等於是訊息傳送不完全
        // 因此我們直接 return ，終止函式執行。
        if (Object.keys(msg).length < 2) return;
        records.push(msg);
    });

    socket.on("disconnect", () => {
        // 有人離線了，扣人
        onlineCount = onlineCount < 0 ? 0 : (onlineCount -= 1);
        io.emit("online", onlineCount);
        // 移除 token
        const index = userTokenList.findIndex(t => t == token);
        userTokenList.splice(index, 1);
        // 移除投票
        delete vote[token];
        // 發送投票結果
        const voteCount = Object.values(vote).filter(v => v).length;
        io.emit("voteCount", voteCount);
    });

    socket.on("setCode", ({ token, room }) => {
        if (token != adminPassword) {
            console.log("有人嘗試更新代碼，密碼錯誤");
            return;
        }
        code = room;
        console.log("Code updated:", code);
        io.sockets.sockets.forEach(socket => {
            socket.disconnect(true);
        });
    });

    socket.on("sendLink", msg => {
        console.log("openLink", msg.link);
        // 廣播訊息到聊天室
        io.emit("openLink", msg.link);
    });

    socket.on("hand", checked => {
        vote[checked.userToken] = checked.checked;
        const voteCount = Object.values(vote).filter(v => v).length;
        io.emit("voteCount", voteCount);
    });
});

records.on("new_message", msg => {
    // 廣播訊息到聊天室
    io.emit("msg", msg);
});

server.listen(process.env.PORT || 3000, () => {
    console.log("Express server listening on port");
});

function generateToken() {
    const characters =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let token = "";
    for (let i = 0; i < 10; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        token += characters[randomIndex];
    }
    return token;
}
