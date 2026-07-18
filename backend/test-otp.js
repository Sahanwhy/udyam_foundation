require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const ADMIN_ROLES = ['Super Admin', 'Admin', 'Editor'];

const adminUserSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ADMIN_ROLES },
  createdAt: { type: Date, default: Date.now },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  profileUpdateOtp: String,
  profileUpdateOtpExpires: Date,
  photo: String
}, { collection: 'users' });

async function test() {
  try {
    console.log('Connecting to DB...');
    await mongoose.connect(process.env.MONGO_URI);
    const superAdminDb = mongoose.connection.useDb('Super_admin');
    const AdminUser = superAdminDb.model('AdminUser', adminUserSchema);

    console.log('Finding user...');
    // Just find any user
    const user = await AdminUser.findOne();
    if (!user) {
      console.log('No user found');
      return;
    }
    console.log('User found:', user.email);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    
    user.profileUpdateOtp = otpHash;
    user.profileUpdateOtpExpires = Date.now() + 10 * 60 * 1000;
    
    console.log('Saving user...');
    await user.save();
    console.log('User saved.');

    console.log('Sending email...');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `"Udyam Foundation" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `OTP for Mobile Number Update`,
      text: `Your OTP for updating your mobile number is: ${otp}. It is valid for 10 minutes.`,
      html: `<p>Your OTP for updating your mobile number is: <strong>${otp}</strong>. It is valid for 10 minutes.</p>`
    });
    console.log('Email sent.');
  } catch (err) {
    console.error('ERROR OCCURRED:', err);
  } finally {
    mongoose.disconnect();
  }
}

test();
