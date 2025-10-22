import { PrismaClient } from '@prisma/client'
import TelegramBot, { type Message } from 'node-telegram-bot-api'

import { findOrCreateUser, grantConsent } from './core/user-service.js'
import { askAI } from './modules/ai/open-router.js'
import { AIRacePredictor } from './modules/analysis/ai-race-predictor.js'
import { analyzeDriverComparison } from './modules/analysis/comparison.js'
import { f1Data } from './modules/openf1/openf1-parser.js'
import { championship } from './modules/stats/championship.js'
import { driverStats } from './modules/stats/driver-stats.js'
import { logger } from './utils/logger.js'

const prisma = new PrismaClient()

export class F1Bot {
	private bot: TelegramBot
	private openRouterKey?: string
	private aiPredictor?: AIRacePredictor
	private isDataReady = false

	constructor(token: string, openRouterKey?: string) {
		this.bot = new TelegramBot(token, { polling: true })
		this.openRouterKey = openRouterKey
		this.aiPredictor = openRouterKey
			? new AIRacePredictor(openRouterKey)
			: undefined
	}

	private async onAnyMessage(msg: Message): Promise<void> {
		if (!msg.from || !msg.text) return

		try {
			const user = await findOrCreateUser(msg.from)
			await prisma.message.create({
				data: {
					userId: user.id,
					role: 'user',
					content: msg.text
				}
			})
		} catch (error) {
			logger.error('Ошибка логирования сообщения', error)
		}
	}

	private splitMessage(text: string, maxLength: number): string[] {
		const parts: string[] = []
		let current = ''

		text.split('\n').forEach(line => {
			if ((current + line + '\n').length > maxLength) {
				parts.push(current)
				current = line + '\n'
			} else {
				current += line + '\n'
			}
		})

		if (current) parts.push(current)
		return parts
	}

	private async sendLongMessage(
		chatId: number,
		text: string,
		parseMode: 'Markdown' | 'HTML' = 'Markdown'
	): Promise<void> {
		if (text.length > 4000) {
			const parts = this.splitMessage(text, 4000)
			for (const part of parts) {
				await this.bot.sendMessage(chatId, part, {
					parse_mode: parseMode
				})
			}
		} else {
			await this.bot.sendMessage(chatId, text, { parse_mode: parseMode })
		}
	}

	private async checkDataReady(chatId: number): Promise<boolean> {
		if (!this.isDataReady) {
			await this.bot.sendMessage(chatId, '⏳ Данные ещё загружаются...')
			return false
		}
		return true
	}

	private async checkAIAvailable(chatId: number): Promise<boolean> {
		if (!this.openRouterKey) {
			await this.bot.sendMessage(
				chatId,
				'❌ Эта команда недоступна: OpenRouter API не настроен.'
			)
			return false
		}
		return true
	}

	private async setupBotCommands(): Promise<void> {
		try {
			await this.bot.setMyCommands([
				{ command: 'start', description: 'Начать работу с ботом' },
				{ command: 'help', description: 'Список всех команд' },
				{
					command: 'standings',
					description: 'Таблица чемпионата пилотов'
				},
				{
					command: 'constructors',
					description: 'Таблица конструкторов'
				},
				{ command: 'driver', description: 'Профиль пилота' },
				{ command: 'form', description: 'Форма пилота' },
				{ command: 'points', description: 'Разбивка очков пилота' },
				{ command: 'drivers', description: 'Список всех пилотов' },
				{ command: 'teams', description: 'Список команд с очками' },
				{
					command: 'compare',
					description: 'Сравнение двух пилотов (AI)'
				},
				{ command: 'ask', description: 'Задать вопрос о F1 (AI)' },
				{
					command: 'predict',
					description: 'Предсказание результатов (AI)'
				}
			])
			logger.success('Меню команд установлено')
		} catch (error) {
			logger.error('Ошибка установки меню команд', error)
		}
	}

