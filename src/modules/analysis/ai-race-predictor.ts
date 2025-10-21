import axios from 'axios';
import {askAI} from "../ai/open-router.js";

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
            const currentSeasonData = await this.getCurrentSeasonData();

            const trackInfo = await this.getTrackInfo(trackName);

            const prediction = await this.generateRacePrediction(currentSeasonData, trackInfo, trackName);

            return prediction;
        } catch (error) {
            console.error('Ошибка при создании предикции:', error);
            throw new Error('Не удалось составить предикцию для гонки');
        }
    }

    private async getCurrentSeasonData(): Promise<string> {
        const prompt = `
Найди актуальную на ${currentDate.getFullYear()} информацию о текущем сезоне Формулы 1:
- Текущие позиции в чемпионате пилотов (топ-10)
- Количество побед, подиумов и очков каждого пилота
- Последние результаты (3-5 гонок)
- Текущая форма команд
- Статистика надежности пилотов (крэши, сходы)

Представь данные в структурированном виде.`;

        return await askAI(prompt, this.openRouterKey);
    }

    private async getTrackInfo(trackName: string): Promise<string> {
        const prompt = `
Найди подробную информацию на ${currentDate.getFullYear()} о трассе ${trackName} в Формуле 1:
- Полное название и страна
- Длина трассы и количество поворотов
- Характеристики (много прямых/технический трек)
- Статистика обгонов (легко/сложно обгонять)
- Какие команды/пилоты исторически сильны на этой трассе
- Влияние погодных условий
- Особенности трассы (DRS зоны, сложные повороты)

Представь информацию кратко но информативно.`;

        return await askAI(prompt, this.openRouterKey);
    }

    private async generateRacePrediction(seasonData: string, trackInfo: string, trackName: string): Promise<{
        predictions: PredictionResult[];
        analysis: string
    }> {
        const prompt = `
На основе следующих данных составь детальную предикцию результатов гонки Формулы 1:

ДАННЫЕ О СЕЗОНЕ:
${seasonData}

ИНФОРМАЦИЯ О ТРАССЕ:
${trackInfo}

ЗАДАЧА:
Проанализируй данные и составь предикцию для гонки на трассе ${trackName}. 

Верни ответ в следующем JSON формате:
{
  "predictions": [
    {
      "driver": "Имя Пилота",
      "team": "Название команды",
      "predictedPosition": число_от_1_до_20,
      "podiumProbability": процент_от_0_до_100,
      "winProbability": процент_от_0_до_100,
      "reasoning": "краткое обоснование позиции"
    }
  ],
  "analysis": "общий анализ гонки и ключевые факторы"
}

Учти следующие факторы:
- Текущую форму пилотов и команд
- Историческую производительность на данной трассе  
- Характеристики трассы и их влияние на разные команды
- Надежность и стабильность пилотов
- Стратегические особенности трассы

Предикция должна быть реалистичной и основанной на данных. Включи топ-10 пилотов.`;

        const response = await askAI(prompt, this.openRouterKey);

        try {
            const parsed = JSON.parse(response);
            return parsed;
        } catch (error) {
            return this.parseUnstructuredResponse(response);
        }
    }

    private parseUnstructuredResponse(response: string): { predictions: PredictionResult[]; analysis: string } {
        const lines = response.split('\n');
        const predictions: PredictionResult[] = [];
        let analysis = response;

        lines.forEach((line, index) => {
            if (line.includes('1.') || line.includes('2.') || line.includes('3.')) {
                const match = line.match(/(\d+)\.\s*([^-]+)/);
                if (match) {
                    predictions.push({
                        driver: match[2].trim(),
                        team: 'Неизвестно',
                        predictedPosition: parseInt(match[1]),
                        podiumProbability: index < 3 ? 70 - index * 10 : 10,
                        winProbability: index === 0 ? 40 : index < 3 ? 20 - index * 5 : 5,
                        reasoning: 'На основе анализа ИИ'
                    });
                }
            }
        });

        return {predictions, analysis};
    }

    public formatPredictionMessage(result: { predictions: PredictionResult[]; analysis: string }): string {
        let message = '🏁 **ПРЕДИКЦИЯ РЕЗУЛЬТАТОВ ГОНКИ F1** 🏁\n\n';

        result.predictions.slice(0, 10).forEach((pred, index) => {
            const positionEmoji = this.getPositionEmoji(pred.predictedPosition);

            message += `${positionEmoji} **${pred.driver}**`;
            if (pred.team !== 'Неизвестно') {
                message += ` _(${pred.team})_`;
            }
            message += '\n';
            message += `   📍 Позиция: P${pred.predictedPosition}\n`;
            message += `   🏆 Подиум: ${pred.podiumProbability}%\n`;
            message += `   👑 Победа: ${pred.winProbability}%\n`;
            message += `   💭 _${pred.reasoning}_\n\n`;
        });

        message += '📊 **АНАЛИЗ ГОНКИ:**\n';
        message += result.analysis + '\n\n';
        message += '🤖 *Предикция составлена ИИ на основе актуальных данных Формулы 1*\n';
        message += '⚠️ *Результаты носят прогнозный характер и могут отличаться от реальных*';

        return message;
    }

    private getPositionEmoji(position: number): string {
        const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        return emojis[position - 1] || `${position}.`;
    }

    async analyzeDriverForRace(driverName: string, trackName: string): Promise<string> {
        const prompt = `
Проанализируй шансы пилота ${driverName} на предстоящей гонке на трассе ${trackName}.

Учти:
- Текущую форму пилота в сезоне
- Историческую производительность на данной трассе
- Сильные и слабые стороны его команды
- Характеристики трассы

Дай краткий но содержательный анализ (2-3 абзаца).`;

        return await askAI(prompt, this.openRouterKey);
    }

    async analyzePitStopStrategy(trackName: string): Promise<string> {
        const prompt = `
Проанализируй оптимальную стратегию пит-стопов для гонки на трассе ${trackName}.

Рассмотри:
- Характеристики трассы (износ шин, время прохождения пит-лейна)
- Исторические данные по стратегиям
- Текущие правила и доступные составы шин
- Факторы погоды и безопасности

Дай рекомендации по оптимальной стратегии.`;

        return await askAI(prompt, this.openRouterKey);
    }
}