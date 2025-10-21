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
                driverMap.set(result.driver, {
                    position: 0,
                    driver: result.driver,
                    team: result.team,
                    points: 0,
                    wins: 0,
                    podiums: 0,
                    polePositions: 0,
                    fastestLaps: 0,
                    dnfs: 0,
                });
            }

            const standing = driverMap.get(result.driver)!;
            standing.points += result.points;

            if (result.position === '1') standing.wins++;
            if (['1', '2', '3'].includes(result.position)) standing.podiums++;
            if (result.setFastestLap) standing.fastestLaps++;
            if (result.position === 'NC' || result.position === 'DQ') standing.dnfs++;
        });

        // Добавляем поул-позиции из квалификации
        const qualifyingResults = f1Data.getQualifyingResults();
        qualifyingResults.forEach(q => {
            if (q.position === 1 && driverMap.has(q.driver)) {
                driverMap.get(q.driver)!.polePositions++;
            }
        });

        // Сортируем по очкам
        const standings = Array.from(driverMap.values())
            .sort((a, b) => b.points - a.points);

        // Назначаем позиции
        standings.forEach((standing, index) => {
            standing.position = index + 1;
        });

        return standings;
    }

    getTeamStandings(): TeamStanding[] {
        const driverStandings = this.getDriverStandings();
        const teamMap = new Map<string, TeamStanding>();

        driverStandings.forEach(driver => {
            if (!teamMap.has(driver.team)) {
                teamMap.set(driver.team, {
                    position: 0,
                    team: driver.team,
                    points: 0,
                    wins: 0,
                    podiums: 0,
                });
            }

            const team = teamMap.get(driver.team)!;
            team.points += driver.points;
            team.wins += driver.wins;
            team.podiums += driver.podiums;
        });

        const standings = Array.from(teamMap.values())
            .sort((a, b) => b.points - a.points);

        standings.forEach((standing, index) => {
            standing.position = index + 1;
        });

        return standings;
    }

    formatDriverStandings(limit: number = 10): string {
        const standings = this.getDriverStandings().slice(0, limit);

        let output = '🏆 **ЧЕМПИОНАТ ПИЛОТОВ 2025** (после ' + f1Data.getAllTracks().length + ' гонок)\n\n';
        output += '```\n';
        output += 'Поз  Пилот                    Очки  П  Подиум  FL\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

        standings.forEach(s => {
            const pos = s.position.toString().padEnd(4);
            const name = s.driver.padEnd(24);
            const points = s.points.toString().padStart(4);
            const wins = s.wins.toString().padStart(2);
            const podiums = s.podiums.toString().padStart(6);
            const fl = s.fastestLaps.toString().padStart(3);

            output += `${pos} ${name} ${points}  ${wins}  ${podiums}  ${fl}\n`;
        });

        output += '```\n';
        output += '\n*П - Победы, FL - Быстрейшие круги*';

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