	private setupHandlers(): void {
		this.bot.on('message', msg => void this.onAnyMessage(msg))

		this.bot.onText(/\/start/, async msg => {
			const chatId = msg.chat.id
			const policyText =
				'Для работы мне нужно обрабатывать ваши запросы. Пожалуйста, примите политику конфиденциальности.'

			await this.bot.sendMessage(
				chatId,
				`🏎️ Добро пожаловать в F1 Analyst Bot!\n\n${policyText}`,
				{
					reply_markup: {
						inline_keyboard: [
							[
								{
									text: '✅ Принять политику',
									callback_data: 'consent_accept_v1.0'
								}
							],
							[
								{
									text: '📄 Читать политику',
									url: 'https://github.com/hilarylfg/f1-analyst-bot/blob/main/PRIVACY_POLICY.md'
								}
							]
						]
					}
				}
			)
		})

		this.bot.on('callback_query', async query => {
			if (
				query.data === 'consent_accept_v1.0' &&
				query.from &&
				query.message
			) {
				try {
					const user = await findOrCreateUser(query.from)
					await grantConsent(user.id, '1.0')
					await this.bot.answerCallbackQuery(query.id, {
						text: 'Спасибо! Согласие принято.'
					})
					await this.bot.editMessageText(
						'✅ Согласие принято! Теперь вы можете пользоваться ботом.',
						{
							chat_id: query.message.chat.id,
							message_id: query.message.message_id
						}
					)
					await this.bot.sendMessage(
						query.message.chat.id,
						'Используйте /help для списка команд.'
					)
				} catch (error) {
					logger.error('Ошибка обработки согласия', error)
				}
			}
		})

		this.bot.onText(/\/help/, async msg => {
			const helpText =
				`*🏎️ F1 Analyst Bot*\n\n` +
				`*📊 СТАТИСТИКА:*\n` +
				`/standings - Таблица пилотов\n` +
				`/constructors - Таблица команд\n` +
				`/driver [имя] - Профиль пилота\n` +
				`/form [имя] - Форма пилота\n` +
				`/points [имя] - Разбивка очков\n` +
				`/drivers - Все пилоты\n` +
				`/teams - Все команды\n\n` +
				`*🤖 AI-АНАЛИЗ:*\n` +
				`/compare [пилот1] [пилот2] - Сравнение\n` +
				`/ask [вопрос] - Вопрос о F1\n` +
				`/predict [трасса] - Предсказание\n\n` +
				`_Данные из OpenF1 API_`

			await this.bot.sendMessage(msg.chat.id, helpText, {
				parse_mode: 'Markdown'
			})
		})

		this.bot.onText(/\/standings/, async msg => {
			if (!(await this.checkDataReady(msg.chat.id))) return

			try {
				const standings = championship.formatDriverStandings()
				await this.bot.sendMessage(msg.chat.id, standings, {
					parse_mode: 'Markdown'
				})
			} catch (error) {
				logger.error('Ошибка /standings', error)
				await this.bot.sendMessage(
					msg.chat.id,
					'❌ Ошибка получения таблицы пилотов'
				)
			}
		})

		this.bot.onText(/\/constructors/, async msg => {
			if (!(await this.checkDataReady(msg.chat.id))) return

			try {
				const standings = championship.formatTeamStandings()
				await this.bot.sendMessage(msg.chat.id, standings, {
					parse_mode: 'Markdown'
				})
			} catch (error) {
				logger.error('Ошибка /constructors', error)
				await this.bot.sendMessage(
					msg.chat.id,
					'❌ Ошибка получения таблицы команд'
				)
			}
		})

		this.bot.onText(/\/driver (.+)/, async (msg, match) => {
			if (!(await this.checkDataReady(msg.chat.id))) return
			const driverName = match?.[1]
			if (!driverName) return

			try {
				const profile = driverStats.getDriverProfile(driverName)
				await this.bot.sendMessage(msg.chat.id, profile, {
					parse_mode: 'Markdown'
				})
			} catch (error) {
				logger.error('Ошибка /driver', error)
				await this.bot.sendMessage(
					msg.chat.id,
					'❌ Ошибка получения профиля пилота'
				)
			}
		})

		this.bot.onText(/\/form (.+)/, async (msg, match) => {
			if (!(await this.checkDataReady(msg.chat.id))) return
			const driverName = match?.[1]
			if (!driverName) return

			try {
				const form = driverStats.getDriverForm(driverName)
				await this.bot.sendMessage(msg.chat.id, form, {
					parse_mode: 'Markdown'
				})
			} catch (error) {
				logger.error('Ошибка /form', error)
				await this.bot.sendMessage(
					msg.chat.id,
					'❌ Ошибка получения формы пилота'
				)
			}
		})

		this.bot.onText(/\/points (.+)/, async (msg, match) => {
			if (!(await this.checkDataReady(msg.chat.id))) return
			const driverName = match?.[1]
			if (!driverName) return

			try {
				const results = f1Data.getDriverResults(driverName)
				if (results.length === 0) {
					return this.bot.sendMessage(
						msg.chat.id,
						`❌ Пилот "${driverName}" не найден`
					)
				}

				const output = this.formatDriverPoints(results)
				await this.sendLongMessage(msg.chat.id, output)
			} catch (error) {
				logger.error('Ошибка /points', error)
				await this.bot.sendMessage(
					msg.chat.id,
					'❌ Ошибка получения очков пилота'
				)
			}
		})

		this.bot.onText(/\/drivers/, async msg => {
			if (!(await this.checkDataReady(msg.chat.id))) return

			try {
				const drivers = f1Data.getAllDrivers()
				const output = `👥 **Все пилоты сезона 2025:**\n\n${drivers.map((d, i) => `${i + 1}. ${d}`).join('\n')}`
				await this.bot.sendMessage(msg.chat.id, output, {
					parse_mode: 'Markdown'
				})
			} catch (error) {
				logger.error('Ошибка /drivers', error)
				await this.bot.sendMessage(
					msg.chat.id,
					'❌ Ошибка получения списка пилотов'
				)
			}
		})

		this.bot.onText(/\/teams/, async msg => {
			if (!(await this.checkDataReady(msg.chat.id))) return

			try {
				const output = this.formatTeamsList()
				await this.bot.sendMessage(msg.chat.id, output, {
					parse_mode: 'HTML'
				})
			} catch (error) {
				logger.error('Ошибка /teams', error)
				await this.bot.sendMessage(
					msg.chat.id,
					'❌ Ошибка получения списка команд'
				)
			}
		})

		this.bot.onText(/\/check_team (.+)/, async (msg, match) => {
			if (!(await this.checkDataReady(msg.chat.id))) return
			const teamName = match?.[1]
			if (!teamName) return

			try {
				const output = this.formatTeamDetails(teamName)
				if (!output) {
					return this.bot.sendMessage(
						msg.chat.id,
						`❌ Команда "${teamName}" не найдена`
					)
				}
				await this.sendLongMessage(msg.chat.id, output)
			} catch (error) {
				logger.error('Ошибка /check_team', error)
				await this.bot.sendMessage(
					msg.chat.id,
					'❌ Ошибка проверки команды'
				)
			}
		})

		this.bot.onText(/\/check_driver (.+)/, async (msg, match) => {
			if (!(await this.checkDataReady(msg.chat.id))) return
			const driverName = match?.[1]
			if (!driverName) return

			try {
				const output = this.formatDriverDetails(driverName)
				if (!output) {
					return this.bot.sendMessage(
						msg.chat.id,
						`❌ Пилот "${driverName}" не найден`
					)
				}
				await this.sendLongMessage(msg.chat.id, output)
			} catch (error) {
				logger.error('Ошибка /check_driver', error)
				await this.bot.sendMessage(
					msg.chat.id,
					'❌ Ошибка проверки пилота'
				)
			}
		})

		this.bot.onText(/\/compare (.+) (.+)/, async (msg, match) => {
			if (!(await this.checkAIAvailable(msg.chat.id))) return

			const driver1 = match?.[1]
			const driver2 = match?.[2]
			if (!driver1 || !driver2) return

			await this.bot.sendMessage(msg.chat.id, '🔄 Анализирую данные...')

			try {
				const analysis = await analyzeDriverComparison(
					driver1,
					driver2,
					this.openRouterKey!
				)
				await this.bot.sendMessage(msg.chat.id, analysis, {
					parse_mode: 'Markdown'
				})
			} catch (error) {
				logger.error('Ошибка /compare', error)
				await this.bot.sendMessage(
					msg.chat.id,
					'❌ Ошибка сравнения пилотов'
				)
			}
		})

		this.bot.onText(/\/ask (.+)/, async (msg, match) => {
			if (!(await this.checkAIAvailable(msg.chat.id))) return

			const question = match?.[1]
			if (!question) return

			await this.bot.sendMessage(msg.chat.id, '🤔 Обрабатываю вопрос...')

			try {
				const answer = await askAI(question, this.openRouterKey!, true)
				await this.bot.sendMessage(msg.chat.id, answer, {
					parse_mode: 'Markdown'
				})
			} catch (error) {
				logger.error('Ошибка /ask', error)
				await this.bot.sendMessage(
					msg.chat.id,
					'❌ Ошибка обработки вопроса'
				)
			}
		})

		this.bot.onText(/\/predict (.+)/, async (msg, match) => {
			if (!(await this.checkAIAvailable(msg.chat.id))) return
			if (!this.aiPredictor) return

			const track = match?.[1]
			if (!track) return

			await this.bot.sendMessage(
				msg.chat.id,
				'🔮 Составляю предсказание...'
			)

			try {
				const prediction =
					await this.aiPredictor.predictRaceResults(track)
				await this.bot.sendMessage(msg.chat.id, prediction.analysis, {
					parse_mode: 'Markdown'
				})
			} catch (error) {
				logger.error('Ошибка /predict', error)
				await this.bot.sendMessage(
					msg.chat.id,
					'❌ Ошибка создания предсказания'
				)
			}
		})
	}

