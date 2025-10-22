import { openF1Service, type OpenF1Driver, type OpenF1Session, type OpenF1SessionResult } from './openf1.js';

export interface RaceResult {
    track: string;
    position: string;
    no: number;
    driver: string;
    team: string;
    startingGrid: number;
    laps: number;
    timeRetired: string;
    points: number;
    setFastestLap: boolean;
    fastestLapTime: string;
    isSprint: boolean;
    isClassified: boolean;
    gap: string;
    isPreliminary: boolean;
    date: string;
    isDNF: boolean;
    isDNS: boolean;
    isDSQ: boolean;
}

export interface QualifyingResult {
    track: string;
    position: number;
    no: number;
    driver: string;
    team: string;
    q1: string;
    q2: string;
    q3: string;
    laps: number;
}

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

const POINTS_SYSTEM: { [position: number]: number } = {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
    6: 8, 7: 6, 8: 4, 9: 2, 10: 1
};

const SPRINT_POINTS_SYSTEM: { [position: number]: number } = {
    1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1
};

class OpenF1DataParser {
    private raceResults: RaceResult[] = [];
    private qualifyingResults: QualifyingResult[] = [];
    private drivers: OpenF1Driver[] = [];
    private currentDriverTeams: Map<number, string> = new Map(); // ТЕКУЩИЕ команды пилотов
    private races: OpenF1Session[] = [];
    private sprints: OpenF1Session[] = [];
    private lastUpdate: number = 0;
    private updateInterval = 30 * 60 * 1000;
    private isLoading: boolean = false;
    private loadingPromise: Promise<void> | null = null;
    private isInitialized: boolean = false;
    private hasPreliminaryResults: boolean = false;

