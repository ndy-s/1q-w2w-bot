const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const parse = require('csv-parse/sync').parse;
const { createCanvas, registerFont } = require('canvas');
const { generateCSV } = require("./runner");

const REPORTS_FOLDER = path.join(__dirname, "../reports");
if (!fs.existsSync(REPORTS_FOLDER)) {
    fs.mkdirSync(REPORTS_FOLDER, { recursive: true });
}

// Helper function to wrap text
function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(' ');
    const lines = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
        const testLine = currentLine + ' ' + words[i];
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    lines.push(currentLine);
    return lines;
}

// Calculate required column widths and row heights
function calculateDimensions(ctx, columns, rows) {
    const minColWidth = 120;
    const maxColWidth = 400;
    const cellPadding = 16;
    const lineHeight = 20;

    // Calculate column widths based on content
    const colWidths = columns.map(col => {
        let maxWidth = ctx.measureText(col).width;

        rows.forEach(row => {
            const text = String(row[col] ?? "");
            const textWidth = ctx.measureText(text).width;
            maxWidth = Math.max(maxWidth, textWidth);
        });

        return Math.min(Math.max(maxWidth + cellPadding * 2, minColWidth), maxColWidth);
    });

    // Calculate row heights based on wrapped text
    const rowHeights = rows.map(row => {
        let maxLines = 1;

        columns.forEach((col, i) => {
            const text = String(row[col] ?? "");
            const availableWidth = colWidths[i] - cellPadding * 2;
            const lines = wrapText(ctx, text, availableWidth);
            maxLines = Math.max(maxLines, lines.length);
        });

        return maxLines * lineHeight + cellPadding * 2;
    });

    return { colWidths, rowHeights };
}

// Draw text with wrapping
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const lines = wrapText(ctx, text, maxWidth);
    lines.forEach((line, i) => {
        ctx.fillText(line, x, y + i * lineHeight);
    });
}

async function generateReportImage(startDate = null, endDate = null) {
    console.log('🟢 Starting generateReportImage (canvas version)...');

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
    const columns = Object.keys(records[0] || {});
    const rows = records;

    // Create temporary canvas for measurements
    const tempCanvas = createCanvas(100, 100);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = "14px Arial";

    // Calculate dynamic dimensions
    const { colWidths, rowHeights } = calculateDimensions(tempCtx, columns, rows);

    const padding = 20;
    const headerHeight = 40;
    const titleHeight = 40;
    const cellPadding = 8;
    const lineHeight = 20;

    const canvasWidth = padding * 2 + colWidths.reduce((sum, w) => sum + w, 0);
    const canvasHeight = padding * 3 + titleHeight + headerHeight + rowHeights.reduce((sum, h) => sum + h, 0);

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Title
    ctx.font = "bold 22px Arial";
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.fillText(title, canvasWidth / 2, padding + 20);

    // Reset alignment for table
    ctx.textAlign = "left";

    let y = padding * 2 + titleHeight;

    // Header background
    ctx.fillStyle = "#f0f0f0";
    let x = padding;
    columns.forEach((col, i) => {
        ctx.fillRect(x, y, colWidths[i], headerHeight);
        x += colWidths[i];
    });

    // Header text
    ctx.font = "bold 14px Arial";
    ctx.fillStyle = "#000";
    x = padding;
    columns.forEach((col, i) => {
        ctx.fillText(col, x + cellPadding, y + 25);
        x += colWidths[i];
    });

    y += headerHeight;

    // Draw rows
    ctx.font = "14px Arial";
    rows.forEach((row, rowIndex) => {
        const rowH = rowHeights[rowIndex];

        // Row background
        ctx.fillStyle = rowIndex % 2 === 0 ? "#ffffff" : "#fafafa";
        x = padding;
        columns.forEach((col, i) => {
            ctx.fillRect(x, y, colWidths[i], rowH);
            x += colWidths[i];
        });

        // Row text with wrapping
        ctx.fillStyle = "#000";
        x = padding;
        columns.forEach((col, i) => {
            const text = String(row[col] ?? "");
            const availableWidth = colWidths[i] - cellPadding * 2;
            drawWrappedText(ctx, text, x + cellPadding, y + cellPadding + 15, availableWidth, lineHeight);
            x += colWidths[i];
        });

        y += rowH;
    });

    // Draw grid lines
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 1;

    // Outer border
    const tableY = padding * 2 + titleHeight;
    const tableHeight = headerHeight + rowHeights.reduce((sum, h) => sum + h, 0);
    ctx.strokeRect(padding, tableY, colWidths.reduce((sum, w) => sum + w, 0), tableHeight);

    // Vertical lines
    x = padding;
    for (let i = 0; i < columns.length; i++) {
        ctx.beginPath();
        ctx.moveTo(x, tableY);
        ctx.lineTo(x, tableY + tableHeight);
        ctx.stroke();
        x += colWidths[i];
    }

    // Horizontal lines
    y = tableY + headerHeight;
    ctx.beginPath();
    ctx.moveTo(padding, tableY + headerHeight);
    ctx.lineTo(padding + colWidths.reduce((sum, w) => sum + w, 0), tableY + headerHeight);
    ctx.stroke();

    rowHeights.forEach(rowH => {
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(padding + colWidths.reduce((sum, w) => sum + w, 0), y);
        ctx.stroke();
        y += rowH;
    });

    const imagePath = path.join(REPORTS_FOLDER, `${filename.replace(".csv", "")}.png`);
    fs.writeFileSync(imagePath, canvas.toBuffer("image/png"));

    console.log(`🏁 Report image generated successfully: ${imagePath}`);
    return { imagePath, fullPath };
}

module.exports = { generateReportImage };