	private formatDriverPoints(
		results: ReturnType<typeof f1Data.getDriverResults>
	): string {
		const driver = results[0].driver
		const team = results[0].team

		const raceResults = results.filter(r => !r.isSprint)
		const sprintResults = results.filter(r => r.isSprint)

		const totalPoints = results.reduce((sum, r) => sum + r.points, 0)
		const racePoints = raceResults.reduce((sum, r) => sum + r.points, 0)
		const sprintPoints = sprintResults.reduce((sum, r) => sum + r.points, 0)

		const wins = raceResults.filter(r => r.position === '1').length
		const podiums = raceResults.filter(r =>
			['1', '2', '3'].includes(r.position)
		).length

		let output = `🏎️ **${driver}** (${team})\n\n`
		output += `📊 **ИТОГО: ${totalPoints} очков**\n`
		output += `   🏁 Гонки: ${racePoints} (${raceResults.length})\n`
		output += `   🏃 Спринты: ${sprintPoints} (${sprintResults.length})\n\n`
		output += `🏆 Победы: ${wins} | Подиумы: ${podiums}\n\n`
		output += `📋 **ДЕТАЛЬНО:**\n\n`

		const trackMap = new Map<
			string,
			{ race?: (typeof results)[0]; sprint?: (typeof results)[0] }
		>()
		results.forEach(r => {
			if (!trackMap.has(r.track)) trackMap.set(r.track, {})
			const track = trackMap.get(r.track)!
			if (r.isSprint) track.sprint = r
			else track.race = r
		})

		trackMap.forEach((data, track) => {
			output += `**${track}:**\n`
			if (data.race) {
				const emoji =
					data.race.position === '1'
						? '🥇'
						: data.race.position === '2'
							? '🥈'
							: data.race.position === '3'
								? '🥉'
								: '🏁'
				output += `   ${emoji} Гонка: P${data.race.position} → +${data.race.points}\n`
			}
			if (data.sprint) {
				const emoji =
					data.sprint.position === '1'
						? '🥇'
						: data.sprint.position === '2'
							? '🥈'
							: data.sprint.position === '3'
								? '🥉'
								: '🏃'
				output += `   ${emoji} Спринт: P${data.sprint.position} → +${data.sprint.points}\n`
			}
			output += '\n'
		})

		return output
	}

