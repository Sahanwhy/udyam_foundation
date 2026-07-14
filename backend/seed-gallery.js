require('dotenv').config();
const fs = require('fs');
const path = require('path');
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

const categories = [
  { folder: '4th year establishment day celebration', name: 'Establishment Day' },
  { folder: 'activities-1', name: 'Activities' },
  { folder: 'blood donation', name: 'Blood Donation' },
  { folder: 'eye camp1(2024)', name: 'Eye Camp 2024' },
  { folder: 'eyecamp2(2026)', name: 'Eye Camp 2026' },
  { folder: 'tree plantation', name: 'Tree Plantation' },
  { folder: 'women empowerment', name: 'Women Empowerment' }
];

const IMAGES_DIR = path.join(__dirname, '..', 'images');

const seedGallery = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const galleryDb = mongoose.connection.useDb('Gallery');
    const GalleryPhoto = galleryDb.model('GalleryPhoto', galleryPhotoSchema);
    
    // Clear existing
    await GalleryPhoto.deleteMany({});
    console.log('Cleared existing gallery photos');

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
