# 🏗️ Rendszerarchitektúra és komponens-térkép

Ez a dokumentum a Főnix Időpont rendszer kanonikus architektúrális leírását tartalmazza.

---

## 1. Komponensek és felelősségi körök

### 1.1 Felhasználói és Konfigurációs Felület (`app.py`)
- **Technológia:** Streamlit (Python 3.x), `requests`, `python-dotenv`.
- **Felelősség:**
  - Felhasználói profilok (időpontfigyelők) CRUD kezelése.
  - Orvosok és szakrendelések kiválasztása egy statikus szótárból (`DOCTORS`, 84 tétel).
  - Figyelési paraméterek beállítása: hetek száma (`max_weeks`), lefoglalt időpont (`current_appointment_date`).
  - Értesítési csatorna konfigurálása (Telegram token és chat_id, vagy Pushbullet token).
  - Közvetlen kommunikáció a Supabase REST API-val (PostgREST) az anonim kulcs (`SUPABASE_KEY`) használatával.
  - Állapotkezelés: Streamlit `st.session_state` az inline szerkesztési műveletekhez.

### 1.2 Időpontfigyelő és Scraping Motor (`monitor.js`)
- **Technológia:** Node.js 22, Playwright (Chromium headless), `@supabase/supabase-js`, natív `fetch`.
- **Felelősség:**
  - Aktív konfigurációk lekérése a Supabase `monitors` táblából (`is_active = true`, 3x retry logikával).
  - Egyedi orvos azonosítók kigyűjtése (`uniqueDocIds`) a felesleges lekérdezések elkerülésére.
  - FőnixWeb portál (`https://fonixweb.szakrendelo16.hu/FonixWeb/`) automatizált autentikációja (központi hitelesítő adatokkal, 3x context-izolált retry, `.ASPXFORMSAUTHFONIXWEB` cookie verifikáció).
  - Orvosonkénti naptár-lapozás (`#ctl00_cphMaster_lbNextFree`), heti naptártáblázat (`#ctl00_cphMaster_gvx`) feldolgozása (`a.freeApp` linkek detektálása).
  - Szűrési logika: `max_weeks` és korábbi időpont feltétel (`current_appointment_date`) érvényesítése.
  - Értesítések összeállítása (orvosonként legfeljebb 3 legkorábbi időpont) és kiküldése (Telegram Bot API / Pushbullet API).

### 1.3 Ütemezett Végrehajtás (`.github/workflows/monitor.yml`)
- **Technológia:** GitHub Actions (`ubuntu-latest`, Node.js 22).
- **Felelősség:**
  - Periodikus futtatás 15 percenként cron alapján (`*/15 * * * *`) és manuális indítás (`workflow_dispatch`).
  - Függőségek és headless Chromium böngésző telepítése (`npm ci`, `npx playwright install chromium`).
  - Környezeti változók és titkok (`secrets.SUPABASE_URL`, `secrets.SUPABASE_KEY`, `secrets.USERNAME`, `secrets.PASSWORD`, `secrets.MAX_WEEKS`) átadása a futtatónak.

### 1.4 Adatmodell és Perzisztencia (Supabase)
- **Tábla:** `monitors`
- **Mezők:**
  - `id`: Elsődleges azonosító.
  - `name`: Profil/felhasználó megnevezése.
  - `fonix_username`, `fonix_password`: Hitelesítési adatok (jelenleg "shared").
  - `doctor_ids`: Orvosazonosítók tömbje (`text[]` vagy `jsonb`).
  - `max_weeks`: Keresési intervallum hetekben.
  - `current_appointment_date`: Meglévő időpont dátuma (csak ennél korábbi keresendő).
  - `notification_channel`: `'telegram'` vagy `'pushbullet'`.
  - `telegram_bot_token`, `telegram_chat_id`, `pushbullet_token`: Értesítési adatok.
  - `is_active`: Figyelés aktív státusza (`boolean`).

### 1.5 Értesítési Réteg
- **Telegram Bot API:** HTTP POST `https://api.telegram.org/bot<token>/sendMessage` HTML formázott üzenettel és közvetlen foglalási linkkel.
- **Pushbullet API:** HTTP POST `https://api.pushbullet.com/v2/pushes` jegyzetként (note) tokenes hitelesítéssel.
