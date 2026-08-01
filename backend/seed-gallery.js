const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
// It automatically picks up CLOUDINARY_URL from process.env

const galleryPhotoSchema = new mongoose.Schema({
  title: String,
  category: String,
  imageUrl: String,
  featured: { type: Boolean, default: false },
  date: { type: Date, default: Date.now }
}, { collection: 'gallery' });

const galleryCategorySchema = new mongoose.Schema({
  category: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'gallery_categories' });

const categories = [
  { folder: '4th year establishment day celebration', name: 'Establishment Day', description: 'Celebrating four impactful years of community service, growth, and empowerment with our dedicated team and supporters.' },
  { folder: 'activities-1', name: 'Activities', description: 'Highlighting our regular grassroots community initiatives, workshops, and social welfare drives.' },
  { folder: 'blood donation', name: 'Blood Donation', description: 'Organizing voluntary blood donation camps to save lives and support healthcare needs across communities.' },
  { folder: 'eye camp1(2024)', name: 'Eye Camp 2024', description: 'Providing free eye tests, consultations, and vision care assistance to under-served communities during 2024.' },
  { folder: 'eyecamp2(2026)', name: 'Eye Camp 2026', description: 'Continuing our commitment to vision care with free eye examinations and treatment guidance in 2026.' },
  { folder: 'tree plantation', name: 'Tree Plantation', description: 'Promoting environmental sustainability through community tree plantation drives and green awareness campaigns.' },
  { folder: 'women empowerment', name: 'Women Empowerment', description: 'Empowering women through skill development, self-reliance training, and livelihood generation initiatives.' }
];

const IMAGES_DIR = path.join(__dirname, '..', 'images');

const seedGallery = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const galleryDb = mongoose.connection.useDb('Gallery');
    const GalleryPhoto = galleryDb.model('GalleryPhoto', galleryPhotoSchema);
    const GalleryCategory = galleryDb.model('GalleryCategory', galleryCategorySchema);
    
    // Clear existing
    await GalleryPhoto.deleteMany({});
    await GalleryCategory.deleteMany({});
    console.log('Cleared existing gallery photos & categories');

    for (const cat of categories) {
      await GalleryCategory.updateOne(
        { category: cat.name },
        { description: cat.description, updatedAt: Date.now() },
        { upsert: true }
      );
    }
    console.log('Saved default category descriptions');

    let featuredCount = 0;

    for (const cat of categories) {
      const folderPath = path.join(IMAGES_DIR, cat.folder);
      if (!fs.existsSync(folderPath)) {
        console.log(`Folder not found: ${cat.folder}`);
        continue;
      }

      const files = fs.readdirSync(folderPath);
      for (const file of files) {
        if (!file.match(/\.(jpg|jpeg|png|webp|heic)$/i)) continue;

        const filePath = path.join(folderPath, file);
        console.log(`Uploading ${cat.name} / ${file}...`);
        
        const result = await cloudinary.uploader.upload(filePath, {
          folder: 'udyam_foundation/gallery'
        });

        // Determine if featured
        let isFeatured = false;
        if (file.includes('important_photo') || (featuredCount < 8 && Math.random() > 0.8)) {
          isFeatured = true;
          featuredCount++;
        }

        const photo = new GalleryPhoto({
          title: file.replace(/\.[^/.]+$/, "").replace(/_/g, " "),
          category: cat.name,
          imageUrl: result.secure_url,
          featured: isFeatured
        });

        await photo.save();
        console.log(`Saved to DB: ${photo.title}`);
      }
    }
    
    // Make sure we have exactly 8 featured photos if possible
    if (featuredCount < 8) {
        const remaining = 8 - featuredCount;
        const nonFeatured = await GalleryPhoto.find({ featured: false }).limit(remaining);
        for(let photo of nonFeatured) {
            photo.featured = true;
            await photo.save();
        }
    }

    console.log('Gallery seeding completed!');
    mongoose.connection.close();
  } catch (error) {
    console.error('Error seeding gallery:', error);
    process.exit(1);
  }
};

seedGallery();
