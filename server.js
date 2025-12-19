const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const pino = require('pino');
const fs = require('fs');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

let sock;
let qrCodeData = null;
let isConnected = false;

async function startWhatsApp() {
    // Auth folder setup
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // FIXED: Set to false to stop warnings
        logger: pino({ level: 'silent' }),
        browser: ["AutoFlowLearn", "Render", "1.0.0"],
        connectTimeoutMs: 60000, // Timeout barha diya
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('New QR Code Generated');
            QRCode.toDataURL(qr, (err, url) => {
                qrCodeData = url;
            });
            isConnected = false;
        }

        if (connection === 'close') {
            // Check reason
            const reason = (lastDisconnect.error)?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            
            console.log(`Connection closed. Reason: ${reason}. Reconnecting: ${shouldReconnect}`);

            if (shouldReconnect) {
                startWhatsApp();
            } else {
                console.log('Session Invalidated. Deleting auth folder...');
                if (fs.existsSync('auth_info')) {
                    fs.rmSync('auth_info', { recursive: true, force: true });
                }
                startWhatsApp(); // Restart fresh
            }
            isConnected = false;
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Connected Successfully!');
            qrCodeData = null;
            isConnected = true;
        }
    });
}

startWhatsApp();

// --- ROUTES ---

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    if (isConnected) {
        res.send('<h1 style="color:green; font-family:sans-serif; text-align:center; margin-top:50px;">✅ WhatsApp Connected!</h1>');
    } else if (qrCodeData) {
        res.send(`
            <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
                <h1>Scan WhatsApp QR</h1>
                <img src="${qrCodeData}" alt="QR Code" style="border:5px solid #ccc; border-radius:10px; width:300px;"/>
                <p>Open WhatsApp > Linked Devices > Link a Device</p>
                <script>setTimeout(function(){location.reload()}, 5000);</script>
            </div>
        `);
    } else {
        res.send('<h1 style="font-family:sans-serif; text-align:center; margin-top:50px;">⏳ Starting... Refresh in 5s.</h1><script>setTimeout(function(){location.reload()}, 5000);</script>');
    }
});

app.post('/send-otp', async (req, res) => {
    if (!isConnected) return res.status(503).json({ success: false, error: 'WhatsApp not connected.' });

    const { number, message } = req.body;
    if (!number || !message) return res.status(400).json({ error: 'Missing parameters' });

    try {
        let cleanNumber = number.replace(/\D/g, '');
        if (cleanNumber.startsWith('03') && cleanNumber.length === 11) cleanNumber = '92' + cleanNumber.substring(1);
        
        const jid = cleanNumber + "@s.whatsapp.net";
        await sock.sendMessage(jid, { text: message });
        
        console.log(`Sent to ${cleanNumber}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Self Ping to keep alive
setInterval(() => {
    if (process.env.RENDER_EXTERNAL_URL) http.get(process.env.RENDER_EXTERNAL_URL);
}, 300000);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
