import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import * as path from 'path';

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

class F1DataParser {
    private raceResults: RaceResult[] = [];
    private qualifyingResults: QualifyingResult[] = [];

    constructor() {
        this.loadData();
    }

    private loadData() {
        // Используем process.cwd() для получения корня проекта
        const raceFilePath = path.join(process.cwd(), 'data', 'F1_2025_RaceResults.csv');
        const qualifyingFilePath = path.join(process.cwd(), 'data', 'F1_2025_QualifyingResults.csv');

        console.log('📂 Загрузка данных из:', raceFilePath);

        // Проверяем существование файлов
        if (!fs.existsSync(raceFilePath)) {
            throw new Error(`❌ Файл не найден: ${raceFilePath}\n\nУбедитесь, что CSV файлы находятся в папке 'data/' в корне проекта.`);
        }
        if (!fs.existsSync(qualifyingFilePath)) {
            throw new Error(`❌ Файл не найден: ${qualifyingFilePath}\n\nУбедитесь, что CSV файлы находятся в папке 'data/' в корне проекта.`);
        }

        // Парсим результаты гонок
        const raceBuffer = fs.readFileSync(raceFilePath);
        const raceRecords = parse(raceBuffer, { columns: true, skip_empty_lines: true });

        this.raceResults = raceRecords.map((record: any) => ({
            track: record.Track,
            position: record.Position,
            no: parseInt(record.No),
            driver: record.Driver,
            team: record.Team,
            startingGrid: parseInt(record['Starting Grid']) || 0,
            laps: parseInt(record.Laps) || 0,
            timeRetired: record['Time/Retired'],
            points: parseInt(record.Points) || 0,
            setFastestLap: record['Set Fastest Lap'] === 'Yes',
            fastestLapTime: record['Fastest Lap Time'],
        }));

        // Парсим результаты квалификаций
        const qualifyingBuffer = fs.readFileSync(qualifyingFilePath);
        const qualifyingRecords = parse(qualifyingBuffer, { columns: true, skip_empty_lines: true });

        this.qualifyingResults = qualifyingRecords.map((record: any) => ({
            track: record.Track,
            position: parseInt(record.Position),
            no: parseInt(record.No),
            driver: record.Driver,
            team: record.Team,
            q1: record.Q1,
            q2: record.Q2,
            q3: record.Q3,
            laps: parseInt(record.Laps) || 0,
        }));

        console.log(`✅ Загружено ${this.raceResults.length} результатов гонок и ${this.qualifyingResults.length} результатов квалификаций`);
    }

    getRaceResults(): RaceResult[] {
        return this.raceResults;
    }

    getQualifyingResults(): QualifyingResult[] {
        return this.qualifyingResults;
    }

    getRacesByTrack(track: string): RaceResult[] {
        return this.raceResults.filter(r => r.track.toLowerCase() === track.toLowerCase());
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
        return [...new Set(this.raceResults.map(r => r.driver))].sort();
    }
}

// Singleton экземпляр
export const f1Data = new F1DataParser();