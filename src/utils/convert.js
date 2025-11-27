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

    const { fullPath, filename } = await generateCSV(startDate, endDate);
    const csvContent = fs.readFileSync(fullPath, 'utf-8');
    const records = parse(csvContent, { columns: true, skip_empty_lines: true });

    const tz = 'Asia/Jakarta';
    let startTime, endTime;
    if (startDate && endDate) {
        startTime = moment.tz(startDate, tz).startOf('day').hour(8).minute(31).second(0);
        endTime = moment.tz(endDate, tz).startOf('day').hour(8).minute(30).second(0);
    } else {
        endTime = moment.tz(tz).startOf('day').hour(8).minute(30).second(0);
        startTime = endTime.clone().subtract(1, 'day').add(1, 'minute');
    }

    const title = `Report from ${startTime.format('DD MMM YYYY HH:mm')} to ${endTime.format('DD MMM YYYY HH:mm')}`;

    const html = `
    <html>
      <head>
        <style>
          body { font-family: sans-serif; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #000; padding: 8px; }
          th { font-weight: bold; text-align: center; text-transform: uppercase; background-color: #f0f0f0; }
          td { text-align: left; }
          h2 { text-align: center; }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        <table>
          <thead>
            <tr>${Object.keys(records[0] || {}).map(c => `<th>${c}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${records.map(row => '<tr>' + Object.values(row).map(c => `<td>${c}</td>`).join('') + '</tr>').join('')}
          </tbody>
        </table>
      </body>
    </html>
    `;

    const tmpHtmlPath = path.join(REPORTS_FOLDER, `tmp-${Date.now()}.html`);
    fs.writeFileSync(tmpHtmlPath, html);

    const executablePath = await getChromePath();
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        executablePath,
    });

    const page = await browser.newPage();

    // Set viewport dynamically based on table length
    const pageHeight = Math.max(records.length * 35 + 200, 720); // row height * rows + padding
    await page.setViewport({ width: 1280, height: pageHeight });

    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await new Promise(resolve => setTimeout(resolve, 500));

    const imagePath = path.join(REPORTS_FOLDER, `${filename.replace('.csv', '')}.png`);
    await page.screenshot({ path: imagePath, fullPage: true });

    await browser.close();
    fs.unlinkSync(tmpHtmlPath);

    console.log(`🏁 Report image generated successfully: ${imagePath}`);
    return imagePath;
}

module.exports = { generateReportImage };


