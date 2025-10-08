const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { generateReportImage } = require("./utils/convert");
const { getNumber } = require("./utils/messaging");
const { updateAppPassword } = require("./utils/env");

const AUTHORIZED_USERS = (process.env.AUTHORIZED_USERS || '')
    .split(',')
    .map(jid => jid.trim())
    .filter(Boolean);

const WHITELIST = (process.env.WHITELIST || '')
    .split(',')
    .map(jid => jid.trim())
    .filter(Boolean);

const GROUP_JID = process.env.WHATSAPP_GROUP_JID || null;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state });

    let isConnected = false;

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) qrcode.generate(qr, { small: true });

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log('Connection closed:', statusCode);

            isConnected = false;

            if (statusCode !== DisconnectReason.loggedOut) {
                startBot();
            } else {
                console.log('❌ Logged out. Delete auth_info folder and re-run.');
            }
        } else if (connection === 'open') {
            console.log('✅ Bot connected as:', sock.user.id);
            isConnected = true;

            if (GROUP_JID) {
                startCron();
            } else {
                console.log('⚠️ WHATSAPP_GROUP_JID not set. Will log all group JIDs on messages.');
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const messages = m.messages || [];

        if (!GROUP_JID) {
            messages.forEach(msg => {
                const jid = msg.key.remoteJid;
                if (jid?.endsWith('@g.us')) {
                    console.log('📌 Group JID:', jid, '| From message:', msg.message?.conversation || msg.message?.extendedTextMessage?.text);
                }
            });
        }

        for (const msg of messages) {
            if (!msg.message) continue;

            const jid = msg.key.remoteJid;
            const userJid = msg.key.participant || jid;

            if (WHITELIST.length > 0 && !WHITELIST.includes(jid)) continue;

            const botJid = getNumber(sock.user.lid || sock.user.id);
            const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const isTagged = mentions.includes(botJid);
            if (!isTagged) continue;

            const cleanText = (msg.message.conversation || msg.message.extendedTextMessage?.text || "")
                .replace(/@\d+/g, "")
                .trim();

            // !setpassword command
            if (cleanText.toLowerCase().startsWith('!setpassword ')) {
                const newPassword = cleanText.split(' ')[1];
                const resultMessage = await updateAppPassword(newPassword, userJid, AUTHORIZED_USERS);
                await sock.sendMessage(jid, { text: resultMessage });
                continue;
            }

            // !help command
            if (cleanText.toLowerCase() === '!help') {
                await sock.sendMessage(jid, {
                    text:
                        `*Bot Available Commands*
                        
1. @Bot monitoring  
\`Generate the daily report (covers yesterday 08:31 to today 08:30).\`

2. @Bot monitoring DD-MM-YYYY DD-MM-YYYY
\`Generate a report from the first date (start) 08:31 to the second date (end) 08:30.\`

📌 Notes:
- Dates must follow the format "DD-MM-YYYY"
- The start date must be earlier than or equal to the end date
- The system automatically generates the daily report every day at 08:31 AM`
                });
                continue;
            }

            // Accept user input in DD-MM-YYYY format
            const match = cleanText.match(/^monitoring(?:\s+(\d{2}-\d{2}-\d{4}))?(?:\s+(\d{2}-\d{2}-\d{4}))?$/i);
            if (!match) continue;

            let [, startDateInput, endDateInput] = match;
            let hasCustomRange = false;

            let startDate = null;
            let endDate = null;

            try {
                if (startDateInput) {
                    // Convert DD-MM-YYYY → YYYY-MM-DD
                    const startMoment = moment(startDateInput, 'DD-MM-YYYY', true);
                    if (!startMoment.isValid()) throw new Error('Invalid start date format');
                    startDate = startMoment.format('YYYY-MM-DD');
                }

                if (endDateInput) {
                    const endMoment = moment(endDateInput, 'DD-MM-YYYY', true);
                    if (!endMoment.isValid()) throw new Error('Invalid end date format');
                    endDate = endMoment.format('YYYY-MM-DD');
                }

                if (startDate && endDate && moment(startDate).isAfter(moment(endDate))) {
                    await sock.sendMessage(jid, { text: 'Start date cannot be after end date.' });
                    continue;
                }

                if (startDate || endDate) hasCustomRange = true;
            } catch (err) {
                await sock.sendMessage(jid, { text: 'Invalid date format. Please use DD-MM-YYYY.' });
                continue;
            }

            const startText = startDate ? moment(startDate, 'YYYY-MM-DD').format('DD MMM YYYY') : null;
            const endText = endDate ? moment(endDate, 'YYYY-MM-DD').format('DD MMM YYYY') : null;

            await sock.sendMessage(jid, {
                text: `Alright, preparing ${hasCustomRange
                    ? `your report from ${startText} to ${endText}`
                    : 'today’s daily report'}. This may take a few seconds...`
            });

            try {
                const imagePath = await generateReportImage(startDate, endDate);
                const caption = path.basename(imagePath, path.extname(imagePath));

                await sock.sendMessage(jid, {
                    image: fs.readFileSync(imagePath),
                    caption,
                    mimetype: 'image/png',
                });

                console.log(`✅ Report sent (${hasCustomRange ? `${startDate}→${endDate}` : 'default range'})`);
            } catch (err) {
                console.error('❌ Failed to generate/send report:', err);
                await sock.sendMessage(jid, { text: '❌ Failed to generate report. Check server logs.' });
            }
        }
    });

    function startCron() {
        if (startCron.scheduled) return;
        startCron.scheduled = true;

        // Schedule report at 08:01 Asia/Jakarta
        cron.schedule('0 31 8 * * *', async () => {
            if (!isConnected) {
                console.log('⏳ WhatsApp not connected yet. Skipping cron task.');
                return;
            }

            console.log('📊 Running daily WhaTap report...');

            try {
                const imagePath = await generateReportImage();

                if (!fs.existsSync(imagePath)) {
                    console.error('❌ Report image not found:', imagePath);
                    return;
                }

                const caption = path.basename(imagePath, path.extname(imagePath));

                console.log(`Sending report image to group ${GROUP_JID} with caption: "${caption}"`);
                await sock.sendMessage(GROUP_JID, {
                    image: fs.readFileSync(imagePath),
                    caption,
                    mimetype: 'image/png',
                });

                console.log('✅ Daily report sent to WhatsApp group!');
            } catch (err) {
                console.error('❌ Failed to generate/send report:', err);
            }
        }, { timezone: 'Asia/Jakarta' });
    }
}

startBot();

