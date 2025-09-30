const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { generateReport } = require('./report');

const REPORTS_FOLDER = path.join(__dirname, "../reports");
if (!fs.existsSync(REPORTS_FOLDER)) {
    fs.mkdirSync(REPORTS_FOLDER, { recursive: true });
}

async function generateReportImage() {
    console.log('🟢 Starting generateReportImage...');

    console.log('📄 Generating CSV report...');
    const { fullPath, filename } = await generateReport();
    console.log(`✅ CSV report generated: ${fullPath}`);

    console.log('📖 Reading CSV content...');
    const csvContent = fs.readFileSync(fullPath, 'utf-8');
    console.log(`✅ CSV content length: ${csvContent.length} chars`);

    const lines = csvContent.split('\n');
    console.log(`📊 Total lines in CSV: ${lines.length}`);

    const tableRows = lines.map(line => {
        const cols = line.split(',');
        return `<tr>${cols.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');

    const html = `
        <html>
            <body>
                <table border="1" style="border-collapse: collapse; font-family: sans-serif;">
                    ${tableRows}
                </table>
            </body>
        </html>
    `;

    const tmpHtmlPath = path.join(REPORTS_FOLDER, `tmp-${Date.now()}.html`);
    console.log(`💾 Writing temporary HTML to: ${tmpHtmlPath}`);
    fs.writeFileSync(tmpHtmlPath, html);

    console.log('🌐 Launching Puppeteer browser...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
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

