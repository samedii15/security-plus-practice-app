# Use official Node.js LTS image
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY app.js .
COPY audit.js .
COPY helpers.js .
COPY middleware.js .

# Expose port
EXPOSE 3000

# Set environment variables (can be overridden)
ENV PORT=3000
ENV IP_RATE_WINDOW_MIN=15
ENV IP_RATE_MAX_ATTEMPTS=20
ENV USER_IP_WINDOW_MIN=15
ENV USER_IP_MAX_FAILURES=5

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Run the application
CMD ["node", "app.js"]
