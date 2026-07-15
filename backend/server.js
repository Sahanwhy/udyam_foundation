require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

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
  'Program Incharge',
  'Treasurer',
  'Communication Public Relations Officer'
];

const adminUserSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ADMIN_ROLES },
  createdAt: { type: Date, default: Date.now },
  resetPasswordToken: String,
  resetPasswordExpires: Date
}, { collection: 'users' });

const volunteerSchema = new mongoose.Schema({
  fullName: String,
  phone: String,
  whatsapp: String,
  email: String,
  bloodGroup: String,
  addressProofs: [String],
  photo: String,
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'forwarded', 'verified', 'issue_reported'], default: 'pending' },
  assignedToRole: { type: String, default: 'Secretary' },
  forwardAttachments: [mongoose.Schema.Types.Mixed],
  verifiedBy: [{ name: String, role: String, date: { type: Date, default: Date.now } }],
  issueText: String,
  date: { type: Date, default: Date.now }
}, { collection: 'volunteer' });

const employeeSchema = new mongoose.Schema({
  fullName: String,
  phone: String,
  whatsapp: String,
  email: String,
  bloodGroup: String,
  panCard: String,
  aadharCard: String,
  dobProof: String,
  educationDocs: [String],
  photo: String,
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'forwarded', 'verified', 'issue_reported'], default: 'pending' },
  assignedToRole: { type: String, default: 'Secretary' },
  forwardAttachments: [mongoose.Schema.Types.Mixed],
  verifiedBy: [{ name: String, role: String, date: { type: Date, default: Date.now } }],
  issueText: String,
  date: { type: Date, default: Date.now }
}, { collection: 'employee' });

const memberSchema = new mongoose.Schema({
  fullName: String,
  phone: String,
  whatsapp: String,
  email: String,
  bloodGroup: String,
  address1: String,
  address2: String,
  district: String,
  pin: String,
  validity: String,
  amount: Number,
  addressProofs: [String],
  photo: String,
  paymentId: String,
  orderId: String,
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'forwarded', 'verified', 'issue_reported'], default: 'pending' },
  assignedToRole: { type: String, default: 'Secretary' },
  forwardAttachments: [mongoose.Schema.Types.Mixed],
  verifiedBy: [{ name: String, role: String, date: { type: Date, default: Date.now } }],
  issueText: String,
  date: { type: Date, default: Date.now }
}, { collection: 'member' });

const galleryPhotoSchema = new mongoose.Schema({
  title: String,
  category: String,
  imageUrl: String,
  featured: { type: Boolean, default: false },
  date: { type: String, default: '' }
}, { collection: 'gallery' });

let AdminUser, Volunteer, Employee, Member, GalleryPhoto;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    const superAdminDb = mongoose.connection.useDb('Super_admin');
    AdminUser = superAdminDb.model('AdminUser', adminUserSchema);

    const registrationDb = mongoose.connection.useDb('Registration');
    Volunteer = registrationDb.model('Volunteer', volunteerSchema);
    Employee = registrationDb.model('Employee', employeeSchema);
    Member = registrationDb.model('Member', memberSchema);

    const galleryDb = mongoose.connection.useDb('Gallery');
    GalleryPhoto = galleryDb.model('GalleryPhoto', galleryPhotoSchema);
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

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'udyam_foundation',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'heic', 'webp'],
  },
});
const upload = multer({ storage: storage });

// Separate storage for admin forward attachments (PDF + images)
const forwardAttachmentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'udyam_foundation/forward_attachments',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'heic', 'webp']
  },
});
const uploadForwardAttachments = multer({ storage: forwardAttachmentStorage });

const galleryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'udyam_foundation/gallery',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'heic']
  }
});
const uploadGallery = multer({ storage: galleryStorage });

app.post('/api/register/volunteer', upload.fields([
  { name: 'addressProofs', maxCount: 5 },
  { name: 'photo', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!Volunteer) return res.status(503).json({ error: 'Database not ready' });

    const { fullName, phone, whatsapp, email, bloodGroup } = req.body;
    const addressProofs = req.files['addressProofs'] ? req.files['addressProofs'].map(f => f.path) : [];
    const photo = req.files['photo'] ? req.files['photo'][0].path : '';

    const newVolunteer = new Volunteer({ fullName, phone, whatsapp, email, bloodGroup, addressProofs, photo });
    await newVolunteer.save();

    res.status(201).json({ success: true, message: 'Volunteer registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to register volunteer' });
  }
});

