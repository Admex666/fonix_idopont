const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Support loading .env locally
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GLOBAL_MAX_WEEKS = parseInt(process.env.MAX_WEEKS || '4', 10);
const HEADLESS = process.env.HEADLESS !== 'false';

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

function getSlotDate(slot) {
  const dateMatch = slot.day.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  const timeMatch = slot.time.match(/(\d{2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return new Date(0);
  return new Date(
    parseInt(dateMatch[1], 10),
    parseInt(dateMatch[2], 10) - 1,
    parseInt(dateMatch[3], 10),
    parseInt(timeMatch[1], 10),
    parseInt(timeMatch[2], 10)
  );
}

async function sendTelegramMessage(token, chatId, message) {
  if (!token || !chatId) {
    console.log('[Telegram] Credentials not configured. Skipping notification.');
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('[Telegram] Failed to send message:', data);
    } else {
      console.log('[Telegram] Telegram notification sent successfully.');
    }
  } catch (error) {
    console.error('[Telegram] Error sending message:', error);
  }
}

async function sendPushbulletMessage(token, title, body) {
  if (!token) {
    console.log('[Pushbullet] Token not configured. Skipping notification.');
    return;
  }

  const url = 'https://api.pushbullet.com/v2/pushes';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'note',
        title: title,
        body: body,
      }),
    });

    const data = await response.json();
    if (response.status !== 200) {
      console.error('[Pushbullet] Failed to send message:', data);
    } else {
      console.log('[Pushbullet] Pushbullet notification sent successfully.');
    }
  } catch (error) {
    console.error('[Pushbullet] Error sending message:', error);
  }
}

