import {PrismaClient, type User} from '@prisma/client';
import type {User as TelegramUser} from 'node-telegram-bot-api';

const prisma = new PrismaClient();

export async function findOrCreateUser(tgUser: TelegramUser): Promise<User> {
    if (!tgUser.id) {
        throw new Error("Telegram user ID is missing.");
    }

    return prisma.user.upsert({
        where: {tgId: BigInt(tgUser.id)},
        update: {username: tgUser.username},
        create: {
            tgId: BigInt(tgUser.id),
            username: tgUser.username,
            lang: tgUser.language_code || 'ru',
        },
    });
}

export async function grantConsent(userId: number, version: string): Promise<void> {
    await prisma.consent.create({
        data: {
            userId: userId,
            version: version
        }
    });
    console.log(`Consent version ${version} granted for user ID ${userId}`);
}