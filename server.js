require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());
app.use(cors());

// ── Firebase Admin SDK Config (Direct JSON import) ────────
// .env-এর PEM formatting ঝামেলা এড়াতে সরাসরি JSON ফাইল লোড করা হচ্ছে
// আপনার ডাউনলোড হওয়া ফাইলের আসল নাম বসান
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ── 1. Admin: নতুন লাইসেন্স তৈরি করার API ──────────────
app.post('/api/admin/generate', async (req, res) => {
  try {
    const { adminSecret, days } = req.body;

    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const randomStr = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const key = `ARB-${randomStr()}-${randomStr()}`;

    const validityDays = parseInt(days, 10) || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validityDays);

    await db.collection('licenses').doc(key).set({
      key: key,
      status: 'active',
      deviceId: null,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'License Key created!',
      key: key,
      expiresAt: expiresAt.toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 2. Extension: লাইসেন্স ভেরিফাই করার API ──────────────
app.post('/api/verify-license', async (req, res) => {
  try {
    const { licenseKey, deviceId } = req.body;

    if (!licenseKey || typeof licenseKey !== 'string') {
      return res.json({ valid: false, reason: 'License Key is required' });
    }

    const cleanKey = licenseKey.trim();
    const docRef = db.collection('licenses').doc(cleanKey);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.json({ valid: false, reason: 'Invalid License Key' });
    }

    const license = doc.data();

    if (license.status === 'blocked') {
      return res.json({ valid: false, reason: 'License blocked by Admin' });
    }

    if (new Date() > new Date(license.expiresAt)) {
      return res.json({ valid: false, reason: 'License has expired' });
    }

    // ডিভাইস লক সিস্টেম
    if (!license.deviceId) {
      await docRef.update({ deviceId: deviceId });
    } else if (license.deviceId !== deviceId) {
      return res.json({ valid: false, reason: 'Bound to another device' });
    }

    res.json({
      valid: true,
      expiresAt: license.expiresAt,
      reason: 'Active License'
    });
  } catch (err) {
    res.status(500).json({ valid: false, reason: 'Server Error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Firebase Backend running on port ${PORT}`));