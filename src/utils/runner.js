const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

const venvPath = path.join(__dirname, '../../.venv');
const pyScript = path.join(__dirname, '../scripts/generate.py');
const requirements = path.join(__dirname, '../scripts/requirements.txt');

const isWin = process.platform === 'win32';
const pyCmd = isWin ? 'python' : 'python3';
const pyExec = isWin
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');

async function ensureVenv() {
    if (!fs.existsSync(venvPath)) {
        console.log('🟡 Virtual environment not found. Creating...');
        const py = spawn(pyCmd, ['-m', 'venv', venvPath], { stdio: 'inherit' });
        await new Promise((res, rej) =>
            py.on('close', code => (code === 0 ? res() : rej(new Error(`Failed to create venv (code ${code})`))))
        );
        console.log('✅ Virtual environment created.');
    }
}

async function installRequirements() {
    if (fs.existsSync(requirements)) {
        console.log('🟡 Installing Python requirements...');
        const py = spawn(pyExec, ['-m', 'pip', 'install', '-r', requirements], { stdio: 'inherit' });
        await new Promise((res, rej) =>
            py.on('close', code => (code === 0 ? res() : rej(new Error(`Failed to install requirements (code ${code})`))))
        );
        console.log('✅ Requirements installed.');
    }
}

async function generateCSV() {
    await ensureVenv();
    await installRequirements();

    return new Promise((resolve, reject) => {
        const py = spawn(pyExec, [pyScript]);

        let output = '';
        let error = '';

        py.stdout.on('data', data => (output += data.toString()));
        py.stderr.on('data', data => (error += data.toString()));

        py.on('close', code => {
            if (code !== 0) {
                console.error('❌ Python script error:', error);
                return reject(new Error(`Python exited with code ${code}`));
            }

            try {
                const { fullPath, filename } = JSON.parse(output.trim());
                if (!fs.existsSync(fullPath)) {
                    return reject(new Error(`CSV file not found: ${fullPath}`));
                }
                console.log(`✅ CSV generated at: ${fullPath}`);
                resolve({ fullPath, filename });
            } catch (err) {
                reject(new Error(`Failed to parse Python output: ${err.message}\nOutput:\n${output}`));
            }
        });
    });
}

module.exports = { generateCSV };

