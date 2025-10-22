import { f1Data } from '../openf1/openf1-parser.js'

import { championship } from './championship.js'

export class ContextBuilder {
	getChampionshipContext(): string {
		const drivers = championship.getDriverStandings().slice(0, 10)
		const teams = championship.getTeamStandings().slice(0, 5)
		const tracks = f1Data.getAllTracks()

		let ctx = `=== РЕАЛЬНЫЕ ДАННЫЕ Ф1 2025 ===\n`
		ctx += `Дата: ${new Date().toISOString().split('T')[0]}\n`
		ctx += `Гонок проведено: ${tracks.length}\n`
		ctx += `Трассы: ${tracks.join(', ')}\n\n`

		ctx += `ПИЛОТЫ (топ-10):\n`
		drivers.forEach(s => {
			ctx += `${s.position}. ${s.driver} (${s.team}) - ${s.points} очков | `
			ctx += `Победы: ${s.wins}, Подиумы: ${s.podiums}, Поулы: ${s.polePositions}, DNF: ${s.dnfs}\n`
		})

		ctx += `\nКОМАНДЫ (топ-5):\n`
		teams.forEach(s => {
			ctx += `${s.position}. ${s.team} - ${s.points} очков | Победы: ${s.wins}\n`
		})

		return ctx
	}

	getDriverComparisonContext(
		driver1Name: string,
		driver2Name: string
	): string {
		const results1 = f1Data.getDriverResults(driver1Name)
		const results2 = f1Data.getDriverResults(driver2Name)

		if (results1.length === 0 || results2.length === 0) {
			return `ОШИБКА: Один или оба пилота не найдены`
		}

		const d1 = results1[0].driver
		const d2 = results2[0].driver
		const s1 = championship.getDriverStandings().find(s => s.driver === d1)
		const s2 = championship.getDriverStandings().find(s => s.driver === d2)

		if (!s1 || !s2) {
			return `ОШИБКА: Статистика не найдена`
		}

		let ctx = `=== СРАВНЕНИЕ (СЕЗОН 2025) ===\n\n`
		ctx += this.formatDriverContext(s1, results1)
		ctx += `\n`
		ctx += this.formatDriverContext(s2, results2)

		return ctx
	}

	private formatDriverContext(
		standing: ReturnType<typeof championship.getDriverStandings>[0],
		results: ReturnType<typeof f1Data.getDriverResults>
	): string {
		let ctx = `${standing.driver} (${standing.team}):\n`
		ctx += `- Позиция: ${standing.position}\n`
		ctx += `- Очки: ${standing.points}\n`
		ctx += `- Победы: ${standing.wins} | Подиумы: ${standing.podiums}\n`
		ctx += `- Поул-позиции: ${standing.polePositions} | DNF: ${standing.dnfs}\n`

		const last5 = results.slice(-5).reverse()
		ctx += `- Последние 5: ${last5
			.map(r => {
				const pos =
					['NC', 'DQ'].includes(r.position) || !r.isClassified
						? 'DNF'
						: `P${r.position}`
				return `${r.track}(${pos})`
			})
			.join(', ')}\n`

		return ctx
	}
}

export const contextBuilder = new ContextBuilder()
