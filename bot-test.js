const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        printQRInTerminal: true,
        auth: state,
    });

    // WhatsApp number to receive reports (replace with your number)
    const targetNumber = '6281267668768@s.whatsapp.net';

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('Scan the QR code above');
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log('Connection closed due to', reason);
            startBot();
        } else if (connection === 'open') {
            console.log('Bot is connected');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Listen for incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.key.fromMe && msg.message) {
            const sender = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (text) {
                await sock.sendMessage(msg.key.remoteJid, { text: `You said: ${text}` });
            }

            // Trigger only from your personal number and specific text
            if (sender === targetNumber && text && text.toLowerCase() === 'send report') {
                console.log(`Triggering report for ${targetNumber}...`);

                // Run Python script
                exec('python3 ./generate_report_test.py', async (err, stdout, stderr) => {
                    if (err) {
                        console.error('Python script error:', err);
                        await sock.sendMessage(targetNumber, { text: '❌ Failed to generate report.' });
                        return;
                    }
                    console.log(stdout);
                    if (stderr) console.error(stderr);

                    // CSV file path
                    const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long' });
                    const filename = `${todayStr} Error Monitoring WhaTap.csv`;
                    const filePath = path.join(__dirname, filename);

                    if (!fs.existsSync(filePath)) {
                        console.error('CSV file not found:', filePath);
                        await sock.sendMessage(targetNumber, { text: '❌ Report not found.' });
                        return;
                    }

                    // Send CSV to your personal number
                    try {
                        await sock.sendMessage(targetNumber, {
                            document: fs.readFileSync(filePath),
                            fileName: filename,
                            mimetype: 'text/csv',
                        });
                        console.log('✅ Report sent to', targetNumber);
                    } catch (e) {
                        console.error('Failed to send report:', e);
                        await sock.sendMessage(targetNumber, { text: '❌ Failed to send report.' });
                    }
                });
            }
        }
    });
}

startBot();


