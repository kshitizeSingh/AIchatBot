FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Create uploads directory (for local dev if using local storage path mapping)
RUN mkdir -p /app/uploads

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3002)+'/health',res=>{if(res.statusCode===200)process.exit(0);process.exit(1)}).on('error',()=>process.exit(1))"

EXPOSE 3002

CMD ["node", "src/index.js"]
