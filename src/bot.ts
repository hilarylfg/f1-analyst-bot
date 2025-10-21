import TelegramBot, {type Message} from 'node-telegram-bot-api';
import {analyzeDriverComparison} from './modules/analysis/comparison.js';
import {askAI} from './modules/ai/open-router.js';
import {findOrCreateUser, grantConsent} from './core/user-service.js';
import {PrismaClient} from '@prisma/client';
import {AIRacePredictor} from "./modules/analysis/ai-race-predictor.js";

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

        this.bot.onText(/\/help/, (msg) => {
            const helpText = `*Доступные команды:*\n\n` +
                `\`/compare hamilton vs alonso\` - Сравнение двух пилотов по ключевым показателям.\n\n` +
                `\`/ask в чем была особенность граунд-эффекта в 80-х? \` - Задать вопрос ИИ-аналитику о Формуле 1.\n\n` +
                `\`/predict monaco\` - Предугадает исход будущей гонки\n\n` +
                `\`/reset\` - Сбросить контекст диалога с ИИ (в разработке).\n\n` +
                `\`/profile\` - Ваши настройки (в разработке).\n\n` +
                `\`/privacy\` - Информация о политике конфиденциальности.`;
            // ============================
            this.bot.sendMessage(msg.chat.id, helpText, {parse_mode: 'Markdown'});
        });

        this.bot.onText(/\/compare (.+) vs (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;

            if (!this.openRouterKey) {
                await this.bot.sendMessage(chatId, "❌ Команда сравнения недоступна, так как не настроен API ключ для ИИ.");
                return;
            }

            if (!match || !match[1] || !match[2]) {
                await this.bot.sendMessage(chatId, "Пожалуйста, используйте формат: `/compare Пилот1 vs Пилот2`");
                return;
            }

            const driver1 = match[1].trim();
            const driver2 = match[2].trim();

            try {
                // 3. Отправляем сообщение о начале анализа и показываем "печать..."
                await this.bot.sendMessage(chatId, `⏳ Нейросеть анализирует: **${driver1}** vs **${driver2}**...`, {parse_mode: 'Markdown'});
                await this.bot.sendChatAction(chatId, 'typing');

                // 4. Вызываем новую функцию анализа и передаем ей ключ
                const textReport = await analyzeDriverComparison(driver1, driver2, this.openRouterKey);

                // 5. Отправляем готовый отчет от ИИ пользователю
                await this.bot.sendMessage(chatId, textReport, {parse_mode: 'Markdown'});

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

        this.bot.onText(/\/predict\s*(.*)/, async (msg, match) => {
            const chatId = msg.chat.id;

            if (!this.aiPredictor) {
                await this.bot.sendMessage(chatId, "❌ Функция предикции недоступна. Не настроен API ключ для ИИ.");
                return;
            }

            try {
                if (!match || !match[1] || match[1].trim() === '') {
                    await this.bot.sendMessage(chatId,
                        `🏁 **Предикция результатов гонки F1**\n\n` +
                        `Использование: \`/predict <название_трассы>\`\n\n` +
                        `**Примеры:**\n` +
                        `• \`/predict monaco\` - Гран-при Монако\n` +
                        `• \`/predict silverstone\` - Гран-при Великобритании\n` +
                        `• \`/predict spa\` - Гран-при Бельгии\n` +
                        `• \`/predict suzuka\` - Гран-при Японии\n\n` +
                        `🤖 ИИ найдет актуальную информацию и составит предикцию!`,
                        {parse_mode: 'Markdown'}
                    );
                    return;
                }

                const trackName = match[1].trim();

                const statusMessage = await this.bot.sendMessage(chatId, '🔍 Ищу актуальные данные о пилотах F1...');
                await this.bot.sendChatAction(chatId, 'typing');

                const result = await this.aiPredictor.predictRaceResults(trackName);

                await this.bot.editMessageText('📊 Анализирую данные и составляю предикцию...', {
                    chat_id: chatId,
                    message_id: statusMessage.message_id
                });

                const formattedMessage = this.aiPredictor.formatPredictionMessage(result);

                await this.bot.deleteMessage(chatId, statusMessage.message_id);
                await this.bot.sendMessage(chatId, formattedMessage, {parse_mode: 'Markdown'});

            } catch (error: any) {
                console.error('Ошибка в команде predict:', error);
                await this.bot.sendMessage(chatId,
                    `❌ Произошла ошибка при составлении предикции: ${error.message}\n\n` +
                    `Возможные причины:\n` +
                    `• Проблемы с подключением к ИИ\n` +
                    `• Неизвестная трасса\n` +
                    `• Временная недоступность данных F1`
                );
            }
        });

        this.bot.onText(/\/reset/, (msg) => this.bot.sendMessage(msg.chat.id, "Команда /reset в разработке. Она будет очищать контекст диалога с ИИ."));
        this.bot.onText(/\/profile/, (msg) => this.bot.sendMessage(msg.chat.id, "Команда /profile в разработке. Здесь можно будет настроить язык и часовой пояс."));
        this.bot.onText(/\/privacy/, (msg) => this.bot.sendMessage(msg.chat.id, "Команда /privacy в разработке. Здесь можно будет управлять согласиями на обработку данных."));
        this.bot.onText(/\/feedback/, (msg) => this.bot.sendMessage(msg.chat.id, "Команда /feedback в разработке. Здесь можно будет оставить отзыв о работе бота."));
    }

    public start() {
        this.setupCommands();
    }
}