# Ficha de tienda — Coach Hub

Todo lo necesario para rellenar App Store Connect y Google Play Console.
Copia/pega directo; los tamaños de imagen y límites de caracteres ya están
respetados.

## Textos

**Nombre de la app** (iOS: máx. 30 car.) — 30/30
```
Coach Hub: Basketball Training
```

**Subtítulo** (solo iOS, máx. 30 car.) — 25/30
```
Team Rosters & Attendance
```

**Descripción corta** (solo Google Play, máx. 80 car.) — 68/80
```
Plan practices, track attendance, and manage your basketball roster.
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
you're running, and add notes for the team.

WEEKLY SCHEDULE
See your whole training week at a glance — upcoming sessions, completed
ones, and attendance rates, organized day by day.

ATTENDANCE TRACKING
Mark players present, absent, late, or excused for every session, and
watch your team's attendance rate over time.

EXERCISE LIBRARY
Start with a built-in library of shooting, dribbling, defense, passing,
and conditioning drills, organized by category and difficulty.

AI TRAINING INSIGHTS
Get smart suggestions based on your team's actual session history — which
categories you've been neglecting, and what to focus on next.

FREE TO START
The free plan covers 1 team and up to 15 players with the full built-in
exercise library — plenty for most amateur teams. Upgrade any time to add
unlimited players, more teams, and your own custom exercises.

Built for the volunteer coach, the weekend-league coach, the parent who
got roped into coaching — anyone running a team without a big club's
budget or staff behind them.
```

**Palabras clave** (solo iOS, máx. 100 car., separadas por comas sin
espacio) — 87/100
```
basketball,coach,team,roster,training,practice,attendance,youth,exercise,drills
```

**Categoría:** Sports / Deportes (en ambas tiendas)

## URLs

Rellena estas casillas cuando la app esté desplegada (Render u otro
hosting) — App Store Connect y Play Console las piden como URLs reales,
no `mailto:`:

| Campo | URL |
|---|---|
| Privacy Policy URL | `https://<tu-dominio-o-app>.onrender.com/privacy` |
| Support URL | `https://<tu-dominio-o-app>.onrender.com/support` |
| Marketing URL (opcional, solo iOS) | `https://<tu-dominio-o-app>.onrender.com/` |

Las tres páginas ya existen en la app (`/privacy`, `/support`, `/terms`) y
son accesibles sin iniciar sesión.

## Icono

- `store-assets/play-icon-512.png` — icono de 512×512 para la ficha de
  Google Play (subida aparte del APK/AAB).
- El icono de iOS (1024×1024) ya está integrado en el proyecto Xcode en
  `ios/App/App/Assets.xcassets/AppIcon.appiconset/` — no hace falta
  subirlo aparte, se genera al compilar.

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

Pantallas incluidas: dashboard, horario semanal, sesiones de
entrenamiento, biblioteca de ejercicios, jugadores. Todas con datos de
ejemplo realistas (un equipo de 12 jugadores, sesiones de la semana,
asistencia variada) en el plan de pago, para mostrar la app completa.

## Pendiente antes de enviar a revisión

- [ ] Desplegar en Render (o donde corresponda) y sustituir los
      placeholders de URL de arriba.
- [ ] Cuestionario de clasificación de contenido (content rating) —
      se rellena directamente en cada consola, no es generable de
      antemano.
- [ ] Apple exige cuenta de desarrollador ($99/año) y Google Play
      cuenta de desarrollador ($25 pago único) antes de poder subir nada
      de esto.
- [ ] Revisar el aviso de In-App Purchase de Apple (Guideline 3.1.1) en
      `MOBILE_DEPLOY.md` antes de enviar la versión iOS a revisión.
