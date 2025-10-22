import { logger } from '../../utils/logger.js'
import { askAI } from '../ai/open-router.js'
import { contextBuilder } from '../stats/context-builder.js'

interface PredictionResult {
	predictions: never[]
	analysis: string
}

export class AIRacePredictor {
	private openRouterKey: string

	constructor(openRouterKey: string) {
		this.openRouterKey = openRouterKey
	}

	async predictRaceResults(trackName: string): Promise<PredictionResult> {
		try {
			const context = contextBuilder.getChampionshipContext()
			const prompt = this.createPredictionPrompt(context, trackName)
			const analysis = await askAI(prompt, this.openRouterKey, false)

			if (!analysis || analysis.trim().length === 0) {
				logger.warn(`AI вернул пустой анализ для трассы: ${trackName}`)
				return {
					predictions: [],
					analysis:
						'Извините, не удалось составить предсказание. Попробуйте позже или используйте /ask.'
				}
			}

			return {
				predictions: [],
				analysis: analysis.trim()
			}
		} catch (error) {
			logger.error(`Ошибка предсказания для ${trackName}`, error)
			throw new Error('Не удалось составить предсказание')
		}
	}

	private createPredictionPrompt(context: string, trackName: string): string {
		const currentDate = new Date().toISOString().split('T')[0]

		return `
Текущая дата: ${currentDate}

${context}

═══════════════════════════════════════════════════════════

**ЗАДАЧА:** Составь детальное предсказание гонки на трассе **${trackName}**

**ШАГ 1: АНАЛИЗ РЕАЛЬНЫХ ДАННЫХ**
Проанализируй данные выше:
- Кто лидирует в чемпионате?
- Какие команды доминируют?
- Кто в форме (последние гонки)?

**ШАГ 2: ОСОБЕННОСТИ ТРАССЫ ${trackName}**
Вспомни характеристики:
- Тип трассы (скоростная/техническая/уличная)
- Исторически сильные команды/пилоты
- Ключевые зоны обгона

**ШАГ 3: СТРУКТУРИРОВАННОЕ ПРЕДСКАЗАНИЕ**

**🏆 ФАВОРИТЫ НА ПОБЕДУ** (2-3 пилота)
Для каждого:
- Почему фаворит (статистика из данных)
- Его форма (последние гонки)
- Преимущества на этой трассе

**🥇 ПРОГНОЗ ПОДИУМА: ТОП-5**
1. [Пилот] — [краткое обоснование]
2. [Пилот] — [краткое обоснование]
3. [Пилот] — [краткое обоснование]
4. [Пилот] — [краткое обоснование]
5. [Пилот] — [краткое обоснование]

**🦄 ТЁМНАЯ ЛОШАДКА**
Кто может удивить? (1 пилот с обоснованием)

**🔑 КЛЮЧЕВЫЕ ФАКТОРЫ**
3-5 пунктов, которые решат гонку:
- Стратегия пит-стопов
- Погода
- Квалификация
- Надёжность

**📊 ИТОГОВЫЙ ПРОГНОЗ ПОДИУМА:**
1. [Пилот] (Команда)
2. [Пилот] (Команда)
3. [Пилот] (Команда)

═══════════════════════════════════════════════════════════

**ВАЖНО:**
- Используй конкретные цифры из данных
- Будь реалистичным
- ЗАКОНЧИ ответ итоговым прогнозом подиума
- Максимум 3800 символов
`
	}
}