async function run() {
  console.log(`[Monitor] Starting execution at ${new Date().toISOString()}`);
  console.log(`[Monitor] Headless mode: ${HEADLESS}`);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[Monitor] Error: SUPABASE_URL and SUPABASE_KEY must be set.');
    process.exit(1);
  }

  if (!USERNAME || !PASSWORD) {
    console.error('[Monitor] Error: USERNAME and PASSWORD must be set in the environment or .env file.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('[Monitor] Fetching active configurations from Supabase...');
  let monitors = null;
  let error = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await supabase
      .from('monitors')
      .select('*')
      .eq('is_active', true);
    
    monitors = res.data;
    error = res.error;

    if (!error) break;

    console.warn(`[Monitor] Supabase attempt ${attempt}/3 failed (${error.message}). Retrying in 10s...`);
    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  if (error) {
    console.error('[Monitor] Failed to fetch monitors from Supabase after 3 attempts:', error);
    process.exit(1);
  }

  console.log(`[Monitor] Found ${monitors.length} active configurations.`);
  if (monitors.length === 0) {
    console.log('[Monitor] No active monitors found. Exiting.');
    return;
  }

  // Find the set of all unique doctor IDs across all monitors
  const uniqueDocIds = [...new Set(monitors.flatMap(m => m.doctor_ids || []))];
  console.log(`[Monitor] Unique Doctor IDs to scan: ${uniqueDocIds.join(', ')}`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();
  
  // Accumulated results: mapping monitor.id -> array of eligible slots
  const monitorResults = {};
  monitors.forEach(m => {
    monitorResults[m.id] = [];
  });

  try {
    // 1. Log in once
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
      console.error('[Monitor] Login failed. Incorrect global credentials in .env.');
      await browser.close();
      process.exit(1);
    }

    console.log('[Monitor] Waiting for doctor selection popup...');
    await page.waitForSelector('#selPopupAppMt', { state: 'visible', timeout: 10000 });

    // 2. Iterate over unique doctors
    for (let d = 0; d < uniqueDocIds.length; d++) {
      const docId = uniqueDocIds[d];

      // Find monitors interested in this doctor
      const docMonitors = monitors.filter(m => (m.doctor_ids || []).includes(docId));
      if (docMonitors.length === 0) continue;

      // Find largest max_weeks requested for this doctor
      const docMaxWeeks = Math.max(...docMonitors.map(m => m.max_weeks || GLOBAL_MAX_WEEKS));

      if (d > 0) {
        await page.click('#ctl00_cphMaster_hlAppmtList');
        await page.waitForSelector('#selPopupAppMt', { state: 'visible', timeout: 5000 });
      }

      // Fetch the actual doctor name from the select options
      const docName = await page.evaluate((id) => {
        const option = document.querySelector(`#selPopupAppMt option[value="${id}"]`);
        return option ? option.text.trim() : '';
      }, docId);

      if (!docName) {
        console.log(`[Monitor] Doctor ID ${docId} not found in dropdown options. Skipping.`);
        continue;
      }

      console.log(`\n[Monitor] --- Scanning Doctor: ${docName} (ID: ${docId}) up to ${docMaxWeeks} weeks ---`);

      let oldDocLabel = '';
      if (await page.isVisible('#ctl00_cphMaster_labAppmt')) {
        oldDocLabel = await page.innerText('#ctl00_cphMaster_labAppmt');
      }

      await page.selectOption('#selPopupAppMt', docId);
      await page.click('#btnPopupAppMtOk');

      await page.waitForFunction(
        ({ expectedName, oldDoc }) => {
          const el = document.getElementById('ctl00_cphMaster_labAppmt');
          if (!el) return false;
          const text = el.innerText || '';
          return text.includes(expectedName) && text !== oldDoc;
        },
        { expectedName: docName, oldDoc: oldDocLabel },
        { timeout: 10000 }
      );

      let currentFirstDateStr = '';
      let step = 0;
      const docFoundSlots = [];

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

          if (weekDate && !isWithinWeeks(weekDate, docMaxWeeks)) {
            console.log(`[Monitor] Week starting ${currentFirstDateStr} is beyond max ${docMaxWeeks} weeks. Stopping search for this doctor.`);
            break;
          }

          const slots = await parseCalendarPage(page);
          console.log(`[Monitor] Found ${slots.length} free slots this week.`);
          
          if (slots.length > 0) {
            slots.forEach(slot => {
              docFoundSlots.push({
                doctor: docName,
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
        await page.waitForTimeout(1000);

        // Check if the warning popup appeared
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

        const newFirstDateStr = await page.evaluate(() => {
          const td = document.querySelector('#ctl00_cphMaster_gvx tr:first-child td:nth-child(2)');
          return td ? td.innerText.trim().replace(/\n/g, ' ') : '';
        });

        if (newFirstDateStr === currentFirstDateStr) {
          console.log('[Monitor] Week starting date did not change. Stopping search.');
          break;
        }
      }

      // Distribute eligible slots to matching monitors
      docMonitors.forEach(m => {
        const mMaxWeeks = m.max_weeks || GLOBAL_MAX_WEEKS;
        let mAppDate = null;
        if (m.current_appointment_date) {
          mAppDate = new Date(m.current_appointment_date);
          mAppDate.setHours(0, 0, 0, 0);
        }

        const eligibleSlots = docFoundSlots.filter(slot => {
          // Check week boundary
          const slotWeekDate = parseDateFromString(slot.weekStart);
          if (slotWeekDate && !isWithinWeeks(slotWeekDate, mMaxWeeks)) {
            return false;
          }
          // Check appointment date boundary
          if (mAppDate) {
            const slotDate = getSlotDate(slot);
            return slotDate < mAppDate;
          }
          return true;
        });

        monitorResults[m.id].push(...eligibleSlots);
      });
    }

  } catch (err) {
    console.error('[Monitor] Fatal error during scraping session:', err);
  } finally {
    await browser.close();
    console.log('[Monitor] Browser closed.');
  }

  // 3. Send notifications for each monitor
  console.log('\n[Monitor] --- Processing and dispatching notifications ---');
  for (const monitor of monitors) {
    const slots = monitorResults[monitor.id] || [];
    console.log(`[Monitor] User ${monitor.name}: Found ${slots.length} eligible slots.`);

    if (slots.length > 0) {
      console.log(`[Monitor] Sending notification to ${monitor.name} via ${monitor.notification_channel}...`);

      const maxWeeks = monitor.max_weeks || GLOBAL_MAX_WEEKS;
      const currentAppDateStr = monitor.current_appointment_date;

      // Group by doctor
      const groupedByDoc = {};
      slots.forEach(slot => {
        if (!groupedByDoc[slot.doctor]) {
          groupedByDoc[slot.doctor] = [];
        }
        groupedByDoc[slot.doctor].push(slot);
      });

      let textMessage = '';
      let htmlMessage = '';

      if (currentAppDateStr) {
        textMessage = `🚨 FŐNIXWEB: KORÁBBI IDŐPONT TALÁLHATÓ! 🚨\n\nTaláltam a jelenlegi időpontodnál (${currentAppDateStr}) korábbi időpontot az elkövetkező ${maxWeeks} hétben:\n\n`;
        htmlMessage = `🚨 <b>FŐNIXWEB: KORÁBBI IDŐPONT TALÁLHATÓ!</b> 🚨\n\nTaláltam a jelenlegi időpontodnál (<code>${currentAppDateStr}</code>) korábbi időpontot az elkövetkező ${maxWeeks} hétben:\n\n`;
      } else {
        textMessage = `🚨 FŐNIXWEB SZABAD IDŐPONT! 🚨\n\nA 3-3 legkorábbi szabad időpont az elkövetkező ${maxWeeks} hétben:\n\n`;
        htmlMessage = `🚨 <b>FŐNIXWEB SZABAD IDŐPONT!</b> 🚨\n\nA 3-3 legkorábbi szabad időpont az elkövetkező ${maxWeeks} hétben:\n\n`;
      }

      for (const [docName, docSlots] of Object.entries(groupedByDoc)) {
        docSlots.sort((a, b) => getSlotDate(a) - getSlotDate(b));
        const earliest = docSlots.slice(0, 3);

        textMessage += `👨‍⚕️ ${docName}:\n`;
        htmlMessage += `👨‍⚕️ <b>${docName}</b>:\n`;

        earliest.forEach(slot => {
          textMessage += `• ${slot.day} ${slot.time}\n`;
          htmlMessage += `• 📅 <code>${slot.day} ${slot.time}</code>\n`;
        });
        textMessage += `\n`;
        htmlMessage += `\n`;
      }

      textMessage += `Foglalás: https://fonixweb.szakrendelo16.hu/FonixWeb/Default.aspx`;
      htmlMessage += `🔗 <a href="https://fonixweb.szakrendelo16.hu/FonixWeb/Default.aspx">Kattints ide a foglaláshoz</a>`;

      if (monitor.notification_channel === 'pushbullet') {
        await sendPushbulletMessage(monitor.pushbullet_token, 'FőnixWeb Szabad Időpont', textMessage);
      } else {
        await sendTelegramMessage(monitor.telegram_bot_token, monitor.telegram_chat_id, htmlMessage);
      }
    }
  }

  console.log('[Monitor] Run completed.');
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
