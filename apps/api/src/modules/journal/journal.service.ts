import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import type { JournalEntry } from '../../generated/prisma/client.js';
import type {
  CreateJournalEntryDto,
  JournalEntryDto,
  JournalPageDto,
  UpdateJournalEntryDto,
} from './dto.js';

const toDto = (e: JournalEntry): JournalEntryDto => ({
  id: e.id,
  accountId: e.accountId,
  date: e.date,
  title: e.title,
  body: e.body,
  tags: e.tags,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
});

const cleanTags = (tags: string[] | undefined) =>
  tags ? [...new Set(tags.map((t) => t.trim()).filter(Boolean))] : undefined;

/** Trading journal ("Notebook"): private notes per user, newest first, cursor-paginated. */
@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, cursor?: string, limit = 30): Promise<JournalPageDto> {
    const rows = await this.prisma.journalEntry.findMany({
      where: { userId, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map(toDto),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  async create(userId: string, dto: CreateJournalEntryDto): Promise<JournalEntryDto> {
    if (dto.accountId) {
      const acc = await this.prisma.tradingAccount.findFirst({
        where: { id: dto.accountId, userId },
        select: { id: true },
      });
      if (!acc) throw Errors.notFound('Account');
    }
    const e = await this.prisma.journalEntry.create({
      data: {
        userId,
        accountId: dto.accountId ?? null,
        date: dto.date,
        title: dto.title.trim(),
        body: dto.body,
        tags: cleanTags(dto.tags) ?? [],
      },
    });
    return toDto(e);
  }

  private async own(userId: string, id: string) {
    const e = await this.prisma.journalEntry.findFirst({ where: { id, userId } });
    if (!e) throw Errors.notFound('JournalEntry');
    return e;
  }

  async update(userId: string, id: string, dto: UpdateJournalEntryDto): Promise<JournalEntryDto> {
    await this.own(userId, id);
    const e = await this.prisma.journalEntry.update({
      where: { id },
      data: {
        ...(dto.date !== undefined && { date: dto.date }),
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.tags !== undefined && { tags: cleanTags(dto.tags) }),
      },
    });
    return toDto(e);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.own(userId, id);
    await this.prisma.journalEntry.delete({ where: { id } });
  }
}
