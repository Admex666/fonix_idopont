import streamlit as st
import requests
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# List of doctors extracted from FonixWeb
DOCTORS = {
    "2880574": "Ortopédia - Abonyi Bence dr. Ortopédia",
    "2880658": "Ortopédia - Pánti Zsombor Alpár dr. Ortopédia",
    "2880250": "Ortopédia - Budai-Bock László dr. Ortopédia",
    "2880607": "Ortopédia - Kessler-Rosivall Andrea dr. Ortopédia",
    "2880633": "Belgyógyászat - Belgyógyászat EKG",
    "2880659": "Belgyógyászat - Hülitzer Katinka dr. Angiológia",
    "2880467": "Belgyógyászat - Salamon Mónika dr. Belgyógyászat",
    "2880399": "Bőrgyógyászat - Dobray Mária dr. Bőrgyógyászat",
    "2880501": "Bőrgyógyászat - Széver Krisztina dr. Bőrgyógyászat",
    "2880707": "Diabetológia - Bogdán Anita Kriszta dr. Diabetológia",
    "2880562": "Diabetológia - Dajka Éva dr. Diabetológia",
    "2880264": "Diabetológia - Filó Andrea dr. Diabetológia",
    "2880364": "Diabetológia - Vass Viktor dr. Diabetológia",
    "2880682": "Diabetológia - Zsargó Eszter Ildikó dr. Diabetológia",
    "2880241": "Érsebészet - Berezvai Sándor dr. Érsebészet",
    "2880681": "Foglalkozás egészségügy",
    "2880512": "Fül-Orr-Gégészet - Gerencsér Emőke dr. Fül-Orr-Gégészet",
    "2880587": "Fül-Orr-Gégészet - Rohr Petra dr.  Fül-Orr-Gégészet",
    "2880703": "Fül-Orr-Gégészet - Tóth Áron dr. Fül-Orr-Gégészet",
    "2880590": "Fül-Orr-Gégészet - Vinczellér Ildikó dr. Fül-Orr-Gégészet",
    "2880460": "Gasztroenterológia - Kokas Péter dr. Gasztroenterológia",
    "2880301": "Gasztroenterológia - Kőrösi Géza dr. Gasztroenterológia",
    "2880672": "Gasztroenterológia - Mohai Csaba Gyula dr. Gasztroenterológia",
    "2880513": "Gasztroenterológia - Solymos Mónika dr. Gasztroenterológia",
    "2880553": "Gyermekfogászat - Bálint Szilvia dr. Gyermekfogászat",
    "2880548": "Gyermekfogászat - Barna Mónika dr. Gyermekfogászat",
    "2880699": "Gyermekfogászat - Beke Zsuzsanna dr. Gyermekfogászat",
    "2880551": "Gyermekfogászat - Bérczi Gabriella dr. Gyermekfogászat",
    "2880549": "Gyermekfogászat - Türner Ilona dr. Gyermekfogászat",
    "2880611": "Kardiológia - Bódi Mária dr. Kardiológia",
    "2880252": "Kardiológia - Czeilinger Zsolt dr. Gyermekkardiológia",
    "2880490": "Kardiológia - Kenessey Andrea dr. kardiológia",
    "2880290": "Kardiológia - Kiss Marianna dr. Kardiológia",
    "2880496": "Kardiológia - Oswald Patricia dr. Kardiológia",
    "2880713": "Kardiológia - Rácz Kinga Mária dr. Kardiológia",
    "2880342": "Kardiológia - Sperr Erzsébet dr. Kardiológia",
    "2880563": "Kardiológia - Szekula Ágnes dr. Kardiológia",
    "2880397": "Laboratórium",
    "2880684": "Laboratórium - Laboratórium Hősök tere",
    "2880638": "Mammográfia",
    "2880465": "Neurológia - Gaál Tibor dr. Neurológia",
    "2880616": "Neurológia - Gulyás Szilvia dr. Neurológia",
    "2880617": "Neurológia - Halabuk Cecília dr. Neurológia",
    "2880298": "Neurológia - Kovács Krisztina dr. Neurológia",
    "2880335": "Neurológia - Rózsa Anikó dr. Neurológia",
    "2880351": "Neurológia - Sztankaninecz Yvette dr. Neurológia",
    "2880356": "Neurológia - Torák Gyöngyi dr. Neurológia",
    "2880247": "Nőgyógyászat - Boros György dr. Nőgyógyászat",
    "2880538": "Nőgyógyászat - Ishiguro Mirjam dr. Nőgyógyászat",
    "2880438": "Nőgyógyászat - Jeney Krisztina dr. Nőgyógyászat",
    "2880479": "Nőgyógyászat - Reszler Beáta dr. Nőgyógyászat",
    "2880358": "Nőgyógyászat - Turcsányi Attila dr. Nőgyógyászat",
    "2880248": "Onkológia - Boros György dr. Onkológia",
    "2880416": "Pszichiátria - Botond Gyula dr. Pszichiátria",
    "2880541": "Pszichiátria - Koncz Gergely dr. Pszichiátria",
    "2880670": "Pszichiátria - Nagy Mária Magdolna dr. Pszichiátria",
    "2880531": "Pszichiátria - Sós Éva dr. Pszichiátria",
    "2880656": "Reumatológia - Füri Judit dr. Reumatológia",
    "2880443": "Reumatológia - Nagy Kázmér Tamás dr. Reumatológia",
    "2880622": "Röntgen",
    "2880389": "Röntgen - Csontsűrűség mérés",
    "2880235": "Sebészet - Balogh Attila dr. Sebészet",
    "2880239": "Sebészet - Berezvai Sándor dr. Sebészet",
    "2880702": "Sebészet - Kishonti Rolland dr. Gyermeksebészet",
    "2880292": "Sebészet - Kollár Sándor dr. Sebészet",
    "2880583": "Sebészet - Mayer Ákos dr. Sebészet",
    "2880732": "Sebészet - Németh Lehel Gábor dr. Sebészet",
    "2880409": "Sebészet - Oláh Tamás dr. sebészet",
    "2880320": "Sebészet - Orbán László dr. Sebészet",
    "2880486": "Szemészet - Hernádi Krisztina dr. Szemészet",
    "2880477": "Szemészet - Kis Krisztina Gabriella dr. Szemészet",
    "2880598": "Szemészet - Nagy Zsuzsanna dr. Szemészet",
    "2880319": "Szemészet - Olajos Ágnes dr. Szemészet",
    "2880338": "Szemészet - Saja Panna dr. Szemészet",
    "2880502": "Tüdőgyógyászat - Molnár Márta Klára dr. Tüdőgyógyászat",
    "2880430": "Tüdőgyógyászat - Tót Éva Erika dr. Tüdőgyógyászat",
    "2880495": "Tüdőszűrő",
    "2880353": "Ultrahang - Tengerdi Judit Carotis Ultrahang",
    "2880518": "Urológia - Kertész László Róbert dr. Urológia",
    "2880288": "Urológia - Kiss Attila dr. Urológia",
    "2880296": "Urológia - Kondér Gyula dr. Urológia",
    "2880547": "Urológia - Kopasz Ádám dr. Urológia",
    "2880466": "Urológia - Sziklafy Csaba Endre dr. Urológia",
    "2880371": "Urológia - Zóber Tamás dr. Urológia"
}

