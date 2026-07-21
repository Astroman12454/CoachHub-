# Coach Hub

Coach Hub es una aplicación web full-stack para ayudar a entrenadores de baloncesto a planificar y gestionar sus entrenamientos: biblioteca de ejercicios, sesiones de entrenamiento, jugadores y asistencia.

## Stack

- **Frontend**: React 18 + TypeScript, Vite, Wouter (routing), TanStack Query, Tailwind CSS, shadcn/ui, React Hook Form + Zod
- **Backend**: Node.js + Express, TypeScript (ES modules)
- **Base de datos**: PostgreSQL con Drizzle ORM (driver `pg`/`node-postgres`, funciona con cualquier Postgres: local, Neon, Supabase, Railway, etc.)

## Estructura del proyecto

```
client/     Aplicación React (Vite)
server/     API REST con Express
shared/     Esquema de base de datos y tipos compartidos (Drizzle + Zod)
```

## Requisitos previos

- Node.js 20+
- Una base de datos PostgreSQL, local o remota (por ejemplo [Neon](https://neon.tech), [Supabase](https://supabase.com) o [Railway](https://railway.app))

## Configuración

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Copiar el archivo de variables de entorno y completar la conexión a la base de datos:

   ```bash
   cp .env.example .env
   ```

3. Aplicar el esquema a la base de datos:

   ```bash
   npm run db:push
   ```

## Desarrollo

```bash
npm run dev
```

La app queda disponible en `http://localhost:5000` (sirve tanto la API como el cliente).

## Producción

```bash
npm run build
npm start
```

## Otros scripts

- `npm run check` — chequeo de tipos con TypeScript
