const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDatabase } = require('../database/init');

const router = express.Router();

// In-memory OTP storage (in production, use Redis or database)
const otpStore = new Map();

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Hash OTP for secure storage
const hashOTP = (otp) => {
  return crypto.createHash('sha256').update(otp).digest('hex');
};

// Real SMS service integration
const sendSMS = async (phone, otp) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  try {
    if (isProduction && process.env.TWILIO_ACCOUNT_SID) {
      // Production: Use Twilio
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      const message = `Your Spendly OTP is ${otp}. Valid for 5 minutes. Do not share this code.`;
      
      console.log(`📱 Sending SMS to +91${phone} via Twilio...`);
      
      const result = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+91${phone}`
      });
      
      console.log(`✅ SMS sent successfully. SID: ${result.sid}`);
      return { success: true, provider: 'twilio', sid: result.sid };
      
    } else if (isProduction && process.env.AWS_ACCESS_KEY_ID) {
      // Production: Use AWS SNS
      const AWS = require('aws-sdk');
      const sns = new AWS.SNS({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'ap-south-1'
      });
      
      const message = `Your Spendly OTP is ${otp}. Valid for 5 minutes. Do not share this code.`;
      
      console.log(`📱 Sending SMS to +91${phone} via AWS SNS...`);
      
      const params = {
        Message: message,
        PhoneNumber: `+91${phone}`,
        MessageAttributes: {
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: 'SPENDLY'
          },
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: 'Transactional'
          }
        }
      };
      
      const result = await sns.publish(params).promise();
      console.log(`✅ SMS sent successfully. MessageId: ${result.MessageId}`);
      return { success: true, provider: 'aws-sns', messageId: result.MessageId };
      
    } else {
      // Development or fallback: Console logging
      console.log(`📱 [${isProduction ? 'PROD-FALLBACK' : 'DEV'}] SMS to +91${phone}: Your Spendly OTP is ${otp}. Valid for 5 minutes.`);
      
      if (isProduction) {
        console.warn('⚠️  Production SMS not configured! Add TWILIO_* or AWS_* environment variables');
        throw new Error('SMS service not configured for production');
      }
      
      // Simulate SMS sending delay in development
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { success: true, provider: 'console' };
    }
    
  } catch (error) {
    console.error('❌ SMS sending failed:', error.message);
    throw error;
  }
};

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Email and password are required'
      });
    }

    if (!phone) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Phone number is required'
      });
    }

    // Validate phone number format (Indian mobile)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ 
        error: 'Invalid phone number',
        message: 'Phone number must be a valid 10-digit Indian mobile number'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Invalid password',
        message: 'Password must be at least 6 characters long'
      });
    }

    const db = getDatabase();
    
    // Check if user exists with email or phone
    db.get('SELECT id FROM users WHERE email = ? OR phone = ?', [email, phone], async (err, row) => {
      if (err) {
        console.error('❌ Database error:', err);
        return res.status(500).json({ 
          error: 'Database error',
          message: 'Failed to check user existence'
        });
      }
      
      if (row) {
        return res.status(409).json({ 
          error: 'User exists',
          message: 'User with this email or phone number already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user
      db.run(
        'INSERT INTO users (email, password, name, phone) VALUES (?, ?, ?, ?)',
        [email, hashedPassword, name || '', phone],
        function(err) {
          if (err) {
            console.error('❌ Failed to create user:', err);
            return res.status(500).json({ 
              error: 'Registration failed',
              message: 'Failed to create user account'
            });
          }
          
          const token = jwt.sign(
            { userId: this.lastID, email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
          );
          
          console.log('✅ User registered:', email, phone);
          res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
              id: this.lastID,
              email,
              name: name || '',
              phone
            }
          });
        }
      );
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ 
      error: 'Server error',
      message: 'Internal server error during registration'
    });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Missing credentials',
        message: 'Email and password are required'
      });
    }

    const db = getDatabase();
    
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        console.error('❌ Database error:', err);
        return res.status(500).json({ 
          error: 'Database error',
          message: 'Failed to authenticate user'
        });
      }
      
      if (!user) {
        return res.status(401).json({ 
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ 
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      console.log('✅ User logged in:', email);
      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          salary: user.salary
        }
      });
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      error: 'Server error',
      message: 'Internal server error during login'
    });
  }
});

// Send OTP for password reset
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number is required'
      });
    }

    // Validate phone number format (Indian mobile)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid phone number format. Please enter a valid 10-digit Indian mobile number.'
      });
    }

    // Rate limiting: Check if OTP was sent recently
    const existingOTP = otpStore.get(phone);
    if (existingOTP && (Date.now() - (existingOTP.sentAt || 0)) < 60000) { // 1 minute cooldown
      return res.status(429).json({ 
        success: false,
        error: 'Please wait 1 minute before requesting another OTP'
      });
    }

    const db = getDatabase();
    
    // Check if user exists with this phone number
    db.get('SELECT id, email FROM users WHERE phone = ?', [phone], async (err, user) => {
      if (err) {
        console.error('❌ Database error:', err);
        return res.status(500).json({ 
          success: false,
          error: 'Unable to process request. Please try again later.'
        });
      }
      
      if (!user) {
        console.log(`❌ OTP request for unregistered phone: ${phone}`);
        return res.status(404).json({ 
          success: false,
          error: 'Phone number not registered. Please register first.'
        });
      }

      // Generate OTP
      const otp = generateOTP();
      const hashedOTP = hashOTP(otp);
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
      const sentAt = Date.now();
      
      console.log(`📱 Generating OTP for phone: ${phone} (User ID: ${user.id})`);
      
      // Store hashed OTP securely
      otpStore.set(phone, {
        hashedOTP,
        expiresAt,
        sentAt,
        attempts: 0,
        verified: false,
        userId: user.id
      });

      try {
        // Send SMS
        const smsResult = await sendSMS(phone, otp);
        
        console.log(`✅ OTP sent to ${phone} via ${smsResult.provider}`);
        
        res.json({
          success: true,
          message: 'OTP sent successfully to your mobile number',
          provider: smsResult.provider !== 'console' ? 'sms' : 'console'
        });
        
      } catch (smsError) {
        console.error('❌ SMS sending failed:', smsError.message);
        
        // Remove OTP from store if SMS failed
        otpStore.delete(phone);
        
        res.status(500).json({ 
          success: false,
          error: 'Unable to send OTP. Please check your phone number and try again later.'
        });
      }
    });
  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Unable to send OTP. Please try again later.'
    });
  }
});
          message: 'OTP sent successfully'
        });
      } catch (smsError) {
        console.error('❌ SMS sending failed:', smsError);
        res.status(500).json({ 
          success: false,
          error: 'Failed to send OTP'
        });
      }
    });
  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error'
    });
  }
});

// Verify OTP
router.post('/verify-otp', (req, res) => {
  try {
    const { phone, otp } = req.body;
    
    if (!phone || !otp) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number and OTP are required'
      });
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ 
        success: false,
        error: 'OTP must be a 6-digit number'
      });
    }

    const otpData = otpStore.get(phone);
    
    if (!otpData) {
      console.log(`❌ OTP verification failed: No OTP found for phone ${phone}`);
      return res.status(400).json({ 
        success: false,
        error: 'OTP not found or expired. Please request a new OTP.'
      });
    }

    // Check if OTP is expired
    if (Date.now() > otpData.expiresAt) {
      console.log(`❌ OTP verification failed: Expired OTP for phone ${phone}`);
      otpStore.delete(phone);
      return res.status(400).json({ 
        success: false,
        error: 'OTP has expired. Please request a new OTP.'
      });
    }

    // Check attempts (prevent brute force)
    if (otpData.attempts >= 3) {
      console.log(`❌ OTP verification failed: Too many attempts for phone ${phone}`);
      otpStore.delete(phone);
      return res.status(400).json({ 
        success: false,
        error: 'Too many failed attempts. Please request a new OTP.'
      });
    }

    // Verify OTP using hash comparison
    const hashedInputOTP = hashOTP(otp);
    if (otpData.hashedOTP !== hashedInputOTP) {
      otpData.attempts += 1;
      console.log(`❌ OTP verification failed: Invalid OTP for phone ${phone} (Attempt ${otpData.attempts}/3)`);
      return res.status(400).json({ 
        success: false,
        error: `Invalid OTP. ${3 - otpData.attempts} attempts remaining.`
      });
    }

    // Mark as verified (one-time use)
    otpData.verified = true;
    otpData.verifiedAt = Date.now();
    
    console.log(`✅ OTP verified successfully for phone ${phone} (User ID: ${otpData.userId})`);
    
    res.json({
      success: true,
      message: 'OTP verified successfully'
    });
    
  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Unable to verify OTP. Please try again later.'
    });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { phone, newPassword } = req.body;
    
    if (!phone || !newPassword) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number and new password are required'
      });
    }

    // Validate password
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    }

    const otpData = otpStore.get(phone);
    
    if (!otpData || !otpData.verified) {
      console.log(`❌ Password reset failed: OTP not verified for phone ${phone}`);
      return res.status(400).json({ 
        success: false,
        error: 'OTP verification required. Please verify OTP first.'
      });
    }

    // Check if OTP was used recently (prevent replay attacks)
    if (otpData.verifiedAt && (Date.now() - otpData.verifiedAt) > 10 * 60 * 1000) { // 10 minutes
      console.log(`❌ Password reset failed: OTP verification expired for phone ${phone}`);
      otpStore.delete(phone);
      return res.status(400).json({ 
        success: false,
        error: 'OTP verification expired. Please request a new OTP.'
      });
    }

    const db = getDatabase();
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    db.run(
      'UPDATE users SET password = ? WHERE phone = ?',
      [hashedPassword, phone],
      function(err) {
        if (err) {
          console.error('❌ Failed to update password:', err);
          return res.status(500).json({ 
            success: false,
            error: 'Failed to update password'
          });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ 
            success: false,
            error: 'User not found'
          });
        }
        
        // Clear OTP data
        otpStore.delete(phone);
        
        console.log(`✅ Password reset for phone ${phone}`);
        res.json({
          success: true,
          message: 'Password reset successfully'
        });
      }
    );
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;