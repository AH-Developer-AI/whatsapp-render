const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static('public'));

let isReady = false;

// WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  }
});

// QR event → browser
client.on('qr', async (qr) => {
  console.log('📲 QR generated');
  const qrImage = await QRCode.toDataURL(qr);
  io.emit('qr', qrImage);
});

// Ready
client.on('ready', () => {
  console.log('✅ WhatsApp client ready');
  isReady = true;
  io.emit('ready');
});

client.on('authenticated', () => {
  console.log('🔐 Authenticated');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Auth failure:', msg);
});

client.initialize();

// OTP API
app.post('/send-otp', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({
      error: 'WhatsApp not ready. Scan QR first.'
    });
  }

  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).json({
      error: 'number and message are required'
    });
  }

  let cleanNumber = number.replace(/\D/g, '');

  // Pakistan auto-fix
  if (cleanNumber.startsWith('03') && cleanNumber.length === 11) {
    cleanNumber = '92' + cleanNumber.substring(1);
  }

  try {
    await client.sendMessage(`${cleanNumber}@c.us`, message);
    console.log(`✅ Message sent to ${cleanNumber}`);
    res.json({ success: true, number: cleanNumber });
  } catch (err) {
    console.error('❌ Send failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', whatsappReady: isReady });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
