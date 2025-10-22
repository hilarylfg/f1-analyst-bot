import type { RaceResult } from '../../types/f1.types.js'
import { f1Data } from '../openf1/openf1-parser.js'

export class DriverStatsCalculator {
	getDriverProfile(driverName: string): string {
		const results = f1Data.getDriverResults(driverName)

		if (results.length === 0) {
			return `❌ Пилот "${driverName}" не найден`
		}

		const driver = results[0].driver
		const driverNo = results[0].no
		const currentTeam =
			f1Data.getCurrentTeam(driverNo) || results[results.length - 1].team

		const stats = this.calculateDriverStats(results)
		const qualifyingResults = f1Data
			.getQualifyingResults()
			.filter(q =>
				q.driver.toLowerCase().includes(driverName.toLowerCase())
			)
		const polePositions = qualifyingResults.filter(
			q => q.position === 1
		).length
		const championshipPosition = this.getChampionshipPosition(driver)

		let output = `👤 **${driver}**\n`
		output += `🏎️ Команда: ${currentTeam}\n\n`
		output += `📊 **Статистика сезона:**\n`
		output += `• Позиция: ${championshipPosition}\n`
		output += `• Очки: ${stats.totalPoints}\n`
		output += `• Победы: ${stats.wins} | Подиумы: ${stats.podiums}\n`
		output += `• Поул-позиции: ${polePositions}\n`
		output += `• DNF/DNS/DSQ: ${stats.dnfs}\n`
		output += `• Средняя позиция: ${stats.avgPosition}\n`
		output += `• Процент финишей: ${stats.finishRate}%\n\n`
		output += `🏁 **Последние 5 уик-эндов:**\n`
		output += this.formatRecentWeekends(results)

		return output
	}

	getDriverForm(driverName: string): string {
		const results = f1Data.getDriverResults(driverName)

		if (results.length === 0) {
			return `❌ Пилот "${driverName}" не найден`
		}

		const driver = results[0].driver
		const driverNo = results[0].no
		const currentTeam =
			f1Data.getCurrentTeam(driverNo) || results[results.length - 1].team

		let output = `📈 **Форма: ${driver}** (${currentTeam})\n\n`
		output += this.formatDetailedForm(results)

		return output
	}

	private calculateDriverStats(results: RaceResult[]) {
		const totalPoints = results.reduce((sum, r) => sum + r.points, 0)
		const wins = results.filter(
			r => r.position === '1' && !r.isSprint && r.isClassified
		).length
		const podiums = results.filter(
			r =>
				['1', '2', '3'].includes(r.position) &&
				!r.isSprint &&
				r.isClassified
		).length
		const dnfs = results.filter(r => r.isDNF || r.isDNS || r.isDSQ).length
		const finishRate =
			results.length > 0
				? (((results.length - dnfs) / results.length) * 100).toFixed(1)
				: '0.0'

		const classifiedResults = results.filter(r => r.isClassified)
		const avgPosition =
			classifiedResults.length > 0
				? (
						classifiedResults.reduce(
							(sum, r) => sum + parseInt(r.position),
							0
						) / classifiedResults.length
					).toFixed(1)
				: 'N/A'

		return { totalPoints, wins, podiums, dnfs, finishRate, avgPosition }
	}

	private getChampionshipPosition(driverName: string): number {
		const standings = f1Data.getRaceResults()
		const driverStandings = new Map<string, number>()

		standings.forEach(r => {
			driverStandings.set(
				r.driver,
				(driverStandings.get(r.driver) || 0) + r.points
			)
		})

		const sorted = Array.from(driverStandings.entries()).sort(
			(a, b) => b[1] - a[1]
		)
		return sorted.findIndex(([name]) => name === driverName) + 1
	}

	private formatRecentWeekends(results: RaceResult[]): string {
		const trackResults = this.groupByTrack(results)
		const recent = Array.from(trackResults.entries())
			.sort(
				(a, b) =>
					new Date(b[1][0].date).getTime() -
					new Date(a[1][0].date).getTime()
			)
			.slice(0, 5)

		let output = ''
		recent.forEach(([track, results]) => {
			const sorted = results.sort(
				(a, b) =>
					new Date(a.date).getTime() - new Date(b.date).getTime()
			)
			output += `${track}: `

			sorted.forEach((r, i) => {
				const type = r.isSprint ? 'Sprint' : 'Race'
				const position = this.formatPosition(r)
				const prelim = r.isPreliminary ? '⚠️' : ''
				output += `${type}: ${position}${prelim}`
				if (i < sorted.length - 1) output += ', '
			})

			output += '\n'
		})

		return output
	}

	private formatDetailedForm(results: RaceResult[]): string {
		const trackResults = this.groupByTrack(results)
		const recent = Array.from(trackResults.entries())
			.sort(
				(a, b) =>
					new Date(b[1][0].date).getTime() -
					new Date(a[1][0].date).getTime()
			)
			.slice(0, 5)

		let output = ''
		recent.forEach(([track, results]) => {
			const dateStr = new Date(results[0].date)
				.toISOString()
				.split('T')[0]
			const sorted = results.sort(
				(a, b) =>
					new Date(a.date).getTime() - new Date(b.date).getTime()
			)

			output += `**${track}** (${dateStr})\n`

			sorted.forEach(r => {
				const type = r.isSprint ? '🏃 Sprint' : '🏁 Race'
				const position = this.formatPosition(r)
				const emoji = this.getResultEmoji(r)
				const prelim = r.isPreliminary ? ' ⚠️' : ''

				output += `   ${emoji} ${type}: ${position} (+${r.points} очков)${prelim}\n`

				if (r.gap && r.gap !== '0') {
					output += `      Отставание: ${r.gap}\n`
				}
			})

			output += '\n'
		})

		return output
	}

	private groupByTrack(results: RaceResult[]): Map<string, RaceResult[]> {
		const map = new Map<string, RaceResult[]>()
		results.forEach(r => {
			if (!map.has(r.track)) map.set(r.track, [])
			map.get(r.track)!.push(r)
		})
		return map
	}

	private formatPosition(result: RaceResult): string {
		if (result.isDSQ) return 'DSQ'
		if (result.isDNF) return 'DNF'
		if (result.isDNS) return 'DNS'
		if (!result.isClassified) return 'DNF/DNS'
		if (result.position === 'NC') return 'DSQ'
		return `P${result.position}`
	}

	private getResultEmoji(result: RaceResult): string {
		if (result.position === '1' && result.isClassified) return '🥇'
		if (result.position === '2' && result.isClassified) return '🥈'
		if (result.position === '3' && result.isClassified) return '🥉'
		if (!result.isClassified || result.position === 'NC') return '❌'
		if (parseInt(result.position) <= 10) return '✅'
		return '⚪'
	}
}

export const driverStats = new DriverStatsCalculator()
