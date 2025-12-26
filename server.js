const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static('public')); // serve HTML

// WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let isReady = false;

// Send QR to browser
client.on('qr', async (qr) => {
  console.log('📲 QR generated');
  const qrImage = await QRCode.toDataURL(qr);
  io.emit('qr', qrImage);
});

client.on('ready', () => {
  console.log('✅ WhatsApp Ready');
  isReady = true;
  io.emit('ready');
});

client.on('auth_failure', msg => {
  console.error('❌ Auth failure', msg);
});

client.initialize();

// API for OTP
app.post('/send-otp', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp not ready, scan QR first' });
  }

  const { number, message } = req.body;
  if (!number || !message) {
    return res.status(400).json({ error: 'Number & message required' });
  }

  let cleanNumber = number.replace(/\D/g, '');
  if (cleanNumber.startsWith('03') && cleanNumber.length === 11) {
    cleanNumber = '92' + cleanNumber.substring(1);
  }

  try {
    await client.sendMessage(cleanNumber + '@c.us', message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
