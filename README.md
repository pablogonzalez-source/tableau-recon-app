# Reconciliation App — Deployment Guide

App multi-usuario para auditar dashboards de Tableau contra las plataformas fuente (MeLi, Amazon Ads, Amazon DSP), con análisis de screenshots por IA (Claude).

Esta guía te lleva desde cero hasta tener la app corriendo en una URL pública en **~45 minutos**, asumiendo que nunca usaste GitHub ni Vercel.

---

## Arquitectura

Tres servicios, todos con plan gratuito suficiente para un equipo chico:

- **Vercel** → hospeda el frontend (React) y corre los endpoints `/api/*` como funciones serverless. Acá vive tu API key de Anthropic.
- **Supabase** → base de datos Postgres compartida. Una tabla para audits, otra para investigations, otra para meta.
- **Anthropic** → la API que analiza las screenshots. Nunca llamada desde el navegador — siempre vía Vercel.

El navegador del usuario solo habla con Vercel. Vercel habla con Supabase y Anthropic.

---

## Lo que vas a necesitar

Antes de empezar, abrí una pestaña con cada uno y creá la cuenta (todo gratis):

1. **GitHub** — [github.com](https://github.com) (para hospedar el código)
2. **Vercel** — [vercel.com](https://vercel.com) (registrate con tu cuenta de GitHub, es lo más fácil)
3. **Supabase** — [supabase.com](https://supabase.com) (registrate con GitHub también)
4. **Anthropic Console** — [console.anthropic.com](https://console.anthropic.com) (para tu API key; necesitás cargarle algunos USD de crédito)

Para los créditos de Anthropic: con USD 5 te alcanza para analizar cientos de auditorías. Cada análisis de 4-6 screenshots cuesta entre USD 0.02 y 0.05.

---

## Paso 1 — Crear la base de datos en Supabase

1. Entrá a [supabase.com](https://supabase.com) y hacé click en **New project**.
2. Ponele un nombre (ej. `tableau-recon`) y elegí una región cerca tuyo (South America East · São Paulo está bien para Mx/Lat).
3. Generá una contraseña fuerte para la DB y **guardala** (no la vas a usar directamente, pero la podés necesitar después).
4. Esperá ~2 min mientras Supabase provisiona el proyecto.
5. Una vez listo, andá a la sección **SQL Editor** (ícono de terminal en la barra izquierda).
6. Pegá el siguiente SQL y dale **Run**:

```sql
-- Tabla de audits
create table audits (
  id text primary key,
  account text not null,
  surface text not null,
  period text,
  status text not null check (status in ('clean', 'warn', 'issue')),
  status_label text,
  summary text,
  platform_label text,
  rows jsonb default '[]'::jsonb,
  evidence jsonb default '[]'::jsonb,
  position int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabla de investigaciones
create table investigations (
  id text primary key,
  account text,
  title text not null,
  detail text,
  severity text not null check (severity in ('high', 'med')),
  position int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabla meta (siempre una sola fila)
create table meta (
  id int primary key default 1 check (id = 1),
  title text default 'Tableau Reconciliation',
  subtitle text,
  period text,
  updated_at timestamptz default now()
);

insert into meta (id, title, subtitle, period) values
  (1,
   'Tableau Reconciliation',
   'Side-by-side audit of Tableau dashboards against source platforms.',
   'Apr 1 – Apr 30, 2026')
on conflict (id) do nothing;
```

Vas a ver "Success. No rows returned" — perfecto.

7. Andá a **Settings → API**. Vas a copiar **2 valores** para usar después:
   - `Project URL` (ej. `https://xyzabc.supabase.co`)
   - `service_role` key (la *secret*, no la `anon`). Es larga, empieza con `eyJ...`

> ⚠️ La `service_role` key da acceso completo a la base. **Nunca** la pongas en el frontend ni la subas a GitHub. Solo va en variables de entorno de Vercel.

---

## Paso 2 — Conseguir tu API key de Anthropic

1. Entrá a [console.anthropic.com](https://console.anthropic.com).
2. Si es tu primera vez, andá a **Plans & Billing** y cargá al menos USD 5 de crédito.
3. Andá a **API Keys → Create Key**, ponele un nombre (`tableau-recon-app`) y copiala. Empieza con `sk-ant-api03-...`
4. **Guardala bien** — solo te la muestra una vez.

---

## Paso 3 — Conseguir el código

Te lo voy a entregar como un repositorio que vas a poner en tu GitHub.

> *Nota: el código de la app va en el siguiente paso de la conversación. Cuando lo tengas, va a venir como un zip que descomprimís. Por ahora seguí leyendo para entender el flujo completo.*

Cuando tengas el zip:

1. Descomprimilo en una carpeta (ej. `~/Desktop/recon-app/`).
2. Entrá a GitHub, click **New repository**, nombre `tableau-recon-app`, **Public** o **Private** (tu elección), **no** marques nada más, click **Create repository**.
3. En la página del repo recién creado vas a ver un comando como `git remote add origin ...`. Si no usás terminal, la opción más fácil es:
   - En la página del repo vacío, hacer click en **uploading an existing file**.
   - Arrastrar todos los archivos del zip (no la carpeta, los archivos adentro).
   - Click **Commit changes**.

Listo, tu código ya está en GitHub.

---

## Paso 4 — Deploy en Vercel

1. Entrá a [vercel.com](https://vercel.com) y click **Add New → Project**.
2. Vercel te muestra tus repos de GitHub. Elegí `tableau-recon-app` y click **Import**.
3. En la pantalla de configuración del proyecto, **antes de hacer Deploy**, expandí la sección **Environment Variables** y agregá las 3 variables siguientes:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | la key que copiaste de Anthropic (`sk-ant-...`) |
| `SUPABASE_URL` | el Project URL de Supabase (`https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | la service_role key larga (`eyJ...`) |

4. Click **Deploy** y esperá 1-2 min.
5. Cuando termine, Vercel te da una URL del estilo `tableau-recon-app.vercel.app`. Esa es tu app.

---

## Paso 5 — Probar que funcione

Abrí la URL en el navegador. Deberías ver el dashboard.

Si ves el dashboard pero te falla algo al guardar o analizar:

- **"No se guarda nada"** → revisá que `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` están bien en Vercel (Settings → Environment Variables). Si las modificaste, hacé un redeploy (Deployments → click los 3 puntitos del último deploy → Redeploy).
- **"Analyze falla"** → revisá `ANTHROPIC_API_KEY`. Asegurate también de tener crédito en la cuenta de Anthropic.
- **"Pantalla en blanco"** → abrí la consola del navegador (F12 → Console) y mostrame el error.

---

## Paso 6 — Compartir con el equipo

Como elegimos el modelo "cualquiera con el link puede entrar y editar":

1. Mandales la URL de Vercel (`tableau-recon-app.vercel.app`) por Slack/mail.
2. Si querés una URL más linda, en Vercel **Settings → Domains** podés conectar un dominio propio (`reconciliation.tuempresa.com`).

> Cada cambio se guarda en la DB compartida, así que todos ven lo mismo. Cuidado con que dos personas editen el mismo audit al mismo tiempo — la última escritura gana.

---

## Estructura del repo

Para que sepas qué vas a recibir:

```
tableau-recon-app/
├── README.md              ← esta guía
├── package.json           ← dependencias (React, Vite, Supabase, etc.)
├── vite.config.js         ← config del build
├── index.html             ← entry point HTML
├── .env.example           ← template de variables (las reales van en Vercel)
├── .gitignore
├── api/                   ← serverless functions (corren en Vercel)
│   ├── analyze.js         ← POST: análisis de screenshots con Claude
│   ├── audits.js          ← GET/POST/PUT/DELETE de audits
│   ├── investigations.js  ← GET/POST/PUT/DELETE de investigaciones
│   └── meta.js            ← GET/PUT del header
└── src/
    ├── main.jsx           ← arranque de React
    ├── App.jsx            ← componente principal
    └── api.js             ← cliente que habla con /api/*
```

---

## Correr el código en tu máquina (opcional)

Si querés editar el código y probarlo localmente antes de hacer deploy:

1. Instalá [Node.js](https://nodejs.org) (versión 20 o superior).
2. En la carpeta del proyecto, abrí terminal y corré:
   ```bash
   npm install
   ```
3. Copiá `.env.example` a `.env.local` y completá las 3 variables (mismas que pusiste en Vercel).
4. Arrancá el servidor de desarrollo:
   ```bash
   npm run dev
   ```
5. Abrí [localhost:5173](http://localhost:5173).

Cualquier cambio en `src/` se refleja al instante (hot reload). Los cambios en `api/` requieren reiniciar el server.

---

## Limitaciones conocidas y mejoras futuras

- **Imágenes en JSONB**: las screenshots se guardan como base64 directo en la DB. Funciona pero es pesado. Migración natural: usar Supabase Storage (bucket de imágenes) y guardar solo las URLs.
- **Sin auth**: cualquiera con el link entra. Si en algún momento querés agregar login, Supabase Auth se enchufa fácil — me decís y te paso el upgrade.
- **Sin tiempo real**: los cambios de otros usuarios se ven al recargar. Supabase Realtime soluciona esto con websockets, también es un upgrade simple.
- **Sin export**: no hay export a Excel/PDF todavía. Es agregable cuando lo necesites.

---

## Costos esperados

- **Vercel free tier**: cubre hasta 100 GB de bandwidth/mes — más que suficiente.
- **Supabase free tier**: 500 MB de DB, 5 GB de bandwidth/mes — alcanza para miles de audits.
- **Anthropic**: pagás por uso. Cada análisis de 4-6 screenshots ≈ USD 0.02-0.05. Con USD 10 hacés ~250 auditorías.

Total mensual estimado para un equipo de 5 personas haciendo 50 audits/mes: **~USD 3**.

---

## Próximos pasos

Cuando termines de leer:

1. Si todo el flujo te queda claro, decime y te genero el código (el zip con los archivos del repo).
2. Si hay alguna parte que no se entiende o querés cambiar, decime y ajusto la guía antes de generar el código.
