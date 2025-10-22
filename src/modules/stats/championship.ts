import type { DriverStanding, TeamStanding } from '../../types/f1.types.js'
import { f1Data } from '../openf1/openf1-parser.js'

export class ChampionshipCalculator {
	getDriverStandings(): DriverStanding[] {
		const results = f1Data.getRaceResults()
		const driverMap = new Map<string, DriverStanding>()

		results.forEach(result => {
			if (!driverMap.has(result.driver)) {
				const currentTeam =
					f1Data.getCurrentTeam(result.no) || result.team

				driverMap.set(result.driver, {
					position: 0,
					driver: result.driver,
					team: currentTeam,
					points: 0,
					wins: 0,
					podiums: 0,
					polePositions: 0,
					dnfs: 0
				})
			}

			const standing = driverMap.get(result.driver)!

			standing.points += result.points

			if (
				result.position === '1' &&
				!result.isSprint &&
				result.isClassified
			) {
				standing.wins++
			}

			if (
				['1', '2', '3'].includes(result.position) &&
				!result.isSprint &&
				result.isClassified
			) {
				standing.podiums++
			}

			if (!result.isClassified || result.position === 'NC') {
				standing.dnfs++
			}
		})

		const qualifying = f1Data.getQualifyingResults()
		qualifying.forEach(q => {
			if (q.position === 1 && driverMap.has(q.driver)) {
				driverMap.get(q.driver)!.polePositions++
			}
		})

		const standings = Array.from(driverMap.values()).sort(
			(a, b) => b.points - a.points
		)
		standings.forEach((s, i) => (s.position = i + 1))

		return standings
	}

	getTeamStandings(): TeamStanding[] {
		const results = f1Data.getRaceResults()
		const teamMap = new Map<string, TeamStanding>()

		results.forEach(result => {
			if (!teamMap.has(result.team)) {
				teamMap.set(result.team, {
					position: 0,
					team: result.team,
					points: 0,
					wins: 0,
					podiums: 0
				})
			}

			const team = teamMap.get(result.team)!
			team.points += result.points

			if (
				result.position === '1' &&
				!result.isSprint &&
				result.isClassified
			) {
				team.wins++
			}

			if (
				['1', '2', '3'].includes(result.position) &&
				!result.isSprint &&
				result.isClassified
			) {
				team.podiums++
			}
		})

		const standings = Array.from(teamMap.values()).sort(
			(a, b) => b.points - a.points
		)
		standings.forEach((s, i) => (s.position = i + 1))

		return standings
	}

	formatDriverStandings(limit?: number): string {
		const standings = limit
			? this.getDriverStandings().slice(0, limit)
			: this.getDriverStandings()

		let output = '🏆 **ЧЕМПИОНАТ ПИЛОТОВ 2025**\n\n```\n'
		output += 'Поз  Пилот                    Очки  П  Подиум\n'
		output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'

		standings.forEach(s => {
			const pos = s.position.toString().padEnd(4)
			const name = s.driver.padEnd(24)
			const points = s.points.toString().padStart(4)
			const wins = s.wins.toString().padStart(2)
			const podiums = s.podiums.toString().padStart(6)
			output += `${pos} ${name} ${points}  ${wins}  ${podiums}\n`
		})

		output += '```\n\n*П - Победы в гонках (спринты не считаются)*'

		return output
	}

	formatTeamStandings(limit = 10): string {
		const standings = this.getTeamStandings().slice(0, limit)

		let output = '🏁 **ЧЕМПИОНАТ КОНСТРУКТОРОВ 2025**\n\n```\n'
		output += 'Поз  Команда                       Очки  Побед\n'
		output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'

		standings.forEach(s => {
			const pos = s.position.toString().padEnd(4)
			const team = s.team.padEnd(28)
			const points = s.points.toString().padStart(5)
			const wins = s.wins.toString().padStart(6)
			output += `${pos} ${team} ${points} ${wins}\n`
		})

		output += '```'

		return output
	}
}

export const championship = new ChampionshipCalculator()
