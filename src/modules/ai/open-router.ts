import axios from 'axios';

export async function askAI(question: string, apiKey: string): Promise<string> {
    const systemPrompt = `Вы — ведущий AI-аналитик Формулы 1, обладающий глубокими знаниями в области автоспорта.

Ваша основная задача — предоставлять пользователям исчерпывающие, точные и увлекательные ответы на любые вопросы, касающиеся Формулы 1. Это включает в себя анализ стилей вождения, сравнение пилотов разных эпох, обсуждение технических аспектов болидов и истории гонок.

Все ответы должны быть на русском языке. Стремитесь к краткости, но при этом сохраняйте содержательность и глубину информации. Учитывайте, что ваши ответы будут отображаться в Telegram, поэтому используйте форматирование, совместимое с этой платформой (заголовки из Markdown не поддерживаются).`;

    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'x-ai/grok-4-fast:free',
                messages: [
                    {role: 'system', content: systemPrompt},
                    {role: 'user', content: question},
                ],
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