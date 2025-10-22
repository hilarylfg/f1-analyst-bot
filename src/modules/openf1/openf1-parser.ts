import {
	API_CONFIG,
	DRIVER_NAME_NORMALIZATION,
	POINTS_SYSTEM,
	SPRINT_POINTS_SYSTEM
} from '../../config/constants.js'
import type {
	OpenF1Driver,
	OpenF1Session,
	OpenF1SessionResult,
	QualifyingResult,
	RaceResult
} from '../../types/f1.types.js'
import { logger } from '../../utils/logger.js'

import { openF1Service } from './openf1.js'

class OpenF1DataParser {
	private raceResults: RaceResult[] = []
	private qualifyingResults: QualifyingResult[] = []
	private drivers: OpenF1Driver[] = []
	private currentDriverTeams = new Map<number, string>()
	private lastUpdate = 0
	private isLoading = false
	private loadingPromise: Promise<void> | null = null
	private isInitialized = false
	private hasPreliminaryResults = false

	async initialize(): Promise<void> {
		if (this.isInitialized) {
			logger.info('Парсер уже инициализирован')
			return
		}

		if (this.loadingPromise) {
			await this.loadingPromise
			return
		}

		this.loadingPromise = this.loadData()
		await this.loadingPromise
		this.isInitialized = true

		setInterval(() => {
			if (!this.isLoading) {
				logger.info('Автообновление данных')
				void this.loadData()
			}
		}, API_CONFIG.UPDATE_INTERVAL)
	}

	private async loadData(): Promise<void> {
		if (this.isLoading) return

		this.isLoading = true
		this.hasPreliminaryResults = false

		try {
			logger.info('Загрузка данных из OpenF1 API')

			const allSessions = await openF1Service.getSessions(2025)
			const races = allSessions.filter(s => s.session_name === 'Race')
			const sprints = allSessions.filter(
				s =>
					s.session_name === 'Sprint' ||
					s.session_name === 'Sprint Race'
			)

			logger.info(
				`Найдено гонок: ${races.length}, спринтов: ${sprints.length}`
			)

			await this.loadQualifyingResults(allSessions)
			await this.loadRaceResults(races, sprints)

			this.lastUpdate = Date.now()

			logger.success(
				`Данные обновлены: ${this.raceResults.length} результатов, ${this.drivers.length} пилотов`
			)
			if (this.hasPreliminaryResults) {
				logger.warn('Есть предварительные результаты')
			}
		} catch (error) {
			logger.error('Ошибка загрузки данных', error)
		} finally {
			this.isLoading = false
			this.loadingPromise = null
		}
	}

