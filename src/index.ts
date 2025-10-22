import { F1Bot } from './bot.js';
import * as dotenv from 'dotenv';

dotenv.config();

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const openRouterKey = process.env.OPENROUTER_API_KEY;

if (!telegramToken) {
    throw new Error('FATAL: TELEGRAM_BOT_TOKEN не найден в .env файле!');
}
if (!process.env.DATABASE_URL) {
    throw new Error('FATAL: DATABASE_URL не найден в .env файле!');
}
if (!openRouterKey) {
    console.warn('WARN: OPENROUTER_API_KEY не найден. Функциональность /ask будет недоступна.');
}

try {
    const bot = new F1Bot(telegramToken, openRouterKey);
    void bot.start();
    console.log('✅ F1 Analyst Bot успешно запущен...');
} catch (error) {
    console.error('❌ Не удалось запустить бота:', error);
}