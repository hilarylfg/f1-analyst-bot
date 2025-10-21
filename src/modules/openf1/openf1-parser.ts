import {type OpenF1Driver, openF1Service, type OpenF1Session} from './openf1.js';

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

// Таблица очков F1 2025
const POINTS_SYSTEM: { [position: number]: number } = {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
    6: 8, 7: 6, 8: 4, 9: 2, 10: 1
};

class OpenF1DataParser {
    private raceResults: RaceResult[] = [];
    private qualifyingResults: QualifyingResult[] = [];
    private drivers: OpenF1Driver[] = [];
    private races: OpenF1Session[] = [];
    private lastUpdate: number = 0;
    private updateInterval = 30 * 60 * 1000; // 30 минут
    private isLoading: boolean = false;
    private loadingPromise: Promise<void> | null = null;
    private isInitialized: boolean = false;

    constructor() {
        // Не вызываем loadData() в конструкторе
    }

    /**
     * Инициализация парсера (нужно вызвать перед использованием)
     */
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

        // Автоматическое обновление каждые 30 минут
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
        try {
            console.log('🔄 Загрузка данных из OpenF1 API...');

            // Загружаем пилотов и гонки
            this.drivers = await openF1Service.getDrivers(2025);
            this.races = await openF1Service.getRaces(2025);

            console.log(`📊 Найдено ${this.drivers.length} пилотов и ${this.races.length} гонок`);

            // ДЕБАГ: Показываем список пилотов
            console.log('\n👥 СПИСОК ПИЛОТОВ:');
            this.drivers.forEach(d => {
                console.log(`   #${d.driver_number} - ${d.broadcast_name} (${d.team_name})`);
            });

            // ДЕБАГ: Показываем список гонок
            console.log('\n🏁 СПИСОК ГОНОК:');
            this.races.forEach(r => {
                const isPast = new Date(r.date_start) < new Date();
                console.log(`   ${r.circuit_short_name || r.location} - ${r.date_start} ${isPast ? '✅ прошла' : '⏰ будущая'}`);
            });

            // Загружаем результаты гонок ПОСЛЕДОВАТЕЛЬНО
            await this.loadRaceResults();

            this.lastUpdate = Date.now();

            console.log(`\n✅ Данные успешно обновлены!`);
            console.log(`📋 Результатов гонок: ${this.raceResults.length}`);
            console.log(`📋 Уникальных трасс: ${this.getAllTracks().length}`);
            console.log(`👥 Уникальных пилотов в результатах: ${new Set(this.raceResults.map(r => r.driver)).size}`);

            // ДЕБАГ: Показываем первые 5 результатов
            console.log('\n🔍 ПРИМЕРЫ РЕЗУЛЬТАТОВ (первые 5):');
            this.raceResults.slice(0, 5).forEach(r => {
                console.log(`   ${r.track}: P${r.position} - ${r.driver} (${r.team}) - ${r.points} очков`);
            });

            // ДЕБАГ: Показываем статистику по трассам
            console.log('\n📊 РЕЗУЛЬТАТЫ ПО ТРАССАМ:');
            const trackStats = new Map<string, number>();
            this.raceResults.forEach(r => {
                trackStats.set(r.track, (trackStats.get(r.track) || 0) + 1);
            });
            trackStats.forEach((count, track) => {
                console.log(`   ${track}: ${count} результатов`);
            });

        } catch (error) {
            console.error('❌ Ошибка при загрузке данных из OpenF1:', error);
        } finally {
            this.isLoading = false;
            this.loadingPromise = null;
        }
    }

    private async loadRaceResults() {
        this.raceResults = [];

        // Фильтруем только прошедшие гонки
        const completedRaces = this.races.filter(race => new Date(race.date_start) < new Date());

        console.log(`\n📥 Загружаю результаты ${completedRaces.length} прошедших гонок...`);

        // ВАЖНО: Загружаем ПОСЛЕДОВАТЕЛЬНО, а не параллельно!
        for (let i = 0; i < completedRaces.length; i++) {
            const race = completedRaces[i];

            try {
                console.log(`\n⏳ [${i + 1}/${completedRaces.length}] Загрузка: ${race.circuit_short_name || race.location}`);
                console.log(`   Session Key: ${race.session_key}`);

                const positions = await openF1Service.getSessionPositions(race.session_key);

                console.log(`   📦 Получено ${positions.length} записей о позициях`);

                if (positions.length === 0) {
                    console.warn(`   ⚠️ Нет данных о позициях`);
                    continue;
                }

                // Берем финальные позиции (последние записи для каждого пилота)
                const finalPositions = this.getFinalPositions(positions);

                console.log(`   ✓ Обработано ${finalPositions.length} финальных позиций`);

                // ДЕБАГ: Показываем топ-3
                console.log(`   🏆 Топ-3:`);
                finalPositions.slice(0, 3).forEach(pos => {
                    const driver = this.drivers.find(d => d.driver_number === pos.driver_number);
                    console.log(`      P${pos.position}: #${pos.driver_number} ${driver?.broadcast_name || 'Unknown'}`);
                });

                let addedCount = 0;
                finalPositions.forEach((pos) => {
                    const driver = this.drivers.find(d => d.driver_number === pos.driver_number);
                    if (!driver) {
                        console.warn(`   ⚠️ Пилот с номером ${pos.driver_number} не найден`);
                        return;
                    }

                    const position = pos.position;
                    const points = POINTS_SYSTEM[position] || 0;

                    this.raceResults.push({
                        track: race.circuit_short_name || race.location,
                        position: position.toString(),
                        no: driver.driver_number,
                        driver: driver.broadcast_name,
                        team: driver.team_name,
                        startingGrid: 0,
                        laps: 0,
                        timeRetired: '',
                        points: points,
                        setFastestLap: false,
                        fastestLapTime: '',
                    });
                    addedCount++;
                });

                console.log(`   ✅ Добавлено ${addedCount} результатов. Всего в базе: ${this.raceResults.length}`);

            } catch (error) {
                console.error(`   ❌ Ошибка при загрузке гонки:`, error);
                // Продолжаем загрузку остальных гонок
            }
        }
    }

    private getFinalPositions(positions: any[]): any[] {
        // Группируем по driver_number и берем последнюю позицию
        const driverMap = new Map();

        positions.forEach(pos => {
            const existing = driverMap.get(pos.driver_number);
            if (!existing || new Date(pos.date) > new Date(existing.date)) {
                driverMap.set(pos.driver_number, pos);
            }
        });

        return Array.from(driverMap.values())
            .filter(p => p.position > 0) // Убираем невалидные позиции
            .sort((a, b) => a.position - b.position);
    }

    getRaceResults(): RaceResult[] {
        console.log(`🔍 getRaceResults() вызван: возвращаю ${this.raceResults.length} результатов`);
        return this.raceResults;
    }

    getQualifyingResults(): QualifyingResult[] {
        return this.qualifyingResults;
    }

    getRacesByTrack(track: string): RaceResult[] {
        const results = this.raceResults.filter(r =>
            r.track.toLowerCase().includes(track.toLowerCase())
        );
        console.log(`🔍 getRacesByTrack("${track}"): найдено ${results.length} результатов`);
        return results;
    }

    getDriverResults(driverName: string): RaceResult[] {
        const results = this.raceResults.filter(r =>
            r.driver.toLowerCase().includes(driverName.toLowerCase())
        );
        console.log(`🔍 getDriverResults("${driverName}"): найдено ${results.length} результатов`);
        return results;
    }

    getAllTracks(): string[] {
        const tracks = [...new Set(this.raceResults.map(r => r.track))];
        console.log(`🔍 getAllTracks(): найдено ${tracks.length} уникальных трасс:`, tracks);
        return tracks;
    }

    getAllDrivers(): string[] {
        const drivers = this.drivers.map(d => d.broadcast_name).sort();
        console.log(`🔍 getAllDrivers(): ${drivers.length} пилотов`);
        return drivers;
    }

    /**
     * Проверка готовности данных
     */
    isReady(): boolean {
        const ready = this.isInitialized && this.raceResults.length > 0;
        console.log(`🔍 isReady(): ${ready} (initialized: ${this.isInitialized}, results: ${this.raceResults.length})`);
        return ready;
    }

    /**
     * Получить информацию о последнем обновлении
     */
    getLastUpdateInfo(): string {
        if (this.lastUpdate === 0) {
            return 'Данные загружаются...';
        }
        const minutes = Math.floor((Date.now() - this.lastUpdate) / 60000);
        return `Обновлено ${minutes} мин. назад`;
    }

    /**
     * ДЕБАГ: Вывести всю статистику
     */
    debugPrintStats(): void {
        console.log('\n' + '='.repeat(60));
        console.log('📊 СТАТИСТИКА ДАННЫХ F1');
        console.log('='.repeat(60));
        console.log(`Инициализирован: ${this.isInitialized}`);
        console.log(`Загружается: ${this.isLoading}`);
        console.log(`Последнее обновление: ${this.lastUpdate ? new Date(this.lastUpdate).toISOString() : 'никогда'}`);
        console.log(`\nПилоты: ${this.drivers.length}`);
        console.log(`Гонки: ${this.races.length}`);
        console.log(`Результаты: ${this.raceResults.length}`);
        console.log(`Уникальные трассы: ${this.getAllTracks().length}`);
        console.log(`Уникальные пилоты в результатах: ${new Set(this.raceResults.map(r => r.driver)).size}`);
        console.log('='.repeat(60) + '\n');
    }
}

// Singleton экземпляр
export const f1Data = new OpenF1DataParser();