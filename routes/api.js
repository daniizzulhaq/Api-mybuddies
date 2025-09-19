const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// API Documentation
router.get('/', (req, res) => {
  res.json({
    message: 'Breast Cancer Education API',
    version: '1.0.0',
    endpoints: {
      categories: {
        'GET /api/categories': 'Get all categories',
        'GET /api/categories/:id': 'Get category by ID'
      },
      materials: {
        'GET /api/materials': 'Get all published materials',
        'GET /api/materials/:id': 'Get material by ID',
        'GET /api/materials/category/:categoryId': 'Get materials by category'
      },
      videos: {
        'GET /api/videos': 'Get all published videos',
        'GET /api/videos/:id': 'Get video by ID',
        'GET /api/videos/category/:categoryId': 'Get videos by category'
      },
      search: {
        'GET /api/search?q=keyword': 'Search materials and videos'
      }
    }
  });
});

// Categories endpoints
router.get('/categories', async (req, res) => {
  try {
    const [categories] = await pool.execute(`
      SELECT c.*, 
        COUNT(DISTINCT m.id) as material_count,
        COUNT(DISTINCT v.id) as video_count
      FROM categories c
      LEFT JOIN materials m ON c.id = m.category_id AND m.status = 'published'
      LEFT JOIN videos v ON c.id = v.category_id AND v.status = 'published'
      GROUP BY c.id
      ORDER BY c.name
    `);
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Fetch categories error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

router.get('/categories/:id', async (req, res) => {
  try {
    const [categories] = await pool.execute(
      'SELECT * FROM categories WHERE id = ?',
      [req.params.id]
    );

    if (categories.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({
      success: true,
      data: categories[0]
    });
  } catch (error) {
    console.error('Fetch category error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch category' });
  }
});

// Materials endpoints
// Updated Materials API endpoints with author field
// Replace the materials section in your api.js file

// Materials endpoints
router.get('/materials', async (req, res) => {
  try {
    const { page = 1, limit = 10, category, author } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT m.*, c.name as category_name 
      FROM materials m 
      LEFT JOIN categories c ON m.category_id = c.id 
      WHERE m.status = 'published'
    `;
    let countQuery = 'SELECT COUNT(*) as total FROM materials WHERE status = "published"';
    let params = [];
    let countParams = [];

    if (category) {
      query += ' AND m.category_id = ?';
      countQuery += ' AND category_id = ?';
      params.push(category);
      countParams.push(category);
    }

    if (author) {
      query += ' AND m.author LIKE ?';
      countQuery += ' AND author LIKE ?';
      const authorFilter = `%${author}%`;
      params.push(authorFilter);
      countParams.push(authorFilter);
    }

    query += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [materials] = await pool.execute(query, params);
    const [totalResult] = await pool.execute(countQuery, countParams);

    res.json({
      success: true,
      data: materials,
      pagination: {
        total: totalResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalResult[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Fetch materials error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch materials' });
  }
});

router.get('/materials/:id', async (req, res) => {
  try {
    const [materials] = await pool.execute(`
      SELECT m.*, c.name as category_name 
      FROM materials m 
      LEFT JOIN categories c ON m.category_id = c.id 
      WHERE m.id = ? AND m.status = 'published'
    `, [req.params.id]);

    if (materials.length === 0) {
      return res.status(404).json({ success: false, error: 'Material not found' });
    }

    res.json({
      success: true,
      data: materials[0]
    });
  } catch (error) {
    console.error('Fetch material error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch material' });
  }
});

router.get('/materials/category/:categoryId', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const [materials] = await pool.execute(`
      SELECT m.*, c.name as category_name 
      FROM materials m 
      LEFT JOIN categories c ON m.category_id = c.id 
      WHERE m.category_id = ? AND m.status = 'published'
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.params.categoryId, parseInt(limit), offset]);

    const [totalResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM materials WHERE category_id = ? AND status = "published"',
      [req.params.categoryId]
    );

    res.json({
      success: true,
      data: materials,
      pagination: {
        total: totalResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalResult[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Fetch materials by category error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch materials' });
  }
});

// Get materials by author
router.get('/materials/author/:author', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const authorFilter = `%${req.params.author}%`;

    const [materials] = await pool.execute(`
      SELECT m.*, c.name as category_name 
      FROM materials m 
      LEFT JOIN categories c ON m.category_id = c.id 
      WHERE m.author LIKE ? AND m.status = 'published'
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `, [authorFilter, parseInt(limit), offset]);

    const [totalResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM materials WHERE author LIKE ? AND status = "published"',
      [authorFilter]
    );

    res.json({
      success: true,
      data: materials,
      pagination: {
        total: totalResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalResult[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Fetch materials by author error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch materials by author' });
  }
});

// Get all authors
router.get('/authors', async (req, res) => {
  try {
    const [authors] = await pool.execute(`
      SELECT 
        author,
        COUNT(*) as material_count,
        MAX(created_at) as latest_material
      FROM materials 
      WHERE author IS NOT NULL AND author != '' AND status = 'published'
      GROUP BY author 
      ORDER BY material_count DESC, author
    `);

    res.json({
      success: true,
      data: authors
    });
  } catch (error) {
    console.error('Fetch authors error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch authors' });
  }
});

// Videos endpoints
router.get('/videos', async (req, res) => {
  try {
    const { page = 1, limit = 10, category } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT v.*, c.name as category_name 
      FROM videos v 
      LEFT JOIN categories c ON v.category_id = c.id 
      WHERE v.status = 'published'
    `;
    let countQuery = 'SELECT COUNT(*) as total FROM videos WHERE status = "published"';
    let params = [];
    let countParams = [];

    if (category) {
      query += ' AND v.category_id = ?';
      countQuery += ' AND category_id = ?';
      params.push(category);
      countParams.push(category);
    }

    query += ' ORDER BY v.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [videos] = await pool.execute(query, params);
    const [totalResult] = await pool.execute(countQuery, countParams);

    res.json({
      success: true,
      data: videos,
      pagination: {
        total: totalResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalResult[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Fetch videos error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch videos' });
  }
});

router.get('/videos/:id', async (req, res) => {
  try {
    const [videos] = await pool.execute(`
      SELECT v.*, c.name as category_name 
      FROM videos v 
      LEFT JOIN categories c ON v.category_id = c.id 
      WHERE v.id = ? AND v.status = 'published'
    `, [req.params.id]);

    if (videos.length === 0) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }

    res.json({
      success: true,
      data: videos[0]
    });
  } catch (error) {
    console.error('Fetch video error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch video' });
  }
});

router.get('/videos/category/:categoryId', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const [videos] = await pool.execute(`
      SELECT v.*, c.name as category_name 
      FROM videos v 
      LEFT JOIN categories c ON v.category_id = c.id 
      WHERE v.category_id = ? AND v.status = 'published'
      ORDER BY v.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.params.categoryId, parseInt(limit), offset]);

    const [totalResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM videos WHERE category_id = ? AND status = "published"',
      [req.params.categoryId]
    );

    res.json({
      success: true,
      data: videos,
      pagination: {
        total: totalResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalResult[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Fetch videos by category error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch videos' });
  }
});

// Search endpoint
// Updated search endpoint to include author field
// Replace the search section in your api.js file

// Search endpoint
router.get('/search', async (req, res) => {
  try {
    const { q: query, type, category, page = 1, limit = 10 } = req.query;
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }

    const offset = (page - 1) * limit;
    const searchTerm = `%${query}%`;
    let results = { materials: [], videos: [] };

    // Search materials (including author field)
    if (!type || type === 'materials') {
      let materialQuery = `
        SELECT m.*, c.name as category_name, 'material' as content_type
        FROM materials m 
        LEFT JOIN categories c ON m.category_id = c.id 
        WHERE m.status = 'published' 
        AND (m.title LIKE ? OR m.content LIKE ? OR m.author LIKE ?)
      `;
      let materialParams = [searchTerm, searchTerm, searchTerm];

      if (category) {
        materialQuery += ' AND m.category_id = ?';
        materialParams.push(category);
      }

      materialQuery += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
      materialParams.push(parseInt(limit), offset);

      const [materials] = await pool.execute(materialQuery, materialParams);
      results.materials = materials;
    }

    // Search videos (unchanged)
    if (!type || type === 'videos') {
      let videoQuery = `
        SELECT v.*, c.name as category_name, 'video' as content_type
        FROM videos v 
        LEFT JOIN categories c ON v.category_id = c.id 
        WHERE v.status = 'published' AND (v.title LIKE ? OR v.description LIKE ?)
      `;
      let videoParams = [searchTerm, searchTerm];

      if (category) {
        videoQuery += ' AND v.category_id = ?';
        videoParams.push(category);
      }

      videoQuery += ' ORDER BY v.created_at DESC LIMIT ? OFFSET ?';
      videoParams.push(parseInt(limit), offset);

      const [videos] = await pool.execute(videoQuery, videoParams);
      results.videos = videos;
    }

    res.json({
      success: true,
      data: results,
      query: query,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// Get latest content (for home screen)
router.get('/latest', async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    const [materials] = await pool.execute(`
      SELECT m.*, c.name as category_name, 'material' as content_type
      FROM materials m 
      LEFT JOIN categories c ON m.category_id = c.id 
      WHERE m.status = 'published'
      ORDER BY m.created_at DESC
      LIMIT ?
    `, [parseInt(limit)]);

    const [videos] = await pool.execute(`
      SELECT v.*, c.name as category_name, 'video' as content_type
      FROM videos v 
      LEFT JOIN categories c ON v.category_id = c.id 
      WHERE v.status = 'published'
      ORDER BY v.created_at DESC
      LIMIT ?
    `, [parseInt(limit)]);

    res.json({
      success: true,
      data: {
        materials: materials,
        videos: videos
      }
    });
  } catch (error) {
    console.error('Fetch latest content error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch latest content' });
  }
});

module.exports = router;