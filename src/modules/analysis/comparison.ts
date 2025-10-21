import { askAI } from '../ai/open-router.js';
import { contextBuilder } from '../stats/context-builder.js';

export async function analyzeDriverComparison(driver1: string, driver2: string, openRouterKey: string): Promise<string> {
    const realDataContext = contextBuilder.getDriverComparisonContext(driver1, driver2);

    const currentDate = new Date().toISOString().split('T')[0];

    const prompt = `
Текущая дата: ${currentDate}

${realDataContext}

ЗАДАЧА:
Проведи детальное сравнение этих двух пилотов на основе РЕАЛЬНЫХ ДАННЫХ выше.

**КРИТИЧЕСКИ ВАЖНО:**
- Используй ТОЛЬКО данные, предоставленные выше
- НЕ выдумывай статистику — все цифры уже есть в контексте
- Если данных недостаточно, так и напиши

Проанализируй:
1. **Текущее положение в чемпионате** — кто впереди и почему
2. **Стабильность и форма** — сравни последние 5 гонок
3. **Сильные стороны** — в чём каждый из них хорош (квалификация, гонка, обгоны)
4. **Ключевые различия** — что выделяет одного из них
5. **Краткий вывод** — кто имеет преимущество в этом сезоне

Ответ должен быть структурированным, **кратким** (не более 3500 символов) и на русском языке.
Используй Markdown для форматирования, но БЕЗ заголовков уровня # (только жирный текст и списки).
`;

    return await askAI(prompt, openRouterKey);
}