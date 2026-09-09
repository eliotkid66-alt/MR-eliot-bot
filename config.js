const config = require('./config.json');

module.exports = {
    ...config,
    VERSION: "1.0.0",
    sessionDir: "./session"
};