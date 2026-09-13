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
      // Generous memory ceiling: Prevents unintended mid-session restarts during 9:15 AM - 3:30 PM IST
      max_memory_restart: '1500M',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
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
      max_memory_restart: '800M',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '../../logs/pm2-frontend-error.log',
      out_file: '../../logs/pm2-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