# Page Configuration
st.set_page_config(
    page_title="FőnixWeb Monitor Panel",
    page_icon="🚨",
    layout="centered"
)

# Custom Sleek Design Elements via CSS
st.markdown("""
<style>
    .main-title {
        font-family: 'Inter', sans-serif;
        font-weight: 800;
        background: linear-gradient(135deg, #FF4B4B, #FF8E53);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-align: center;
        margin-bottom: 5px;
    }
    .sub-title {
        text-align: center;
        color: #888888;
        font-size: 1.1rem;
        margin-bottom: 30px;
    }
    .card {
        background: rgba(255, 255, 255, 0.05);
        padding: 20px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        margin-bottom: 15px;
    }
</style>
""", unsafe_allow_html=True)

st.markdown("<h1 class='main-title'>FőnixWeb Monitor Panel</h1>", unsafe_allow_html=True)
st.markdown("<p class='sub-title'>Kezeld és konfiguráld az automatikus időpontfigyelőidet egyszerűen</p>", unsafe_allow_html=True)

if not SUPABASE_URL or not SUPABASE_KEY:
    st.error("⚠️ Supabase URL és Key hiányzik! Kérlek konfiguráld a `.env` fájlt.")
    st.stop()

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# Supabase API endpoints
url_monitors = f"{SUPABASE_URL}/rest/v1/monitors"

# Fetch configurations
def get_monitors():
    try:
        response = requests.get(f"{url_monitors}?select=*", headers=headers)
        if response.status_code == 200:
            return response.json()
        else:
            st.error(f"Hiba a lekérés során: {response.text}")
            return []
    except Exception as e:
        st.error(f"Hálózati hiba: {str(e)}")
        return []

