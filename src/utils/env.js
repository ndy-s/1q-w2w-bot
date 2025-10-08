const fs = require('fs');
const path = require('path');

async function updateAppPassword(newPassword, userJid, AUTHORIZED_USERS) {
    return new Promise((resolve) => {
        try {
            if (!AUTHORIZED_USERS.includes(userJid)) {
                return resolve('You are not authorized to change the password.');
            }

            if (!newPassword || newPassword.trim() === '') {
                return resolve('Please provide a new password.');
            }

            process.env.APP_PASSWORD = newPassword;
            const wrappedPassword = `"${newPassword}"`;

            const envPath = path.join(__dirname, '../../.env');
            let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
            if (/^APP_PASSWORD=.*$/m.test(envContent)) {
                envContent = envContent.replace(/^APP_PASSWORD=.*$/m, `APP_PASSWORD=${wrappedPassword}`);
            } else {
                envContent += `\nAPP_PASSWORD=${wrappedPassword}`;
            }
            fs.writeFileSync(envPath, envContent, 'utf-8');

            console.log(`🎉 APP_PASSWORD updated successfully by ${userJid}`);
            resolve('🎉 APP_PASSWORD has been updated successfully.');
        } catch (err) {
            console.error('❌ Failed to update APP_PASSWORD:', err);
            resolve('❌ Failed to update APP_PASSWORD. Check server logs.');
        }
    });
}

module.exports = { updateAppPassword };