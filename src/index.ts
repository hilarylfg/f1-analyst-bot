import * as dotenv from 'dotenv'

import { F1Bot } from './bot.js'
import { logger } from './utils/logger.js'

dotenv.config()

const telegramToken = process.env.TELEGRAM_BOT_TOKEN
const openRouterKey = process.env.OPENROUTER_API_KEY
const databaseUrl = process.env.DATABASE_URL

if (!telegramToken) {
	logger.error('TELEGRAM_BOT_TOKEN не найден в .env')
	process.exit(1)
}

if (!databaseUrl) {
	logger.error('DATABASE_URL не найден в .env')
	process.exit(1)
}

if (!openRouterKey) {
	logger.warn('OPENROUTER_API_KEY не найден. AI-функции будут недоступны.')
}

async function main() {
	try {
		const bot = new F1Bot(telegramToken || '', openRouterKey)
		await bot.start()
	} catch (error) {
		logger.error('Не удалось запустить бота', error)
		process.exit(1)
	}
}

process.on('unhandledRejection', (reason, promise) => {
	logger.error('Unhandled Rejection', { reason, promise })
})

process.on('uncaughtException', error => {
	logger.error('Uncaught Exception', error)
	process.exit(1)
})

process.on('SIGINT', () => {
	logger.info('Получен SIGINT, завершение работы...')
	process.exit(0)
})

process.on('SIGTERM', () => {
	logger.info('Получен SIGTERM, завершение работы...')
	process.exit(0)
})

void main()
