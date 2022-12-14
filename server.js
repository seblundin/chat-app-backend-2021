const express = require("express");
const app = express();
/*Express as http server event listener.*/
const server = require("http").createServer(app);
const {Server} = require("socket.io");
/*Bind socket io to http server*/
const io = new Server(server, {
    /* options */
    /*Enable cross-origin resource sharing.*/
    cors: "http://localhost:8080"
});
/*the dotenv package is needed for using process environment variables*/
require('dotenv').config({path: "./variables.env"});
console.log(process.env.PORT);

/*For storing and acquiring user data*/
const UserStorage = require("./userStorage");
const userStorage = new UserStorage();

/*For hashing*/
const PasswordUtil = require("./passwordUtil");
const passwordUtil = new PasswordUtil();

/*For creating random 8 byte strings*/
const crypto = require("crypto");
const randomId = () => crypto.randomBytes(8).toString("hex");

app.use(express.json());
app.use(express.urlencoded({extended:true}));
/*app.use(express.static("dist"));*/
/*return messages sent by userID*/
/*app.get("/", (req,res) => {
    req.sendFile("dist/index.html");
})*/
app.get("/api/getMessages", async (req,res) => {
    if (req.query.userID) {
        try {
            await userStorage.getMessages(req.query.userID).then(result => {
                if (result) {
                    res.send(result)
                } else {
                    res.sendStatus(404);
                }
            });
        } catch (e) {
            console.error(e);
        }
    } else {
        res.sendStatus(404);
    }
});

/*Set up middleware*/
io.use(async (socket, next) => {
    try {
        /*The socket handshake should always contain a username or id, but not both*/
        console.log(socket.handshake.auth);
        const username = socket.handshake.auth.username;
        const id = socket.handshake.auth.sessionID;
        if (id) {
            /*Find user with id and attach session data from database to socket.*/
            await userStorage.findUser(id).then(sessionData => {
                console.log("login with user id");
                socket.sessionID = id
                socket.username = sessionData.username;
                socket.userID = sessionData.userID
                return next();
            }, reason => {
                return next(new Error(reason));
            });
            /*If the connection was made with a username create new user*/
        } else if (username) {
            if (await userStorage.findUserWithName(username)) {
                return next(new Error("invalid username or password"));
            }
            /*bind user data to socket*/
            socket.username = username;
            await passwordUtil.hash(username).then(hash => {
                socket.userID = hash;
            });
            socket.sessionID = randomId();
            /*no error -> empty function*/
            return next();
        }
    } catch (e) {
        console.error(e.message);
        return next(new Error("something went wrong: " + e.message));
    }
});

io.on("reconnect", async (socket) => {

})

io.on("connection", async (socket) => {
    /*Save connected user to database*/
    console.log("connection with username " + socket.username);
    userStorage.connect().then(async () => {
        await userStorage.saveUser({sessionID: socket.sessionID, userID: socket.userID, username: socket.username});
        console.log(`emitting session: ${socket.sessionID}`);
        socket.emit("session", {
            sessionID: socket.sessionID,
            userID: socket.userID,
            username: socket.username
        });
        //join room with own id for message transfer purposes
        socket.join(socket.userID);

        const users = [];
        userStorage.getUsers().then(sessions => {
            for (let index in sessions) {
                users.push({
                    userID: sessions[index].userID,
                    username: sessions[index].username
                });
            }
            //console.log(users);
            socket.emit("users", users);
        });
    });
    // notify existing users of new user
    socket.broadcast.emit("user connected", {
        userID: socket.userID,
        username: socket.username
    });
    //handle message event
    socket.on("message", (data) => {
        const to = data.to;
        const from = data.from;
        const text = data.text
        /*check that message is correctly structured (no null values)*/
        if (to && from && text) {
            const message = {
                to: to,
                from: from,
                text: text
            }
            /*Message event is emitted to both sender and recipient rooms*/
            try {
                socket.to(to).to(socket.userID).emit("message", message);
                userStorage.updateMessages(socket.userID, message)
                    .then(result => result.acknowledged ? console.log("message saved") : console.error("message saving failed"));
            } catch (e) {
                console.error(e);
            }

        } else {
            console.error("invalid message structure");
        }
    });
    socket.on("logout", (data) => {
        console.log("disconnecting: ");
        console.log(data);
        userStorage.deleteUser(data.userID).then(result => {
            if (result.acknowledged && result.deletedCount === 1) {
                socket.disconnect();
            }
        });
    });
    console.log("user " + socket.username + " connected");

    socket.on("disconnect", async () => {
        console.log("disconnect event");
        /*Make sure the size of connected sockets in room with specific id is 0,
        then broadcast user disconnected with said id.*/
        io.in(socket.userID).allSockets().then(sockets => {
            sockets.size === 0 ? socket.broadcast.emit("user disconnected", socket.userID) : null
            //TODO: MAYBE UPDATE CONNECTION STATUS TO DATABASE?
        });
    });
});


server.listen(parseInt(process.env.PORT) || 8082, () => {
    console.log("Server listening");
});