/**
 * seed-gallery.js
 * Clears old Cloudinary gallery records from MongoDB and seeds fresh records
 * pointing to images stored locally in ../images/<category>/
 *
 * Usage (from the backend/ directory):  node seed-gallery.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fs = require("fs");
const mongoose = require("mongoose");

const IMAGES_DIR = path.join(__dirname, "..", "images");

const GALLERY_FOLDERS = [
  { folder: "women empowerment",                      description: "Empowering women through skill development and livelihood generation." },
  { folder: "4th year establishment day celebration", description: "Celebrating four impactful years of community service and empowerment." },
  { folder: "blood donation",                          description: "Organizing voluntary blood donation camps to save lives." },
  { folder: "environment day celebration",             description: "Promoting environmental sustainability through community events." },
  { folder: "eye camp1(2024)",                         description: "Free eye tests and vision care for under-served communities in 2024." },
  { folder: "eyecamp 2026",                           description: "Continuing our commitment to vision care with free eye examinations in 2026." },
  { folder: "eyecamp2(2026)",                          description: "Second eye camp of 2026, expanding reach across the region." },
  { folder: "tree plantation",                         description: "Community tree plantation drives and green awareness campaigns." },
  { folder: "usdf",                                    description: "Photos from USDF programmes, meetings, and social activities." },
];

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"]);

const galleryPhotoSchema = new mongoose.Schema({
  title: String,
  category: String,
  imageUrl: String,
  featured: { type: Boolean, default: false },
  date:     { type: String,  default: "" }
}, { collection: "gallery" });

const galleryCategorySchema = new mongoose.Schema({
  category:    { type: String, required: true, unique: true },
  description: { type: String, default: "" },
  updatedAt:   { type: Date,   default: Date.now }
}, { collection: "gallery_categories" });

const seed = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected!\n");

    const galleryDb    = mongoose.connection.useDb("Gallery");
    const GalleryPhoto = galleryDb.model("GalleryPhoto",    galleryPhotoSchema);
    const GalleryCategory = galleryDb.model("GalleryCategory", galleryCategorySchema);

    console.log("Clearing old gallery records...");
    const dp = await GalleryPhoto.deleteMany({});
    const dc = await GalleryCategory.deleteMany({});
    console.log("  Deleted " + dp.deletedCount + " photo(s), " + dc.deletedCount + " category record(s).\n");

    let totalInserted = 0;

    for (const item of GALLERY_FOLDERS) {
      const folderPath = path.join(IMAGES_DIR, item.folder);

      if (!fs.existsSync(folderPath)) {
        console.log("[SKIP] Folder not found: " + folderPath);
        continue;
      }

      const files = fs.readdirSync(folderPath).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return IMAGE_EXTS.has(ext) && !f.startsWith(".");
      });

      if (files.length === 0) {
        console.log("[SKIP] No images in: " + item.folder);
        continue;
      }

      console.log("[" + item.folder + "] " + files.length + " image(s):");

      const photoDocs = files.map((filename, idx) => {
        const imageUrl = "images/" + item.folder + "/" + filename;
        const featured = idx < 2;
        console.log("  + " + filename + (featured ? "  [featured]" : ""));
        return { title: "", category: item.folder, imageUrl, featured, date: "" };
      });

      await GalleryPhoto.insertMany(photoDocs);
      totalInserted += photoDocs.length;

      await GalleryCategory.findOneAndUpdate(
        { category: item.folder },
        { category: item.folder, description: item.description, updatedAt: new Date() },
        { upsert: true, new: true }
      );

      console.log("  -> Inserted " + photoDocs.length + " record(s) for \"" + item.folder + "\"\n");
    }

    console.log("Done! Inserted " + totalInserted + " photo record(s) total.");
    mongoose.connection.close();
  } catch (error) {
    console.error("Seed script failed:", error);
    process.exit(1);
  }
};

seed();
