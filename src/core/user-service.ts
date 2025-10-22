import { PrismaClient, type User } from '@prisma/client'
import type { User as TelegramUser } from 'node-telegram-bot-api'

import { logger } from '../utils/logger.js'

const prisma = new PrismaClient()

export async function findOrCreateUser(tgUser: TelegramUser): Promise<User> {
	if (!tgUser.id) {
		throw new Error('Telegram user ID отсутствует')
	}

	try {
		return await prisma.user.upsert({
			where: { tgId: BigInt(tgUser.id) },
			update: {
				username: tgUser.username,
				updatedAt: new Date()
			},
			create: {
				tgId: BigInt(tgUser.id),
				username: tgUser.username,
				lang: tgUser.language_code || 'ru'
			}
		})
	} catch (error) {
		logger.error(
			`Ошибка создания/обновления пользователя ${tgUser.id}`,
			error
		)
		throw error
	}
}

export async function grantConsent(
	userId: number,
	version: string
): Promise<void> {
	try {
		await prisma.consent.create({
			data: {
				userId,
				version
			}
		})
		logger.info(
			`Согласие v${version} предоставлено пользователем ${userId}`
		)
	} catch (error) {
		logger.error(
			`Ошибка сохранения согласия для пользователя ${userId}`,
			error
		)
		throw error
	}
}
