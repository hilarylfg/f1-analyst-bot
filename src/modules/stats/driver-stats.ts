import { f1Data } from '../../core/parser.js';
import { championship } from './championship.js';

export class DriverStatsAnalyzer {

    getDriverProfile(driverName: string): string {
        const results = f1Data.getDriverResults(driverName);

        if (results.length === 0) {
            return `❌ Пилот "${driverName}" не найден в базе данных.`;
        }

        const driver = results[0].driver;
        const team = results[0].team;
        const standing = championship.getDriverStandings().find(s => s.driver === driver);

        if (!standing) {
            return `❌ Статистика для "${driver}" не найдена.`;
        }

        // Последние 5 гонок
        const lastRaces = results.slice(-5).reverse();
        const lastRacesStr = lastRaces.map(r => {
            const pos = r.position === 'NC' || r.position === 'DQ' ? 'DNF' : `P${r.position}`;
            return `${r.track}: ${pos}`;
        }).join('\n');

        // Средняя позиция в гонке
        const finishedRaces = results.filter(r => !['NC', 'DQ'].includes(r.position));
        const avgPosition = finishedRaces.length > 0
            ? (finishedRaces.reduce((sum, r) => sum + parseInt(r.position), 0) / finishedRaces.length).toFixed(1)
            : 'N/A';

        // Процент финишей
        const finishRate = ((finishedRaces.length / results.length) * 100).toFixed(1);

        let output = `👤 **${driver}**\n`;
        output += `🏎️ Команда: ${team}\n\n`;
        output += `📊 **Статистика сезона:**\n`;
        output += `• Позиция в чемпионате: **${standing.position}**\n`;
        output += `• Очки: **${standing.points}**\n`;
        output += `• Победы: ${standing.wins} | Подиумы: ${standing.podiums}\n`;
        output += `• Поул-позиции: ${standing.polePositions} | Быстрейшие круги: ${standing.fastestLaps}\n`;
        output += `• DNF/DQ: ${standing.dnfs}\n`;
        output += `• Средняя позиция: ${avgPosition}\n`;
        output += `• Процент финишей: ${finishRate}%\n\n`;
        output += `🏁 **Последние 5 гонок:**\n${lastRacesStr}`;

        return output;
    }

    getDriverForm(driverName: string, races: number = 5): string {
        const results = f1Data.getDriverResults(driverName);

        if (results.length === 0) {
            return `❌ Пилот "${driverName}" не найден.`;
        }

        const driver = results[0].driver;
        const lastRaces = results.slice(-races).reverse();

        let output = `📈 **Форма пилота: ${driver}** (последние ${races} гонок)\n\n`;

        lastRaces.forEach((r, index) => {
            const emoji = r.position === '1' ? '🥇' :
                r.position === '2' ? '🥈' :
                    r.position === '3' ? '🥉' :
                        ['NC', 'DQ'].includes(r.position) ? '❌' : '🏁';

            const pos = ['NC', 'DQ'].includes(r.position) ? 'DNF' : `P${r.position}`;
            const grid = r.startingGrid ? `(старт: P${r.startingGrid})` : '';
            const points = r.points > 0 ? `+${r.points} очков` : '';

            output += `${emoji} **${r.track}**: ${pos} ${grid} ${points}\n`;
        });

        // Тренд
        const recentPoints = lastRaces.slice(0, 3).reduce((sum, r) => sum + r.points, 0);
        const olderPoints = lastRaces.slice(3).reduce((sum, r) => sum + r.points, 0);

        const trend = recentPoints > olderPoints ? '📈 Форма растёт' :
            recentPoints < olderPoints ? '📉 Форма падает' :
                '➡️ Стабильная форма';

        output += `\n${trend}`;

        return output;
    }
}

export const driverStats = new DriverStatsAnalyzer();