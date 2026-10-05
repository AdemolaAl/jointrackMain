FROM node:22-slim
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
COPY joe ./joe
COPY scripts ./scripts
COPY lib ./lib
COPY voo-connect ./voo-connect
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
# Railway: attach a volume at /data in the dashboard (Docker VOLUME is not used there)
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
