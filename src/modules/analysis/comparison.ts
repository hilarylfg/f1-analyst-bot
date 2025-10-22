import { logger } from '../../utils/logger.js'
import { askAI } from '../ai/open-router.js'
import { contextBuilder } from '../stats/context-builder.js'

export async function analyzeDriverComparison(
	driver1: string,
	driver2: string,
	openRouterKey: string
): Promise<string> {
	try {
		const context = contextBuilder.getDriverComparisonContext(
			driver1,
			driver2
		)

		if (context.startsWith('ОШИБКА:')) {
			return context
		}

		const prompt = createComparisonPrompt(context)

		return await askAI(prompt, openRouterKey, false)
	} catch (error) {
		logger.error('Ошибка сравнения пилотов', error)
		throw new Error('Не удалось выполнить сравнение пилотов')
	}
}

function createComparisonPrompt(context: string): string {
	const currentDate = new Date().toISOString().split('T')[0]

	return `
Текущая дата: ${currentDate}

${context}

**ЗАДАЧА:** Проведи детальное сравнение пилотов на основе РЕАЛЬНЫХ ДАННЫХ выше.

**КРИТИЧЕСКИ ВАЖНО:**
- Используй ТОЛЬКО предоставленные данные
- НЕ выдумывай статистику
- Если данных недостаточно - скажи об этом

**СТРУКТУРА АНАЛИЗА:**

**🏆 Текущее положение в чемпионате**
Кто впереди и почему? Сравни очки, победы, подиумы.

**📈 Стабильность и форма**
Проанализируй последние 5 гонок каждого. Кто стабильнее?

**💪 Сильные стороны**
В чём каждый пилот хорош? (квалификация, гонка, обгоны, тактика)

**⚖️ Ключевые различия**
Что выделяет одного из них? Команда? Опыт? Агрессивность?

**🎯 Краткий вывод**
Кто имеет преимущество в этом сезоне и почему?

**ТРЕБОВАНИЯ:**
- Максимум 3500 символов
- Используй Markdown (жирный текст, списки)
- БЕЗ заголовков уровня # (только **)
- На русском языке
`
}
