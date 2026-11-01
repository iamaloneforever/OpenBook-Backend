import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  CreatePostDto,
  EditPostDto,
  FeedQueryDto,
  SaveProfileDto,
} from './social.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const validate = (type: Type, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: type });

describe('social input validation', () => {
  it('normalizes handles and trims text', async () => {
    const profile = (await validate(SaveProfileDto, {
      handle: 'Reader_123',
      displayName: ' Reader ',
    })) as SaveProfileDto;
    expect(profile.handle).toBe('reader_123');
    expect(profile.displayName).toBe('Reader');
    expect(await validate(CreatePostDto, { content: ' hello ' })).toEqual({
      content: 'hello',
    });
  });
  it.each([
    '',
    '  ',
    'a'.repeat(281),
    '\u0000text',
    'te\u000Bxt',
    '\uFFFFtext',
    null,
    1,
    {},
    [],
  ])('rejects invalid post content %j', async (content) => {
    await expect(validate(CreatePostDto, { content })).rejects.toThrow();
    await expect(validate(EditPostDto, { content })).rejects.toThrow();
  });
  it('accepts Unicode and newlines as plain text', async () => {
    await expect(
      validate(CreatePostDto, { content: 'کتاب 📖\n#reading' }),
    ).resolves.toBeDefined();
  });
  it.each([
    { authorId: 'attacker' },
    { tags: ['spoofed'] },
    { parentId: 'invalid' },
    { parentId: null },
    { isPublic: true },
  ])('rejects post field injection %j', async (extra) => {
    await expect(
      validate(CreatePostDto, { content: 'hello', ...extra }),
    ).rejects.toThrow();
  });
  it.each([
    { handle: 'a' },
    { handle: '../admin' },
    { handle: 'hello world' },
    { displayName: '  ' },
    { displayName: 'a'.repeat(81) },
    { bio: null },
    { bio: 'a'.repeat(161) },
    { isPublic: 'true' },
    { isPublic: null },
    { personalizeFeed: null },
    { avatarUrl: 'javascript:alert(1)' },
    { avatarUrl: 'http://example.com/image' },
    { websiteUrl: 'file:///etc/passwd' },
    { websiteUrl: 'https://user:pass@example.com' },
    { password: 'injection' },
  ])('rejects invalid profile fields %j', async (extra) => {
    await expect(
      validate(SaveProfileDto, {
        handle: 'reader',
        displayName: 'Reader',
        ...extra,
      }),
    ).rejects.toThrow();
  });
  it('allows explicitly clearing profile URLs', async () => {
    await expect(
      validate(SaveProfileDto, {
        handle: 'reader',
        displayName: 'Reader',
        avatarUrl: null,
        websiteUrl: null,
      }),
    ).resolves.toBeDefined();
  });
  it.each([
    { limit: 0 },
    { limit: -1 },
    { limit: 51 },
    { limit: 'NaN' },
    { limit: 1.5 },
    { mode: 'unknown' },
    { cursor: 'a'.repeat(16001) },
  ])('bounds feed queries %j', async (query) => {
    await expect(validate(FeedQueryDto, query)).rejects.toThrow();
  });
});
