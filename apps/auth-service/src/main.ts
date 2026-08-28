import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

const logger = new Logger('ProcessBoundary');

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error?.message || error}`, error?.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at Promise: ${promise}, reason: ${reason instanceof Error ? reason.stack : reason}`);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      const frontendUrl = process.env.FRONTEND_URL;
      if (frontendUrl && origin === frontendUrl) {
        return callback(null, true);
      }

      // Check localhost, 127.0.0.1, or private LAN IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      const isLocalOrLan =
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(
          origin,
        );

      if (isLocalOrLan) {
        return callback(null, true);
      }

      return callback(new Error(`Blocked by CORS: ${origin}`), false);
    },
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('v1');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger docs
  const config = new DocumentBuilder()
    .setTitle('TradeIO Auth Service')
    .setDescription('Authentication and user management API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3002;
  const server = await app.listen(port, '0.0.0.0');
  const httpServer = app.getHttpServer();
  if (httpServer && httpServer.keepAliveTimeout !== undefined) {
    httpServer.keepAliveTimeout = 65000;
    httpServer.headersTimeout = 66000;
  }
  console.log(`Auth Service running on http://localhost:${port}`);
  console.log(`Swagger: http://localhost:${port}/docs`);
}

bootstrap();