# Create / Update configuration
def save_monitor(data, monitor_id=None):
    try:
        if monitor_id:
            res = requests.patch(f"{url_monitors}?id=eq.{monitor_id}", headers=headers, json=data)
        else:
            res = requests.post(url_monitors, headers=headers, json=data)
        
        if res.status_code in [200, 201, 204]:
            return True
        else:
            st.error(f"Supabase mentési hiba (Státusz: {res.status_code}): {res.text}")
            return False
    except Exception as e:
        st.error(f"Hálózati hiba a mentésnél: {str(e)}")
        return False

# Delete configuration
def delete_monitor(monitor_id):
    try:
        res = requests.delete(f"{url_monitors}?id=eq.{monitor_id}", headers=headers)
        if res.status_code in [200, 204]:
            return True
        else:
            st.error(f"Supabase törlési hiba (Státusz: {res.status_code}): {res.text}")
            return False
    except Exception as e:
        st.error(f"Hálózati hiba a törlésnél: {str(e)}")
        return False

monitors = get_monitors()

# Main tabs: 1. List Monitors, 2. Add New Monitor
tab_list, tab_add = st.tabs(["📋 Aktív Figyelők", "➕ Új Figyelő Hozzáadása"])

with tab_list:
    if not monitors:
        st.info("Még nincsenek beállított figyelők. Kattints az 'Új Figyelő Hozzáadása' fülre!")
    else:
        for m in monitors:
            status_color = "🟢 Aktív" if m["is_active"] else "🔴 Kikapcsolva"
            is_editing = st.session_state.get("editing_id") == m["id"]
            
            with st.expander(f"👤 {m['name']} ({status_color})", expanded=is_editing):
                if is_editing:
                    st.write("### Profil Szerkesztése")
                    edit_name = st.text_input("Profil Neve", value=m["name"], key=f"edit_name_{m['id']}")
                    
                    edit_selected_docs = st.multiselect(
                        "Figyelendő orvosok/szakrendelések",
                        options=list(DOCTORS.keys()),
                        format_func=lambda x: DOCTORS[x],
                        default=m["doctor_ids"],
                        key=f"edit_docs_{m['id']}"
                    )
                    
                    col_weeks, col_date = st.columns(2)
                    with col_weeks:
                        edit_max_w = st.number_input("Hány hetet vizsgáljon?", min_value=1, max_value=24, value=int(m["max_weeks"]), key=f"edit_weeks_{m['id']}")
                    with col_date:
                        import datetime
                        default_date = None
                        if m["current_appointment_date"]:
                            try:
                                default_date = datetime.date.fromisoformat(m["current_appointment_date"])
                            except:
                                default_date = None
                        edit_curr_date = st.date_input("Meglévő időpont dátuma (Opcionális)", value=default_date, key=f"edit_date_{m['id']}")
                        
                    edit_channel = st.selectbox("Értesítési csatorna", ["telegram", "pushbullet"], index=0 if m["notification_channel"] == "telegram" else 1, key=f"edit_channel_{m['id']}")
                    
                    edit_tg_bot = m["telegram_bot_token"] or ""
                    edit_tg_chat = m["telegram_chat_id"] or ""
                    edit_pb = m["pushbullet_token"] or ""
                    
                    if edit_channel == "telegram":
                        col_t1, col_t2 = st.columns(2)
                        with col_t1:
                            edit_tg_bot = st.text_input("Telegram Bot Token", value=edit_tg_bot, type="password", key=f"edit_tg_bot_{m['id']}")
                        with col_t2:
                            edit_tg_chat = st.text_input("Telegram Chat ID", value=edit_tg_chat, key=f"edit_tg_chat_{m['id']}")
                    else:
                        edit_pb = st.text_input("Pushbullet Access Token", value=edit_pb, type="password", key=f"edit_pb_{m['id']}")
                        
                    col_btn1, col_btn2 = st.columns(2)
                    with col_btn1:
                        if st.button("💾 Mentés", key=f"save_btn_{m['id']}"):
                            if not edit_name or not edit_selected_docs:
                                st.error("Kérlek töltsd ki a Profil nevét és válassz orvost!")
                            else:
                                updated_data = {
                                    "name": edit_name,
                                    "fonix_username": "shared",
                                    "fonix_password": "shared",
                                    "doctor_ids": edit_selected_docs,
                                    "max_weeks": int(edit_max_w),
                                    "current_appointment_date": str(edit_curr_date) if edit_curr_date else None,
                                    "notification_channel": edit_channel,
                                    "telegram_bot_token": edit_tg_bot if edit_channel == "telegram" else None,
                                    "telegram_chat_id": edit_tg_chat if edit_channel == "telegram" else None,
                                    "pushbullet_token": edit_pb if edit_channel == "pushbullet" else None,
                                    "is_active": m["is_active"]
                                }
                                if save_monitor(updated_data, m["id"]):
                                    st.success("Módosítások mentve!")
                                    st.session_state["editing_id"] = None
                                    st.rerun()
                    with col_btn2:
                        if st.button("❌ Mégsem", key=f"cancel_btn_{m['id']}"):
                            st.session_state["editing_id"] = None
                            st.rerun()
                else:
                    col1, col2 = st.columns([2, 1])
                    
                    with col1:
                        st.write(f"**Figyelt hetek:** {m['max_weeks']} hét")
                        if m["current_appointment_date"]:
                            st.write(f"**Aktuális lefoglalt dátum:** `{m['current_appointment_date']}` (Csak ennél korábbiakat keres!)")
                        else:
                            st.write("**Aktuális lefoglalt dátum:** Nincs beállítva (bármilyen időpont jó)")
                            
                        doc_names = [DOCTORS.get(d_id, f"Ismeretlen orvos #{d_id}") for d_id in m["doctor_ids"]]
                        st.write("**Figyelt szakrendelések / orvosok:**")
                        for d_name in doc_names:
                            st.write(f"- {d_name}")
                            
                        st.write(f"**Értesítési csatorna:** {m['notification_channel'].capitalize()}")
                    
                    with col2:
                        st.write("### Műveletek")
                        # Toggle status
                        new_status = not m["is_active"]
                        toggle_btn = "Kikapcsolás" if m["is_active"] else "Bekapcsolás"
                        if st.button(toggle_btn, key=f"toggle_{m['id']}"):
                            if save_monitor({"is_active": new_status}, m["id"]):
                                st.success("Státusz frissítve!")
                                st.rerun()
                                
                        # Edit Trigger
                        if st.button("✏️ Szerkesztés", key=f"edit_trigger_{m['id']}"):
                            st.session_state["editing_id"] = m["id"]
                            st.rerun()
                                
                        # Delete
                        if st.button("🗑️ Törlés", key=f"del_{m['id']}"):
                            if delete_monitor(m["id"]):
                                st.success("Figyelő törölve!")
                                st.rerun()

