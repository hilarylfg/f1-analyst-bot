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

export interface OpenF1SessionResult {
    session_key: number;
    driver_number: number;
    position: number | null; // ✅ Может быть null при DNF/DNS
    classified?: number; // Может отсутствовать
    grid_position?: number;
    points: number;
    time?: string | null;
    gap_to_leader?: string | null;
    interval?: string | null;
    laps_completed?: number;
    number_of_laps?: number; // ✅ Количество кругов
    team_name?: string;
    driver_name?: string;
    // ✅ НОВЫЕ поля для статуса
    dnf?: boolean;
    dns?: boolean;
    dsq?: boolean;
    duration?: string | null;
    meeting_key?: number;
}

class OpenF1Service {
    private baseUrl = 'https://api.openf1.org/v1';
    private cache: Map<string, { data: any; timestamp: number }> = new Map();
    private cacheDuration = 30 * 60 * 1000; // 30 минут
    private requestDelay = 500; // Задержка между запросами в мс

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
            console.log(`📦 Использую кеш для: ${endpoint}`);
            return cached.data as T;
        }

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (attempt > 1) {
                    const backoffDelay = this.requestDelay * Math.pow(2, attempt - 1);
                    console.log(`⏳ Повторная попытка ${attempt}/${retries} через ${backoffDelay}ms...`);
                    await this.delay(backoffDelay);
                }

                console.log(`🌐 Запрос: ${this.baseUrl}${endpoint}`);
                const response = await fetch(`${this.baseUrl}${endpoint}`);

                if (response.status === 429) {
                    console.warn(`⚠️ Rate limit для ${endpoint}, ждём...`);
                    if (attempt < retries) {
                        await this.delay(2000);
                        continue;
                    }
                    throw new Error('Rate limit exceeded');
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                this.cache.set(cacheKey, { data, timestamp: Date.now() });

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
        return sessions.filter(s => s.session_name === 'Race');
    }

    /**
     * Получить пилотов из конкретной сессии
     */
    async getDriversFromSession(sessionKey: number): Promise<OpenF1Driver[]> {
        try {
            return await this.fetchWithCache<OpenF1Driver[]>(`/drivers?session_key=${sessionKey}`);
        } catch (error) {
            console.error(`Ошибка при загрузке пилотов для сессии ${sessionKey}:`, error);
            return [];
        }
    }

    /**
     * Получить всех уникальных пилотов сезона
     */
    async getAllDriversFromSeason(year: number = 2025): Promise<OpenF1Driver[]> {
        const races = await this.getRaces(year);

        if (races.length === 0) {
            console.error('❌ Не найдено ни одной гонки');
            return [];
        }

        const completedRaces = races.filter(r => new Date(r.date_start) < new Date());

        if (completedRaces.length === 0) {
            console.warn('⚠️ Ещё не прошло ни одной гонки');
            return [];
        }

        console.log(`👥 Загружаю пилотов из последних 3 гонок...`);

        const driverMap = new Map<number, OpenF1Driver>();
        const racesToCheck = completedRaces.slice(-3);

        for (const race of racesToCheck) {
            const raceDrivers = await this.getDriversFromSession(race.session_key);
            raceDrivers.forEach(d => {
                if (!driverMap.has(d.driver_number)) {
                    driverMap.set(d.driver_number, d);
                }
            });
        }

        const allDrivers = Array.from(driverMap.values());
        console.log(`✅ Загружено ${allDrivers.length} уникальных пилотов`);

        return allDrivers;
    }

    /**
     * Получить квалификации
     */
    async getQualifying(year: number = 2025): Promise<OpenF1Session[]> {
        const sessions = await this.getSessions(year);
        return sessions.filter(s => s.session_type === 'Qualifying');
    }

    /**
     * НОВЫЙ МЕТОД: Получить официальные результаты сессии (с учётом штрафов и DSQ)
     */
    async getSessionResults(sessionKey: number): Promise<OpenF1SessionResult[]> {
        try {
            return await this.fetchWithCache<OpenF1SessionResult[]>(
                `/session_result?session_key=${sessionKey}`
            );
        } catch (error) {
            console.error(`Ошибка при загрузке результатов сессии ${sessionKey}:`, error);
            return [];
        }
    }

    /**
     * УСТАРЕВШИЙ МЕТОД (оставляем для совместимости, но не используем)
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