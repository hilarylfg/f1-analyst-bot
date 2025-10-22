export const POINTS_SYSTEM: Record<number, number> = {
	1: 25,
	2: 18,
	3: 15,
	4: 12,
	5: 10,
	6: 8,
	7: 6,
	8: 4,
	9: 2,
	10: 1
}

export const SPRINT_POINTS_SYSTEM: Record<number, number> = {
	1: 8,
	2: 7,
	3: 6,
	4: 5,
	5: 4,
	6: 3,
	7: 2,
	8: 1
}

export const DRIVER_NAME_NORMALIZATION: Record<number, string> = {
	12: 'Andrea Kimi ANTONELLI'
}

export const API_CONFIG = {
	BASE_URL: 'https://api.openf1.org/v1',
	CACHE_DURATION: 30 * 60 * 1000, // 30 минут
	REQUEST_DELAY: 500,
	UPDATE_INTERVAL: 30 * 60 * 1000
}
