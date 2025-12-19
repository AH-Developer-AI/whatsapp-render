const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const pino = require('pino');
const fs = require('fs');
const http = require('http'); // Self-ping ke liye

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

let sock;
let qrCodeData = null;
let isConnected = false;

// --- WHATSAPP LOGIC ---
async function startWhatsApp() {
    // Auth folder (Render free tier par restart hone pe delete ho jata hai)
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ["AutoFlowLearn", "Render", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Generated');
            QRCode.toDataURL(qr, (err, url) => {
                qrCodeData = url;
            });
            isConnected = false;
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                startWhatsApp();
            } else {
                console.log('Logged out. Clearing session.');
                if (fs.existsSync('auth_info')) {
                    fs.rmSync('auth_info', { recursive: true, force: true });
                }
                startWhatsApp();
            }
            isConnected = false;
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Connected!');
            qrCodeData = null;
            isConnected = true;
        }
    });
}

startWhatsApp();

// --- ROUTES ---

// 1. View Status & QR
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    if (isConnected) {
        res.send('<h1 style="color:green; font-family:sans-serif; text-align:center; margin-top:50px;">✅ WhatsApp Connected!</h1><p style="text-align:center;">Server is Active.</p>');
    } else if (qrCodeData) {
        res.send(`
            <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
                <h1>Scan WhatsApp QR</h1>
                <img src="${qrCodeData}" alt="QR Code" style="border:5px solid #ccc; border-radius:10px;"/>
                <p>Open WhatsApp > Linked Devices > Link a Device</p>
                <p style="color:red;">Note: On free hosting, if server restarts, you may need to rescan.</p>
            </div>
        `);
    } else {
        res.send('<h1 style="font-family:sans-serif; text-align:center; margin-top:50px;">⏳ Initializing... Refresh in 5 seconds.</h1>');
    }
});

// 2. Send OTP API
app.post('/send-otp', async (req, res) => {
    if (!isConnected) {
        return res.status(503).json({ success: false, error: 'WhatsApp not connected. Scan QR first.' });
    }

    const { number, message } = req.body;
    if (!number || !message) return res.status(400).json({ error: 'Missing parameters' });

    try {
        let cleanNumber = number.replace(/\D/g, '');
        if (cleanNumber.startsWith('03') && cleanNumber.length === 11) {
            cleanNumber = '92' + cleanNumber.substring(1);
        }
        
        const jid = cleanNumber + "@s.whatsapp.net";
        
        await sock.sendMessage(jid, { text: message });
        console.log(`Sent to ${cleanNumber}`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- KEEP ALIVE (PREVENT SLEEP) ---
// Har 5 minute baad khud ko ping karega
setInterval(() => {
    // Render URL automatically environment variable mein hota hai
    const url = process.env.RENDER_EXTERNAL_URL; 
    if (url) {
        http.get(url);
        console.log('Ping sent to keep server alive.');
    }
}, 300000); // 5 Minutes

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
