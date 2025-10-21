import axios from 'axios';
import { contextBuilder } from '../stats/context-builder.js';

export async function askAI(question: string, apiKey: string, includeContext: boolean = false): Promise<string> {
    const currentDate = new Date().toISOString().split('T')[0];

    let contextData = '';
    if (includeContext) {
        contextData = '\n\n' + contextBuilder.getChampionshipContext() + '\n';
    }

    const systemPrompt = `Вы — ведущий AI-аналитик Формулы 1, обладающий глубокими знаниями в области автоспорта.

Текущая дата: ${currentDate}

${contextData}

**КРИТИЧЕСКИ ВАЖНО:**
- Если вам предоставлены РЕАЛЬНЫЕ ДАННЫЕ сезона ${new Date().getFullYear()} выше, используйте ТОЛЬКО их
- НЕ полагайтесь на устаревшие данные из вашей базы знаний для сезона ${new Date().getFullYear()}
- Если данных недостаточно, честно скажите об этом
- Всегда указывайте, когда используете реальные данные vs общие знания

Ваша задача — предоставлять исчерпывающие, точные и увлекательные ответы на вопросы о Формуле 1.

Все ответы должны быть на русском языке, краткими (до 3800 символов), но содержательными.
Используйте Markdown для форматирования, совместимое с Telegram (БЕЗ заголовков уровня #).`;

    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions',
            {
                model: "tngtech/deepseek-r1t2-chimera:free",
                messages: [
                    {role: 'system', content: systemPrompt},
                    {role: 'user', content: question},
                ],
                temperature: 0.3,
                max_tokens: 2000,
            },
            {
                headers: {'Authorization': `Bearer ${apiKey}`},
            }
        );

        return response.data.choices[0].message.content.trim();
    } catch (error: any) {
        console.error("Ошибка при запросе к OpenRouter:", error.response?.data || error.message);
        throw new Error('Не удалось связаться с AI-сервисом.');
    }
}