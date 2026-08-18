# Backboard — App Store / Play Store

Checklist para terminar de publicar la app. Capacitor ya está instalado y
configurado; esto es lo que falta y en qué orden conviene hacerlo.

## 1. Desplegar el backend (bloqueante, hacer primero)

La app nativa carga el sitio real por HTTPS (`server.url` en
`capacitor.config.ts`), no una copia offline — así el login (cuenta propia
por coach) y las cookies de sesión funcionan igual que en el navegador, sin
tocar CORS.

1. Desplegar con `render.yaml` (o donde prefieras) y confirmar que
   `https://tu-app...` responde bien desde afuera.
2. En `capacitor.config.ts`, descomentar el bloque `server` y poner esa URL.
3. Correr `npm run build && npx cap sync`.

Sin este paso la app nativa no tiene con quién hablar.

## 2. Ícono y splash reales

Los íconos actuales (`client/public/icon-*.png`) llegan a 512×512, pero las
tiendas piden un ícono fuente de **1024×1024 sin canal alfa**. Con eso:

```
npx @capacitor/assets generate --iconBackgroundColor '#DB3A00' --splashBackgroundColor '#DB3A00'
```

(requiere `resources/icon.png` de 1024×1024 y `resources/splash.png`).

## 3. Android (se puede hacer todo en Linux/Windows/Mac)

1. Abrir la carpeta `android/` en Android Studio, o compilar por CLI:
   `cd android && ./gradlew bundleRelease` (esta sandbox no tiene salida de
   red hacia `dl.google.com`, así que el primer build hay que hacerlo desde
   tu máquina).
2. Generar un keystore de firma (`keytool -genkeypair ...`) y configurarlo
   en `android/app/build.gradle` — **guardalo bien, sin él no podés
   actualizar la app nunca más**.
3. Crear cuenta en Google Play Console (pago único ~US$25).
4. Subir el `.aab` firmado, completar ficha (descripción, capturas,
   política de privacidad).

## 4. iOS (necesita tu Mac)

1. `npx cap sync ios`
2. Abrir `ios/App/App.xcworkspace` en Xcode (no el `.xcodeproj`).
3. En Signing & Capabilities, elegir tu Apple Developer Team.
4. Cuenta en Apple Developer Program (US$99/año) si todavía no la tenés.
5. Product → Archive, subir a App Store Connect desde el Organizer.
6. Completar ficha en App Store Connect (capturas, descripción, política
   de privacidad, clasificación de edad).

## 5. Antes de mandar a revisión

- **Política de privacidad**: ambas tiendas la piden como URL pública,
  aunque la app no recolecte datos de terceros.
- **Capturas de pantalla**: tamaños específicos por dispositivo en cada
  tienda (Play: al menos 2; App Store: por tamaño de iPhone/iPad que
  soportes).
- **Cobros y App Store (importante, no lo pases por alto)**: Apple exige
  usar su propio In-App Purchase (StoreKit) para desbloquear funciones
  *dentro* de la app de iOS — no un checkout externo como el de Stripe.
  Publicar la app de iOS con el botón "Upgrade" (que hoy manda a Stripe
  Checkout) visible adentro puede terminar en rechazo por la guideline
  3.1.1. Antes de mandar la versión de iOS a revisión, hay que ocultar el
  flujo de upgrade cuando la app corre embebida en Capacitor (se puede
  detectar con `Capacitor.isNativePlatform()`) y avisarle al coach que
  actualice su plan desde el navegador. Google Play es más permisivo con
  links externos según la región, pero conviene revisar su política de
  facturación también antes de publicar ahí. Web y Android vía navegador
  no tienen este problema — Stripe funciona normal.

## Referencia rápida

- `capacitor.config.ts` — config central (appId, nombre, URL del backend).
- `android/` y `ios/` — proyectos nativos generados por Capacitor. Se
  regeneran con `npx cap sync` después de cada `npm run build`; no hace
  falta tocarlos a mano salvo para firma/config nativa específica.
- Cada vez que cambia el código del cliente: `npm run build && npx cap sync`.
