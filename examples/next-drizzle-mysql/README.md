# Next.js + Drizzle ORM + MySQL + Protect.js Example

This example demonstrates how to build a modern web application using:
- [Next.js](https://nextjs.org/) - React framework for production
- [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM for SQL databases
- [MySQL](https://www.mysql.com/) - Popular open-source relational database
- [Protect.js](https://cipherstash.com/protect) - Data protection and encryption library

## Features

- Full-stack TypeScript application
- Database migrations and schema management with Drizzle
- Data protection and encryption with Protect.js
- Modern UI with Tailwind CSS
- Form handling with React Hook Form and Zod validation
- Docker-based MySQL database setup

## Prerequisites

- Node.js 18+ 
- Docker and Docker Compose
- MySQL (if running locally without Docker)

## Getting Started

1. Clone the repository and install dependencies:
   ```bash
   pnpm install
   ```

2. Set up your environment variables:
   Copy the `.env.example` file to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Then update the environment variables in `.env.local` with your Protect.js configuration values.

3. Start the MySQL database using Docker:
   ```bash
   docker compose up -d
   ```

4. Run database migrations:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:3000`.

## Project Structure

- `/src` - Application source code
- `/drizzle` - Database migrations and schema
- `/public` - Static assets
- `drizzle.config.ts` - Drizzle ORM configuration
- `docker-compose.yml` - Docker configuration for MySQL

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:generate` - Generate database migrations
- `npm run db:migrate` - Run database migrations

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Protect.js Documentation](https://cipherstash.com/protect/docs)
- [MySQL Documentation](https://dev.mysql.com/doc/)
