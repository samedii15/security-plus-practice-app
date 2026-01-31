import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, run } from './database/db.js';
import { logAudit, EventTypes } from './auditService.js';

// Helper to get JWT secret with validation
function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return process.env.JWT_SECRET;
}

// Register new user
async function register(email, password, req = null) {
  return new Promise((resolve, reject) => {
    // Validate input
    if (!email || !password) {
      return reject({ status: 400, message: 'Email and password are required' });
    }

    if (password.length < 8) {
      return reject({ status: 400, message: 'Password must be at least 8 characters' });
    }

    // Hash password
      bcrypt.hash(password, 10, async (err, hash) => {
        if (err) {
          return reject({ status: 500, message: 'Error hashing password' });
        }

        try {
          // Check if this is the first user (should be admin)
          const userCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM users', (err, result) => {
              if (err) reject(err);
              else resolve(result.count);
            });
          });

          const role = userCount === 0 ? 'admin' : 'user';

          // Insert user into database
          db.run(
            'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
            [email.toLowerCase(), hash, role],
            function(err) {
              if (err) {
                if (err.message.includes('UNIQUE')) {
                  return reject({ status: 409, message: 'Email already exists' });
                }
                return reject({ status: 500, message: 'Error creating user' });
              }

              const userId = this.lastID;
              
              // Log registration
              logAudit(EventTypes.REGISTER, userId, { email: email.toLowerCase() }, req);

              // Generate JWT token for auto-login after registration
              const token = jwt.sign(
                { id: userId, email: email.toLowerCase(), role: role },
                getJwtSecret(),
                { expiresIn: '24h' }
              );

              resolve({
                token,
                user: {
                  id: userId,
                  email: email.toLowerCase(),
                  role: role
                }
              });
            }
          );
        } catch (err) {
          return reject({ status: 500, message: 'Error creating user' });
        }
    });
  });
}

// Login user
async function login(email, password, req = null) {
  return new Promise((resolve, reject) => {
    if (!email || !password) {
      return reject({ status: 400, message: 'Email and password are required' });
    }

    // Find user by email (only non-deleted users)
    db.get(
      'SELECT id, email, password_hash, role FROM users WHERE email = ? AND deleted_at IS NULL',
      [email.toLowerCase()],
      (err, user) => {
        if (err) {
          return reject({ status: 500, message: 'Database error' });
        }

        if (!user) {
          // Log failed login attempt
          logAudit(EventTypes.LOGIN_FAILURE, null, { email: email.toLowerCase(), reason: 'User not found or deleted' }, req);
          return reject({ 
            status: 401, 
            message: 'Invalid credentials. Please check your email and password, or register if you don\'t have an account.' 
          });
        }

        // Compare passwords
        bcrypt.compare(password, user.password_hash, (err, isMatch) => {
          if (err) {
            return reject({ status: 500, message: 'Error verifying password' });
          }

          if (!isMatch) {
            // Log failed login attempt
            logAudit(EventTypes.LOGIN_FAILURE, user.id, { email: email.toLowerCase(), reason: 'Invalid password' }, req);
            return reject({ status: 401, message: 'Invalid credentials' });
          }

          // Log successful login
          logAudit(EventTypes.LOGIN_SUCCESS, user.id, { email: user.email }, req);

          // Insert into auth_logins table
          const ipAddress = req?.ip || req?.connection?.remoteAddress || 'unknown';
          const userAgent = req?.headers?.['user-agent'] || 'unknown';
          
          run(
            'INSERT INTO auth_logins (user_id, event, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [user.id, 'login_success', ipAddress, userAgent]
          ).catch(err => {
            console.error('Error logging auth event:', err);
          });

          // Generate JWT token with role
          const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            getJwtSecret(),
            { expiresIn: '24h' }
          );

          resolve({
            token,
            user: {
              id: user.id,
              email: user.email,
              role: user.role
            }
          });
        });
      }
    );
  });
}

// Verify JWT token middleware
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(
      token,
      getJwtSecret()
    );
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Verify admin role middleware
function verifyAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    logAudit(EventTypes.ADMIN_ACCESS, req.user?.id, { 
      denied: true, 
      path: req.path,
      reason: 'Insufficient permissions' 
    }, req);
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  logAudit(EventTypes.ADMIN_ACCESS, req.user.id, { 
    allowed: true, 
    path: req.path 
  }, req);
  
  next();
}

export {
  register,
  login,
  verifyToken,
  verifyAdmin
};
