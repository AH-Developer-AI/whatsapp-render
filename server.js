const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isReady = false;

client.on('qr', (qr) => {
    console.log('\n=================================================');
    console.log('SCAN THIS QR CODE WITH YOUR WHATSAPP TO LOGIN:');
    console.log('=================================================\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('\n✅ WhatsApp Client is Ready! You can now send OTPs.\n');
    isReady = true;
});

client.on('authenticated', () => {
    console.log('✅ Authenticated successfully.');
});

client.on('auth_failure', msg => {
    console.error('❌ Authentication failure:', msg);
});

client.initialize();

// API Endpoint for Python
app.post('/send-otp', async (req, res) => {
    if (!isReady) {
        return res.status(503).json({ error: 'WhatsApp client not ready yet. Please scan QR code.' });
    }

    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({ error: 'Number and message are required.' });
    }

    // Basic formatting for Pakistan/International numbers
    // Removes +, spaces, dashes
    let cleanNumber = number.replace(/\D/g, ''); 
    
    // Auto-fix for PK numbers starting with 03... -> 923...
    if (cleanNumber.startsWith('03') && cleanNumber.length === 11) {
        cleanNumber = '92' + cleanNumber.substring(1);
    }

    const chatId = cleanNumber + "@c.us";

    try {
        await client.sendMessage(chatId, message);
        console.log(`✅ OTP Sent to ${cleanNumber}`);
        res.json({ success: true, number: cleanNumber });
    } catch (err) {
        console.error(`❌ Failed to send to ${cleanNumber}:`, err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Service running on port ${PORT}`);
});