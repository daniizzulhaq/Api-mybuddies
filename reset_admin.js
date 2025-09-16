// reset_admin.js - Jalankan dengan: node reset_admin.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetAdminPassword() {
  try {
    // Buat koneksi ke database
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    // Password baru yang ingin diset
    const newPassword = 'admin123';
    const email = 'admin@breastcancer.com';
    
    // Hash password baru
    console.log('Hashing password...');
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    console.log('New password hash:', hashedPassword);
    
    // Update password di database
    const [result] = await connection.execute(
      'UPDATE admins SET password = ? WHERE email = ?',
      [hashedPassword, email]
    );
    
    if (result.affectedRows > 0) {
      console.log('✅ Password updated successfully!');
      console.log('Email:', email);
      console.log('New Password:', newPassword);
      
      // Test password
      const [admin] = await connection.execute(
        'SELECT password FROM admins WHERE email = ?',
        [email]
      );
      
      if (admin.length > 0) {
        const isValid = await bcrypt.compare(newPassword, admin[0].password);
        console.log('Password verification test:', isValid ? '✅ PASSED' : '❌ FAILED');
      }
    } else {
      console.log('❌ Admin not found');
    }
    
    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

resetAdminPassword();