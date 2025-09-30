const fs = require('fs');
const path = require('path');

const REPORTS_FOLDER = path.join(__dirname, "../reports");
if (!fs.existsSync(REPORTS_FOLDER)) {
    fs.mkdirSync(REPORTS_FOLDER, { recursive: true });
}

async function process() {
    const todayStr = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
    });

    const filename = `${todayStr} Error Monitoring WhaTap.csv`;
    const fullPath = path.join(REPORTS_FOLDER, filename);

    const header = "class,service,msg,count\n";

    // Generate 50 rows of dummy data
    let rows = "";
    for (let i = 1; i <= 50; i++) {
        rows += `"DummyClass${i}","DummyService${i}","This is a test message ${i}",${Math.floor(Math.random() * 10) + 1}\n`;
    }

    fs.writeFileSync(fullPath, header + rows, "utf-8");

    console.log(`✅ Dummy report generated with 50 rows: ${fullPath}`);
    return { fullPath, filename };
}

module.exports = { process };

