import {f1Data} from "../openf1/openf1-parser.js";

export interface DriverStanding {
    position: number;
    driver: string;
    team: string;
    points: number;
    wins: number;
    podiums: number;
    polePositions: number;
    fastestLaps: number;
    dnfs: number;
}

export interface TeamStanding {
    position: number;
    team: string;
    points: number;
    wins: number;
    podiums: number;
}

export class ChampionshipCalculator {

    getDriverStandings(): DriverStanding[] {
        const results = f1Data.getRaceResults();
        const driverMap = new Map<string, DriverStanding>();

        results.forEach(result => {
            if (!driverMap.has(result.driver)) {
                const currentTeam = f1Data.getCurrentTeam(result.no) || result.team;

                driverMap.set(result.driver, {
                    position: 0,
                    driver: result.driver,
                    team: currentTeam,
                    points: 0,
                    wins: 0,
                    podiums: 0,
                    polePositions: 0,
                    fastestLaps: 0,
                    dnfs: 0,
                });
            }

            const standing = driverMap.get(result.driver)!;

            // Очки всегда
            standing.points += result.points;

            // Победы только в гонках
            if (result.position === '1' && !result.isSprint && result.isClassified) {
                standing.wins++;
            }

            // Подиумы только в гонках
            if (['1', '2', '3'].includes(result.position) && !result.isSprint && result.isClassified) {
                standing.podiums++;
            }

            if (result.setFastestLap) standing.fastestLaps++;

            if (!result.isClassified || result.position === 'NC') {
                standing.dnfs++;
            }
        });

        // Добавляем поул-позиции из квалификации
        const qualifyingResults = f1Data.getQualifyingResults();
        qualifyingResults.forEach(q => {
            if (q.position === 1 && driverMap.has(q.driver)) {
                driverMap.get(q.driver)!.polePositions++;
            }
        });

        const standings = Array.from(driverMap.values())
            .sort((a, b) => b.points - a.points);

        standings.forEach((standing, index) => {
            standing.position = index + 1;
        });

        return standings;
    }

    /**
     * ✅ ИСПРАВЛЕНО: Считаем очки команд НАПРЯМУЮ из результатов,
     * а НЕ через суммирование очков пилотов (чтобы учесть переходы)
     */
    getTeamStandings(): TeamStanding[] {
        const results = f1Data.getRaceResults();
        const teamMap = new Map<string, TeamStanding>();

        // ✅ Считаем очки НАПРЯМУЮ из результатов (команда на момент гонки!)
        results.forEach(result => {
            if (!teamMap.has(result.team)) {
                teamMap.set(result.team, {
                    position: 0,
                    team: result.team,
                    points: 0,
                    wins: 0,
                    podiums: 0,
                });
            }

            const team = teamMap.get(result.team)!;

            // ✅ Очки - из результата (команда на момент гонки)
            team.points += result.points;

            // ✅ Победы - только гонки (не спринты)
            if (result.position === '1' && !result.isSprint && result.isClassified) {
                team.wins++;
            }

            // ✅ Подиумы - только гонки (не спринты)
            if (['1', '2', '3'].includes(result.position) && !result.isSprint && result.isClassified) {
                team.podiums++;
            }
        });

        const standings = Array.from(teamMap.values())
            .sort((a, b) => b.points - a.points);

        standings.forEach((standing, index) => {
            standing.position = index + 1;
        });

        return standings;
    }

    formatDriverStandings(): string {
        const standings = this.getDriverStandings().slice(0);

        let output = '🏆 **ЧЕМПИОНАТ ПИЛОТОВ 2025**\n\n';
        output += '```\n';
        output += 'Поз  Пилот                    Очки  П  Подиум\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

        standings.forEach(s => {
            const pos = s.position.toString().padEnd(4);
            const name = s.driver.padEnd(24);
            const points = s.points.toString().padStart(4);
            const wins = s.wins.toString().padStart(2);
            const podiums = s.podiums.toString().padStart(6);
            output += `${pos} ${name} ${points}  ${wins}  ${podiums}\n`;
        });

        output += '```\n';
        output += '\n*П - Победы в гонках (спринты не считаются)*';

        return output;
    }

    formatTeamStandings(limit: number = 10): string {
        const standings = this.getTeamStandings().slice(0, limit);

        let output = '🏁 **ЧЕМПИОНАТ КОНСТРУКТОРОВ 2025**\n\n';
        output += '```\n';
        output += 'Поз  Команда                       Очки  Побед\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

        standings.forEach(s => {
            const pos = s.position.toString().padEnd(4);
            const team = s.team.padEnd(28);
            const points = s.points.toString().padStart(5);
            const wins = s.wins.toString().padStart(6);

            output += `${pos} ${team} ${points} ${wins}\n`;
        });

        output += '```';

        return output;
    }
}

export const championship = new ChampionshipCalculator();