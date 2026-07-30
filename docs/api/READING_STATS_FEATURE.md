# Reading Statistics & Analytics Feature

## Overview
The Reading Statistics & Analytics feature tracks and displays user reading metrics and progress, providing insights into reading habits and achievements.

## New Endpoints

### GET `/reading-stats`
Returns user reading statistics (cached for 5 minutes).

**Authentication:** Required (JWT)

**Response:**
```json
{
  "id": "stats-1",
  "userId": "user-1",
  "totalBooksCompleted": 5,
  "totalPagesRead": 1500,
  "totalReadingTime": 0,
  "averageRating": 4.2,
  "currentStreak": 3,
  "longestStreak": 10,
  "lastReadDate": "2026-07-25T17:48:19.652+03:30",
  "createdAt": "2026-07-25T17:48:19.652+03:30",
  "updatedAt": "2026-07-25T17:48:19.652+03:30"
}
```

### GET `/reading-stats/dashboard`
Returns comprehensive reading dashboard with monthly statistics (cached for 5 minutes).

**Authentication:** Required (JWT)

**Response:**
```json
{
  "stats": {
    "id": "stats-1",
    "userId": "user-1",
    "totalBooksCompleted": 5,
    "totalPagesRead": 1500,
    "totalReadingTime": 0,
    "averageRating": 4.2,
    "currentStreak": 3,
    "longestStreak": 10,
    "lastReadDate": "2026-07-25T17:48:19.652+03:30",
    "createdAt": "2026-07-25T17:48:19.652+03:30",
    "updatedAt": "2026-07-25T17:48:19.652+03:30"
  },
  "summary": {
    "completedBooks": 5,
    "currentlyReading": 2,
    "totalPages": 1500
  },
  "monthlyStats": {
    "2026-01": { "books": 2, "pages": 450 },
    "2026-02": { "books": 1, "pages": 300 },
    "2026-03": { "books": 2, "pages": 750 }
  }
}
```

## Automatic Updates

Stats are automatically updated when:
1. **Book marked as COMPLETED** — totalBooksCompleted increments, totalPagesRead adds book pages, averageRating updates
2. **Any day a book is marked completed** — Reading streak updates

## Reading Streak Logic

- **Same day**: No change to streak
- **Consecutive days**: Streak increments by 1
- **Gap > 1 day**: Streak resets to 1
- **Longest streak**: Tracks maximum consecutive days (never resets)

## Database Schema

### ReadingStats Model
```prisma
model ReadingStats {
  id String @id @default(cuid())
  
  userId String @unique
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  totalBooksCompleted Int @default(0)
  totalPagesRead Int @default(0)
  totalReadingTime Int @default(0)
  averageRating Float @default(0)
  
  currentStreak Int @default(0)
  longestStreak Int @default(0)
  lastReadDate DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Code Structure

```
src/reading-stats/
├── reading-stats.controller.ts        # Handles HTTP requests
├── reading-stats.controller.spec.ts   # Controller tests
├── reading-stats.service.ts           # Business logic
├── reading-stats.service.spec.ts      # Service tests
└── reading-stats.module.ts            # Module definition
```

## Integration Points

### BookService Integration
When a book progress is set to `COMPLETED` status:
1. `ReadingStatsService.updateStatsOnCompletion()` is called
2. `ReadingStatsService.updateStreak()` is called

This happens automatically, no manual intervention needed.

## Tests

All tests pass using Vitest:
- 5 service tests
- 3 controller tests

Run tests:
```bash
npm run test -- reading-stats
```

## Future Enhancements

- Reading time tracking (pages per hour)
- Genre-based statistics
- Reading challenges
- Monthly reading goals
- Statistics export (CSV, PDF)
- Comparison with other users (optional, privacy-aware)
