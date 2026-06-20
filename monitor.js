const { chromium } = require('playwright');
const path = require('path');

// Support loading .env locally, but allow environment variables on cloud environments (e.g. GitHub Actions)
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_WEEKS = parseInt(process.env.MAX_WEEKS || '4', 10);
const HEADLESS = process.env.HEADLESS !== 'false'; // Default to headless, but allow local headful debugging

function parseDateFromString(str) {
  const match = str.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (!match) return null;
  return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
}

function isWithinWeeks(date, maxWeeks) {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const diffWeeks = diffDays / 7;
  
  return diffWeeks <= maxWeeks;
}

async function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[Telegram] Credentials not configured. Skipping notification.');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('[Telegram] Failed to send message:', data);
    } else {
      console.log('[Telegram] Notification sent successfully.');
    }
  } catch (error) {
    console.error('[Telegram] Error sending message:', error);
  }
}

async function run() {
  console.log(`[Monitor] Starting execution at ${new Date().toISOString()}`);
  console.log(`[Monitor] Headless mode: ${HEADLESS}`);
  
  if (!USERNAME || !PASSWORD) {
    console.error('[Monitor] Error: USERNAME and PASSWORD must be set in the environment or .env file.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();

  try {
    console.log('[Monitor] Navigating to FonixWeb homepage...');
    await page.goto('https://fonixweb.szakrendelo16.hu/FonixWeb/Default.aspx');
    await page.waitForLoadState('networkidle');

    console.log('[Monitor] Clicking login button...');
    await page.click('div.BigMenuCitizen');
    await page.waitForSelector('#ctl00_cphMaster_txtPopupLoginName_Txt', { state: 'visible', timeout: 5000 });

    console.log('[Monitor] Filling in login details...');
    await page.fill('#ctl00_cphMaster_txtPopupLoginName_Txt', USERNAME);
    await page.fill('#ctl00_cphMaster_txtPopupLoginPwd_Txt', PASSWORD);

    console.log('[Monitor] Submitting credentials...');
    await page.click('#ctl00_cphMaster_btnPopupLoginCitizenLogin');

    await page.waitForTimeout(5000);
    console.log('[Monitor] URL after login attempt:', page.url());

    console.log('[Monitor] Navigating to Appointment page...');
    await page.goto('https://fonixweb.szakrendelo16.hu/FonixWeb/Member/Appointment.aspx');
    await page.waitForLoadState('networkidle');
    
    const currentUrl = page.url();
    if (currentUrl.includes('Default.aspx?ReturnUrl=')) {
      console.error('[Monitor] Login failed. Redirected back to login page.');
      await sendTelegramMessage('⚠️ <b>FőnixWeb Hiba:</b> A bejelentkezés sikertelen volt! Kérlek ellenőrizd a felhasználónevedet és a jelszavadat.');
      process.exit(1);
    }

    console.log('[Monitor] Waiting for doctor selection popup...');
    await page.waitForSelector('#selPopupAppMt', { state: 'visible', timeout: 10000 });

    const doctors = [
      { id: '2880574', name: 'Abonyi Bence' },
      { id: '2880658', name: 'Pánti Zsombor Alpár' }
    ];

    const allFoundSlots = [];

    for (let d = 0; d < doctors.length; d++) {
      const doc = doctors[d];
      console.log(`\n[Monitor] Checking doctor: ${doc.name} (ID: ${doc.id})`);

      if (d > 0) {
        await page.click('#ctl00_cphMaster_hlAppmtList');
        await page.waitForSelector('#selPopupAppMt', { state: 'visible', timeout: 5000 });
      }

      let oldDocLabel = '';
      if (await page.isVisible('#ctl00_cphMaster_labAppmt')) {
        oldDocLabel = await page.innerText('#ctl00_cphMaster_labAppmt');
      }

      await page.selectOption('#selPopupAppMt', doc.id);
      await page.click('#btnPopupAppMtOk');

      await page.waitForFunction(
        ({ docName, oldDoc }) => {
          const el = document.getElementById('ctl00_cphMaster_labAppmt');
          if (!el) return false;
          const text = el.innerText || '';
          return text.includes(docName) && text !== oldDoc;
        },
        { docName: doc.name, oldDoc: oldDocLabel },
        { timeout: 10000 }
      );

      console.log(`[Monitor] Calendar loaded for ${doc.name}. Scanning for free slots...`);

      let currentFirstDateStr = '';
      let step = 0;

      while (true) {
        step++;
        const gvxExists = await page.isVisible('#ctl00_cphMaster_gvx');
        let weekDate = null;

        if (gvxExists) {
          currentFirstDateStr = await page.evaluate(() => {
            const td = document.querySelector('#ctl00_cphMaster_gvx tr:first-child td:nth-child(2)');
            return td ? td.innerText.trim().replace(/\n/g, ' ') : '';
          });
          
          weekDate = parseDateFromString(currentFirstDateStr);
          console.log(`[Monitor] Step ${step} - Week starting: ${currentFirstDateStr}`);

          if (weekDate && !isWithinWeeks(weekDate, MAX_WEEKS)) {
            console.log(`[Monitor] Week starting ${currentFirstDateStr} is beyond MAX_WEEKS (${MAX_WEEKS}). Stopping search for this doctor.`);
            break;
          }

          const slots = await parseCalendarPage(page);
          console.log(`[Monitor] Found ${slots.length} free slots this week.`);
          
          if (slots.length > 0) {
            slots.forEach(slot => {
              allFoundSlots.push({
                doctor: doc.name,
                weekStart: currentFirstDateStr,
                ...slot
              });
            });
          }
        } else {
          console.log(`[Monitor] Step ${step} - No calendar table (gvx) rendered. (No office hours scheduled this week)`);
        }

        console.log('[Monitor] Clicking "Next Free" button to search further...');
        const responsePromise = page.waitForResponse(
          response => response.url().includes('Appointment.aspx') && response.status() === 200,
          { timeout: 5000 }
        ).catch(() => null);

        await page.click('#ctl00_cphMaster_lbNextFree');
        const res = await responsePromise;
        if (!res) {
          console.log('[Monitor] AJAX request timed out. No action occurred. Stopping search.');
          break;
        }
        await page.waitForTimeout(1000); // Allow DOM to settle

        // Check if the warning popup appeared (indicates no more free appointments)
        const isPopupVisible = await page.isVisible('#ctl00_cphMaster_PopMsg_tabPopupMsg');
        if (isPopupVisible) {
          const popupText = await page.innerText('#ctl00_cphMaster_PopMsg_labPopupMsgText');
          console.log(`[Monitor] Warning popup visible: "${popupText.trim()}"`);
          
          console.log('[Monitor] Closing warning popup...');
          await page.click('#ctl00_cphMaster_PopMsg_btnPopupMsgOk');
          await page.waitForSelector('#ctl00_cphMaster_PopMsg_tabPopupMsg', { state: 'hidden', timeout: 5000 });
          console.log('[Monitor] Popup closed. No more free appointments for this doctor.');
          break;
        }

        // Compare week start dates to prevent infinite loops if page doesn't change
        const newFirstDateStr = await page.evaluate(() => {
          const td = document.querySelector('#ctl00_cphMaster_gvx tr:first-child td:nth-child(2)');
          return td ? td.innerText.trim().replace(/\n/g, ' ') : '';
        });

        if (newFirstDateStr === currentFirstDateStr) {
          console.log('[Monitor] Week starting date did not change. Stopping search.');
          break;
        }
      }
    }

    console.log(`\n[Monitor] Scan finished. Total free slots found: ${allFoundSlots.length}`);

    if (allFoundSlots.length > 0) {
      console.log('[Monitor] Free slots found! Preparing Telegram notification...');
      let message = `🚨 <b>FŐNIXWEB SZABAD IDŐPONT!</b> 🚨\n\n`;
      message += `Az alábbi szabad időpontokat találtam az elkövetkező ${MAX_WEEKS} hétben:\n\n`;

      // Group by doctor
      const groupedByDoc = {};
      allFoundSlots.forEach(slot => {
        if (!groupedByDoc[slot.doctor]) {
          groupedByDoc[slot.doctor] = [];
        }
        groupedByDoc[slot.doctor].push(slot);
      });

      for (const [docName, slots] of Object.entries(groupedByDoc)) {
        message += `👨‍⚕️ <b>${docName}</b>:\n`;
        slots.forEach(slot => {
          message += `• 📅 <code>${slot.day} ${slot.time}</code>\n`;
        });
        message += `\n`;
      }

      message += `🔗 <a href="https://fonixweb.szakrendelo16.hu/FonixWeb/Default.aspx">Kattints ide a foglaláshoz</a>`;

      await sendTelegramMessage(message);
    } else {
      console.log('[Monitor] No free slots found in the monitored timeframe.');
    }

  } catch (error) {
    console.error('[Monitor] Scraping failed with error:', error);
    await sendTelegramMessage(`⚠️ <b>FőnixWeb Hiba:</b> Hiba lépett fel a futás során:\n<code>${error.message}</code>`);
  } finally {
    await browser.close();
    console.log('[Monitor] Browser closed. Run completed.');
  }
}

async function parseCalendarPage(page) {
  return await page.evaluate(() => {
    const slots = [];
    const table = document.getElementById('ctl00_cphMaster_gvx');
    if (!table) return slots;
    const rows = table.querySelectorAll('tr');
    if (rows.length === 0) return slots;

    const headers = Array.from(rows[0].querySelectorAll('td')).map(td => td.innerText.trim().replace(/\n/g, ' '));

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      if (cells.length < headers.length) continue;
      const time = cells[0].innerText.trim();

      for (let j = 1; j < cells.length - 1; j++) {
        const cell = cells[j];
        const link = cell.querySelector('a.freeApp');
        if (link) {
          slots.push({
            day: headers[j],
            time: time,
          });
        }
      }
    }
    return slots;
  });
}

run();
