const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { generateReportImage } = require("./utils/convert");

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
        if (!groupJid) {
            const messages = m.messages || [];
            messages.forEach(msg => {
                const jid = msg.key.remoteJid;
                if (jid?.endsWith('@g.us')) {
                    console.log('📌 Group JID:', jid, '| From message:', msg.message?.conversation || msg.message?.extendedTextMessage?.text);
                }
            });
        }
    });

    function startCron() {
        if (startCron.scheduled) return;
        startCron.scheduled = true;

        // Schedule report at 08:01 Asia/Jakarta
        // cron.schedule('0 31 8 * * *', async () => {
        cron.schedule('*/5 * * * * *', async () => {
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

