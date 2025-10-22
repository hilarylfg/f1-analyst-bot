import TelegramBot, {type Message} from 'node-telegram-bot-api';
import {analyzeDriverComparison} from './modules/analysis/comparison.js';
import {askAI} from './modules/ai/open-router.js';
import {findOrCreateUser, grantConsent} from './core/user-service.js';
import {PrismaClient} from '@prisma/client';
import {AIRacePredictor} from "./modules/analysis/ai-race-predictor.js";
import { championship } from './modules/stats/championship.js';
import { driverStats } from './modules/stats/driver-stats.js';
import {f1Data} from "./modules/openf1/openf1-parser.js";

const prisma = new PrismaClient();

export class F1Bot {
    private bot: TelegramBot;
    private openRouterKey?: string;
    private aiPredictor?: AIRacePredictor;
    private isDataReady: boolean = false;

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

    private splitMessage(text: string, maxLength: number): string[] {
        const parts: string[] = [];
        let current = '';

        text.split('\n').forEach(line => {
            if ((current + line + '\n').length > maxLength) {
                parts.push(current);
                current = line + '\n';
            } else {
                current += line + '\n';
            }
        });

        if (current) parts.push(current);
        return parts;
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
                const standings = championship.formatDriverStandings();
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
                `*📊 СТАТИСТИКА (актуальные данные через OpenF1 API):*\n` +
                `/standings - Таблица чемпионата пилотов\n` +
                `/constructors - Таблица конструкторов\n` +
                `/driver [имя] - Полный профиль пилота\n` +
                `/form [имя] - Форма пилота (последние 5 гонок)\n` +
                `/points [имя] - Детальная разбивка очков пилота\n` +
                `/drivers - Список всех пилотов\n` +
                `/teams - Список всех команд с очками\n\n` +
                `*🤖 ИИ-АНАЛИЗ:*\n` +
                `/compare [пилот1] [пилот2] - Сравнение двух пилотов\n` +
                `/ask [вопрос] - Задать вопрос о Формуле 1\n` +
                `/predict [трасса] - Предикт результатов гонки\n\n` +
                `*💡 Примеры:*\n` +
                `\`/driver Piastri\`\n` +
                `\`/form Norris\`\n` +
                `\`/points Hamilton\`\n` +
                `\`/teams\`\n` +
                `\`/compare Verstappen Norris\`\n` +
                `\`/ask Почему McLaren так быстр в этом сезоне?\`\n\n` +
                `*🔧 Дебаг:*\n` +
                `/check\\_driver [имя] - Детальная проверка пилота\n` +
                `/check\\_team [команда] - Детальная проверка команды\n\n` +
                `_Данные обновляются автоматически каждые 30 минут_`;

            this.bot.sendMessage(msg.chat.id, helpText, {parse_mode: 'Markdown'});
        });

        // Список всех команд с очками
        this.bot.onText(/\/teams/, async (msg) => {
            const chatId = msg.chat.id;

            if (!this.isDataReady) {
                return this.bot.sendMessage(chatId, '⏳ Данные ещё загружаются...');
            }

            try {
                const allResults = f1Data.getRaceResults();

                const teamPoints = new Map<string, {
                    total: number,
                    race: number,
                    sprint: number,
                    drivers: Set<string>
                }>();

                allResults.forEach(r => {
                    if (!teamPoints.has(r.team)) {
                        teamPoints.set(r.team, {
                            total: 0,
                            race: 0,
                            sprint: 0,
                            drivers: new Set()
                        });
                    }

                    const team = teamPoints.get(r.team)!;
                    team.total += r.points;
                    if (r.isSprint) {
                        team.sprint += r.points;
                    } else {
                        team.race += r.points;
                    }
                    team.drivers.add(r.driver);
                });

                const sortedTeams = Array.from(teamPoints.entries())
                    .sort((a, b) => b[1].total - a[1].total);

                let output = '🏁 **ВСЕ КОМАНДЫ СЕЗОНА 2025**\n\n';

                sortedTeams.forEach(([teamName, data], index) => {
                    const drivers = Array.from(data.drivers).join(', ');
                    output += `**${index + 1}. ${teamName}** — ${data.total} очков\n`;
                    output += `   👥 Пилоты: ${drivers}\n\n`;
                });

                await this.bot.sendMessage(chatId, output, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Ошибка /teams:', error);
                await this.bot.sendMessage(chatId, '❌ Ошибка при получении списка команд.');
            }
        });

        // Проверка команды (дебаг)
        this.bot.onText(/\/check_team (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;

            if (!this.isDataReady) {
                return this.bot.sendMessage(chatId, '⏳ Данные ещё загружаются...');
            }

            const teamName = match?.[1];
            if (!teamName) {
                return this.bot.sendMessage(chatId, 'Использование: /check_team [название команды]');
            }

            try {
                const allResults = f1Data.getRaceResults();

                // Ищем результаты команды
                const teamResults = allResults.filter(r =>
                    r.team.toLowerCase().includes(teamName.toLowerCase())
                );

                if (teamResults.length === 0) {
                    return this.bot.sendMessage(chatId, `❌ Команда "${teamName}" не найдена.`);
                }

                const fullTeamName = teamResults[0].team;

                // Подсчёт очков
                const totalPoints = teamResults.reduce((sum, r) => sum + r.points, 0);
                const racePoints = teamResults.filter(r => !r.isSprint).reduce((sum, r) => sum + r.points, 0);
                const sprintPoints = teamResults.filter(r => r.isSprint).reduce((sum, r) => sum + r.points, 0);

                // Пилоты команды
                const driversSet = new Set(teamResults.map(r => r.driver));
                const drivers = Array.from(driversSet);

                // Очки по пилотам
                const driverPoints = new Map<string, number>();
                teamResults.forEach(r => {
                    const current = driverPoints.get(r.driver) || 0;
                    driverPoints.set(r.driver, current + r.points);
                });

                let output = `🏎️ **${fullTeamName}**\n\n`;
                output += `📊 **ИТОГО ОЧКОВ: ${totalPoints}**\n`;
                output += `   🏁 Из гонок: ${racePoints}\n`;
                output += `   🏃 Из спринтов: ${sprintPoints}\n\n`;

                output += `👥 **ПИЛОТЫ:**\n`;
                drivers.forEach(driver => {
                    const points = driverPoints.get(driver) || 0;
                    output += `   • ${driver}: ${points} очков\n`;
                });

                output += `\n📋 **ВСЕ РЕЗУЛЬТАТЫ (в хронологическом порядке):**\n\n`;

                teamResults.forEach((r, index) => {
                    const type = r.isSprint ? '🏃 Sprint' : '🏁 Race';
                    const prelim = r.isPreliminary ? ' ⚠️' : '';
                    const dateStr = new Date(r.date).toISOString().split('T')[0];

                    output += `${index + 1}. **${dateStr}** ${type} - ${r.track}\n`;
                    output += `   ${r.driver}: P${r.position} → +${r.points} очков${prelim}\n\n`;
                });

                output += `_Всего результатов: ${teamResults.length}_`;

                if (output.length > 4000) {
                    const parts = this.splitMessage(output, 4000);
                    for (const part of parts) {
                        await this.bot.sendMessage(chatId, part, { parse_mode: 'Markdown' });
                    }
                } else {
                    await this.bot.sendMessage(chatId, output, { parse_mode: 'Markdown' });
                }
            } catch (error) {
                console.error('Ошибка /check_team:', error);
                await this.bot.sendMessage(chatId, '❌ Ошибка при проверке команды.');
            }
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

        // Детальная информация об очках пилота
        this.bot.onText(/\/points (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;

            if (!this.isDataReady) {
                return this.bot.sendMessage(chatId, '⏳ Данные ещё загружаются, подождите немного...');
            }

            const driverName = match?.[1];

            if (!driverName) {
                return this.bot.sendMessage(chatId, 'Использование: /points [имя пилота]');
            }

            try {
                const results = f1Data.getDriverResults(driverName);

                if (results.length === 0) {
                    return this.bot.sendMessage(chatId, `❌ Пилот "${driverName}" не найден в базе данных.`);
                }

                const driver = results[0].driver;
                const team = results[0].team;

                // Разделяем на гонки и спринты
                const raceResults = results.filter(r => !r.isSprint);
                const sprintResults = results.filter(r => r.isSprint);

                // Подсчёт статистики
                const totalPoints = results.reduce((sum, r) => sum + r.points, 0);
                const racePoints = raceResults.reduce((sum, r) => sum + r.points, 0);
                const sprintPoints = sprintResults.reduce((sum, r) => sum + r.points, 0);

                const wins = raceResults.filter(r => r.position === '1').length;
                const podiums = raceResults.filter(r => ['1', '2', '3'].includes(r.position)).length;

                const sprintWins = sprintResults.filter(r => r.position === '1').length;
                const sprintPodiums = sprintResults.filter(r => ['1', '2', '3'].includes(r.position)).length;

                let output = `🏎️ **${driver}** (${team})\n\n`;
                output += `📊 **ИТОГО ОЧКОВ: ${totalPoints}**\n`;
                output += `   🏁 Из гонок: ${racePoints} (${raceResults.length} гонок)\n`;
                output += `   🏃 Из спринтов: ${sprintPoints} (${sprintResults.length} спринтов)\n\n`;

                output += `🏆 **СТАТИСТИКА ГОНОК:**\n`;
                output += `   Победы: ${wins}\n`;
                output += `   Подиумы: ${podiums}\n\n`;

                if (sprintResults.length > 0) {
                    output += `🏃 **СТАТИСТИКА СПРИНТОВ (не считаются в победах):**\n`;
                    output += `   Победы в спринтах: ${sprintWins}\n`;
                    output += `   Подиумы в спринтах: ${sprintPodiums}\n\n`;
                }

                output += `📋 **ДЕТАЛЬНАЯ РАЗБИВКА ПО ГОНКАМ:**\n\n`;

                // Группируем результаты по трассам (могут быть гонка + спринт на одной трассе)
                const trackMap = new Map<string, { race?: typeof results[0], sprint?: typeof results[0] }>();

                results.forEach(r => {
                    if (!trackMap.has(r.track)) {
                        trackMap.set(r.track, {});
                    }
                    const track = trackMap.get(r.track)!;
                    if (r.isSprint) {
                        track.sprint = r;
                    } else {
                        track.race = r;
                    }
                });

                trackMap.forEach((data, track) => {
                    output += `**${track}:**\n`;

                    if (data.race) {
                        const emoji = data.race.position === '1' ? '🥇' :
                            data.race.position === '2' ? '🥈' :
                                data.race.position === '3' ? '🥉' : '🏁';
                        const preliminary = data.race.isPreliminary ? ' ⚠️ _предварительно_' : '';
                        output += `   ${emoji} Гонка: P${data.race.position} → **+${data.race.points} очков**${preliminary}\n`;
                    }

                    if (data.sprint) {
                        const emoji = data.sprint.position === '1' ? '🥇' :
                            data.sprint.position === '2' ? '🥈' :
                                data.sprint.position === '3' ? '🥉' : '🏃';
                        const preliminary = data.sprint.isPreliminary ? ' ⚠️ _предварительно_' : '';
                        output += `   ${emoji} Спринт: P${data.sprint.position} → **+${data.sprint.points} очков**${preliminary}\n`;
                    }

                    output += '\n';
                });

                output += `_Всего этапов: ${trackMap.size}_`;

                await this.bot.sendMessage(chatId, output, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Ошибка /points:', error);
                await this.bot.sendMessage(chatId, '❌ Ошибка при получении информации об очках.');
            }
        });

        this.bot.onText(/\/check_duplicates/, async (msg) => {
            const chatId = msg.chat.id;

            if (!this.isDataReady) {
                return this.bot.sendMessage(chatId, '⏳ Данные ещё загружаются...');
            }

            try {
                const allResults = f1Data.getRaceResults();

                // Собираем всех уникальных пилотов по имени
                const driverNames = new Map<string, Set<number>>();
                allResults.forEach(r => {
                    if (!driverNames.has(r.driver)) {
                        driverNames.set(r.driver, new Set());
                    }
                    driverNames.get(r.driver)!.add(r.no);
                });

                // Ищем дубликаты по номеру
                const driversByNumber = new Map<number, Set<string>>();
                allResults.forEach(r => {
                    if (!driversByNumber.has(r.no)) {
                        driversByNumber.set(r.no, new Set());
                    }
                    driversByNumber.get(r.no)!.add(r.driver);
                });

                let output = '🔍 **ПРОВЕРКА ДУБЛИКАТОВ ПИЛОТОВ**\n\n';

                // Находим пилотов с разными именами под одним номером
                const duplicates: string[] = [];
                driversByNumber.forEach((names, number) => {
                    if (names.size > 1) {
                        const nameList = Array.from(names).join(' / ');

                        // Считаем очки для каждого имени
                        const pointsInfo: string[] = [];
                        names.forEach(name => {
                            const results = allResults.filter(r => r.no === number && r.driver === name);
                            const points = results.reduce((sum, r) => sum + r.points, 0);
                            const races = results.length;
                            pointsInfo.push(`  • "${name}": ${points} очков (${races} результатов)`);
                        });

                        duplicates.push(`**#${number}:** ${nameList}\n${pointsInfo.join('\n')}`);
                    }
                });

                if (duplicates.length > 0) {
                    output += '⚠️ **НАЙДЕНЫ ДУБЛИКАТЫ:**\n\n';
                    output += duplicates.join('\n\n');
                } else {
                    output += '✅ Дубликатов не найдено';
                }

                await this.bot.sendMessage(chatId, output, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Ошибка /check_duplicates:', error);
                await this.bot.sendMessage(chatId, '❌ Ошибка при проверке дубликатов.');
            }
        });

        this.bot.onText(/\/check_driver (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;

            if (!this.isDataReady) {
                return this.bot.sendMessage(chatId, '⏳ Данные ещё загружаются...');
            }

            const driverName = match?.[1];
            if (!driverName) {
                return this.bot.sendMessage(chatId, 'Использование: /check_driver [имя]');
            }

            try {
                const results = f1Data.getDriverResults(driverName);

                if (results.length === 0) {
                    return this.bot.sendMessage(chatId, `❌ Пилот "${driverName}" не найден.`);
                }

                const driver = results[0].driver;
                const driverNo = results[0].no;

                let output = `🔍 **ДЕТАЛЬНАЯ ПРОВЕРКА: ${driver} (#${driverNo})**\n\n`;

                const teamPoints = new Map<string, number>();
                results.forEach(r => {
                    const current = teamPoints.get(r.team) || 0;
                    teamPoints.set(r.team, current + r.points);
                });

                output += `📊 **ОЧКИ ПО КОМАНДАМ:**\n`;
                teamPoints.forEach((points, team) => {
                    output += `   ${team}: ${points} очков\n`;
                });

                output += `\n📋 **ВСЕ РЕЗУЛЬТАТЫ (в хронологическом порядке):**\n\n`;

                results.forEach((r, index) => {
                    const type = r.isSprint ? '🏃 Sprint' : '🏁 Race';
                    const prelim = r.isPreliminary ? ' ⚠️' : '';
                    const dateStr = new Date(r.date).toISOString().split('T')[0];

                    output += `${index + 1}. **${dateStr}** ${type} - ${r.track}\n`;
                    output += `   P${r.position} | ${r.team} | +${r.points} очков${prelim}\n\n`;
                });

                output += `\n_Всего результатов: ${results.length}_`;

                if (output.length > 4000) {
                    const parts = this.splitMessage(output, 4000);
                    for (const part of parts) {
                        await this.bot.sendMessage(chatId, part, { parse_mode: 'Markdown' });
                    }
                } else {
                    await this.bot.sendMessage(chatId, output, { parse_mode: 'Markdown' });
                }
            } catch (error) {
                console.error('Ошибка /check_driver:', error);
                await this.bot.sendMessage(chatId, '❌ Ошибка при проверке пилота.');
            }
        });
    }

    async start() {
        console.log('🚀 Запуск F1 Analyst Bot...');
        console.log('⏳ Загрузка данных из OpenF1 API...');

        await f1Data.initialize();

        this.isDataReady = f1Data.isReady();

        if (!this.isDataReady) {
            console.error('❌ Не удалось загрузить данные! Бот запущен, но команды могут не работать.');
        } else {
            console.log('✅ Данные успешно загружены!');
            console.log(`📊 Результатов: ${f1Data.getRaceResults().length}`);
            console.log(`📋 Трасс: ${f1Data.getAllTracks().length}`);
        }

        this.setupCommands();
        console.log("✅ F1 Analyst Bot запущен с OpenF1 API! Данные обновляются автоматически.");
    }
}