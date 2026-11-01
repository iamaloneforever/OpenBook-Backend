import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SendMessageDto,
  SendSocketMessageDto,
  MessageHistoryDto,
} from './chat.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

describe('chat input validation', () => {
  it.each([
    '',
    '   ',
    'x'.repeat(4001),
    null,
    {},
    ['message'],
    'message\u0000',
    'unpaired\uD800',
  ])('rejects invalid message content %j', async (content) => {
    await expect(
      pipe.transform(
        { clientMessageId: randomUUID(), content },
        { type: 'body', metatype: SendMessageDto },
      ),
    ).rejects.toThrow();
  });
  it('trims text while preserving line breaks', async () => {
    const dto: unknown = await pipe.transform(
      { clientMessageId: randomUUID(), content: ' hello\nworld ' },
      { type: 'body', metatype: SendMessageDto },
    );
    expect(dto).toMatchObject({ content: 'hello\nworld' });
  });
  it.each([
    { spoiler: 'true' },
    { spoiler: null },
    { replyToId: 'not-a-message' },
    { books: [{ provider: 'local', id: 'c123456789012345678901234' }] },
    {
      books: [{ provider: 'openlibrary', id: 'OL1W', title: 'Forged preview' }],
    },
    { quote: { text: 'Quote', authorId: 'another-user' } },
    { quote: { text: 'x'.repeat(1001) } },
    { quote: { text: 'Quote', attribution: 'bad\u0000' } },
    { quote: { text: 'unpaired\uD800' } },
    { bookUrls: ['file:///etc/passwd'] },
  ])('rejects malformed rich-message metadata %j', async (extra) => {
    await expect(
      pipe.transform(
        { clientMessageId: randomUUID(), content: 'A message', ...extra },
        { type: 'body', metatype: SendMessageDto },
      ),
    ).rejects.toThrow();
  });
  it('rejects sender and room mass assignment', async () => {
    await expect(
      pipe.transform(
        {
          conversationId: 'c123456789012345678901234',
          clientMessageId: randomUUID(),
          content: 'hello',
          senderId: 'another-user',
          room: 'admin',
        },
        { type: 'body', metatype: SendSocketMessageDto },
      ),
    ).rejects.toThrow();
  });
  it.each([
    { limit: 101 },
    { limit: 1.5 },
    { before: -1 },
    { after: -1 },
    { before: 2147483648 },
  ])('bounds history queries %j', async (query) => {
    await expect(
      pipe.transform(query, { type: 'query', metatype: MessageHistoryDto }),
    ).rejects.toThrow();
  });
});
