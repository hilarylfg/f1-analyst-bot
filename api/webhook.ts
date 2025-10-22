import type { VercelRequest, VercelResponse } from '@vercel/node';
import TelegramBot from 'node-telegram-bot-api';

const token = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new TelegramBot(token);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'POST') {
        try {
            const update = req.body;

            if (!update.message) {
                return res.status(200).send('OK');
            }

            const msg = update.message;
            const chatId = msg.chat.id;
            const text = msg.text || '';

            if (text === '/start') {
                await bot.sendMessage(chatId, '🏎️ F1 Analyst Bot запущен на Vercel!');
            }

            return res.status(200).send('OK');
        } catch (error) {
            console.error('Ошибка webhook:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    return res.status(200).json({
        status: 'F1 Analyst Bot running on Vercel',
        timestamp: new Date().toISOString()
    });
}