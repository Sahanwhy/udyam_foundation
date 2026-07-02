require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
const JWT_SECRET = process.env.JWT_SECRET || 'udyam-admin-secret-change-in-production';

const userPaymentSchema = new mongoose.Schema({
  fullName: String,
  email: String,
  phone: String,
  address: String,
  pan: String,
  amount: Number,
  paymentId: String,
  orderId: String,
  receiptNo: String,
  with80G: Boolean,
  date: { type: Date, default: Date.now }
}, { collection: 'user_payements' });
const UserPayment = mongoose.model('UserPayment', userPaymentSchema);

const ADMIN_ROLES = [
  'Executive Member',
  'President',
  'Office Secretary',
  'Secretary',
  'Board Member'
];

const adminUserSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ADMIN_ROLES },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'users' });

let AdminUser;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    const superAdminDb = mongoose.connection.useDb('Super_admin');
    AdminUser = superAdminDb.model('AdminUser', adminUserSchema);
  })
  .catch(err => console.error('MongoDB connection error:', err));

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.post('/api/create-order', async (req, res) => {
  try {
    const uniqueReceipt = `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const { amount, currency = 'INR', receipt = uniqueReceipt } = req.body;
    
    if (!amount || amount < 100) {
      return res.status(400).json({ error: 'Amount must be at least 100 paise' });
    }

    const options = {
      amount, // amount in smallest currency unit (paise)
      currency,
      receipt
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error(error);
    if (error.statusCode === 401) {
       return res.status(401).json({ error: 'Authentication failed' });
    }
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.post('/api/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, donorDetails } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const sign = razorpay_order_id + '|' + razorpay_payment_id;
  
  const expectedSign = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(sign.toString())
    .digest('hex');

  if (razorpay_signature === expectedSign) {
    // Signature verified successfully
    try {
      if (donorDetails) {
        const newUserPayment = new UserPayment({
          ...donorDetails,
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
        });
        await newUserPayment.save();
      }
      return res.json({ success: true, message: 'Payment verified successfully' });
    } catch (err) {
      console.error('Error saving payment details:', err);
      return res.status(500).json({ error: 'Payment verified but failed to save details' });
    }
  } else {
    // Signature verification failed
    return res.status(400).json({ error: 'Invalid signature sent!' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    if (!AdminUser) {
      return res.status(503).json({ error: 'Database not ready. Please try again.' });
    }

    const { fullName, email, password, role } = req.body;

    if (!fullName?.trim() || !email?.trim() || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!ADMIN_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role selected' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await AdminUser.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new AdminUser({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role
    });
    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, email: newUser.email, fullName: newUser.fullName, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: { fullName: newUser.fullName, email: newUser.email, role: newUser.role }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    if (!AdminUser) {
      return res.status(503).json({ error: 'Database not ready. Please try again.' });
    }

    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await AdminUser.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, fullName: user.fullName, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: { fullName: user.fullName, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    if (!AdminUser) {
      return res.status(503).json({ error: 'Database not ready' });
    }
    const user = await AdminUser.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ fullName: user.fullName, email: user.email, role: user.role });
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/api/donations', authMiddleware, async (req, res) => {
  try {
    const payments = await UserPayment.find().sort({ date: -1 });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
