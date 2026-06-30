# 📖 OpenBook

<p align="center">
  <img src="https://img.shields.io/badge/Node-22.x-green?logo=nodedotjs" alt="Node Version" />
  <img src="https://img.shields.io/badge/NestJS-11.x-red?logo=nestjs" alt="NestJS Version" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Prisma-6.x-white?logo=prisma" alt="Prisma" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License" />
  <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/iamaloneforever/OpenBook-Backend?style=plastic&logo=github" />
</p>

---

> **OpenBook** — A modern, self‑hosted backend service to manage your personal book collection with full privacy and control.

---

## ✨ Features

- 📚 **Full Book Management** — Add, edit, delete, and organize your books
- 🔍 **Advanced Search & Filter** — Find books by title, author, genre, and more
- 👤 **User Authentication** — Secure JWT-based authentication
- 🏷️ **Tags & Categories** — Organize books with custom tags
- 📊 **Reading Status** — Track reading progress, wishlist, favorites
- 🌐 **RESTful API** — Well-structured and documented API endpoints
- 🗄️ **PostgreSQL + Prisma** — Robust database with type-safe ORM
- 🔒 **Self‑Hosted** — Your data stays on your server
- 🐳 **Docker Ready** — Easy deployment with Docker Compose

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v22.x or higher)
- PostgreSQL (v16.x or higher)
- npm / yarn / pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/iamaloneforever/OpenBook-Backend.git
cd OpenBook-Backend

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Update .env with your database credentials

# Run database migrations
npx prisma migrate dev

# Start the development server
npm run start:dev

```

> [!CAUTION]
> You need a client to use this project for client visit - (Still in development)

Developed By [Alone](https://www.iamalone.ir)
