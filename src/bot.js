const { Telegraf } = require('telegraf')

const PumpDetector = require('./PumpDetector')

const bot = new Telegraf('1724870296:AAFVeLCTVWNUou6MCQkB2KZQ_qIG7IDzZKE')

new PumpDetector(bot.telegram)

bot.catch(err => console.log('GLOBAL ERROR', err))

module.exports = bot