	private formatTeamsList(): string {
		const allResults = f1Data.getRaceResults()
		const teamPoints = new Map<
			string,
			{
				total: number
				race: number
				sprint: number
				drivers: Set<string>
			}
		>()

		allResults.forEach(r => {
			if (!teamPoints.has(r.team)) {
				teamPoints.set(r.team, {
					total: 0,
					race: 0,
					sprint: 0,
					drivers: new Set()
				})
			}
			const team = teamPoints.get(r.team)!
			team.total += r.points
			if (r.isSprint) team.sprint += r.points
			else team.race += r.points
			team.drivers.add(r.driver)
		})

		const sorted = Array.from(teamPoints.entries()).sort(
			(a, b) => b[1].total - a[1].total
		)

		let output = '🏁 <b>ВСЕ КОМАНДЫ СЕЗОНА 2025</b>\n\n'
		sorted.forEach(([teamName, data], i) => {
			const drivers = Array.from(data.drivers).join(', ')
			output += `<b>${i + 1}. ${teamName}</b> — ${data.total} очков\n`
			output += `   👥 Пилоты: ${drivers}\n\n`
		})

		return output
	}

	private formatTeamDetails(teamName: string): string | null {
		const allResults = f1Data.getRaceResults()
		const teamResults = allResults.filter(r =>
			r.team.toLowerCase().includes(teamName.toLowerCase())
		)

		if (teamResults.length === 0) return null

		const fullTeamName = teamResults[0].team
		const totalPoints = teamResults.reduce((sum, r) => sum + r.points, 0)
		const racePoints = teamResults
			.filter(r => !r.isSprint)
			.reduce((sum, r) => sum + r.points, 0)
		const sprintPoints = teamResults
			.filter(r => r.isSprint)
			.reduce((sum, r) => sum + r.points, 0)

		const drivers = [...new Set(teamResults.map(r => r.driver))]
		const driverPoints = new Map<string, number>()
		teamResults.forEach(r => {
			driverPoints.set(
				r.driver,
				(driverPoints.get(r.driver) || 0) + r.points
			)
		})

		let output = `🏎️ **${fullTeamName}**\n\n`
		output += `📊 **ИТОГО: ${totalPoints} очков**\n`
		output += `   🏁 Гонки: ${racePoints}\n`
		output += `   🏃 Спринты: ${sprintPoints}\n\n`
		output += `👥 **ПИЛОТЫ:**\n`
		drivers.forEach(driver => {
			output += `   • ${driver}: ${driverPoints.get(driver)} очков\n`
		})

		return output
	}

