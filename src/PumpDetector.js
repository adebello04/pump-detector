const dedent = require('dedent')
const Broadcaster = require('telegraf-broadcast')

const { BinanceWS } = require('binance')

const binance = new BinanceWS(true)

const formatSybmol = (symbol) => {
    const tickers = ['BTC', 'BUSD', 'USDT', 'BNB', 'EUR', 'TRY', 'ETH']

    const ticker = tickers.find(ticker => symbol.endsWith(ticker))

    if (ticker) {
        return `<b>${symbol.slice(0, symbol.length - ticker.length)}</b>/${ticker}`
    }

    return symbol
}

const declination = (number, titles) => {  
    const cases = [2, 0, 1, 1, 1, 2]

    return titles[
        (number%100 > 4 && number%100 < 20)
            ? 2
            : cases[(number%10 < 5) ? number%10 : 5]
    ]  
}

const formatLongFloat = (n, precision = 15) => n.toFixed(precision).replace(/\.?0+$/,"")

class PumpDetector {
    constructor(telegram) {
        this.channels = ['@pump_detect']
        this.broadcaster = new Broadcaster(telegram)

        this.startTickers = null
        this.endTickers = null
        this.triggered = {}

        this.limit = 60 * 5
        this.percent = 7.5
        this.againPercent = 5
        this.counter = 0
        this.triggerTimeout = 1 // sec

        this.run()
    }

    onTickers = (tickers) => {
        if (this.counter >= this.limit) {
            this.startTickers = null
            this.endTickers = null
            this.counter = 0
            this.triggered = {}
        }

        const formattedTickers = tickers.reduce((acc, ticker) => {
            return {
                ...acc,
                [ticker.symbol]: {
                    symbol: ticker.symbol,
                    price: parseFloat(ticker.currentClose),
                    dayDiff: parseFloat(ticker.priceChangePercent),
                    dayMax: parseFloat(ticker.high),
                    dayMin: parseFloat(ticker.low),
                }
            }
        }, {})

        if (!this.startTickers) {
            this.startTickers = formattedTickers
        } else {
            this.endTickers = formattedTickers
        }

        this.counter += 1

        const maxDiffs = this.findMaxDifference()

        this.broadcastMessages(maxDiffs)
    }
    
    run() {
        binance.onAllTickers(this.onTickers)
    }

    findMaxDifference() {
        if (!this.startTickers || !this.endTickers) {
            return []
        }

        const diffs = []

        for (const symbol in this.startTickers) {
            const a = this.startTickers[symbol].price

            if (!this.endTickers[symbol]) {
                continue
            }

            const b = this.endTickers[symbol].price

            diffs.push({
                symbol,
                priceFrom: a,
                priceTo: b,
                diff: b - a,
                dayDiff: this.endTickers[symbol].dayDiff,
                dayMax: this.endTickers[symbol].dayMax,
                dayMin: this.endTickers[symbol].dayMin,
                percentDiff: Math.abs(this.endTickers[symbol].dayDiff - this.startTickers[symbol].dayDiff)
                // percentDiff: a < b ? ((b - a) / a) * 100 : ((a - b) / a) * 100
            })
        }

        const maxDiffs = diffs.filter(ticker => {
            const lastTrigger = this.triggered[ticker.symbol]

            if (ticker.diff > 0 && ticker.percentDiff > this.percent && (!lastTrigger || (lastTrigger + this.againPercent) < ticker.percentDiff)) {
                this.triggered[ticker.symbol] = ticker.percentDiff

                return true
            }

            return false
        })

        return maxDiffs
    }

    broadcastMessages(maxDiffs) {
        const minutes = Math.floor(this.counter / 60)
        const seconds = this.counter - minutes * 60

        maxDiffs.forEach(max => {
            this.broadcaster.sendText(this.channels, dedent`
                ${max.percentDiff > 20 ? '🚨 ' : ''}${formatSybmol(max.symbol)}

                📈 <b> Has risen in price </b> <b>${formatLongFloat(max.percentDiff, 2)}%</b> за ${declination(minutes || seconds,  ['the last', 'the last', 'the last'])} <b>${minutes != 0 ? `${minutes} ${declination(minutes, ['a minute', 'minutes', 'minutes'])} ` : ''}${seconds} ${declination(seconds, ['give me a sec', 'seconds', 'seconds'])}</b>

                <b> It was: </b> <code>${formatLongFloat(max.priceFrom)}</code>
                <b> Has become: </b> <code>${formatLongFloat(max.priceTo)}</code>

                <b>Minimum per day:</b> <code>${formatLongFloat(max.dayMin)}</code>
                <b> Maximum per day: </b> <code>${formatLongFloat(max.dayMax)}</code>

                <b>Change Per day:</b> <code>${formatLongFloat(max.dayDiff, 2)}%</code>
            `, { parse_mode: 'HTML' })
        })
    }
}

module.exports = PumpDetector
