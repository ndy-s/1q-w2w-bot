const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
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

    // Connection update events 
    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            console.log('Connection closed:', lastDisconnect?.error?.output?.statusCode);
            startBot(); // Reconnect
        } else if (connection === 'open') {
            console.log('Bot connected:', sock.user.id);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Schedule daily report at 08:00 
    cron.schedule('0 8 * * *', async () => {
        console.log('Running daily WhaTap report...');

        // Run Python script
        exec('python3 ./generate_report.py', async (err, stdout, stderr) => {
            if (err) {
                console.error('Python script error:', err);
                return;
            }
            console.log(stdout);
            if (stderr) console.error(stderr);

            // Get today's date to match Python filename
            const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long' });
            const filename = `${todayStr} Error Monitoring WhaTap.csv`;
            const filePath = path.join(__dirname, filename);

            if (!fs.existsSync(filePath)) {
                console.error('CSV file not found:', filePath);
                return;
            }

            // Send CSV to WhatsApp group
            const groupJid = '123456789-123456@g.us';
            try {
                await sock.sendMessage(groupJid, {
                    document: fs.readFileSync(filePath),
                    fileName: filename,
                    mimetype: 'text/csv',
                });
                console.log('✅ Daily report sent to WhatsApp group!');
            } catch (e) {
                console.error('Failed to send report:', e);
            }
        });
    }, {
            timezone: 'Asia/Jakarta'
        });
}

startBot();


