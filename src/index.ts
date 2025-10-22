import { F1Bot } from './bot.js';
import * as dotenv from 'dotenv';
import type { VercelRequest, VercelResponse } from '@vercel/node';

dotenv.config();

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const openRouterKey = process.env.OPENROUTER_API_KEY;

if (!telegramToken) {
    throw new Error('FATAL: TELEGRAM_BOT_TOKEN не найден в .env файле!');
}

const bot = new F1Bot(telegramToken, openRouterKey, { polling: false });

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        await bot.getInstance().processUpdate(req.body);
    } catch (error) {
        console.error('Ошибка обработки обновления:', error);
    }

    res.status(200).send('OK');
}