
import { championship } from './championship.js';
import {f1Data} from "../../core/parser.js";

export class ContextBuilder {
    getChampionshipContext(): string {
        const driverStandings = championship.getDriverStandings().slice(0, 10);
        const teamStandings = championship.getTeamStandings().slice(0, 5);
        const tracks = f1Data.getAllTracks();

        let context = `=== РЕАЛЬНЫЕ ДАННЫЕ СЕЗОНА ФОРМУЛЫ 1 2025 ===\n`;
        context += `Дата: 2025-10-21\n`;
        context += `Проведено гонок: ${tracks.length}\n`;
        context += `Гонки: ${tracks.join(', ')}\n\n`;

        context += `ТАБЛИЦА ЧЕМПИОНАТА ПИЛОТОВ (топ-10):\n`;
        driverStandings.forEach(s => {
            context += `${s.position}. ${s.driver} (${s.team}) - ${s.points} очков | `;
            context += `Победы: ${s.wins}, Подиумы: ${s.podiums}, Поулы: ${s.polePositions}, FL: ${s.fastestLaps}, DNF: ${s.dnfs}\n`;
        });

        context += `\nТАБЛИЦА КОНСТРУКТОРОВ (топ-5):\n`;
        teamStandings.forEach(s => {
            context += `${s.position}. ${s.team} - ${s.points} очков | Победы: ${s.wins}\n`;
        });

        return context;
    }

    getDriverComparisonContext(driver1Name: string, driver2Name: string): string {
        const results1 = f1Data.getDriverResults(driver1Name);
        const results2 = f1Data.getDriverResults(driver2Name);

        if (results1.length === 0 || results2.length === 0) {
            return `ВНИМАНИЕ: Один или оба пилота не найдены в базе данных сезона 2025.`;
        }

        const driver1 = results1[0].driver;
        const driver2 = results2[0].driver;
        const standing1 = championship.getDriverStandings().find(s => s.driver === driver1);
        const standing2 = championship.getDriverStandings().find(s => s.driver === driver2);

        if (!standing1 || !standing2) {
            return `ВНИМАНИЕ: Статистика не найдена для одного или обоих пилотов.`;
        }

        let context = `=== РЕАЛЬНЫЕ ДАННЫЕ ДЛЯ СРАВНЕНИЯ (СЕЗОН 2025) ===\n\n`;

        context += `${driver1} (${standing1.team}):\n`;
        context += `- Позиция в чемпионате: ${standing1.position}\n`;
        context += `- Очки: ${standing1.points}\n`;
        context += `- Победы: ${standing1.wins} | Подиумы: ${standing1.podiums}\n`;
        context += `- Поул-позиции: ${standing1.polePositions} | Быстрейшие круги: ${standing1.fastestLaps}\n`;
        context += `- DNF/DQ: ${standing1.dnfs}\n`;

        const last5_1 = results1.slice(-5).reverse();
        context += `- Последние 5 гонок: ${last5_1.map(r => {
            const pos = ['NC', 'DQ'].includes(r.position) ? 'DNF' : `P${r.position}`;
            return `${r.track}(${pos})`;
        }).join(', ')}\n\n`;

        context += `${driver2} (${standing2.team}):\n`;
        context += `- Позиция в чемпионате: ${standing2.position}\n`;
        context += `- Очки: ${standing2.points}\n`;
        context += `- Победы: ${standing2.wins} | Подиумы: ${standing2.podiums}\n`;
        context += `- Поул-позиции: ${standing2.polePositions} | Быстрейшие круги: ${standing2.fastestLaps}\n`;
        context += `- DNF/DQ: ${standing2.dnfs}\n`;

        const last5_2 = results2.slice(-5).reverse();
        context += `- Последние 5 гонок: ${last5_2.map(r => {
            const pos = ['NC', 'DQ'].includes(r.position) ? 'DNF' : `P${r.position}`;
            return `${r.track}(${pos})`;
        }).join(', ')}\n`;

        return context;
    }

    getDriverContext(driverName: string): string {
        const results = f1Data.getDriverResults(driverName);

        if (results.length === 0) {
            return `ВНИМАНИЕ: Пилот "${driverName}" не найден в базе данных сезона 2025.`;
        }

        const driver = results[0].driver;
        const team = results[0].team;
        const standing = championship.getDriverStandings().find(s => s.driver === driver);

        if (!standing) {
            return `ВНИМАНИЕ: Статистика не найдена для пилота ${driver}.`;
        }

        let context = `=== РЕАЛЬНЫЕ ДАННЫЕ: ${driver} (СЕЗОН 2025) ===\n`;
        context += `Команда: ${team}\n`;
        context += `Позиция в чемпионате: ${standing.position}\n`;
        context += `Очки: ${standing.points}\n`;
        context += `Победы: ${standing.wins} | Подиумы: ${standing.podiums}\n`;
        context += `Поул-позиции: ${standing.polePositions} | Быстрейшие круги: ${standing.fastestLaps}\n`;
        context += `DNF/DQ: ${standing.dnfs}\n\n`;

        context += `ВСЕ РЕЗУЛЬТАТЫ ГОНОК:\n`;
        results.forEach(r => {
            const pos = ['NC', 'DQ'].includes(r.position) ? 'DNF' : `P${r.position}`;
            const grid = r.startingGrid ? ` (старт: P${r.startingGrid})` : '';
            context += `- ${r.track}: ${pos}${grid}, ${r.points} очков\n`;
        });

        return context;
    }

    getTeamContext(teamName: string): string {
        const teamStanding = championship.getTeamStandings().find(t =>
            t.team.toLowerCase().includes(teamName.toLowerCase())
        );

        if (!teamStanding) {
            return `ВНИМАНИЕ: Команда "${teamName}" не найдена в базе данных сезона 2025.`;
        }

        const driverStandings = championship.getDriverStandings().filter(d =>
            d.team === teamStanding.team
        );

        let context = `=== РЕАЛЬНЫЕ ДАННЫЕ: ${teamStanding.team} (СЕЗОН 2025) ===\n`;
        context += `Позиция в чемпионате конструкторов: ${teamStanding.position}\n`;
        context += `Очки: ${teamStanding.points}\n`;
        context += `Победы: ${teamStanding.wins} | Подиумы: ${teamStanding.podiums}\n\n`;

        context += `ПИЛОТЫ КОМАНДЫ:\n`;
        driverStandings.forEach(d => {
            context += `- ${d.driver}: P${d.position} в чемпионате, ${d.points} очков, ${d.wins} побед\n`;
        });

        return context;
    }
}

export const contextBuilder = new ContextBuilder();