	private async loadRaceResults(
		races: OpenF1Session[],
		sprints: OpenF1Session[]
	): Promise<void> {
		this.raceResults = []
		const driverMap = new Map<number, OpenF1Driver>()
		this.currentDriverTeams.clear()

		const allSessions = [
			...races.map(r => ({ session: r, isSprint: false })),
			...sprints.map(s => ({ session: s, isSprint: true }))
		].sort(
			(a, b) =>
				new Date(a.session.date_start).getTime() -
				new Date(b.session.date_start).getTime()
		)

		const completed = allSessions.filter(
			s => new Date(s.session.date_start) < new Date()
		)

		logger.info(`Загружаю ${completed.length} сессий`)

		for (const { session, isSprint } of completed) {
			await this.loadSessionResults(session, isSprint, driverMap)
		}

		this.drivers = Array.from(driverMap.values())
		this.raceResults.sort(
			(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
		)
	}

	private async loadQualifyingResults(
		sessions: OpenF1Session[]
	): Promise<void> {
		this.qualifyingResults = []
		const qualifying = sessions.filter(
			s =>
				s.session_name === 'Qualifying' &&
				new Date(s.date_start) < new Date()
		)

		logger.info(`Загружаю ${qualifying.length} квалификаций`)

		for (const session of qualifying) {
			try {
				const results = await openF1Service.getSessionResults(
					session.session_key
				)
				if (results.length === 0) continue

				const drivers = await openF1Service.getDriversFromSession(
					session.session_key
				)
				const sorted = results
					.filter(r => r.position)
					.sort((a, b) => (a.position || 999) - (b.position || 999))

				sorted.forEach(result => {
					const driver = drivers.find(
						d => d.driver_number === result.driver_number
					)
					if (!driver || !result.position) return

					this.qualifyingResults.push({
						track: session.circuit_short_name || session.location,
						position: result.position,
						no: driver.driver_number,
						driver: this.normalizeDriverName(
							driver.driver_number,
							driver.full_name
						),
						team: driver.team_name,
						laps: result.number_of_laps || 0
					})
				})
			} catch (error) {
				logger.error(
					`Ошибка квалификации ${session.circuit_short_name}`,
					error
				)
			}
		}

		logger.success(
			`Загружено ${this.qualifyingResults.length} квалификаций`
		)
	}

	private async loadSessionResults(
		session: OpenF1Session,
		isSprint: boolean,
		driverMap: Map<number, OpenF1Driver>
	): Promise<void> {
		try {
			const drivers = await openF1Service.getDriversFromSession(
				session.session_key
			)
			const sessionDriverMap = new Map(
				drivers.map(d => [d.driver_number, d])
			)

			drivers.forEach(d => {
				driverMap.set(d.driver_number, d)
				this.currentDriverTeams.set(d.driver_number, d.team_name)
			})

			const results = await openF1Service.getSessionResults(
				session.session_key
			)

			if (results.length > 0) {
				await this.processOfficialResults(
					session,
					results,
					isSprint,
					sessionDriverMap
				)
			} else {
				this.hasPreliminaryResults = true
				await this.processPreliminaryResults(
					session,
					isSprint,
					sessionDriverMap
				)
			}
		} catch (error) {
			logger.error(`Ошибка сессии ${session.circuit_short_name}`, error)
		}
	}

	private async processOfficialResults(
		session: OpenF1Session,
		results: OpenF1SessionResult[],
		isSprint: boolean,
		driverMap: Map<number, OpenF1Driver>
	): Promise<void> {
		const sorted = results
			.filter(
				r => (r.position && r.position > 0) || r.dnf || r.dns || r.dsq
			)
			.sort((a, b) => {
				if (a.position && b.position) return a.position - b.position
				return !a.position ? 1 : -1
			})

		sorted.forEach(result => {
			const driver = driverMap.get(result.driver_number)
			if (!driver) return

			let position = ''
			let isClassified = true

			if (result.dsq) {
				position = 'DSQ'
				isClassified = false
			} else if (result.dns) {
				position = 'DNS'
				isClassified = false
			} else if (result.dnf) {
				position = 'DNF'
				isClassified = false
			} else if (result.position) {
				position = result.position.toString()
			} else {
				position = 'NC'
				isClassified = false
			}

			this.raceResults.push({
				track: session.circuit_short_name || session.location,
				position,
				no: driver.driver_number,
				driver: this.normalizeDriverName(
					driver.driver_number,
					driver.full_name
				),
				team: result.team_name || driver.team_name,
				startingGrid: result.grid_position || 0,
				laps: result.number_of_laps || 0,
				points: result.points,
				isSprint,
				isClassified,
				gap: result.gap_to_leader || '',
				isPreliminary: false,
				date: session.date_start,
				isDNF: result.dnf || false,
				isDNS: result.dns || false,
				isDSQ: result.dsq || false
			})
		})
	}

	private async processPreliminaryResults(
		session: OpenF1Session,
		isSprint: boolean,
		driverMap: Map<number, OpenF1Driver>
	): Promise<void> {
		const positions = await openF1Service.getSessionPositions(
			session.session_key
		)
		if (positions.length === 0) return

		const finalPositions = this.getFinalPositions(positions)
		const pointsTable = isSprint ? SPRINT_POINTS_SYSTEM : POINTS_SYSTEM

		finalPositions.forEach(pos => {
			const driver = driverMap.get(pos.driver_number)
			if (!driver) return

			this.raceResults.push({
				track: session.circuit_short_name || session.location,
				position: pos.position.toString(),
				no: driver.driver_number,
				driver: this.normalizeDriverName(
					driver.driver_number,
					driver.full_name
				),
				team: driver.team_name,
				startingGrid: 0,
				laps: 0,
				points: pointsTable[pos.position] || 0,
				isSprint,
				isClassified: true,
				gap: '',
				isPreliminary: true,
				date: session.date_start,
				isDNF: false,
				isDNS: false,
				isDSQ: false
			})
		})
	}

	private getFinalPositions(
		positions: Array<{
			driver_number: number
			position: number
			date: string
		}>
	): Array<{ driver_number: number; position: number }> {
		const map = new Map()
		positions.forEach(pos => {
			const existing = map.get(pos.driver_number)
			if (!existing || new Date(pos.date) > new Date(existing.date)) {
				map.set(pos.driver_number, pos)
			}
		})
		return Array.from(map.values())
			.filter(p => p.position > 0)
			.sort((a, b) => a.position - b.position)
	}

	private normalizeDriverName(
		driverNumber: number,
		driverName: string
	): string {
		return DRIVER_NAME_NORMALIZATION[driverNumber] || driverName
	}

	getRaceResults(): RaceResult[] {
		return this.raceResults
	}

	getQualifyingResults(): QualifyingResult[] {
		return this.qualifyingResults
	}

	getDriverResults(driverName: string): RaceResult[] {
		return this.raceResults.filter(r =>
			r.driver.toLowerCase().includes(driverName.toLowerCase())
		)
	}

	getAllTracks(): string[] {
		return [...new Set(this.raceResults.map(r => r.track))]
	}

	getAllDrivers(): string[] {
		return this.drivers.map(d => d.full_name).sort()
	}

	getCurrentTeam(driverNumber: number): string | undefined {
		return this.currentDriverTeams.get(driverNumber)
	}

	isReady(): boolean {
		return this.isInitialized && this.raceResults.length > 0
	}
}

export const f1Data = new OpenF1DataParser()