app.post('/api/register/employee', upload.fields([
  { name: 'panCard', maxCount: 1 },
  { name: 'aadharCard', maxCount: 1 },
  { name: 'dobProof', maxCount: 1 },
  { name: 'educationDocs', maxCount: 5 },
  { name: 'photo', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!Employee) return res.status(503).json({ error: 'Database not ready' });

    const { fullName, phone, whatsapp, email, bloodGroup } = req.body;
    const panCard = req.files['panCard'] ? req.files['panCard'][0].path : '';
    const aadharCard = req.files['aadharCard'] ? req.files['aadharCard'][0].path : '';
    const dobProof = req.files['dobProof'] ? req.files['dobProof'][0].path : '';
    const educationDocs = req.files['educationDocs'] ? req.files['educationDocs'].map(f => f.path) : [];
    const photo = req.files['photo'] ? req.files['photo'][0].path : '';

    const newEmployee = new Employee({ fullName, phone, whatsapp, email, bloodGroup, panCard, aadharCard, dobProof, educationDocs, photo });
    await newEmployee.save();

    res.status(201).json({ success: true, message: 'Employee registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to register employee' });
  }
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
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, donorDetails, memberDetails } = req.body;

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

        // Send confirmation email with PDF receipt (non-blocking)
        sendDonationConfirmationEmail({
          ...donorDetails,
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
        }).catch(emailErr => console.error('Email send error:', emailErr));
      } else if (memberDetails) {
        if (!Member) return res.status(503).json({ error: 'Database not ready' });
        const newMember = new Member({
          ...memberDetails,
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
        });
        await newMember.save();
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

app.post('/api/verify-member-payment', upload.fields([
  { name: 'addressProofs', maxCount: 5 },
  { name: 'photo', maxCount: 1 }
]), async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, memberDetailsStr } = req.body;
  
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const sign = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSign = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(sign.toString())
    .digest('hex');

  if (razorpay_signature === expectedSign) {
    try {
      if (!Member) return res.status(503).json({ error: 'Database not ready' });
      
      let memberDetails = {};
      try {
        if (memberDetailsStr) memberDetails = JSON.parse(memberDetailsStr);
      } catch(e) {
         console.error('Error parsing member details');
      }

      const addressProofs = req.files && req.files['addressProofs'] ? req.files['addressProofs'].map(f => f.path) : [];
      const photo = req.files && req.files['photo'] ? req.files['photo'][0].path : '';

      const newMember = new Member({
        ...memberDetails,
        addressProofs,
        photo,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
      });
      await newMember.save();
      return res.json({ success: true, message: 'Payment verified successfully' });
    } catch (err) {
      console.error('Error saving payment details:', err);
      return res.status(500).json({ error: 'Payment verified but failed to save details' });
    }
  } else {
    return res.status(400).json({ error: 'Invalid signature sent!' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    if (!AdminUser) {
      return res.status(503).json({ error: 'Database not ready. Please try again.' });
    }

    const { fullName, phone, email, password, role } = req.body;

    if (!fullName?.trim() || !phone?.trim() || !email?.trim() || !password || !role) {
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
      phone: phone.trim(),
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

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// ─── PDF Receipt Generator (server-side) ─────────────────────────────────────
const ORG = {
  name: 'UDYAM SOCIAL DEVELOPMENT FOUNDATION',
  shortName: 'Udyam Foundation',
  tagline: 'Empowering Youth, Transforming Communities',
  address: 'Kakodonga, Golaghat, Assam — 785621, India',
  pan: 'AAETU1234F',
  reg80G: 'AAETU1234F/80G/2024-25',
  reg12A: 'AAETU1234F/12A/2024-25',
  website: 'udyamfoundation.org',
  email: process.env.EMAIL_USER || 'support@udyamfoundation.org',
};

function formatIndianAmount(amount) {
  const num = Number(amount);
  if (Number.isNaN(num)) return 'INR 0/-';
  return `INR ${num.toLocaleString('en-IN')}/-`;
}

function numberToWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (num === 0) return 'Zero';
  function convert(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  }
  return convert(Math.floor(num)) + ' Rupees Only';
}

function generateReceiptPDF(donor) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const GREEN_DEEP = '#1B4332';
    const GREEN_MID = '#2D6A4F';
    const SAFFRON = '#E8883A';
    const CREAM = '#FDF8F0';
    const LIGHT_GRAY = '#F3F4F6';
    const MID_GRAY = '#6B7280';
    const DARK = '#1F2937';
    const WHITE = '#FFFFFF';
    const pageWidth = doc.page.width;
    const margin = 50;
    const contentW = pageWidth - margin * 2;
    const now = new Date();
    const receiptNo = donor.receiptNo || `RCPT-${Date.now()}`;
    const with80G = Boolean(donor.with80G);

    // ── Header Banner ──────────────────────────────────────────────────────────
    doc.rect(0, 0, pageWidth, 90).fill(GREEN_DEEP);

    // Saffron accent stripe
    doc.rect(0, 80, pageWidth, 6).fill(SAFFRON);

    // Org Name
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(16)
      .text(ORG.name, margin, 20, { width: contentW, align: 'center' });

    // Tagline
    doc.fillColor('#A7F3D0').font('Helvetica').fontSize(9)
      .text(ORG.tagline, margin, 44, { width: contentW, align: 'center' });

    // Address
    doc.fillColor('#D1FAE5').font('Helvetica').fontSize(8)
      .text(ORG.address, margin, 58, { width: contentW, align: 'center' });

    // ── Receipt Title Band ─────────────────────────────────────────────────────
    const titleY = 96;
    doc.rect(margin, titleY, contentW, 28).fill(CREAM);
    doc.rect(margin, titleY, 4, 28).fill(SAFFRON);
    doc.fillColor(GREEN_DEEP).font('Helvetica-Bold').fontSize(13)
      .text(with80G ? 'DONATION RECEIPT — 80G TAX EXEMPTION' : 'DONATION RECEIPT', margin + 14, titleY + 8, { width: contentW - 14 });

    let y = titleY + 42;

    // ── Receipt Meta Row ───────────────────────────────────────────────────────
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8.5)
      .text(`Receipt No: ${receiptNo}`, margin, y)
      .text(`Date: ${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, margin + contentW / 2, y, { width: contentW / 2, align: 'right' });

    y += 16;
    doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    y += 14;

    // ── Donor Details Section ──────────────────────────────────────────────────
    doc.rect(margin, y, contentW, 16).fill(GREEN_DEEP);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9)
      .text('DONOR INFORMATION', margin + 10, y + 4);
    y += 24;

    function infoRow(label, value, currentY) {
      doc.fillColor(MID_GRAY).font('Helvetica-Bold').fontSize(9).text(label, margin + 8, currentY, { width: 120 });
      doc.fillColor(DARK).font('Helvetica').fontSize(9).text(value || '—', margin + 130, currentY, { width: contentW - 138 });
      return currentY + 18;
    }

    y = infoRow('Full Name', donor.fullName, y);
    y = infoRow('Email Address', donor.email, y);
    y = infoRow('Phone Number', donor.phone, y);
    y = infoRow('Address', donor.address, y);
    if (with80G && donor.pan) y = infoRow('PAN Card No.', donor.pan.toUpperCase(), y);

    y += 8;

    // ── Payment Details Section ────────────────────────────────────────────────
    doc.rect(margin, y, contentW, 16).fill(GREEN_DEEP);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9)
      .text('PAYMENT DETAILS', margin + 10, y + 4);
    y += 24;

    y = infoRow('Payment ID', donor.paymentId || '—', y);
    y = infoRow('Order ID', donor.orderId || '—', y);
    y = infoRow('Payment Method', 'Online (Razorpay)', y);
    y = infoRow('Payment Status', '✓ Successful', y);
    y = infoRow('Payment Date', now.toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' }), y);

    y += 12;

    // ── Amount Box ────────────────────────────────────────────────────────────
    doc.rect(margin, y, contentW, 56).fill(CREAM).stroke(GREEN_MID);
    doc.rect(margin, y, contentW, 56).strokeColor(GREEN_MID).lineWidth(1).stroke();

    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8.5)
      .text('DONATION AMOUNT', margin + 12, y + 10);
    doc.fillColor(GREEN_DEEP).font('Helvetica-Bold').fontSize(22)
      .text(formatIndianAmount(donor.amount), margin + 12, y + 22);
    doc.fillColor(MID_GRAY).font('Helvetica-Oblique').fontSize(8)
      .text(`(${numberToWords(donor.amount)})`, margin + 12, y + 45);

    y += 68;

    // ── 80G Certificate Block ─────────────────────────────────────────────────
    if (with80G) {
      doc.rect(margin, y, contentW, 70).fill('#F0FDF4').strokeColor(GREEN_MID).lineWidth(0.8).stroke();
      doc.rect(margin, y, 4, 70).fill(GREEN_MID);

      doc.fillColor(GREEN_DEEP).font('Helvetica-Bold').fontSize(9)
        .text('80G TAX EXEMPTION CERTIFICATE', margin + 12, y + 10);

      const certText = `This is to certify that ${ORG.shortName} (PAN: ${ORG.pan}), registered under Section 80G ` +
        `(Reg. No.: ${ORG.reg80G}), has received a voluntary donation of ${formatIndianAmount(donor.amount)} ` +
        `from ${donor.fullName}${donor.pan ? ' (PAN: ' + donor.pan.toUpperCase() + ')' : ''}, residing at ${donor.address}. ` +
        `The donor is entitled to claim deduction under Section 80G of the Income Tax Act, 1961, subject to applicable limits.`;

      doc.fillColor('#374151').font('Helvetica').fontSize(8)
        .text(certText, margin + 12, y + 24, { width: contentW - 24, lineGap: 2 });

      doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7.5)
        .text(`Org. PAN: ${ORG.pan}   |   80G Reg.: ${ORG.reg80G}   |   12A Reg.: ${ORG.reg12A}`, margin + 12, y + 56);

      y += 82;
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = Math.max(y + 14, 700);
    doc.moveTo(margin, footerY).lineTo(margin + contentW, footerY).strokeColor('#E5E7EB').lineWidth(0.5).stroke();

    doc.fillColor(GREEN_DEEP).font('Helvetica-BoldOblique').fontSize(10)
      .text('"Thank you for your generous contribution."', margin, footerY + 10, { width: contentW, align: 'center' });
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8.5)
      .text('Your support helps us empower youth and transform communities in Golaghat.', margin, footerY + 26, { width: contentW, align: 'center' });
    doc.fillColor('#9CA3AF').font('Helvetica').fontSize(7.5)
      .text('This is a computer-generated receipt and does not require a signature.', margin, footerY + 40, { width: contentW, align: 'center' });

    // Bottom green strip
    doc.rect(0, doc.page.height - 12, pageWidth, 12).fill(GREEN_DEEP);
    doc.rect(0, doc.page.height - 18, pageWidth, 6).fill(SAFFRON);

    doc.end();
  });
}

// ─── Donation Confirmation Email ──────────────────────────────────────────────
async function sendDonationConfirmationEmail(donor) {
  if (!donor.email) return;

  const pdfBuffer = await generateReceiptPDF(donor);
  const with80G = Boolean(donor.with80G);
  const receiptNo = donor.receiptNo || `RCPT-${Date.now()}`;
  const amountFormatted = `₹${Number(donor.amount).toLocaleString('en-IN')}`;
  const filename = with80G
    ? `Udyam_80G_Receipt_${receiptNo}.pdf`
    : `Udyam_Donation_Receipt_${receiptNo}.pdf`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Donation Confirmation</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%);padding:0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:36px 40px 20px;text-align:center;">
                <div style="display:inline-block;background:rgba(255,255,255,0.12);border-radius:50%;padding:14px;margin-bottom:12px;">
                  <span style="font-size:36px;">🌿</span>
                </div>
                <h1 style="margin:0 0 4px;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Udyam Social Development Foundation</h1>
                <p style="margin:0;color:#A7F3D0;font-size:13px;letter-spacing:0.3px;">Empowering Youth · Transforming Communities</p>
              </td></tr>
              <tr><td style="background:#E8883A;height:5px;"></td></tr>
            </table>
          </td>
        </tr>

        <!-- Success Badge -->
        <tr>
          <td style="padding:32px 40px 0;text-align:center;">
            <div style="display:inline-block;background:#ECFDF5;border:2px solid #6EE7B7;border-radius:50px;padding:8px 24px;margin-bottom:20px;">
              <span style="color:#065F46;font-size:13px;font-weight:600;">✅ &nbsp;Payment Successful</span>
            </div>
            <h2 style="margin:0 0 10px;color:#1B4332;font-size:26px;font-weight:700;">Thank You, ${donor.fullName.split(' ')[0]}! 🙏</h2>
            <p style="margin:0;color:#6B7280;font-size:15px;line-height:1.6;">Your generous donation of <strong style="color:#1B4332;font-size:17px;">${amountFormatted}</strong> has been received.</p>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:24px 40px 0;"><hr style="border:none;border-top:1px solid #E5E7EB;" /></td></tr>

        <!-- Donation Summary Card -->
        <tr>
          <td style="padding:24px 40px;">
            <div style="background:#F9FAFB;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;">
              <div style="background:#1B4332;padding:12px 20px;">
                <p style="margin:0;color:#ffffff;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Donation Summary</p>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:0;">
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #F3F4F6;">
                    <span style="color:#9CA3AF;font-size:12px;">RECEIPT NO.</span><br/>
                    <span style="color:#1F2937;font-size:14px;font-weight:600;">${receiptNo}</span>
                  </td>
                  <td style="padding:14px 20px;border-bottom:1px solid #F3F4F6;text-align:right;">
                    <span style="color:#9CA3AF;font-size:12px;">PAYMENT ID</span><br/>
                    <span style="color:#1F2937;font-size:13px;font-weight:500;">${donor.paymentId || '—'}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #F3F4F6;">
                    <span style="color:#9CA3AF;font-size:12px;">AMOUNT DONATED</span><br/>
                    <span style="color:#1B4332;font-size:22px;font-weight:700;">${amountFormatted}</span>
                  </td>
                  <td style="padding:14px 20px;border-bottom:1px solid #F3F4F6;text-align:right;">
                    <span style="color:#9CA3AF;font-size:12px;">CERTIFICATE TYPE</span><br/>
                    <span style="color:#1F2937;font-size:14px;font-weight:600;">${with80G ? '80G Tax Exemption' : 'Standard Receipt'}</span>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:14px 20px;">
                    <span style="color:#9CA3AF;font-size:12px;">DATE</span><br/>
                    <span style="color:#1F2937;font-size:14px;font-weight:600;">${new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}</span>
                  </td>
                </tr>
              </table>
            </div>
          </td>
        </tr>

        <!-- PDF Attachment Notice -->
        <tr>
          <td style="padding:0 40px 24px;">
            <div style="background:linear-gradient(135deg,#ECFDF5,#D1FAE5);border-radius:12px;border-left:4px solid #34D399;padding:18px 20px;display:flex;align-items:flex-start;">
              <span style="font-size:24px;margin-right:14px;">📎</span>
              <div>
                <p style="margin:0 0 4px;color:#065F46;font-size:14px;font-weight:600;">Your Receipt is Attached!</p>
                <p style="margin:0;color:#047857;font-size:13px;line-height:1.5;">We've attached your official donation receipt (<strong>${filename}</strong>) to this email. Please save it for your records${with80G ? ' and for claiming your 80G tax deduction' : ''}.</p>
              </div>
            </div>
          </td>
        </tr>

        ${with80G ? `
        <!-- 80G Note -->
        <tr>
          <td style="padding:0 40px 24px;">
            <div style="background:#FFFBEB;border-radius:12px;border-left:4px solid #F59E0B;padding:18px 20px;">
              <p style="margin:0 0 4px;color:#92400E;font-size:14px;font-weight:600;">🏛️ 80G Tax Deduction Information</p>
              <p style="margin:0;color:#78350F;font-size:13px;line-height:1.6;">Your donation qualifies for a deduction under <strong>Section 80G</strong> of the Income Tax Act, 1961. Please retain the attached receipt to claim this benefit while filing your income tax return.</p>
              <p style="margin:8px 0 0;color:#92400E;font-size:12px;">Org. PAN: <strong>${ORG.pan}</strong> &nbsp;|&nbsp; 80G Reg.: <strong>${ORG.reg80G}</strong></p>
            </div>
          </td>
        </tr>` : ''}

        <!-- Impact Message -->
        <tr>
          <td style="padding:0 40px 28px;text-align:center;">
            <div style="background:#1B4332;border-radius:12px;padding:24px;">
              <p style="margin:0 0 8px;color:#A7F3D0;font-size:12px;letter-spacing:1px;text-transform:uppercase;font-weight:600;">Your Impact</p>
              <p style="margin:0 0 16px;color:#ffffff;font-size:15px;line-height:1.7;">Your contribution directly funds <strong>skill workshops</strong>, <strong>learning materials</strong>, <strong>health camps</strong>, and <strong>community programs</strong> for the youth of Golaghat, Assam.</p>
              <p style="margin:0;color:#6EE7B7;font-size:13px;font-style:italic;">"Every rupee you give, plants a seed of change."</p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 8px;color:#1B4332;font-weight:700;font-size:14px;">Udyam Social Development Foundation</p>
            <p style="margin:0 0 4px;color:#9CA3AF;font-size:12px;">${ORG.address}</p>
            <p style="margin:0 0 16px;color:#9CA3AF;font-size:12px;">📧 ${ORG.email}</p>
            <div style="border-top:1px solid #E5E7EB;padding-top:14px;">
              <p style="margin:0;color:#D1D5DB;font-size:11px;">© ${new Date().getFullYear()} Udyam Social Development Foundation. All rights reserved.</p>
              <p style="margin:4px 0 0;color:#D1D5DB;font-size:11px;">This is an automated email. Please do not reply to this message.</p>
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: `"Udyam Foundation" <${process.env.EMAIL_USER}>`,
    to: donor.email,
    subject: `💚 Donation Confirmed — ${amountFormatted} | Receipt ${receiptNo}`,
    text: `Dear ${donor.fullName},\n\nThank you for your generous donation of ${amountFormatted} to Udyam Social Development Foundation!\n\nReceipt No: ${receiptNo}\nPayment ID: ${donor.paymentId}\nAmount: ${amountFormatted}\n\nYour official receipt is attached to this email. Please save it for your records.\n\nWith gratitude,\nUdyam Foundation Team`,
    html: htmlBody,
    attachments: [
      {
        filename: filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }
    ]
  });

  console.log(`Donation confirmation email sent to ${donor.email}`);
}

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await AdminUser.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // To prevent email enumeration, return success even if user not found, 
      // but here we can just return an error for simplicity since it's an admin app.
      return res.status(404).json({ error: 'User with this email does not exist' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = `${req.protocol}://${req.get('host')}/admin-reset-password.html?token=${resetToken}`;

    // Fallback for localhost relative path (if accessed differently)
    const finalResetUrl = resetUrl.includes('localhost:3000')
      ? `http://localhost/Udyam%20Foundation/admin-reset-password.html?token=${resetToken}`
      : `http://localhost/Udyam%20Foundation/admin-reset-password.html?token=${resetToken}`;
    // In production, you would configure the exact FRONTEND_URL in .env

    const htmlContent = `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0d47a1; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">Udyam Foundation</h2>
        </div>
        <div style="padding: 30px; color: #333; line-height: 1.6;">
          <p>Hello <strong>${user.fullName}</strong>,</p>
          <p>We received a request to reset your password for your Udyam Foundation admin account.</p>
          <p>Please click the button below to set a new password. This link is valid for <strong>1 hour</strong>.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${finalResetUrl}" style="background-color: #1976d2; color: white; text-decoration: none; padding: 12px 25px; border-radius: 4px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
          <p>Thank you,<br>Udyam Foundation Team</p>
        </div>
        <div style="background-color: #f5f5f5; color: #777; padding: 15px; text-align: center; font-size: 12px;">
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} Udyam Foundation. All rights reserved.</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"Udyam Foundation" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Password Reset Request - Udyam Foundation',
      text: `You requested a password reset. Click this link to reset your password: ${finalResetUrl}`,
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Password reset link sent to email' });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process forgot password request' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await AdminUser.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password has been successfully reset' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
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

app.get('/api/admin/registrations', authMiddleware, async (req, res) => {
  try {
    if (!Volunteer || !Employee || !Member) return res.status(503).json({ error: 'Database not ready' });
    const volunteers = await Volunteer.find().lean();
    const employees = await Employee.find().lean();
    const members = await Member.find().lean();

    const formattedVolunteers = volunteers.map(v => ({ ...v, type: 'volunteer' }));
    const formattedEmployees = employees.map(e => ({ ...e, type: 'employee' }));
    const formattedMembers = members.map(m => ({ ...m, type: 'member' }));

    const allRegistrations = [...formattedVolunteers, ...formattedEmployees, ...formattedMembers].sort((a, b) => b.date - a.date);
    res.json(allRegistrations);
  } catch (error) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

app.patch('/api/admin/registrations/:type/:id/status', authMiddleware, async (req, res) => {
  try {
    const { type, id } = req.params;
    const { status } = req.body;

    if (!['pending', 'accepted', 'rejected', 'forwarded'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    let updatedDoc;
    if (type === 'volunteer') {
      updatedDoc = await Volunteer.findByIdAndUpdate(id, { status }, { new: true });
    } else if (type === 'employee') {
      updatedDoc = await Employee.findByIdAndUpdate(id, { status }, { new: true });
    } else if (type === 'member') {
      updatedDoc = await Member.findByIdAndUpdate(id, { status }, { new: true });
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    if (!updatedDoc) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    res.json({ success: true, message: 'Status updated successfully', data: updatedDoc });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

app.patch(
  '/api/admin/registrations/:type/:id/forward',
  authMiddleware,
  uploadForwardAttachments.array('attachments', 10),
  async (req, res) => {
    try {
      const { type, id } = req.params;
      const { newRole } = req.body;

      if (!ADMIN_ROLES.includes(newRole)) {
        return res.status(400).json({ error: 'Invalid role for forwarding' });
      }

      // Collect Cloudinary URLs for any uploaded attachments
      const attachmentUrls = req.files ? req.files.map(f => ({ url: f.path, uploadedBy: req.user.fullName || 'Admin' })) : [];

      const updateFields = {
        assignedToRole: newRole,
        status: 'forwarded',
        ...(attachmentUrls.length > 0 && { $push: { forwardAttachments: { $each: attachmentUrls } } }),
      };

      // Separate $set and $push to avoid conflict
      const setFields = { assignedToRole: newRole, status: 'forwarded' };
      const pushFields = attachmentUrls.length > 0 ? { forwardAttachments: { $each: attachmentUrls } } : null;

      let updatedDoc;
      if (type === 'volunteer') {
        updatedDoc = await Volunteer.findByIdAndUpdate(
          id,
          { $set: setFields, ...(pushFields && { $push: pushFields }) },
          { new: true }
        );
      } else if (type === 'employee') {
        updatedDoc = await Employee.findByIdAndUpdate(
          id,
          { $set: setFields, ...(pushFields && { $push: pushFields }) },
          { new: true }
        );
      } else if (type === 'member') {
        updatedDoc = await Member.findByIdAndUpdate(
          id,
          { $set: setFields, ...(pushFields && { $push: pushFields }) },
          { new: true }
        );
      } else {
        return res.status(400).json({ error: 'Invalid type' });
      }

      if (!updatedDoc) {
        return res.status(404).json({ error: 'Registration not found' });
      }

      res.json({ success: true, message: 'Forwarded successfully', data: updatedDoc });
    } catch (error) {
      console.error('Error forwarding registration:', error);
      res.status(500).json({ error: 'Failed to forward' });
    }
  }
);

app.patch('/api/admin/registrations/:type/:id/verify', authMiddleware, async (req, res) => {
  try {
    const { type, id } = req.params;
    const userName = req.user.fullName || 'Unknown Member';
    const userRole = req.user.role || 'Member';

    let updatedDoc;
    const updateData = { 
      status: 'verified', 
      $push: { verifiedBy: { name: userName, role: userRole } } 
    };

    if (type === 'volunteer') {
      updatedDoc = await Volunteer.findByIdAndUpdate(id, updateData, { new: true });
    } else if (type === 'employee') {
      updatedDoc = await Employee.findByIdAndUpdate(id, updateData, { new: true });
    } else if (type === 'member') {
      updatedDoc = await Member.findByIdAndUpdate(id, updateData, { new: true });
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    if (!updatedDoc) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    res.json({ success: true, message: 'Verified successfully', data: updatedDoc });
  } catch (error) {
    console.error('Error verifying registration:', error);
    res.status(500).json({ error: 'Failed to verify' });
  }
});

app.patch(
  '/api/admin/registrations/:type/:id/verify_and_forward',
  authMiddleware,
  uploadForwardAttachments.array('attachments', 10),
  async (req, res) => {
    try {
      const { type, id } = req.params;
      const { newRole } = req.body;
      const userName = req.user.fullName || 'Unknown Member';
      const userRole = req.user.role || 'Member';

      if (!ADMIN_ROLES.includes(newRole)) {
        return res.status(400).json({ error: 'Invalid role for forwarding' });
      }

      const attachmentUrls = req.files ? req.files.map(f => ({ url: f.path, uploadedBy: userName })) : [];

      // When forwarding TO Secretary/President it means the review chain is complete.
      // Set status 'verified' so it leaves the forwarded section and lands in Secretary's
      // verified tab where they can take the final accept/reject decision.
      // For all other intermediate roles, keep status as 'forwarded'.
      const isFinalVerify = newRole === 'Secretary' || newRole === 'President';
      const status = isFinalVerify ? 'verified' : 'forwarded';

      const pushFields = {
        verifiedBy: { $each: [{ name: userName, role: userRole }] }
      };

      if (attachmentUrls.length > 0) {
        pushFields.forwardAttachments = { $each: attachmentUrls };
      }

      const updateData = {
        $set: { status, assignedToRole: newRole },
        $push: pushFields
      };

      let updatedDoc;
      if (type === 'volunteer') {
        updatedDoc = await Volunteer.findByIdAndUpdate(id, updateData, { new: true });
      } else if (type === 'employee') {
        updatedDoc = await Employee.findByIdAndUpdate(id, updateData, { new: true });
      } else if (type === 'member') {
        updatedDoc = await Member.findByIdAndUpdate(id, updateData, { new: true });
      } else {
        return res.status(400).json({ error: 'Invalid type' });
      }

      if (!updatedDoc) {
        return res.status(404).json({ error: 'Registration not found' });
      }

      res.json({ success: true, message: 'Verified and forwarded successfully', data: updatedDoc });
    } catch (error) {
      console.error('Error verifying and forwarding registration:', error);
      res.status(500).json({ error: 'Failed to verify and forward' });
    }
  }
);

app.patch('/api/admin/registrations/:type/:id/report-issue', authMiddleware, async (req, res) => {
  try {
    const { type, id } = req.params;
    const { issueText } = req.body;

    if (!issueText || issueText.trim() === '') {
      return res.status(400).json({ error: 'Issue text is required' });
    }

    let updatedDoc;
    const updateData = { status: 'issue_reported', issueText };

    if (type === 'volunteer') {
      updatedDoc = await Volunteer.findByIdAndUpdate(id, updateData, { new: true });
    } else if (type === 'employee') {
      updatedDoc = await Employee.findByIdAndUpdate(id, updateData, { new: true });
    } else if (type === 'member') {
      updatedDoc = await Member.findByIdAndUpdate(id, updateData, { new: true });
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    if (!updatedDoc) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    res.json({ success: true, message: 'Issue reported successfully', data: updatedDoc });
  } catch (error) {
    console.error('Error reporting issue:', error);
    res.status(500).json({ error: 'Failed to report issue' });
  }
});
// --- Gallery API Endpoints ---

// Get all gallery photos (public)
app.get('/api/gallery', async (req, res) => {
  try {
    const { category, featured } = req.query;
    let query = {};
    if (category) query.category = category;
    if (featured === 'true') query.featured = true;
    
    const photos = await GalleryPhoto.find(query).sort({ date: -1 });
    res.json(photos);
  } catch (error) {
    console.error('Error fetching gallery photos:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// Get unique categories (public)
app.get('/api/gallery/categories', async (req, res) => {
  try {
    const categories = await GalleryPhoto.distinct('category');
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Upload new gallery photo (admin only)
app.post('/api/gallery/upload', authMiddleware, uploadGallery.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo provided' });
    }
    
    const { title, category, featured } = req.body;
    
    const newPhoto = new GalleryPhoto({
      title: title || 'Untitled',
      category: category || 'Uncategorized',
      imageUrl: req.file.path,
      featured: featured === 'true'
    });
    
    await newPhoto.save();
    res.status(201).json({ success: true, message: 'Photo uploaded successfully', photo: newPhoto });
  } catch (error) {
    console.error('Error uploading photo:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// Delete gallery photo (admin only)
app.delete('/api/gallery/:id', authMiddleware, async (req, res) => {
  try {
    const photo = await GalleryPhoto.findByIdAndDelete(req.params.id);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    res.json({ success: true, message: 'Photo deleted successfully' });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// Toggle featured status (admin only)
app.patch('/api/gallery/:id/featured', authMiddleware, async (req, res) => {
  try {
    const { featured } = req.body;
    const photo = await GalleryPhoto.findByIdAndUpdate(
      req.params.id, 
      { featured: featured }, 
      { new: true }
    );
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    res.json({ success: true, photo });
  } catch (error) {
    console.error('Error updating photo:', error);
    res.status(500).json({ error: 'Failed to update photo' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
