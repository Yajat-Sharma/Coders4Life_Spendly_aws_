# 🚀 Deployment Guide

## Pre-Deployment Checklist

### ✅ **Code Preparation**
- [ ] Remove test files (already done)
- [ ] Update environment variables
- [ ] Set strong JWT secret
- [ ] Configure CORS for production domain
- [ ] Build client application
- [ ] Test all functionality

### ✅ **Security**
- [ ] Change default JWT_SECRET
- [ ] Set NODE_ENV=production
- [ ] Configure HTTPS
- [ ] Set up proper CORS origins
- [ ] Enable rate limiting (already configured)

## 🌐 Deployment Options

### Option 1: Vercel (Recommended for Full-Stack)

#### Backend (API Routes)
1. **Create vercel.json in root**:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server/index.js",
      "use": "@vercel/node"
    },
    {
      "src": "client/package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server/index.js"
    },
    {
      "src": "/(.*)",
      "dest": "client/dist/$1"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

2. **Set Environment Variables in Vercel Dashboard**:
   - `JWT_SECRET`: Strong random string
   - `NODE_ENV`: production
   - `CORS_ORIGIN`: https://your-app.vercel.app

#### Frontend
- Automatically deployed with the above config
- Update `VITE_API_URL` to your Vercel API URL

### Option 2: Railway

1. **Connect GitHub repo to Railway**
2. **Set Environment Variables**:
   ```
   NODE_ENV=production
   JWT_SECRET=your-strong-secret
   PORT=5000
   ```
3. **Deploy**: Railway auto-deploys on push

### Option 3: Render

#### Backend
1. **Create Web Service**
2. **Build Command**: `cd server && npm install`
3. **Start Command**: `cd server && npm start`
4. **Environment Variables**:
   ```
   NODE_ENV=production
   JWT_SECRET=your-strong-secret
   ```

#### Frontend
1. **Create Static Site**
2. **Build Command**: `cd client && npm run build`
3. **Publish Directory**: `client/dist`
4. **Environment Variables**:
   ```
   VITE_API_URL=https://your-backend.render.com
   ```

### Option 4: Heroku

1. **Create Procfile**:
```
web: cd server && npm start
```

2. **Set Environment Variables**:
```bash
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-strong-secret
```

3. **Deploy**:
```bash
git push heroku main
```

### Option 5: VPS/DigitalOcean

#### Server Setup
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
npm install -g pm2

# Clone and setup
git clone your-repo
cd your-repo
npm run install-all
npm run build
```

#### PM2 Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'spendly-server',
    script: 'server/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      JWT_SECRET: 'your-strong-secret'
    }
  }]
}
```

```bash
# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Nginx Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Frontend
    location / {
        root /path/to/your-repo/client/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔧 Environment Variables

### Production Environment Variables

#### Server (.env)
```env
NODE_ENV=production
PORT=5000
JWT_SECRET=your-super-strong-jwt-secret-at-least-32-characters
DB_PATH=./database.sqlite
CORS_ORIGIN=https://your-frontend-domain.com
```

#### Client (.env.production)
```env
VITE_API_URL=https://your-backend-domain.com
```

### Generate Strong JWT Secret
```bash
# Option 1: OpenSSL
openssl rand -base64 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 📱 Mobile App Deployment

### Android WebView App

1. **Create Android Studio Project**
2. **Add WebView with URL**: https://your-deployed-app.com
3. **Configure UPI Intent Handling**:
```java
// In MainActivity.java
webView.setWebViewClient(new WebViewClient() {
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        if (url.startsWith("upi://")) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
            return true;
        }
        return false;
    }
});
```

4. **Add Permissions in AndroidManifest.xml**:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
```

### PWA Deployment
1. **Add manifest.json** (already configured)
2. **Add service worker** for offline support
3. **Deploy with HTTPS** (required for PWA)

## 🔍 Post-Deployment Testing

### Functionality Tests
- [ ] User registration/login
- [ ] Category creation
- [ ] Payment flow (test with small amounts)
- [ ] QR code scanning
- [ ] Mobile responsiveness
- [ ] UPI app redirects

### Performance Tests
- [ ] Page load times < 3 seconds
- [ ] API response times < 1 second
- [ ] Mobile performance
- [ ] Database query performance

### Security Tests
- [ ] HTTPS enabled
- [ ] CORS properly configured
- [ ] Rate limiting working
- [ ] JWT tokens secure
- [ ] No sensitive data in client

## 🚨 Monitoring & Maintenance

### Error Monitoring
- Set up error tracking (Sentry, LogRocket)
- Monitor API response times
- Track user engagement

### Database Backup
```bash
# Backup SQLite database
cp server/database.sqlite backups/database-$(date +%Y%m%d).sqlite

# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp server/database.sqlite backups/database-$DATE.sqlite
find backups/ -name "database-*.sqlite" -mtime +7 -delete
```

### Updates
```bash
# Update dependencies
npm update
cd server && npm update
cd ../client && npm update

# Rebuild and redeploy
npm run build
# Deploy using your chosen method
```

## 🔧 Troubleshooting

### Common Deployment Issues

**Build Fails**:
- Check Node.js version compatibility
- Clear node_modules and reinstall
- Check for missing environment variables

**API Not Accessible**:
- Verify CORS configuration
- Check firewall settings
- Ensure backend is running on correct port

**Database Issues**:
- Check file permissions
- Verify SQLite is installed
- Check disk space

**UPI Redirects Not Working**:
- Test on actual mobile device
- Verify UPI intent URL format
- Check if UPI apps are installed

### Debug Commands
```bash
# Check server status
curl https://your-api-domain.com/health

# Check frontend build
cd client && npm run build

# Test API endpoints
curl -X POST https://your-api-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

## 📞 Support

If you encounter issues during deployment:
1. Check the logs for error messages
2. Verify all environment variables are set
3. Test locally first
4. Check the troubleshooting section
5. Create an issue in the repository

---

**Happy Deploying! 🚀**