/**
 * PM2 Production Process Management Configuration
 * Designed for High Availability, Low Latency, and Zero-Disruption Trading Operations.
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save
 *   pm2 startup
 */

module.exports = {
  apps: [
    {
      name: 'algo-backend',
      cwd: './apps/auth-service',
      script: 'dist/main.js',
      instances: 1, // Fork mode: prevents race conditions on broker orders & duplicate WebSockets
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      // Strict V8 memory limit: Forces aggressive garbage collection at 256MB to keep server RAM < 500MB
      node_args: '--max-old-space-size=256',
      max_memory_restart: '320M',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
        TZ: 'Asia/Kolkata',
      },
      error_file: '../../logs/pm2-backend-error.log',
      out_file: '../../logs/pm2-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    {
      name: 'algo-frontend',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // Strict V8 memory limit for Next.js SSR process
      node_args: '--max-old-space-size=180',
      max_memory_restart: '220M',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        TZ: 'Asia/Kolkata',
      },
      error_file: '../../logs/pm2-frontend-error.log',
      out_file: '../../logs/pm2-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
