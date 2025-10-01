const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

const BASE_URL = process.env.BASE_URL;
const EMAIL = process.env.APP_EMAIL;
const PASSWORD = process.env.APP_PASSWORD;

const REPORTS_FOLDER = path.join(__dirname, "../reports");
if (!fs.existsSync(REPORTS_FOLDER)) {
    fs.mkdirSync(REPORTS_FOLDER, { recursive: true });
}

const jar = new tough.CookieJar();
const SESSION = wrapper(
    axios.create({
        baseURL: BASE_URL,
        jar,
        withCredentials: true,
    })
);

async function login() {
    const url = `/account/login`;
    const getLoginResp = await SESSION.get(url);

    if (getLoginResp.status !== 200) {
        throw new Error(`❌ Login page request failed. Response: ${getLoginResp.data}`);
    }

    const match = getLoginResp.data.match(/name="_csrf"\s+[^>]*value="([^"]+)"/);
    if (!match) throw new Error("❌ CSRF token not found");

    const csrfToken = match[1];
    const payload = new URLSearchParams({
        email: EMAIL,
        password: PASSWORD,
        remember: "on",
        _csrf: csrfToken,
    });

    const headers = { "Content-Type": "application/x-www-form-urlencoded" };

    return SESSION.post(url, payload.toString(), { 
        headers,
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
    });
}

async function getWhatapData() {
    const url = `/yard/api/flush`;
    const headers = { "Content-Type": "application/json" };

    const WIB_OFFSET = 7 * 60;
    const now = new Date();
    const wibNow = new Date(now.getTime() + WIB_OFFSET * 60 * 1000);

    const yesterday0831 = new Date(wibNow);
    yesterday0831.setDate(yesterday0831.getDate() - 1);
    yesterday0831.setHours(8, 31, 0, 0);

    const today0830 = new Date(wibNow);
    today0830.setHours(8, 30, 0, 0);

    const stime = yesterday0831.getTime();
    const etime = today0830.getTime();

    const data = {
        type: "stat",
        path: "ap",
        pcode: 10,
        params: {
            stime,
            etime,
            ptotal: 100,
            skip: 0,
            psize: 1000,
            filter: {},
            order: "count",
            type: "error",
            textLength: 0,
            oids: [],
        },
    };

    return SESSION.post(url, data, { headers });
}

async function exportCsv(data) {
    const jsonData = data.data;
    const records = jsonData.records || [];

    const excludedClasses = [
        "com.tifscore.biz.exception.OneQLoanException",
        "com.tifscore.biz.exception.OneQPinException",
        "com.tifscore.biz.exception.OneQRequiredException",
        "com.tifscore.core.exception.OneQOnCoreException",
        "com.tifscore.exception.OneQAccountException",
        "com.tifscore.exception.OneQCardException",
        "com.tifscore.exception.OneQChannelException",
        "com.tifscore.exception.OneQCustomerException",
        "com.tifscore.exception.OneQDepositException",
        "com.tifscore.exception.OneQFactoryException",
        "com.tifscore.exception.OneQInvestmentException",
        "java.io.FIleNotFoundException",
        "SLOW_HTTPC",
    ];

    const csvData = records
        .filter((r) => !excludedClasses.includes(r.class))
        .map((r) => ({
            class: r.class || "",
            service: r.service || "",
            msg: r.msg || "",
            count: r.count || 0,
        }));

    const todayStr = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
    });

    const filename = `${todayStr} Error Monitoring WhaTap.csv`;
    const fullPath = path.join(REPORTS_FOLDER, filename);

    const header = "class,service,msg,count\n";
    const rows = csvData
        .map((row) =>
            [row.class, row.service, row.msg.replace(/"/g, '""'), row.count]
                .map((val) => `"${val}"`)
                .join(",")
        )
        .join("\n");

    fs.writeFileSync(fullPath, header + rows, "utf-8");

    console.log(`✅ Report generated: ${fullPath}`);
    return { fullPath, filename };
}

async function generateReport() {
    if (!BASE_URL || !EMAIL || !PASSWORD) {
        throw new Error("❌ Missing BASE_URL, APP_EMAIL, or APP_PASSWORD in .env");
    }

    const loginResp = await login();
    if (![200, 301].includes(loginResp.status)) {
        throw new Error(`❌ Login failed. Status code: ${loginResp.status}`);
    }

    const whatapResp = await getWhatapData();
    if (whatapResp.status !== 200) {
        throw new Error(`❌ Get WhaTap data failed. Status code: ${whatapResp.status}`);
    }

    return exportCsv(whatapResp);
}

module.exports = { generateReport };

