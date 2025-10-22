import { API_CONFIG } from '../../config/constants.js'
import type {
	OpenF1Driver,
	OpenF1Session,
	OpenF1SessionResult
} from '../../types/f1.types.js'
import { logger } from '../../utils/logger.js'

interface CacheEntry<T> {
	data: T
	timestamp: number
}

class OpenF1Service {
	private readonly baseUrl = API_CONFIG.BASE_URL
	private cache = new Map<string, CacheEntry<unknown>>()
	private readonly cacheDuration = API_CONFIG.CACHE_DURATION
	private readonly requestDelay = API_CONFIG.REQUEST_DELAY

	private async delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms))
	}

	private async fetchWithCache<T>(endpoint: string, retries = 3): Promise<T> {
		const cached = this.cache.get(endpoint) as CacheEntry<T> | undefined

		if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
			logger.debug(`Использую кеш для: ${endpoint}`)
			return cached.data
		}

		for (let attempt = 1; attempt <= retries; attempt++) {
			try {
				if (attempt > 1) {
					const backoffDelay =
						this.requestDelay * Math.pow(2, attempt - 1)
					await this.delay(backoffDelay)
				}

				const url = `${this.baseUrl}${endpoint}`
				logger.debug(`Запрос: ${url}`)

				const response = await fetch(url)

				if (response.status === 429) {
					logger.warn(`Rate limit для ${endpoint}`)
					if (attempt < retries) {
						await this.delay(2000)
						continue
					}
					throw new Error('Rate limit exceeded')
				}

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`)
				}

				const data = (await response.json()) as T
				this.cache.set(endpoint, { data, timestamp: Date.now() })
				await this.delay(this.requestDelay)

				return data
			} catch (error) {
				if (attempt === retries) {
					logger.error(`Не удалось загрузить: ${endpoint}`, error)
					throw error
				}
			}
		}

		throw new Error('Unexpected error')
	}

	async getSessions(year = 2025): Promise<OpenF1Session[]> {
		return this.fetchWithCache<OpenF1Session[]>(`/sessions?year=${year}`)
	}

	async getDriversFromSession(sessionKey: number): Promise<OpenF1Driver[]> {
		return this.fetchWithCache<OpenF1Driver[]>(
			`/drivers?session_key=${sessionKey}`
		)
	}

	async getSessionResults(
		sessionKey: number
	): Promise<OpenF1SessionResult[]> {
		return this.fetchWithCache<OpenF1SessionResult[]>(
			`/session_result?session_key=${sessionKey}`
		)
	}

	async getSessionPositions(
		sessionKey: number
	): Promise<
		Array<{ driver_number: number; position: number; date: string }>
	> {
		return this.fetchWithCache(`/position?session_key=${sessionKey}`)
	}
}

export const openF1Service = new OpenF1Service()
