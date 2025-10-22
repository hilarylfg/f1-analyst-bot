export interface RaceResult {
	track: string
	position: string
	no: number
	driver: string
	team: string
	startingGrid: number
	laps: number
	points: number
	isSprint: boolean
	isClassified: boolean
	gap: string
	isPreliminary: boolean
	date: string
	isDNF: boolean
	isDNS: boolean
	isDSQ: boolean
}

export interface QualifyingResult {
	track: string
	position: number
	no: number
	driver: string
	team: string
	laps: number
}

export interface DriverStanding {
	position: number
	driver: string
	team: string
	points: number
	wins: number
	podiums: number
	polePositions: number
	dnfs: number
}

export interface TeamStanding {
	position: number
	team: string
	points: number
	wins: number
	podiums: number
}

export interface OpenF1Driver {
	driver_number: number
	broadcast_name: string
	full_name: string
	name_acronym: string
	team_name: string
	team_colour: string
	country_code: string
}

export interface OpenF1Session {
	session_key: number
	session_name: string
	date_start: string
	date_end: string
	location: string
	circuit_short_name: string
	year: number
}

export interface OpenF1SessionResult {
	session_key: number
	driver_number: number
	position: number | null
	grid_position?: number
	points: number
	gap_to_leader?: string | null
	number_of_laps?: number
	team_name?: string
	dnf?: boolean
	dns?: boolean
	dsq?: boolean
	duration?: string | null
}
