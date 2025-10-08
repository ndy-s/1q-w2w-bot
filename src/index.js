const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { generateReportImage } = require("./utils/convert");
const { getNumber } = require("./utils/messaging");

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state });

    let isConnected = false;
    const groupJid = process.env.WHATSAPP_GROUP_JID;

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

            if (groupJid) {
                startCron();
            } else {
                console.log('⚠️ WHATSAPP_GROUP_JID not set. Will log all group JIDs on messages.');
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const messages = m.messages || [];

        if (!groupJid) {
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
            if (jid !== groupJid) continue;

            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                "";

            if (!text) continue;

            const botJid = getNumber(sock.user.lid || sock.user.id);
            const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const isTagged = mentions.includes(botJid);

            if (!isTagged) continue;

            const cleanText = text.replace(/@\d+/g, "").trim();

            // !help command
            if (cleanText.toLowerCase() === '!help') {
                await sock.sendMessage(jid, {
                    text: `📋 *Monitoring Bot Commands*\n\n` +
                        `1️⃣ @Bot monitoring → Generate daily report (yesterday 08:31 → today 08:30)\n` +
                        `2️⃣ @Bot monitoring YYYY-MM-DD YYYY-MM-DD → Generate report for specific range\n\n` +
                        `⚠️ Dates must be in format YYYY-MM-DD. Start date must be ≤ end date.`
                });
                continue;
            }

            // Match monitoring command with optional dates
            const match = cleanText.match(/^monitoring(?:\s+(\d{4}-\d{2}-\d{2}))?(?:\s+(\d{4}-\d{2}-\d{2}))?$/i);
            if (!match) continue;

            let [ , startDate, endDate ] = match;

            // Validate dates
            let hasCustomRange = false;
            if (startDate && endDate) {
                const startMoment = moment(startDate, 'YYYY-MM-DD', true);
                const endMoment = moment(endDate, 'YYYY-MM-DD', true);

                if (!startMoment.isValid() || !endMoment.isValid()) {
                    await sock.sendMessage(jid, { text: '❌ Invalid date format. Use YYYY-MM-DD.' });
                    continue;
                }

                if (startMoment.isAfter(endMoment)) {
                    await sock.sendMessage(jid, { text: '❌ Start date cannot be after end date.' });
                    continue;
                }

                hasCustomRange = true;
            } else if (startDate && !endDate) {
                startDate = null;
                endDate = null;
            }

            await sock.sendMessage(jid, {
                text: `📊 Generating ${hasCustomRange ? `report for ${startDate} → ${endDate}` : 'daily report'}...`,
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

                console.log(`Sending report image to group ${groupJid} with caption: "${caption}"`);
                await sock.sendMessage(groupJid, {
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

