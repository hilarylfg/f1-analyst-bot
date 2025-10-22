import axios, { type AxiosError } from 'axios'

import { logger } from '../../utils/logger.js'
import { contextBuilder } from '../stats/context-builder.js'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'tngtech/deepseek-r1t2-chimera:free'
const MAX_TOKENS = 2000
const TEMPERATURE = 0.3
const MAX_RESPONSE_LENGTH = 3800

export async function askAI(
	question: string,
	apiKey: string,
	includeContext = false
): Promise<string> {
	try {
		const systemPrompt = createSystemPrompt(includeContext)
		const response = await makeAIRequest(systemPrompt, question, apiKey)

		return response.trim()
	} catch (error) {
		logger.error('Ошибка запроса к OpenRouter', error)

		if (axios.isAxiosError(error)) {
			const axiosError = error as AxiosError
			if (axiosError.response?.status === 429) {
				throw new Error(
					'Превышен лимит запросов к AI. Попробуйте позже.'
				)
			}
			if (axiosError.response?.status === 401) {
				throw new Error('Ошибка авторизации AI сервиса.')
			}
		}

		throw new Error('Не удалось связаться с AI-сервисом.')
	}
}

function createSystemPrompt(includeContext: boolean): string {
	const currentDate = new Date().toISOString().split('T')[0]
	const currentYear = new Date().getFullYear()

	let context = ''
	if (includeContext) {
		context = '\n\n' + contextBuilder.getChampionshipContext() + '\n'
	}

	return `Вы — ведущий AI-аналитик Формулы 1 с глубокими знаниями автоспорта.

Текущая дата: ${currentDate}
${context}

**КРИТИЧЕСКИ ВАЖНО:**
- Если предоставлены РЕАЛЬНЫЕ ДАННЫЕ сезона ${currentYear} - используйте ТОЛЬКО их
- НЕ используйте устаревшие данные из базы знаний для текущего сезона
- Если данных недостаточно - честно скажите об этом
- Указывайте источник: реальные данные vs общие знания

**ВАША ЗАДАЧА:**
Предоставлять точные, увлекательные и исчерпывающие ответы о Формуле 1.

**ТРЕБОВАНИЯ К ОТВЕТУ:**
- На русском языке
- Максимум ${MAX_RESPONSE_LENGTH} символов
- Markdown без заголовков # (только жирный текст, списки)
- Структурированный и содержательный`
}

async function makeAIRequest(
	systemPrompt: string,
	userQuestion: string,
	apiKey: string
): Promise<string> {
	const response = await axios.post(
		OPENROUTER_API_URL,
		{
			model: DEFAULT_MODEL,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userQuestion }
			],
			temperature: TEMPERATURE,
			max_tokens: MAX_TOKENS
		},
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			timeout: 30000
		}
	)

	const content = response.data?.choices?.[0]?.message?.content

	if (!content) {
		throw new Error('AI вернул пустой ответ')
	}

	return content
}
