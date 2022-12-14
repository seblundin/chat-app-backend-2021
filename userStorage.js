/*Class for user session database management*/
const {MongoClient, ObjectId} = require("mongodb");
const {use} = require("express/lib/router");
require('dotenv').config();

/*Class for user saving related tools*/
class UserStorage {
    constructor() {
        const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.reltv.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
        this.client = new MongoClient(uri/*, { useUnifiedTopology: true, useNewUrlParser: true }*/);
        this.connect()
            .then(() => {
                /*Find correct database and table when connected to the cluster.*/
                this.users = this.client.db(process.env.DB_NAME).collection(process.env.DB_USERS_TABLE);
                this.users.createIndex({"loginTime": 1}, {expireAfterSeconds: 60*60}); //one hour expiry
                this.messages = this.client.db(process.env.DB_NAME).collection(process.env.DB_MESSAGES_TABLE)
            }, reason => {
                console.error(reason);
            });
    }

    async connect() {
        return this.client.connect();
    }

    /*Insert new user to user database. mongodb will auto generate _id key value*/
    async saveUser({sessionID, userID, username}) {
        return this.users.updateOne({sessionID: sessionID}, {
            $set: {
                loginTime: new Date(),
                userID: userID,
                username: username
            }
        }, {upsert: true});
    }

    /*Find user with session id*/
    async findUser(sessionID) {
        return this.users.findOne({sessionID: sessionID});
    }

    async findUserWithName(username) {
        return this.users.findOne({username: username});
    }

    async getUsers() {
        return this.users.find().toArray();
    }

    async deleteUser(userID) {
        return this.users.deleteOne({userID: userID});
    }

    async updateMessages(userID, message) {
        return this.messages.updateOne({user: userID}, {
            $addToSet: {
                messages:
                    {to: message.to, from: message.from, text: message.text, time: new Date()}
            }
        }, {upsert: true});
    }

    async getMessages(userID) {
        return this.messages.findOne({user: userID});
    }
}


module.exports = UserStorage;