	private formatDriverDetails(driverName: string): string | null {
		const results = f1Data.getDriverResults(driverName)
		if (results.length === 0) return null

		const driver = results[0].driver
		const driverNo = results[0].no

		const teamPoints = new Map<string, number>()
		results.forEach(r => {
			teamPoints.set(r.team, (teamPoints.get(r.team) || 0) + r.points)
		})

		let output = `🔍 **${driver} (#${driverNo})**\n\n`
		output += `📊 **ОЧКИ ПО КОМАНДАМ:**\n`
		teamPoints.forEach((points, team) => {
			output += `   ${team}: ${points}\n`
		})
		output += `\n_Всего: ${results.length} результатов_`

		return output
	}

	async start(): Promise<void> {
		logger.info('Запуск F1 Analyst Bot')
		logger.info('Загрузка данных из OpenF1 API')

		await f1Data.initialize()
		this.isDataReady = f1Data.isReady()

		if (!this.isDataReady) {
			logger.error(
				'Не удалось загрузить данные! Команды могут не работать.'
			)
		} else {
			logger.success(
				`Данные загружены: ${f1Data.getRaceResults().length} результатов`
			)
		}

		await this.setupBotCommands()
		this.setupHandlers()

		logger.success('F1 Analyst Bot запущен!')
	}
}
