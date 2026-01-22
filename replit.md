# Państwo-Miasto (Country-City) Multiplayer Game

## Overview

A real-time multiplayer word game built with React and Express, where players compete to fill in categories (country, city, name, animal, thing, plant) starting with a randomly chosen letter. Features AI-powered answer validation using OpenAI, room-based matchmaking, and a colorful, playful UI.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state, local React state for UI
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Animations**: Framer Motion for smooth transitions and game states
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Server**: Node.js with HTTP server (supports future WebSocket integration)
- **API Design**: RESTful endpoints with Zod schema validation
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Session Storage**: connect-pg-simple for PostgreSQL-backed sessions

### Data Storage
- **Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Schema Location**: `shared/schema.ts` - shared between frontend and backend
- **Migrations**: Drizzle Kit with `db:push` command for schema synchronization

### Core Game Entities
- **Rooms**: Game lobbies with configurable rounds, timer, and categories
- **Players**: Users in rooms with scores, host status, and ready state
- **Rounds**: Individual game rounds with letter assignment and status tracking
- **Answers**: Player submissions per category with AI validation status

### AI Integration
- **Provider**: OpenAI API via Replit AI Integrations
- **Usage**: Answer validation to verify words match categories and start with correct letter
- **Features**: Chat, image generation, and audio processing capabilities available

### Real-time Synchronization
- **Method**: Polling-based game state synchronization (2-second intervals)
- **Session Persistence**: LocalStorage for player session tokens across page reloads

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### AI Services
- **OpenAI API**: Accessed through Replit AI Integrations for answer validation
- **Environment Variables**: `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`

### UI Components
- **shadcn/ui**: Pre-built accessible components based on Radix UI primitives
- **Radix UI**: Underlying headless component library for dialogs, menus, etc.
- **Lucide React**: Icon library

### Build & Development
- **Vite**: Frontend bundler with HMR support
- **esbuild**: Server-side bundling for production
- **TypeScript**: Full type safety across client and server