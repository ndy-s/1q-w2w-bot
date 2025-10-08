const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const parse = require('csv-parse/sync').parse;
const puppeteer = require('puppeteer');
const chromeLauncher = require('chrome-launcher');
const { generateCSV } = require("./runner");

const REPORTS_FOLDER = path.join(__dirname, "../reports");
if (!fs.existsSync(REPORTS_FOLDER)) {
    fs.mkdirSync(REPORTS_FOLDER, { recursive: true });
}

async function getChromePath() {
    try {
        const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
        const path = chrome?.process?.spawnfile || chrome?.executablePath;
        await chrome.kill();
        return path;
    } catch (err) {
        console.warn("⚠️ Could not detect system Chrome, using Puppeteer's Chromium instead");
        return puppeteer.executablePath();
    }
}

async function generateReportImage(startDate = null, endDate = null) {
    console.log('🟢 Starting generateReportImage...');

    console.log('📄 Generating CSV report...');
    const { fullPath, filename } = await generateCSV(startDate, endDate);

    console.log(`✅ CSV report generated: ${fullPath}`);

    console.log('📖 Reading CSV content...');
    const csvContent = fs.readFileSync(fullPath, 'utf-8');
    console.log(`✅ CSV content length: ${csvContent.length} chars`);

    const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
    });

    const tz = 'Asia/Jakarta';
    let startTime, endTime;

    if (startDate && endDate) {
        startTime = moment.tz(startDate, tz).startOf('day').hour(8).minute(31).second(0);
        endTime = moment.tz(endDate, tz).startOf('day').hour(8).minute(30).second(0);
    } else {
        endTime = moment.tz(tz).startOf('day').hour(8).minute(30).second(0);
        startTime = endTime.clone().subtract(1, 'day').add(1, 'minute');
    }
    const title = `Report from ${startTime.format('YYYY-MM-DD HH:mm')} to ${endTime.format('YYYY-MM-DD HH:mm')}`;

    const html = `
        <html>
            <head>
                <style>
                    table {
                        border-collapse: collapse;
                        font-family: sans-serif;
                        width: 100%;
                    }
                    th, td {
                        border: 1px solid #000;
                        padding: 8px;
                    }
                    th {
                        font-weight: bold;
                        text-align: center;
                        text-transform: uppercase;
                        background-color: #f0f0f0;
                    }
                    td {
                        text-align: left;
                    }
                    h2 {
                        text-align: center;
                        font-family: sans-serif;
                    }
                </style>
            </head>
            <body>
                <h2>${title}</h2>
                <table>
                    <thead>
                        <tr>
                            ${Object.keys(records[0] || {}).map(c => `<th>${c}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map(row =>
                            '<tr>' + Object.values(row).map(c => `<td>${c}</td>`).join('') + '</tr>'
                        ).join('')}
                    </tbody>
                </table>
            </body>
        </html>
    `;

    const tmpHtmlPath = path.join(REPORTS_FOLDER, `tmp-${Date.now()}.html`);
    console.log(`💾 Writing temporary HTML to: ${tmpHtmlPath}`);
    fs.writeFileSync(tmpHtmlPath, html);

    const executablePath = await getChromePath();
    console.log(`📌 Puppeteer will launch with: ${executablePath}`);

    console.log('🌐 Launching Puppeteer browser...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath,
    });

    console.log('📄 Opening new page...');
    const page = await browser.newPage();

    console.log('📝 Setting page content...');
    await page.setContent(html, { waitUntil: 'networkidle0' });
    console.log('✅ Page content set');

    const imagePath = path.join(REPORTS_FOLDER, `${filename.replace('.csv', '')}.png`);
    console.log(`📷 Taking screenshot to: ${imagePath}`);
    await page.screenshot({ path: imagePath, fullPage: true });
    console.log('✅ Screenshot taken');

    console.log('🔒 Closing browser...');
    await browser.close();

    console.log(`🗑 Removing temporary HTML file: ${tmpHtmlPath}`);
    fs.unlinkSync(tmpHtmlPath);

    console.log(`🏁 Report image generated successfully: ${imagePath}`);
    return imagePath;
}

module.exports = { generateReportImage };

