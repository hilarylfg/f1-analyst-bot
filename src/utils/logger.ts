export class Logger {
	private verbose: boolean

	constructor(verbose: boolean = false) {
		this.verbose = verbose
	}

	info(message: string) {
		console.log(`ℹ️  ${message}`)
	}

	success(message: string) {
		console.log(`✅ ${message}`)
	}

	error(message: string, error?: unknown) {
		console.error(`❌ ${message}`, error || '')
	}

	warn(message: string) {
		console.warn(`⚠️  ${message}`)
	}

	debug(message: string) {
		if (this.verbose) {
			console.log(`🔍 ${message}`)
		}
	}
}

export const logger = new Logger(process.env.NODE_ENV === 'development')
