# Ficha de tienda — Coach Hub

Todo lo necesario para rellenar App Store Connect y Google Play Console.
Copia/pega directo; los tamaños de imagen y límites de caracteres ya están
respetados.

## Textos

**Nombre de la app** (iOS: máx. 30 car.) — 30/30
```
Coach Hub: Basketball Training
```

**Subtítulo** (solo iOS, máx. 30 car.) — 27/30
```
Rosters, Plays & Attendance
```

**Descripción corta** (solo Google Play, máx. 80 car.) — 73/80
```
Plan practices, track games and attendance, and run your basketball team.
```

**Descripción larga** (ambas tiendas, máx. 4000 car.)
```
Coach Hub is the simple way for amateur basketball coaches to run a team —
no spreadsheets, no group chats full of "who's coming tonight?"

ROSTER MANAGEMENT
Keep your players organized with names, positions, and active status, all
in one place you can check from your phone before practice.

TRAINING SESSIONS
Schedule practices with date, time, and duration, attach the exercises
and plays you're running, and add notes for the team.

WEEKLY SCHEDULE
See your whole training week at a glance — upcoming sessions, completed
ones, and attendance rates, organized day by day.

RECURRING WEEKLY SCHEDULE
Set up your team's weekly practice pattern once at the start of the
season — day, time, and duration — and generate the whole season's
sessions on the calendar in one tap.

ATTENDANCE TRACKING
Mark players present, absent, late, or excused for every session, and
watch your team's attendance rate over time.

EXERCISE LIBRARY
Start with a built-in library of shooting, dribbling, defense, passing,
and conditioning drills, organized by category and difficulty.

PLAYBOOK
Draw up plays on a virtual court with a simple diagram editor, save them
by category, and see how often each one actually gets run in practice.

SHOT CHARTS & DRILL TRACKING
Log drill attempts as makes and misses, or tap the exact spot on the
court where a shot was taken to build a real shot chart per player.

GAME TRACKING
Log final scores and full box scores — points, rebounds, assists,
steals, blocks, turnovers, fouls — by hand or by photographing your
scorebook and letting AI pull out the numbers.

PLAYER DEVELOPMENT
Rate each player's skills over time, keep private coaching notes, and
track injuries with recovery status, all in one player profile.

PLAYER/PARENT PORTAL
Share a private read-only link so a player or parent can check upcoming
sessions, attendance, and stats — no account or download required — and
opt in to a push notification before the next practice.

AI TRAINING INSIGHTS
Get smart suggestions based on your team's actual session history — which
categories you've been neglecting, and what to focus on next.

ENGLISH & SPANISH
The whole app is fully translated — switch languages any time from the
menu.

FREE TO START
The free plan covers 1 team and up to 15 players with the full built-in
exercise library — plenty for most amateur teams. Upgrade any time to add
unlimited players, more teams, custom exercises, and AI features.

Built for the volunteer coach, the weekend-league coach, the parent who
got roped into coaching — anyone running a team without a big club's
budget or staff behind them.
```

**Palabras clave** (solo iOS, máx. 100 car., separadas por comas sin
espacio) — 85/100
```
basketball,coach,team,roster,training,practice,attendance,youth,drills,playbook,games
```

**Categoría:** Sports / Deportes (en ambas tiendas)

## URLs

El backend ya está desplegado en Render — usa estas URLs directamente en
App Store Connect y Play Console:

| Campo | URL |
|---|---|
| Privacy Policy URL | `https://coach-hub-g99u.onrender.com/privacy` |
| Support URL | `https://coach-hub-g99u.onrender.com/support` |
| Marketing URL (opcional, solo iOS) | `https://coach-hub-g99u.onrender.com/` |

Las tres páginas ya existen en la app (`/privacy`, `/support`, `/terms`) y
son accesibles sin iniciar sesión.

Nota: el plan free de Render duerme el servicio tras un rato sin tráfico
y tarda unos segundos en despertar en la primera visita — normal, no
requiere acción.

## Icono

- `store-assets/play-icon-512.png` — icono de 512×512 para la ficha de
  Google Play (subida aparte del APK/AAB).
- Pendiente: el ícono fuente de **1024×1024 sin canal alfa** que las
  tiendas exigen para regenerar el set completo de iOS todavía no existe
  en el repo (los actuales llegan a 512×512). Ver el paso 2 de
  `MOBILE_DEPLOY.md` (`npx @capacitor/assets generate`, requiere
  `resources/icon.png`) — se hace una sola vez desde tu máquina.

## Gráfico de cabecera (Google Play)

- `store-assets/play-feature-graphic-1024x500.png` — obligatorio en Play
  Console, se sube en la sección "Ficha de la tienda principal".

## Capturas de pantalla

En `store-assets/screenshots/`, dos variantes por pantalla:

- `*-ios.png` — 1284×2778 px (clase 6.5", tamaño consolidado durante años
  para App Store Connect). **Verifica al subir**: Apple ajusta de vez en
  cuando qué clases de tamaño son obligatorias según los dispositivos
  vigentes — si App Store Connect pide una clase distinta (p. ej. 6.9"),
  sube estas igualmente primero; muchas veces las reescala o basta con
  volver a exportar a la resolución exacta que te indique en ese momento.
- `*-android.png` — 1080×1920 px, formato estándar de teléfono para Play
  Console (mínimo 2 capturas, hasta 8).

Pantallas incluidas actualmente: dashboard, horario semanal, sesiones de
entrenamiento, biblioteca de ejercicios, jugadores. Todas con datos de
ejemplo realistas (un equipo de 12 jugadores, sesiones de la semana,
asistencia variada) en el plan de pago, para mostrar la app completa.

**Pendiente**: desde que se capturaron estas pantallas se sumaron
Playbook, Partidos y el Perfil de Jugador (desarrollo, lesiones, mapa de
tiros) — vale la pena agregar 2-3 capturas más de esas pantallas antes de
enviar a revisión para que la ficha refleje toda la app. Ninguna tienda
exige un número fijo de capturas nuevas, pero más pantallas = mejor
conversión.

## Pendiente antes de enviar a revisión

- [x] Desplegar el backend en Render — ya está en producción
      (`coach-hub-g99u.onrender.com`) y `capacitor.config.ts` apunta ahí.
- [x] Cumplimiento de Guideline 3.1.1 (In-App Purchase) de Apple — el
      flujo de pago con Stripe ya está oculto dentro de la app nativa;
      mejorar de plan redirige al navegador. Ver `client/src/lib/billing.ts`.
- [ ] Agregar capturas de Playbook, Partidos y Perfil de Jugador (ver
      nota en la sección de Capturas de pantalla arriba).
- [ ] Cuestionario de clasificación de contenido (content rating) —
      se rellena directamente en cada consola, no es generable de
      antemano.
- [ ] Apple exige cuenta de desarrollador ($99/año) y Google Play
      cuenta de desarrollador ($25 pago único) antes de poder subir nada
      de esto.
- [ ] Ícono fuente de 1024×1024 (ver sección Icono arriba) y firma de
      release de Android (keystore) — ambos pendientes, requieren tu
      propia máquina (Mac/Android Studio), no se pueden generar desde
      este entorno. Ver `MOBILE_DEPLOY.md`.
