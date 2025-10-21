import TelegramBot, {type Message} from 'node-telegram-bot-api';
import {analyzeDriverComparison} from './modules/analysis/comparison.js';
import {askAI} from './modules/ai/open-router.js';
import {findOrCreateUser, grantConsent} from './core/user-service.js';
import {PrismaClient} from '@prisma/client';
import {AIRacePredictor} from "./modules/analysis/ai-race-predictor.js";
import { championship } from './modules/stats/championship.js';
import { driverStats } from './modules/stats/driver-stats.js';
import { f1Data } from './core/parser.js';

const prisma = new PrismaClient();

export class F1Bot {
    private bot: TelegramBot;
    private openRouterKey?: string;
    private aiPredictor?: AIRacePredictor;

    constructor(token: string, openRouterKey?: string) {
        this.bot = new TelegramBot(token, {polling: true});
        this.openRouterKey = openRouterKey;
        this.aiPredictor = openRouterKey ? new AIRacePredictor(openRouterKey) : undefined;
    }

    private async onAnyMessage(msg: Message) {
        if (!msg.from || !msg.text) return;

        try {
            const user = await findOrCreateUser(msg.from);
            await prisma.message.create({
                data: {
                    userId: user.id,
                    role: 'user',
                    content: msg.text,
                }
            });
        } catch (error) {
            console.error("Ошибка в onAnyMessage middleware:", error);
        }
    }

