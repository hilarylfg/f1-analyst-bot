import { askAI } from "../ai/open-router.js";
import { contextBuilder } from '../stats/context-builder.js';

interface PredictionResult {
    driver: string;
    team: string;
    predictedPosition: number;
    podiumProbability: number;
    winProbability: number;
    reasoning: string;
}

const currentDate = new Date();

export class AIRacePredictor {
    private openRouterKey: string;

    constructor(openRouterKey: string) {
        this.openRouterKey = openRouterKey;
    }

    async predictRaceResults(trackName: string): Promise<{ predictions: PredictionResult[]; analysis: string }> {
        try {
            const seasonContext = contextBuilder.getChampionshipContext();
            const prediction = await this.generateRacePrediction(seasonContext, trackName);

            const analysis = (prediction.analysis || '').trim();
            if (!analysis) {
                const fallback = `Извините, не удалось получить текст анализа от AI. Попробуйте повторить команду через минуту или используйте /ask для отдельного запроса.`;
                console.warn('AI returned empty analysis for /predict', { trackName });
                return { predictions: prediction.predictions || [], analysis: fallback };
            }

            return prediction;
        } catch (error) {
            console.error('Ошибка при создании предикции:', error);
            throw new Error('Не удалось составить предикцию для гонки');
        }
    }

    private async generateRacePrediction(seasonContext: string, trackName: string): Promise<{
        predictions: PredictionResult[];
        analysis: string
    }> {
        const prompt = `
${seasonContext}

═══════════════════════════════════════════════════════════

**ЗАДАЧА:** Составь детальную предикцию гонки на трассе **${trackName}**

**ШАГ 1: АНАЛИЗ ДАННЫХ**
Проанализируй реальные данные выше:
- Кто лидирует в чемпионате и почему?
- Какие команды сильнее всего?
- Кто в форме (последние гонки)?
- Кто борется за подиум?

**ШАГ 2: ОСОБЕННОСТИ ТРАССЫ**
Вспомни характеристики трассы ${trackName}:
- Тип трассы (скоростная/техническая/уличная/смешанная)
- Какие команды/пилоты исторически сильны здесь?
- Ключевые повороты и зоны обгона

**ШАГ 3: СОЗДАЙ ПРЕДИКЦИЮ**

Напиши структурированный анализ по следующему плану:

**🏆 ФАВОРИТЫ НА ПОБЕДУ** (2-3 пилота)
Для каждого укажи:
- Почему он фаворит (статистика из данных)
- Его форма (последние 3-5 гонок)
- Преимущества на этой трассе
Пример: *"Оскар Пиастри (McLaren) — лидер чемпионата с 5 победами и 150 очками. Выиграл 3 из последних 5 гонок, включая Монако — схожую техническую трассу. McLaren доминирует в медленных поворотах."*

**🥇 ПОДИУМ: ТОП-5 ПИЛОТОВ** (с кратким обоснованием)
1. [Пилот] — [1-2 предложения почему]
2. [Пилот] — [1-2 предложения почему]

...

**🦄 ТЁМНАЯ ЛОШАДКА** (1 пилот)
Кто может удивить и попасть в топ-5? Обоснуй на основе:
- Последних результатов
- Особенностей трассы
- Исторических сюрпризов

**🔑 КЛЮЧЕВЫЕ ФАКТОРЫ**
3-5 пунктов, которые решат исход гонки:
- Стратегия пит-стопов
- Погода (если актуально)
- Квалификация
- Обгоны / защита позиций
- Надёжность болидов

**📊 ИТОГОВЫЙ ПРОГНОЗ ПОДИУМА:**
1. [Пилот] (Команда)
2. [Пилот] (Команда)  
3. [Пилот] (Команда)

═══════════════════════════════════════════════════════════

**НАПОМИНАНИЕ:**
- Используй конкретные цифры из данных выше
- Будь уверенным, но реалистичным
- Закончи все предложения полностью
- закончи ответ Итоговым прогнозом подиума
`;

        const analysis = await askAI(prompt, this.openRouterKey);

        return {
            predictions: [],
            analysis
        };
    }
}