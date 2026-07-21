# Coach Hub - Basketball Training Planner

## Overview

Coach Hub is a full-stack web application designed to help basketball coaches plan and manage training sessions. The application provides tools for creating and organizing exercises, scheduling training sessions, and tracking team activities. Built with modern web technologies, it offers an intuitive interface for coaches to streamline their training preparation and management workflows.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Framework**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom basketball-themed design tokens
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API endpoints with JSON responses
- **Data Validation**: Zod schemas for request/response validation
- **Session Management**: Configured for future session handling with connect-pg-simple

### Data Storage
- **Database**: PostgreSQL with Neon serverless backend
- **ORM**: Drizzle ORM for type-safe database operations
- **Schema Management**: Drizzle migrations with shared schema definitions
- **Current Storage**: PostgreSQL database implementation (DatabaseStorage class)
- **Connection**: Neon serverless with WebSocket support for Replit environment

## Key Components

### Database Schema
Located in `shared/schema.ts`, defines three main entities:
- **Exercises**: Training drills with categories, difficulty levels, and instructions
- **Training Sessions**: Scheduled practice sessions with exercise assignments
- **Players**: Team member information and status tracking

### Frontend Components
- **Layout**: Sidebar navigation with main content area
- **Pages**: Dashboard, Training Sessions, Exercise Library
- **Modals**: Session creation and exercise management
- **Cards**: Reusable exercise and session display components

### Backend Services
- **Storage Interface**: Abstract IStorage interface for data operations
- **Route Handlers**: RESTful endpoints for exercises, training sessions, and players
- **Validation**: Request/response validation using shared Zod schemas

### API Endpoints
- `GET/POST /api/exercises` - Exercise CRUD operations
- `GET/POST /api/training-sessions` - Training session management
- `GET/POST /api/players` - Player management
- `GET /api/stats` - Dashboard statistics

## Data Flow

1. **Client Requests**: React components make API calls using TanStack Query
2. **Server Processing**: Express routes handle requests with validation
3. **Data Operations**: Storage layer manages data persistence
4. **Response Handling**: JSON responses with error handling
5. **UI Updates**: React Query manages cache invalidation and UI updates

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Database connection for Neon PostgreSQL
- **drizzle-orm**: Type-safe ORM for database operations
- **@tanstack/react-query**: Server state management
- **react-hook-form**: Form handling and validation
- **zod**: Schema validation for TypeScript

### UI Dependencies
- **@radix-ui/***: Accessible UI primitives
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Component variant management
- **lucide-react**: Icon library

### Development Tools
- **vite**: Build tool and development server
- **tsx**: TypeScript execution for development
- **esbuild**: Production bundle optimization

## Deployment Strategy

### Development Environment
- **Replit Integration**: Configured for Replit development environment
- **Hot Reload**: Vite development server with HMR
- **Port Configuration**: Development server runs on port 5000
- **Environment**: NODE_ENV-based configuration switching

### Production Build
- **Client Build**: Vite builds React app to `dist/public`
- **Server Build**: esbuild bundles server code to `dist/index.js`
- **Static Assets**: Express serves built client assets
- **Database**: PostgreSQL with environment-based connection string

### Replit Configuration
- **Modules**: nodejs-20, web, postgresql-16
- **Run Command**: `npm run dev` for development
- **Build Process**: `npm run build` then `npm run start`
- **Deployment Target**: Autoscale deployment on Replit

## Recent Changes

✓ Added comprehensive player management system
✓ Created Players page with Spanish interface
✓ Added 18 sample Spanish player names with positions
✓ Implemented player activation/deactivation functionality
✓ Added player statistics dashboard
✓ Fixed sidebar navigation warnings
✓ Enhanced backend API with full player CRUD operations
✓ Migrated from in-memory storage to PostgreSQL database
✓ Implemented database seeding with sample data
✓ Added proper database connection with Neon serverless
✓ Created weekly schedule planning system
✓ Added attendance tracking with status options (Present, Absent, Late, Excused)
✓ Implemented calendar view for weekly training planning
✓ Added attendance modal for marking player presence
✓ Fixed dashboard functionality - all buttons and links now work properly
✓ Added navigation between pages from dashboard quick actions
✓ Enhanced AI recommendations with interactive modal and exercise navigation
✓ Implemented comprehensive basketball-themed visual design
✓ Added animations, patterns, and dynamic visual effects throughout the app
✓ Enhanced sidebar, cards, and components with orange color scheme and basketball elements

## Changelog

```
Changelog:
- June 24, 2025. Initial setup - Basic coaching app with exercises, sessions, dashboard
- June 24, 2025. Added player management - Spanish interface, 18 sample players, full CRUD operations
- June 24, 2025. Database migration - Switched from in-memory to PostgreSQL with automatic seeding
- June 24, 2025. Weekly planning - Added weekly schedule view and attendance tracking system
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
Preferred language: English for weekly schedule, Spanish for player management features.
Preferred design: Dynamic and interactive interfaces over static layouts.
Basketball-themed visual design with orange color scheme, animations, and sports-specific icons.
```