    private setupCommands() {
        this.bot.on('message', this.onAnyMessage.bind(this));

        this.bot.onText(/\/start/, async (msg) => {
            const chatId = msg.chat.id;
            const policyText = "Для работы мне нужно обрабатывать ваши запросы. Пожалуйста, примите нашу политику конфиденциальности.";
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{text: "✅ Принять политику v1.0", callback_data: "consent_accept_v1.0"}],
                        [{text: "📄 Читать политику (ссылка)", url: "https://github.com/hilarylfg"}]
                    ]
                }
            };
            await this.bot.sendMessage(chatId, `🏎️ Добро пожаловать в F1 Analyst Bot!\n\n${policyText}`, options);
        });

        this.bot.on('callback_query', async (query) => {
            if (query.data === 'consent_accept_v1.0' && query.from && query.message) {
                const user = await findOrCreateUser(query.from);
                await grantConsent(user.id, '1.0');
                await this.bot.answerCallbackQuery(query.id, {text: "Спасибо! Согласие принято."});
                await this.bot.editMessageText("Согласие принято! Теперь вы можете пользоваться ботом.", {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id,
                });
                await this.bot.sendMessage(query.message.chat.id, "Используйте /help, чтобы увидеть список команд.");
            }
        });

        // === НОВЫЕ КОМАНДЫ ===

        // Таблица чемпионата пилотов
        this.bot.onText(/\/standings/, async (msg) => {
            const chatId = msg.chat.id;
            try {
                const standings = championship.formatDriverStandings(15);
                await this.bot.sendMessage(chatId, standings, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Ошибка /standings:', error);
                await this.bot.sendMessage(chatId, '❌ Ошибка при получении таблицы чемпионата.');
            }
        });

        // Таблица конструкторов
        this.bot.onText(/\/constructors/, async (msg) => {
            const chatId = msg.chat.id;
            try {
                const standings = championship.formatTeamStandings();
                await this.bot.sendMessage(chatId, standings, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Ошибка /constructors:', error);
                await this.bot.sendMessage(chatId, '❌ Ошибка при получении таблицы конструкторов.');
            }
        });

        // Профиль пилота
        this.bot.onText(/\/driver (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const driverName = match?.[1];

            if (!driverName) {
                return this.bot.sendMessage(chatId, 'Использование: /driver [имя пилота]');
            }

            try {
                const profile = driverStats.getDriverProfile(driverName);
                await this.bot.sendMessage(chatId, profile, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Ошибка /driver:', error);
                await this.bot.sendMessage(chatId, '❌ Ошибка при получении профиля пилота.');
            }
        });

        // Форма пилота
        this.bot.onText(/\/form (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const driverName = match?.[1];

            if (!driverName) {
                return this.bot.sendMessage(chatId, 'Использование: /form [имя пилота]');
            }

            try {
                const form = driverStats.getDriverForm(driverName);
                await this.bot.sendMessage(chatId, form, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Ошибка /form:', error);
                await this.bot.sendMessage(chatId, '❌ Ошибка при получении формы пилота.');
            }
        });

        // Список всех пилотов
        this.bot.onText(/\/drivers/, async (msg) => {
            const chatId = msg.chat.id;
            try {
                const drivers = f1Data.getAllDrivers();
                let output = '👥 **Все пилоты сезона 2025:**\n\n';
                drivers.forEach((driver, i) => {
                    output += `${i + 1}. ${driver}\n`;
                });
                await this.bot.sendMessage(chatId, output, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Ошибка /drivers:', error);
                await this.bot.sendMessage(chatId, '❌ Ошибка при получении списка пилотов.');
            }
        });

        this.bot.onText(/\/help/, (msg) => {
            const helpText = `*🏎️ F1 Analyst Bot - Доступные команды:*\n\n` +
                `*📊 СТАТИСТИКА (на основе реальных данных сезона 2025):*\n` +
                `/standings - Таблица чемпионата пилотов\n` +
                `/constructors - Таблица конструкторов\n` +
                `/driver [имя] - Полный профиль пилота\n` +
                `/form [имя] - Форма пилота (последние 5 гонок)\n` +
                `/drivers - Список всех пилотов\n\n` +
                `*🤖 ИИ-АНАЛИЗ:*\n` +
                `/compare [пилот1] [пилот2] - Сравнение двух пилотов\n` +
                `/ask [вопрос] - Задать вопрос о Формуле 1\n` +
                `/predict [трасса] - Предикция результатов гонки\n\n` +
                `*💡 Примеры:*\n` +
                `\`/driver Piastri\`\n` +
                `\`/form Norris\`\n` +
                `\`/compare Verstappen Norris\`\n` +
                `\`/ask Почему McLaren так быстр в этом сезоне?\``;

            this.bot.sendMessage(msg.chat.id, helpText, {parse_mode: 'Markdown'});
        });

        this.bot.onText(/\/compare (.+) (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.openRouterKey) {
                return this.bot.sendMessage(chatId, "Команда /compare недоступна: OpenRouter API ключ не настроен.");
            }
            const driver1 = match?.[1];
            const driver2 = match?.[2];
            if (!driver1 || !driver2) {
                return this.bot.sendMessage(chatId, "Использование: /compare [пилот1] [пилот2]");
            }

            await this.bot.sendMessage(chatId, "🔄 Анализирую реальные данные сезона 2025...");
            try {
                const analysis = await analyzeDriverComparison(driver1, driver2, this.openRouterKey);
                await this.bot.sendMessage(chatId, analysis, {parse_mode: 'Markdown'});
            } catch (error) {
                console.error("Ошибка /compare:", error);
                await this.bot.sendMessage(chatId, "Произошла ошибка при сравнении пилотов.");
            }
        });

        this.bot.onText(/\/ask (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.openRouterKey) {
                return this.bot.sendMessage(chatId, "Команда /ask недоступна: OpenRouter API ключ не настроен.");
            }
            const question = match?.[1];
            if (!question) {
                return this.bot.sendMessage(chatId, "Использование: /ask [ваш вопрос]");
            }

            await this.bot.sendMessage(chatId, "🤔 Обрабатываю ваш вопрос...");
            try {
                const answer = await askAI(question, this.openRouterKey, true);
                await this.bot.sendMessage(chatId, answer, {parse_mode: 'Markdown'});
            } catch (error) {
                console.error("Ошибка /ask:", error);
                await this.bot.sendMessage(chatId, "Произошла ошибка при обработке вопроса.");
            }
        });

        this.bot.onText(/\/predict (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.aiPredictor) {
                return this.bot.sendMessage(chatId, "Команда /predict недоступна: OpenRouter API ключ не настроен.");
            }
            const track = match?.[1];
            if (!track) {
                return this.bot.sendMessage(chatId, "Использование: /predict [название трассы]");
            }

            await this.bot.sendMessage(chatId, "🔮 Анализирую реальные данные сезона и составляю предикт...");
            try {
                const prediction = await this.aiPredictor.predictRaceResults(track);
                await this.bot.sendMessage(chatId, prediction.analysis, {parse_mode: 'Markdown'});
            } catch (error) {
                console.error("Ошибка /predict:", error);
                await this.bot.sendMessage(chatId, "Произошла ошибка при создании предикции.");
            }
        });
    }

    start() {
        this.setupCommands();
        console.log("✅ F1 Analyst Bot запущен с поддержкой CSV-данных сезона 2025!");
    }
}