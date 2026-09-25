/**
 * PM2 Production Process Management Configuration
 * Designed for High Availability, Low Latency, and Zero-Disruption Trading Operations.
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save
 *   pm2 startup   # run once on the server, execute the command it prints, then `pm2 save`
 *                 # so the apps come back after a host reboot
 *
 * The backend exits with code 1 on an uncaught exception (see apps/auth-service/src/main.ts);
 * PM2 restarts it and strategy boot recovery re-adopts active strategies and open positions.
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
      // V8 heap 512MB (engines + instrument/candle caches + socket server); PM2 restarts above 640MB RSS
      node_args: '--max-old-space-size=512',
      max_memory_restart: '640M',
      // Give in-flight requests/orders time to finish on SIGINT before PM2 sends SIGKILL
      kill_timeout: 10000,
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
