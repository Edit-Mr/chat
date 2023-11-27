/** @format */

const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const records = require("./records.js");
const port = process.env.PORT || 3000;
let code = "1234";
const adminPassword = "scaict";

// 加入線上人數計數
let onlineCount = 0;

app.use('/static', express.static('static'))

// Rest of your code...

app.get("/", (req, res) => {
    const token = req.query.token;
    if (token == code) {
        res.sendFile(__dirname + "/pages/room.html");
    } else {
        res.sendFile(__dirname + "/pages/index.html");
        console.log("登入失敗:" + token);
    }
});

app.get("/admin", (req, res) => {
    const token = req.query.token;
    if (token == adminPassword) res.sendFile(__dirname + "/pages/admin.html");
    else {
        res.sendFile(__dirname + "/pages/index.html");
        console.log("登入失敗:" + token);
    }
});

io.on("connection", socket => {
    // 有連線發生時增加人數
    onlineCount++;
    // 發送人數給網頁
    io.emit("online", onlineCount);
    // 發送紀錄最大值
    socket.emit("maxRecord", records.getMax());
    // 發送紀錄
    socket.emit("chatRecord", records.get());

    socket.on("greet", () => {
        socket.emit("greet", onlineCount);
    });

    socket.on("send", msg => {
        // 如果 msg 內容鍵值小於 2 等於是訊息傳送不完全
        // 因此我們直接 return ，終止函式執行。
        if (Object.keys(msg).length < 2) return;
        records.push(msg);
    });

    socket.on("disconnect", () => {
        // 有人離線了，扣人
        onlineCount = onlineCount < 0 ? 0 : (onlineCount -= 1);
        io.emit("online", onlineCount);
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
});

records.on("new_message", msg => {
    // 廣播訊息到聊天室
    io.emit("msg", msg);
});

server.listen(port, () => {
    console.log("Server Started. http://localhost:" + port);
});