const bcrypt = require("bcrypt");

class PasswordUtil {
    constructor() {
        this.saltRounds = 10;
    }

    /*Plain text password hashing with bcrypt function*/
    async hash(plainTextPassword) {
        return bcrypt.hash(plainTextPassword, this.saltRounds);
    }

    async checkLogin(plainTextPassword, hash) {
        return bcrypt.compare(plainTextPassword, hash);
    }

}

module.exports = PasswordUtil;