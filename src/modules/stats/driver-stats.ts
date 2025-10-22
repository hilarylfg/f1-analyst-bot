import {f1Data} from "../openf1/openf1-parser.js";

export class DriverStatsCalculator {

    /**
     * Получить профиль пилота
     */
    getDriverProfile(driverName: string): string {
        const results = f1Data.getDriverResults(driverName);

        if (results.length === 0) {
            return `❌ Пилот "${driverName}" не найден в базе данных.`;
        }

        const driver = results[0].driver;
        const driverNo = results[0].no;
        const currentTeam = f1Data.getCurrentTeam(driverNo) || results[results.length - 1].team;

        const totalPoints = results.reduce((sum, r) => sum + r.points, 0);

        const wins = results.filter(r =>
            r.position === '1' && !r.isSprint && r.isClassified
        ).length;

        const podiums = results.filter(r =>
            ['1', '2', '3'].includes(r.position) && !r.isSprint && r.isClassified
        ).length;

        // ✅ DNF/DNS/DSQ из новых полей
        const dnfs = results.filter(r => r.isDNF || r.isDNS || r.isDSQ).length;

        const finishRate = results.length > 0
            ? ((results.length - dnfs) / results.length * 100).toFixed(1)
            : '0.0';

        const classifiedResults = results.filter(r => r.isClassified);
        const avgPosition = classifiedResults.length > 0
            ? (classifiedResults.reduce((sum, r) => sum + parseInt(r.position), 0) / classifiedResults.length).toFixed(1)
            : 'N/A';

        // ✅ Квалификации (поул-позиции)
        const qualifyingResults = f1Data.getQualifyingResults().filter(q =>
            q.driver.toLowerCase().includes(driverName.toLowerCase())
        );
        const polePositions = qualifyingResults.filter(q => q.position === 1).length;

        // Позиция в чемпионате
        const standings = f1Data.getRaceResults();
        const driverStandings = new Map<string, number>();
        standings.forEach(r => {
            const current = driverStandings.get(r.driver) || 0;
            driverStandings.set(r.driver, current + r.points);
        });
        const sortedStandings = Array.from(driverStandings.entries())
            .sort((a, b) => b[1] - a[1]);
        const championshipPosition = sortedStandings.findIndex(([name]) => name === driver) + 1;

        let output = `👤 **${driver}**\n`;
        output += `🏎️ Команда: ${currentTeam}\n\n`;
        output += `📊 **Статистика сезона:**\n`;
        output += `• Позиция в чемпионате: ${championshipPosition}\n`;
        output += `• Очки: ${totalPoints}\n`;
        output += `• Победы: ${wins} | Подиумы: ${podiums}\n`;
        output += `• Поул-позиции: ${polePositions}\n`; // ✅ Убрали быстрейшие круги
        output += `• DNF/DNS/DSQ: ${dnfs}\n`;
        output += `• Средняя позиция: ${avgPosition}\n`;
        output += `• Процент финишей: ${finishRate}%\n\n`;

        // Последние 5 уик-эндов
        output += `🏁 **Последние 5 уик-эндов:**\n`;

        const trackResults = new Map<string, typeof results>();
        results.forEach(r => {
            if (!trackResults.has(r.track)) {
                trackResults.set(r.track, []);
            }
            trackResults.get(r.track)!.push(r);
        });

        const recentTracks = Array.from(trackResults.entries())
            .sort((a, b) => new Date(b[1][0].date).getTime() - new Date(a[1][0].date).getTime())
            .slice(0, 5);

        recentTracks.forEach(([track, trackResults]) => {
            const sorted = trackResults.sort((a, b) =>
                new Date(a.date).getTime() - new Date(b.date).getTime()
            );

            output += `${track}: `;

            sorted.forEach((r, index) => {
                const type = r.isSprint ? 'Sprint' : 'Race';
                const prelim = r.isPreliminary ? '⚠️' : '';

                // ✅ Показываем DSQ, DNF, DNS из атрибутов
                let positionStr = '';
                if (r.isDSQ) positionStr = 'DSQ';
                else if (r.isDNF) positionStr = 'DNF';
                else if (r.isDNS) positionStr = 'DNS';
                else positionStr = `P${r.position}`;

                output += `${type}: ${positionStr}${prelim}`;
                if (index < sorted.length - 1) output += ', ';
            });

            output += '\n';
        });

        return output;
    }

    /**
     * Получить форму пилота (последние 5 гонок)
     */
    getDriverForm(driverName: string): string {
        const results = f1Data.getDriverResults(driverName);

        if (results.length === 0) {
            return `❌ Пилот "${driverName}" не найден в базе данных.`;
        }

        const driver = results[0].driver;
        const driverNo = results[0].no;
        const currentTeam = f1Data.getCurrentTeam(driverNo) || results[results.length - 1].team;

        // Группируем по трассам
        const trackResults = new Map<string, typeof results>();
        results.forEach(r => {
            if (!trackResults.has(r.track)) {
                trackResults.set(r.track, []);
            }
            trackResults.get(r.track)!.push(r);
        });

        // Берём последние 5 трасс
        const recentTracks = Array.from(trackResults.entries())
            .sort((a, b) => new Date(b[1][0].date).getTime() - new Date(a[1][0].date).getTime())
            .slice(0, 5);

        let output = `📈 **Форма пилота: ${driver}** (${currentTeam})\n\n`;

        recentTracks.forEach(([track, trackResults]) => {
            const dateStr = new Date(trackResults[0].date).toISOString().split('T')[0];

            // Сортируем по дате
            const sorted = trackResults.sort((a, b) =>
                new Date(a.date).getTime() - new Date(b.date).getTime()
            );

            output += `**${track}** (${dateStr})\n`;

            sorted.forEach(r => {
                const type = r.isSprint ? '🏃 Sprint' : '🏁 Race';
                const prelim = r.isPreliminary ? ' ⚠️' : '';

                // Позиция
                let positionStr = '';
                if (!r.isClassified) {
                    positionStr = 'DNF/DNS';
                } else if (r.position === 'NC') {
                    positionStr = 'DSQ';
                } else {
                    positionStr = `P${r.position}`;
                }

                // Эмодзи по результату
                let emoji = '';
                if (r.position === '1' && r.isClassified) emoji = '🥇';
                else if (r.position === '2' && r.isClassified) emoji = '🥈';
                else if (r.position === '3' && r.isClassified) emoji = '🥉';
                else if (!r.isClassified || r.position === 'NC') emoji = '❌';
                else if (parseInt(r.position) <= 10) emoji = '✅';
                else emoji = '⚪';

                output += `   ${emoji} ${type}: ${positionStr} (+${r.points} очков)${prelim}\n`;

                if (r.gap && r.gap !== '0') {
                    output += `      Отставание: ${r.gap}\n`;
                }
            });

            output += '\n';
        });

        return output;
    }
}

export const driverStats = new DriverStatsCalculator();