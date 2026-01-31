import { run, all } from '../database/db.js';

async function makeFirstUserAdmin() {
  try {
    console.log('Finding users...');
    const users = await all('SELECT id, email, role FROM users ORDER BY id ASC');
    
    if (users.length === 0) {
      console.log('No users found. Register a user first.');
      return;
    }
    
    console.log(`Found ${users.length} users:`);
    users.forEach(user => {
      console.log(`  - ID: ${user.id}, Email: ${user.email}, Role: ${user.role}`);
    });
    
    // Make the first user admin if no admin exists
    const adminUsers = users.filter(u => u.role === 'admin');
    if (adminUsers.length === 0) {
      const firstUser = users[0];
      await run('UPDATE users SET role = ? WHERE id = ?', ['admin', firstUser.id]);
      console.log(`✅ Made ${firstUser.email} an admin`);
    } else {
      console.log(`✅ Admin user already exists: ${adminUsers[0].email}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

makeFirstUserAdmin();