with tab_add:
    st.subheader("Új időpontfigyelő profil konfigurálása")
    
    name = st.text_input("Profil Neve", placeholder="Pl. Anya, Saját")
    
    selected_docs = st.multiselect(
        "Figyelendő orvosok/szakrendelések",
        options=list(DOCTORS.keys()),
        format_func=lambda x: DOCTORS[x]
    )
    
    col_weeks, col_date = st.columns(2)
    with col_weeks:
        max_w = st.number_input("Hány hetet vizsgáljon?", min_value=1, max_value=24, value=4)
    with col_date:
        curr_date = st.date_input("Meglévő időpont dátuma (Opcionális)", value=None, help="Ha megadod, a rendszer csak ennél korábbi szabad helyeket fog jelezni.")
        
    channel = st.selectbox("Értesítési csatorna", ["telegram", "pushbullet"])
    
    # Conditional notification inputs
    telegram_bot = ""
    telegram_chat = ""
    pushbullet_token = ""
    
    if channel == "telegram":
        col_t1, col_t2 = st.columns(2)
        with col_t1:
            telegram_bot = st.text_input("Telegram Bot Token", type="password")
        with col_t2:
            telegram_chat = st.text_input("Telegram Chat ID")
    else:
        pushbullet_token = st.text_input("Pushbullet Access Token", type="password")
        
    submit = st.button("Létrehozás és indítás")
    
    if submit:
        if not name or not selected_docs:
            st.error("Kérlek töltsd ki a kötelező mezőket (Profil neve, orvosok)!")
        else:
            data = {
                "name": name,
                "fonix_username": "shared",
                "fonix_password": "shared",
                "doctor_ids": selected_docs,
                "max_weeks": int(max_w),
                "current_appointment_date": str(curr_date) if curr_date else None,
                "notification_channel": channel,
                "telegram_bot_token": telegram_bot if channel == "telegram" else None,
                "telegram_chat_id": telegram_chat if channel == "telegram" else None,
                "pushbullet_token": pushbullet_token if channel == "pushbullet" else None,
                "is_active": True
            }
            
            if save_monitor(data):
                st.success("Sikeresen hozzáadva és elmentve a Supabase-be! 🎉")
                st.rerun()
