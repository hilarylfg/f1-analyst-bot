import TelegramBot, {type Message} from 'node-telegram-bot-api';
import {analyzeDriverComparison} from './modules/analysis/comparison.js';
import {askAI} from './modules/ai/open-router.js';
import {findOrCreateUser, grantConsent} from './core/user-service.js';
import {PrismaClient} from '@prisma/client';

const prisma = new PrismaClient();

export class F1Bot {
    private bot: TelegramBot;
    private openRouterKey?: string;

    constructor(token: string, openRouterKey?: string) {
        this.bot = new TelegramBot(token, {polling: true});
        this.openRouterKey = openRouterKey;
    }

    // Middleware for user creation and message logging (TZ: 3.9)
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

        // Onboarding and Consent (TZ: 3.1)
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

        // Help command (TZ: 3.3)
        this.bot.onText(/\/help/, (msg) => {
            // === ИСПРАВЛЕННАЯ СТРОКА ===
            const helpText = `*Доступные команды:*\n\n` +
                `\`/compare <Пилот1> vs <Пилот2>\` - Сравнение двух пилотов по ключевым показателям.\n\n` +
                `\`/ask <Ваш вопрос>\` - Задать вопрос ИИ-аналитику о Формуле 1.\n\n` +
                `\`/reset\` - Сбросить контекст диалога с ИИ (в разработке).\n\n` +
                `\`/profile\` - Ваши настройки (в разработке).\n\n` +
                `\`/privacy\` - Информация о политике конфиденциальности.`;
            // ============================
            this.bot.sendMessage(msg.chat.id, helpText, {parse_mode: 'Markdown'});
        });

        // Core analysis feature
        // Обновленный обработчик команды /compare
        this.bot.onText(/\/compare (.+) vs (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;

            // 1. Проверяем, есть ли у нас ключ для доступа к ИИ
            if (!this.openRouterKey) {
                await this.bot.sendMessage(chatId, "❌ Команда сравнения недоступна, так как не настроен API ключ для ИИ.");
                return;
            }

            // 2. Проверяем, что команда введена корректно
            if (!match || !match[1] || !match[2]) {
                await this.bot.sendMessage(chatId, "Пожалуйста, используйте формат: `/compare Пилот1 vs Пилот2`");
                return;
            }

            const driver1 = match[1].trim();
            const driver2 = match[2].trim();

            try {
                // 3. Отправляем сообщение о начале анализа и показываем "печать..."
                await this.bot.sendMessage(chatId, `⏳ Нейросеть анализирует: **${driver1}** vs **${driver2}**...`, { parse_mode: 'Markdown' });
                await this.bot.sendChatAction(chatId, 'typing');

                // 4. Вызываем новую функцию анализа и передаем ей ключ
                const textReport = await analyzeDriverComparison(driver1, driver2, this.openRouterKey);

                // 5. Отправляем готовый отчет от ИИ пользователю
                await this.bot.sendMessage(chatId, textReport, { parse_mode: 'Markdown' });

            } catch (error: any) {
                console.error("Ошибка при сравнении пилотов через ИИ:", error);
                await this.bot.sendMessage(chatId, `❌ Произошла ошибка во время анализа: ${error.message}`);
            }
        });

        // AI Agent feature (TZ: 3.2)
        this.bot.onText(/\/ask (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            if (!this.openRouterKey) return this.bot.sendMessage(chatId, "Извините, функция ИИ-аналитика временно недоступна.");
            if (!match || !match[1]) return this.bot.sendMessage(chatId, 'Неверный формат. Используйте: /ask Ваш вопрос');

            try {
                await this.bot.sendChatAction(chatId, 'typing');
                const answer = await askAI(match[1].trim(), this.openRouterKey);
                await this.bot.sendMessage(chatId, answer, {parse_mode: 'Markdown'});
            } catch (error: any) {
                await this.bot.sendMessage(chatId, `❌ Ошибка при обращении к ИИ: ${error.message}`);
            }
        });

        // Stubs for other commands from TZ
        this.bot.onText(/\/reset/, (msg) => this.bot.sendMessage(msg.chat.id, "Команда /reset в разработке. Она будет очищать контекст диалога с ИИ."));
        this.bot.onText(/\/profile/, (msg) => this.bot.sendMessage(msg.chat.id, "Команда /profile в разработке. Здесь можно будет настроить язык и часовой пояс."));
        this.bot.onText(/\/privacy/, (msg) => this.bot.sendMessage(msg.chat.id, "Команда /privacy в разработке. Здесь можно будет управлять согласиями на обработку данных."));
        this.bot.onText(/\/feedback/, (msg) => this.bot.sendMessage(msg.chat.id, "Команда /feedback в разработке. Здесь можно будет оставить отзыв о работе бота."));
    }

    public start() {
        this.setupCommands();
    }
}