    constructor() {}

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.log('✅ Парсер уже инициализирован');
            return;
        }

        if (this.loadingPromise) {
            console.log('⏳ Ожидание завершения текущей загрузки...');
            return this.loadingPromise;
        }

        this.loadingPromise = this.loadData();
        await this.loadingPromise;
        this.isInitialized = true;

        setInterval(() => {
            if (!this.isLoading) {
                console.log('🔄 Автоматическое обновление данных...');
                this.loadData();
            }
        }, this.updateInterval);
    }

    private async loadData(): Promise<void> {
        if (this.isLoading) {
            console.log('⏳ Загрузка уже выполняется, пропускаем...');
            return;
        }

        this.isLoading = true;
        this.hasPreliminaryResults = false;

        try {
            console.log('🔄 Загрузка данных из OpenF1 API...');

            const allSessions = await openF1Service.getSessions(2025);

            this.races = allSessions.filter((s: OpenF1Session) =>
                s.session_name === 'Race'
            );

            this.sprints = allSessions.filter((s: OpenF1Session) =>
                s.session_name === 'Sprint' || s.session_name === 'Sprint Race'
            );

            console.log(`📊 Найдено гонок: ${this.races.length}`);
            console.log(`🏃 Найдено спринтов: ${this.sprints.length}`);

            // ✅ Загружаем квалификации
            await this.loadQualifyingResults();

            await this.loadRaceResults();

            this.lastUpdate = Date.now();

            console.log(`\n✅ Данные успешно обновлены!`);
            console.log(`📋 Результатов гонок: ${this.raceResults.filter(r => !r.isSprint).length}`);
            console.log(`📋 Результатов спринтов: ${this.raceResults.filter(r => r.isSprint).length}`);
            console.log(`📋 Результатов квалификаций: ${this.qualifyingResults.length}`);
            console.log(`👥 Пилотов: ${this.drivers.length}`);

            if (this.hasPreliminaryResults) {
                console.log(`⚠️ ВНИМАНИЕ: Некоторые результаты предварительные`);
            }

        } catch (error) {
            console.error('❌ Ошибка при загрузке данных из OpenF1:', error);
        } finally {
            this.isLoading = false;
            this.loadingPromise = null;
        }
    }

    private async loadRaceResults() {
        this.raceResults = [];
        const driverMap = new Map<number, OpenF1Driver>();
        this.currentDriverTeams.clear();

        // Объединяем гонки и спринты
        const allSessions: Array<{ session: OpenF1Session, isSprint: boolean }> = [
            ...this.races.map(r => ({ session: r, isSprint: false })),
            ...this.sprints.map(s => ({ session: s, isSprint: true }))
        ];

        // Сортируем по дате (от старых к новым)
        allSessions.sort((a, b) =>
            new Date(a.session.date_start).getTime() - new Date(b.session.date_start).getTime()
        );

        const completedSessions = allSessions.filter(s =>
            new Date(s.session.date_start) < new Date()
        );

        console.log(`\n📥 Загружаю результаты ${completedSessions.length} прошедших сессий в хронологическом порядке...`);

        // Загружаем сессии по порядку
        for (let i = 0; i < completedSessions.length; i++) {
            const { session, isSprint } = completedSessions[i];
            await this.loadSessionResults(session, i, completedSessions.length, isSprint, driverMap);
        }

        // Берём ТЕКУЩИХ пилотов (для списка пилотов)
        this.drivers = Array.from(driverMap.values());
        console.log(`\n👥 Собрано ${this.drivers.length} уникальных пилотов`);

        // Показываем переходы
        this.logTeamChanges();

        // Сортируем результаты по дате
        this.raceResults.sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
    }

    private async loadQualifyingResults() {
        this.qualifyingResults = [];

        const allSessions = await openF1Service.getSessions(2025);
        const qualifyingSessions = allSessions.filter((s: OpenF1Session) =>
            s.session_name === 'Qualifying'
        );

        const completedQualifying = qualifyingSessions.filter(q =>
            new Date(q.date_start) < new Date()
        );

        console.log(`\n📥 Загружаю результаты ${completedQualifying.length} прошедших квалификаций...`);

        for (let i = 0; i < completedQualifying.length; i++) {
            const session = completedQualifying[i];

            try {
                console.log(`   [${i + 1}/${completedQualifying.length}] ${session.circuit_short_name || session.location}`);

                const sessionResults = await openF1Service.getSessionResults(session.session_key);

                if (sessionResults.length === 0) {
                    console.warn(`   ⚠️ Нет результатов квалификации`);
                    continue;
                }

                // Сортируем по позиции
                const sortedResults = sessionResults
                    .filter(r => r.position !== null && r.position > 0)
                    .sort((a, b) => (a.position || 999) - (b.position || 999));

                console.log(`   ✅ Поул: #${sortedResults[0]?.driver_number} P${sortedResults[0]?.position}`);

                // Получаем пилотов
                const sessionDrivers = await openF1Service.getDriversFromSession(session.session_key);

                sortedResults.forEach(result => {
                    const driver = sessionDrivers.find(d => d.driver_number === result.driver_number);

                    if (!driver || !result.position) return;

                    this.qualifyingResults.push({
                        track: session.circuit_short_name || session.location,
                        position: result.position,
                        no: driver.driver_number,
                        driver: driver.full_name,
                        team: driver.team_name,
                        q1: '',
                        q2: '',
                        q3: '',
                        laps: result.number_of_laps || 0,
                    });
                });

            } catch (error) {
                console.error(`   ❌ Ошибка загрузки квалификации:`, error);
            }
        }

        console.log(`✅ Загружено ${this.qualifyingResults.length} результатов квалификации`);
    }

    private normalizeDriverName(driverNumber: number, driverName: string): string {
        const nameMap: { [key: number]: string } = {
            12: 'Andrea Kimi ANTONELLI',
        };

        if (nameMap[driverNumber]) {
            console.log(`   🔄 Нормализация: #${driverNumber} "${driverName}" → "${nameMap[driverNumber]}"`);
            return nameMap[driverNumber];
        }

        return driverName;
    }
    private logTeamChanges() {
        console.log('\n🔄 Проверка переходов пилотов между командами...');

        const driverTeamHistory = new Map<number, Set<string>>();

        // Собираем историю команд
        this.raceResults.forEach(result => {
            if (!driverTeamHistory.has(result.no)) {
                driverTeamHistory.set(result.no, new Set());
            }
            driverTeamHistory.get(result.no)!.add(result.team);
        });

        // Находим пилотов с несколькими командами
        const transfers: string[] = [];
        driverTeamHistory.forEach((teams, driverNo) => {
            if (teams.size > 1) {
                const driver = this.raceResults.find(r => r.no === driverNo);
                if (driver) {
                    const teamList = Array.from(teams).join(' → ');
                    transfers.push(`#${driverNo} ${driver.driver}: ${teamList}`);
                }
            }
        });

        if (transfers.length > 0) {
            console.log('📝 Обнаружены переходы пилотов:');
            transfers.forEach(t => console.log(`   ${t}`));
        } else {
            console.log('✅ Переходов пилотов не обнаружено');
        }
    }

    private async loadSessionResults(
        session: OpenF1Session,
        index: number,
        total: number,
        isSprint: boolean,
        driverMap: Map<number, OpenF1Driver>
    ) {
        try {
            const sessionType = isSprint ? '🏃 SPRINT' : '🏁 RACE';
            const dateStr = new Date(session.date_start).toISOString().split('T')[0];
            console.log(`\n⏳ [${index + 1}/${total}] ${dateStr} ${sessionType}: ${session.circuit_short_name || session.location}`);
            console.log(`   session_key: ${session.session_key}`);

            // ✅ СНАЧАЛА получаем пилотов ЭТОЙ сессии (команды на момент гонки!)
            const sessionDrivers = await openF1Service.getDriversFromSession(session.session_key);
            const sessionDriverMap = new Map<number, OpenF1Driver>();

            sessionDrivers.forEach(d => {
                sessionDriverMap.set(d.driver_number, d);
                // Обновляем глобальную карту для текущей команды
                driverMap.set(d.driver_number, d);
                this.currentDriverTeams.set(d.driver_number, d.team_name);
            });

            const sessionResults = await openF1Service.getSessionResults(session.session_key);

            if (sessionResults.length > 0) {
                console.log(`   📦 Получено ${sessionResults.length} ОФИЦИАЛЬНЫХ результатов`);
                // ✅ Передаём карту пилотов ЭТОЙ сессии
                await this.processOfficialResults(session, sessionResults, isSprint, sessionDriverMap);
            } else {
                console.warn(`   ⚠️ Нет официальных результатов, используем ПРЕДВАРИТЕЛЬНЫЕ`);
                this.hasPreliminaryResults = true;
                await this.processPreliminaryResults(session, isSprint, sessionDriverMap);
            }

        } catch (error) {
            console.error(`   ❌ Ошибка:`, error);
        }
    }

    private async processOfficialResults(
        session: OpenF1Session,
        sessionResults: OpenF1SessionResult[],
        isSprint: boolean,
        sessionDriverMap: Map<number, OpenF1Driver>
    ) {
        const allResults = sessionResults.filter(r =>
            (r.position !== null && r.position > 0) || r.dnf || r.dns || r.dsq
        );

        const sortedResults = allResults.sort((a, b) => {
            if (a.position && b.position) return a.position - b.position;
            if (!a.position) return 1;
            if (!b.position) return -1;
            return 0;
        });

        console.log(`   🏆 Топ-3:`);
        sortedResults.slice(0, 3).forEach(result => {
            const driver = sessionDriverMap.get(result.driver_number);
            const teamName = result.team_name || driver?.team_name || '?';

            let status = '✅';
            if (result.dsq) status = '❌ DSQ';
            else if (result.dnf) status = '❌ DNF';
            else if (result.dns) status = '❌ DNS';

            // ✅ Нормализуем имя для вывода
            const normalizedName = driver ? this.normalizeDriverName(driver.driver_number, driver.full_name) : 'Unknown';

            console.log(`      P${result.position || 'NC'}: #${result.driver_number} ${normalizedName} (${teamName}) +${result.points} очков ${status}`);
        });

        let addedCount = 0;
        sortedResults.forEach((result) => {
            const driver = sessionDriverMap.get(result.driver_number);

            if (!driver) {
                console.warn(`   ⚠️ Пилот #${result.driver_number} не найден в сессии`);
                return;
            }

            const points = result.points;

            let positionString = '';
            let isClassified = true;

            if (result.dsq) {
                positionString = 'DSQ';
                isClassified = false;
            } else if (result.dns) {
                positionString = 'DNS';
                isClassified = false;
            } else if (result.dnf) {
                positionString = 'DNF';
                isClassified = false;
            } else if (result.position) {
                positionString = result.position.toString();
                isClassified = true;
            } else {
                positionString = 'NC';
                isClassified = false;
            }

            const teamAtRaceTime = result.team_name || driver.team_name;

            // ✅ НОРМАЛИЗУЕМ ИМЯ ПИЛОТА
            const normalizedDriverName = this.normalizeDriverName(driver.driver_number, driver.full_name);

            this.raceResults.push({
                track: session.circuit_short_name || session.location,
                position: positionString,
                no: driver.driver_number,
                driver: normalizedDriverName,
                team: teamAtRaceTime,
                startingGrid: result.grid_position || 0,
                laps: result.number_of_laps || 0,
                timeRetired: result.duration || '',
                points: points,
                setFastestLap: false,
                fastestLapTime: '',
                isSprint: isSprint,
                isClassified: isClassified,
                gap: result.gap_to_leader || '',
                isPreliminary: false,
                date: session.date_start,
                isDNF: result.dnf || false,
                isDNS: result.dns || false,
                isDSQ: result.dsq || false,
            });
            addedCount++;
        });

        console.log(`   ✅ Добавлено ${addedCount} результатов`);
    }

    private async processPreliminaryResults(
        session: OpenF1Session,
        isSprint: boolean,
        sessionDriverMap: Map<number, OpenF1Driver>
    ) {
        const positions = await openF1Service.getSessionPositions(session.session_key);

        if (positions.length === 0) {
            console.warn(`   ⚠️ Нет данных о позициях`);
            return;
        }

        const finalPositions = this.getFinalPositions(positions);
        const pointsTable = isSprint ? SPRINT_POINTS_SYSTEM : POINTS_SYSTEM;

        console.log(`   🏆 Топ-3 (ПРЕДВАРИТЕЛЬНО):`);
        finalPositions.slice(0, 3).forEach(pos => {
            const driver = sessionDriverMap.get(pos.driver_number);
            const points = pointsTable[pos.position] || 0;
            const normalizedName = driver ? this.normalizeDriverName(driver.driver_number, driver.full_name) : 'Unknown';
            console.log(`      P${pos.position}: #${pos.driver_number} ${normalizedName} (${driver?.team_name || '?'}) +${points} очков ⚠️`);
        });

        let addedCount = 0;
        finalPositions.forEach((pos) => {
            const driver = sessionDriverMap.get(pos.driver_number);

            if (!driver) {
                console.warn(`   ⚠️ Пилот #${pos.driver_number} не найден`);
                return;
            }

            const position = pos.position;
            const points = pointsTable[position] || 0;

            // ✅ НОРМАЛИЗУЕМ ИМЯ ПИЛОТА
            const normalizedDriverName = this.normalizeDriverName(driver.driver_number, driver.full_name);

            this.raceResults.push({
                track: session.circuit_short_name || session.location,
                position: position.toString(),
                no: driver.driver_number,
                driver: normalizedDriverName,
                team: driver.team_name,
                startingGrid: 0,
                laps: 0,
                timeRetired: '',
                points: points,
                setFastestLap: false,
                fastestLapTime: '',
                isSprint: isSprint,
                isClassified: true,
                gap: '',
                isPreliminary: true,
                date: session.date_start,
                isDNF: false,
                isDNS: false,
                isDSQ: false,
            });
            addedCount++;
        });

        console.log(`   ✅ Добавлено ${addedCount} ПРЕДВАРИТЕЛЬНЫХ результатов`);
    }

    private getFinalPositions(positions: any[]): any[] {
        const driverMap = new Map();

        positions.forEach(pos => {
            const existing = driverMap.get(pos.driver_number);
            if (!existing || new Date(pos.date) > new Date(existing.date)) {
                driverMap.set(pos.driver_number, pos);
            }
        });

        return Array.from(driverMap.values())
            .filter(p => p.position > 0)
            .sort((a, b) => a.position - b.position);
    }

    getRaceResults(): RaceResult[] {
        return this.raceResults;
    }

    getQualifyingResults(): QualifyingResult[] {
        return this.qualifyingResults;
    }

    getRacesByTrack(track: string): RaceResult[] {
        return this.raceResults.filter(r =>
            r.track.toLowerCase().includes(track.toLowerCase())
        );
    }

    getDriverResults(driverName: string): RaceResult[] {
        return this.raceResults.filter(r =>
            r.driver.toLowerCase().includes(driverName.toLowerCase())
        );
    }

    getAllTracks(): string[] {
        return [...new Set(this.raceResults.map(r => r.track))];
    }

    getAllDrivers(): string[] {
        return this.drivers.map(d => d.full_name).sort();
    }

    /**
     * Получить ТЕКУЩУЮ команду пилота
     */
    getCurrentTeam(driverNumber: number): string | undefined {
        return this.currentDriverTeams.get(driverNumber);
    }

    isReady(): boolean {
        return this.isInitialized && this.raceResults.length > 0;
    }

}

export const f1Data = new OpenF1DataParser();