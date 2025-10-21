/**
 * OpenF1 API Service
 * Документация: https://openf1.org/
 */

export interface OpenF1Driver {
    driver_number: number;
    broadcast_name: string;
    full_name: string;
    name_acronym: string;
    team_name: string;
    team_colour: string;
    first_name: string;
    last_name: string;
    headshot_url: string;
    country_code: string;
}

export interface OpenF1Session {
    session_key: number;
    session_name: string;
    date_start: string;
    date_end: string;
    gmt_offset: string;
    session_type: string;
    meeting_key: number;
    location: string;
    country_name: string;
    circuit_short_name: string;
    year: number;
}

export interface OpenF1Position {
    meeting_key: number;
    session_key: number;
    driver_number: number;
    date: string;
    position: number;
}

class OpenF1Service {
    private baseUrl = 'https://api.openf1.org/v1';
    private cache: Map<string, { data: any; timestamp: number }> = new Map();
    private cacheDuration = 30 * 60 * 1000; // 30 минут (увеличено для снижения нагрузки)
    private requestDelay = 300; // Задержка между запросами в мс

    /**
     * Задержка между запросами
     */
    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async fetchWithCache<T>(endpoint: string, retries: number = 3): Promise<T> {
        const cacheKey = endpoint;
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
            return cached.data as T;
        }

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Добавляем задержку перед каждым запросом (кроме первого)
                if (attempt > 1) {
                    const backoffDelay = this.requestDelay * Math.pow(2, attempt - 1); // Экспоненциальная задержка
                    console.log(`⏳ Повторная попытка ${attempt}/${retries} через ${backoffDelay}ms...`);
                    await this.delay(backoffDelay);
                }

                const response = await fetch(`${this.baseUrl}${endpoint}`);

                if (response.status === 429) {
                    // Rate limit exceeded
                    console.warn(`⚠️ Rate limit для ${endpoint}, ждём...`);
                    if (attempt < retries) {
                        continue; // Попробуем ещё раз
                    }
                    throw new Error('Rate limit exceeded');
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                this.cache.set(cacheKey, { data, timestamp: Date.now() });

                // Небольшая задержка между успешными запросами
                await this.delay(this.requestDelay);

                return data as T;
            } catch (error) {
                if (attempt === retries) {
                    console.error(`❌ Не удалось загрузить данные после ${retries} попыток: ${endpoint}`);
                    throw error;
                }
            }
        }

        throw new Error('Unexpected error in fetchWithCache');
    }

    /**
     * Получить всех пилотов текущего сезона
     */
    async getDrivers(year: number = 2025): Promise<OpenF1Driver[]> {
        try {
            // Получаем пилотов из последних сессий
            const drivers = await this.fetchWithCache<OpenF1Driver[]>(
                `/drivers?year=${year}`
            );

            // Убираем дубликаты по driver_number
            return drivers.reduce((acc, driver) => {
                if (!acc.find(d => d.driver_number === driver.driver_number)) {
                    acc.push(driver);
                }
                return acc;
            }, [] as OpenF1Driver[]);
        } catch (error) {
            console.error('Ошибка при загрузке пилотов:', error);
            return [];
        }
    }

    /**
     * Получить все сессии сезона
     */
    async getSessions(year: number = 2025): Promise<OpenF1Session[]> {
        try {
            return await this.fetchWithCache<OpenF1Session[]>(`/sessions?year=${year}`);
        } catch (error) {
            console.error('Ошибка при загрузке сессий:', error);
            return [];
        }
    }

    /**
     * Получить гонки (только Race сессии)
     */
    async getRaces(year: number = 2025): Promise<OpenF1Session[]> {
        const sessions = await this.getSessions(year);
        return sessions.filter(s => s.session_type === 'Race');
    }

    /**
     * Получить квалификации
     */
    async getQualifying(year: number = 2025): Promise<OpenF1Session[]> {
        const sessions = await this.getSessions(year);
        return sessions.filter(s => s.session_type === 'Qualifying');
    }

    /**
     * Получить позиции пилотов в конкретной сессии
     */
    async getSessionPositions(sessionKey: number): Promise<OpenF1Position[]> {
        try {
            return await this.fetchWithCache<OpenF1Position[]>(
                `/position?session_key=${sessionKey}`
            );
        } catch (error) {
            console.error(`Ошибка при загрузке позиций для сессии ${sessionKey}:`, error);
            return [];
        }
    }

    /**
     * Очистить кеш
     */
    clearCache() {
        this.cache.clear();
    }
}

export const openF1Service = new OpenF1Service();