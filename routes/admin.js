// Fixed version of admin.js with better error handling

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { pool } = require('../config/database');

const router = express.Router();

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'image' || file.fieldname === 'thumbnail') {
      cb(null, 'uploads/images');
    } else if (file.fieldname === 'video') {
      cb(null, 'uploads/videos');
    } else {
      cb(null, 'uploads');
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      if (file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed for video uploads'));
      }
    } else if (file.fieldname === 'image' || file.fieldname === 'thumbnail') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for image uploads'));
      }
    } else {
      cb(null, true);
    }
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Check if admin exists
router.get('/check', async (req, res) => {
  try {
    const [admins] = await pool.execute('SELECT COUNT(*) as count FROM admins');
    res.json({ 
      hasAdmin: admins[0].count > 0,
      count: admins[0].count 
    });
  } catch (error) {
    console.error('Check admin error:', error);
    res.status(500).json({ error: 'Failed to check admin status', details: error.message });
  }
});

// Create default admin if not exists
router.post('/init', async (req, res) => {
  try {
    // Check if admin already exists
    const [existing] = await pool.execute('SELECT id FROM admins LIMIT 1');
    
    if (existing.length > 0) {
      return res.json({ 
        message: 'Admin already exists',
        adminExists: true,
        count: existing.length
      });
    }

    // Create default admin
    const email = process.env.ADMIN_EMAIL || 'admin@breastcancer.com';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    
    console.log('Creating admin with email:', email);
    
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const [result] = await pool.execute(
      'INSERT INTO admins (email, password, name) VALUES (?, ?, ?)',
      [email, hashedPassword, 'Administrator']
    );

    console.log('Admin created with ID:', result.insertId);

    res.json({ 
      message: 'Default admin created successfully',
      adminId: result.insertId,
      email: email,
      tempPassword: password // Remove this in production
    });
  } catch (error) {
    console.error('Init admin error:', error);
    res.status(500).json({ 
      error: 'Failed to create admin', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Admin login with detailed error logging
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt for email:', email);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const [rows] = await pool.execute(
      'SELECT * FROM admins WHERE email = ?',
      [email]
    );

    console.log('Found admins:', rows.length);

    if (rows.length === 0) {
      console.log('No admin found with email:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const admin = rows[0];
    console.log('Checking password for admin ID:', admin.id);
    
    const isValidPassword = await bcrypt.compare(password, admin.password);
    console.log('Password valid:', isValidPassword);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Login successful for admin ID:', admin.id);

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Login failed', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Reset admin password (for debugging)
router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and new password are required' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    const [result] = await pool.execute(
      'UPDATE admins SET password = ? WHERE email = ?',
      [hashedPassword, email]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password', details: error.message });
  }
});

// Dashboard stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [materialCount] = await pool.execute('SELECT COUNT(*) as count FROM materials');
    const [videoCount] = await pool.execute('SELECT COUNT(*) as count FROM videos');
    const [categoryCount] = await pool.execute('SELECT COUNT(*) as count FROM categories');

    res.json({
      materials: materialCount[0].count,
      videos: videoCount[0].count,
      categories: categoryCount[0].count
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Categories CRUD
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const [categories] = await pool.execute('SELECT * FROM categories ORDER BY created_at DESC');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/categories', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
      [name, description]
    );
    res.json({ id: result.insertId, name, description });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/categories/:id', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    const { id } = req.params;
    
    await pool.execute(
      'UPDATE categories SET name = ?, description = ? WHERE id = ?',
      [name, description, id]
    );
    res.json({ id, name, description });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/categories/:id', authenticateToken, async (req, res) => {
  try {
    await pool.execute('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Materials CRUD
// Updated Materials CRUD operations with author field
// Replace the materials section in your admin.js file

// Materials CRUD
router.get('/materials', authenticateToken, async (req, res) => {
  try {
    const [materials] = await pool.execute(`
      SELECT m.*, c.name as category_name 
      FROM materials m 
      LEFT JOIN categories c ON m.category_id = c.id 
      ORDER BY m.created_at DESC
    `);
    res.json(materials);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

router.post('/materials', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { title, content, author, category_id, status } = req.body;
    const image = req.file ? `/uploads/images/${req.file.filename}` : null;

    const [result] = await pool.execute(
      'INSERT INTO materials (title, content, author, category_id, image, status) VALUES (?, ?, ?, ?, ?, ?)',
      [title, content, author || null, category_id || null, image, status || 'published']
    );

    res.json({ 
      id: result.insertId, 
      title, 
      content, 
      author,
      category_id, 
      image, 
      status: status || 'published' 
    });
  } catch (error) {
    console.error('Create material error:', error);
    res.status(500).json({ error: 'Failed to create material' });
  }
});

router.put('/materials/:id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { title, content, author, category_id, status } = req.body;
    const { id } = req.params;
    const image = req.file ? `/uploads/images/${req.file.filename}` : undefined;

    let query = 'UPDATE materials SET title = ?, content = ?, author = ?, category_id = ?, status = ?';
    let params = [title, content, author || null, category_id || null, status || 'published'];

    if (image) {
      query += ', image = ?';
      params.push(image);
    }

    query += ' WHERE id = ?';
    params.push(id);

    await pool.execute(query, params);
    res.json({ id, title, content, author, category_id, image, status });
  } catch (error) {
    console.error('Update material error:', error);
    res.status(500).json({ error: 'Failed to update material' });
  }
});

router.delete('/materials/:id', authenticateToken, async (req, res) => {
  try {
    await pool.execute('DELETE FROM materials WHERE id = ?', [req.params.id]);
    res.json({ message: 'Material deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

// Videos CRUD
router.get('/videos', authenticateToken, async (req, res) => {
  try {
    const [videos] = await pool.execute(`
      SELECT v.*, c.name as category_name 
      FROM videos v 
      LEFT JOIN categories c ON v.category_id = c.id 
      ORDER BY v.created_at DESC
    `);
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

router.post('/videos', authenticateToken, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, description, video_url, duration, category_id, status } = req.body;
    
    let videoUrl = video_url;
    let thumbnail = null;

    if (req.files) {
      if (req.files.video) {
        videoUrl = `/uploads/videos/${req.files.video[0].filename}`;
      }
      if (req.files.thumbnail) {
        thumbnail = `/uploads/images/${req.files.thumbnail[0].filename}`;
      }
    }

    const [result] = await pool.execute(
      'INSERT INTO videos (title, description, video_url, thumbnail, duration, category_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title, description, videoUrl, thumbnail, duration || 0, category_id || null, status || 'published']
    );

    res.json({ 
      id: result.insertId, 
      title, 
      description, 
      video_url: videoUrl, 
      thumbnail, 
      duration: duration || 0,
      category_id, 
      status: status || 'published' 
    });
  } catch (error) {
    console.error('Create video error:', error);
    res.status(500).json({ error: 'Failed to create video' });
  }
});

router.put('/videos/:id', authenticateToken, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, description, video_url, duration, category_id, status } = req.body;
    const { id } = req.params;
    
    let query = 'UPDATE videos SET title = ?, description = ?, duration = ?, category_id = ?, status = ?';
    let params = [title, description, duration || 0, category_id || null, status || 'published'];

    if (req.files) {
      if (req.files.video) {
        query += ', video_url = ?';
        params.push(`/uploads/videos/${req.files.video[0].filename}`);
      }
      if (req.files.thumbnail) {
        query += ', thumbnail = ?';
        params.push(`/uploads/images/${req.files.thumbnail[0].filename}`);
      }
    } else if (video_url) {
      query += ', video_url = ?';
      params.push(video_url);
    }

    query += ' WHERE id = ?';
    params.push(id);

    await pool.execute(query, params);
    res.json({ id, title, description, duration, category_id, status });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update video' });
  }
});

router.delete('/videos/:id', authenticateToken, async (req, res) => {
  try {
    await pool.execute('DELETE FROM videos WHERE id = ?', [req.params.id]);
    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

module.exports = router;